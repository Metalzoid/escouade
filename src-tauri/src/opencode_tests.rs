//! OpenCode beside Claude Code, through the core (ESC-44): an agent of it converses, asks its
//! permissions and its questions, keeps a message sent during a turn for after it, fills the
//! band « Plan » and lists the models of the connected providers. Its agents run the fake
//! `opencode serve` (tests/fixtures/fake-opencode.mjs).

use crate::core::AgentOptions;
use crate::core_tests::{harness, Harness};
use crate::engine::{registry, Program, OPENCODE};
use crate::model::*;
use serde_json::{json, Value};

/// OpenCode's Principal, on the fake `opencode`.
fn opencode_account(h: &Harness) {
    h.set_settings(|s| {
        s.accounts.push(Account {
            id: "principal-opencode".into(),
            name: "Principal".into(),
            engine: EngineId::Opencode,
            config_dir: String::new(),
            claude_path: crate::engine::fake_opencode(),
            active: true,
            projects: Vec::new(),
        });
    });
}

/// The card waiting of `kind` (`permission`, `question`) in the agent's conversation.
fn waiting(h: &Harness, id: &str, kind: &str) -> Option<Value> {
    h.items(id).into_iter().find(|i| {
        i["kind"] == kind
            && i["decision"].is_null()
            && i["answers"].is_null()
            && i["cancelled"] != true
    })
}

fn texts(h: &Harness, id: &str) -> Vec<String> {
    h.items(id)
        .iter()
        .filter(|i| i["kind"] == "text" && i["parent"].is_null())
        .filter_map(|i| i["text"].as_str().map(str::to_string))
        .collect()
}

async fn new_agent(h: &Harness, project: &str) -> String {
    let id = h
        .core
        .create_agent_with(
            project,
            AgentOptions {
                engine: Some(EngineId::Opencode),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .meta
        .id;
    h.wait("its session and the models", |h| {
        h.agent(id.as_str()).session_id.is_some()
            && h.core
                .engine_models
                .read()
                .get(&EngineId::Opencode)
                .is_some_and(|m| !m.is_empty())
    })
    .await;
    id
}

#[tokio::test]
async fn an_agent_of_opencode_converses_asks_its_permissions_and_its_questions() {
    let h = harness("esc44-converse");
    let (p, _) = h.project(false).await;
    opencode_account(&h);
    let id = new_agent(&h, &p.id).await;
    // A model of the connected providers, never one OpenCode would pick itself.
    assert_eq!(h.agent(&id).model, "ollama/qwen3-coder:30b-32k");
    assert_eq!(h.agent(&id).engine, EngineId::Opencode);
    h.turn(&id, "bonjour").await;
    assert!(texts(&h, &id).contains(&"Bonjour, tu as dit : bonjour".to_string()));
    let turn = h
        .items(&id)
        .into_iter()
        .rev()
        .find(|i| i["kind"] == "turn")
        .unwrap();
    assert_eq!(turn["engine"], "opencode");
    assert_eq!(turn["tokens"], 130);

    // A command its rules ask for: its card, allowed, and a message sent meanwhile kept for after.
    h.core
        .send_message(&id, "commande".into(), vec![])
        .await
        .unwrap();
    h.wait("the permission", |h| {
        waiting(h, &id, "permission").is_some()
    })
    .await;
    let card = waiting(&h, &id, "permission").unwrap();
    assert_eq!(card["toolName"], "Bash");
    assert_eq!(card["input"]["command"], "rm -rf build");
    assert!(card["description"].as_str().unwrap().contains("rm *"));
    assert_eq!(h.agent(&id).status, AgentStatus::Waiting);
    h.core
        .send_message(&id, "et ensuite".into(), vec![])
        .await
        .unwrap();
    let queued = h
        .items(&id)
        .into_iter()
        .find(|i| i["kind"] == "user" && i["text"] == "et ensuite")
        .unwrap();
    assert_eq!(queued["queued"], true);
    h.core
        .answer_permission(&id, card["id"].as_str().unwrap(), "allow", None)
        .unwrap();
    h.wait("the message kept, answered", |h| {
        texts(h, &id).contains(&"Bonjour, tu as dit : et ensuite".to_string())
            && !h.agent(&id).status.is_active()
    })
    .await;
    let bash = h
        .items(&id)
        .into_iter()
        .find(|i| i["kind"] == "tool" && i["name"] == "Bash")
        .unwrap();
    assert_eq!(bash["status"], "ok");
    assert!(texts(&h, &id).contains(&"La commande est passée.".to_string()));

    // Refused with a word: the agent is told it.
    h.core
        .send_message(&id, "commande".into(), vec![])
        .await
        .unwrap();
    h.wait("the permission", |h| {
        waiting(h, &id, "permission").is_some()
    })
    .await;
    let card = waiting(&h, &id, "permission").unwrap();
    h.core
        .answer_permission(
            &id,
            card["id"].as_str().unwrap(),
            "deny",
            Some("pas maintenant".into()),
        )
        .unwrap();
    h.wait("the refusal said back", |h| {
        texts(h, &id).iter().any(|t| t.contains("pas maintenant"))
    })
    .await;

    // A question: its card, answered.
    h.wait("the turn over", |h| !h.agent(&id).status.is_active())
        .await;
    h.core
        .send_message(&id, "question".into(), vec![])
        .await
        .unwrap();
    h.wait("the question", |h| waiting(h, &id, "question").is_some())
        .await;
    let card = waiting(&h, &id, "question").unwrap();
    assert_eq!(card["questions"][0]["options"][1]["label"], "Rust");
    h.core
        .answer_question(
            &id,
            card["id"].as_str().unwrap(),
            json!({ "Quel langage préfères-tu ?": "Rust" }),
        )
        .unwrap();
    h.wait("the answer said back", |h| {
        texts(h, &id).contains(&"Tu as choisi : Rust".to_string())
    })
    .await;
    h.core.stop_for_good();
}

#[tokio::test]
async fn the_tasks_and_the_subagents_of_opencode_fill_the_plan() {
    let h = harness("esc44-plan");
    let (p, _) = h.project(false).await;
    opencode_account(&h);
    let id = new_agent(&h, &p.id).await;
    h.turn(&id, "étapes").await;
    let plan = h.agent(&id).plan.expect("its plan");
    assert_eq!(plan.tasks.len(), 3);
    assert!(plan
        .tasks
        .iter()
        .all(|t| t.status == crate::plan::TaskStatus::Done));
    h.turn(&id, "sous-agent").await;
    let plan = h.agent(&id).plan.expect("its plan");
    assert_eq!(plan.agents.len(), 1, "{plan:?}");
    let row = &plan.agents[0];
    assert_eq!(row.title, "Explorer le dépôt");
    assert_eq!(row.status, crate::plan::RunStatus::Done);
    assert_eq!(row.tools, 1);
    assert_eq!(row.tokens, Some(60));
    let child = h
        .items(&id)
        .into_iter()
        .find(|i| i["kind"] == "tool" && i["name"] == "Glob")
        .unwrap();
    assert_eq!(child["parent"], row.id.as_str());
    h.core.stop_for_good();
}

#[tokio::test]
async fn the_models_of_the_connected_providers_come_with_their_variants_and_favorites() {
    let h = harness("esc44-models");
    let (p, _) = h.project(false).await;
    opencode_account(&h);
    let id = new_agent(&h, &p.id).await;
    let models = h.core.engine_models.read()[&EngineId::Opencode].clone();
    let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "ollama/gpt-oss:20b-32k",
            "ollama/qwen3-coder:30b-32k",
            "lmstudio/devstral-small"
        ]
    );
    let gpt = &models[0];
    assert_eq!(gpt.efforts, ["low", "medium", "high"]);
    assert_eq!(gpt.provider.as_deref(), Some("Ollama (local)"));
    // The effort of a model that has it is its variant, at the next prompt.
    h.core
        .set_agent_options(
            &id,
            Some("ollama/gpt-oss:20b-32k".into()),
            Some("high".into()),
            None,
        )
        .await
        .unwrap();
    h.turn(&id, "bonjour").await;
    assert!(texts(&h, &id).contains(&"Bonjour, tu as dit : bonjour (variante high)".to_string()));
    // A model without variants is sent none.
    h.core
        .set_agent_options(&id, Some("ollama/qwen3-coder:30b-32k".into()), None, None)
        .await
        .unwrap();
    h.turn(&id, "salut").await;
    assert!(texts(&h, &id).contains(&"Bonjour, tu as dit : salut".to_string()));
    // Favorites, kept at once.
    let favs = h
        .core
        .set_favorite_model(EngineId::Opencode, "lmstudio/devstral-small", true)
        .unwrap();
    assert_eq!(favs[&EngineId::Opencode], ["lmstudio/devstral-small"]);
    h.core
        .set_favorite_model(EngineId::Opencode, "ollama/gpt-oss:20b-32k", true)
        .unwrap();
    let favs = h
        .core
        .set_favorite_model(EngineId::Opencode, "lmstudio/devstral-small", false)
        .unwrap();
    assert_eq!(favs[&EngineId::Opencode], ["ollama/gpt-oss:20b-32k"]);
    assert_eq!(
        h.core.settings.read().favorite_models[&EngineId::Opencode],
        ["ollama/gpt-oss:20b-32k"]
    );
    h.core.stop_for_good();
}

#[tokio::test]
async fn opencode_2_is_recognized_and_refused_with_its_reason() {
    let dir = crate::paths::test_dir("esc44-v2");
    let (file, body) = if cfg!(windows) {
        ("opencode.cmd", "@echo opencode v2.0.32\r\n")
    } else {
        ("opencode", "#!/bin/sh\necho 'opencode v2.0.32'\n")
    };
    let path = dir.join(file);
    std::fs::write(&path, body).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let program = Program::Native(path);
    let e = registry::check(&OPENCODE, &program).await.unwrap_err();
    let said = format!("{e:#}");
    assert!(
        said.contains("2.0.32") && said.contains("opencode-ai"),
        "{said}"
    );
    let version = registry::version(&OPENCODE, &program).await;
    let (state, note) = registry::state_of(
        crate::i18n::Lang::En,
        &OPENCODE,
        true,
        version.as_deref(),
        true,
    );
    assert_eq!(state, registry::EngineState::Unsupported);
    assert!(note.unwrap().contains("line 2"));
    // OpenCode 1 is taken.
    let (state, _) =
        registry::state_of(crate::i18n::Lang::En, &OPENCODE, true, Some("1.19.3"), true);
    assert_eq!(state, registry::EngineState::Ready);
}

/// Waits, up to `secs`, for what a real model takes its time with.
async fn wait_long(h: &Harness, what: &str, secs: u64, pred: impl Fn(&Harness) -> bool) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(secs);
    while std::time::Instant::now() < deadline {
        if pred(h) {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    let items = h.items(
        &h.core
            .agents
            .read()
            .keys()
            .next()
            .cloned()
            .unwrap_or_default(),
    );
    panic!("timed out waiting for {what}: {items:#?}");
}

/// Real run (ESC-44): an agent on the real OpenCode 1 that `ESCOUADE_REAL_OPENCODE` names, with a
/// local model of Ollama (`qwen3-coder:30b-32k`). By hand only, its OpenCode folders kept out of
/// the user's by `XDG_*` (a folder whose `config/opencode/opencode.json` declares the provider
/// `ollama`): `cargo test --lib real_opencode -- --ignored --nocapture` (docs/TODO-1.8.md, point 0,
/// « OpenCode »). It converses, asks a permission (allowed), a question (answered), keeps a task
/// list and runs a subagent; it prints the conversation.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn real_opencode() {
    let Ok(real) = std::env::var("ESCOUADE_REAL_OPENCODE") else {
        panic!("ESCOUADE_REAL_OPENCODE: the path of the real opencode");
    };
    assert!(
        std::env::var("XDG_CONFIG_HOME").is_ok(),
        "XDG_CONFIG_HOME and the others: OpenCode's folders out of the user's"
    );
    let h = harness("esc44-real");
    let (p, _) = h.project(false).await;
    h.set_settings(|s| {
        s.accounts.push(Account {
            id: "principal-opencode".into(),
            name: "Principal".into(),
            engine: EngineId::Opencode,
            config_dir: String::new(),
            claude_path: real.clone(),
            active: true,
            projects: Vec::new(),
        });
    });
    let id = h
        .core
        .create_agent_with(
            &p.id,
            AgentOptions {
                engine: Some(EngineId::Opencode),
                model: Some("ollama/qwen3-coder:30b-32k".into()),
                mode: Some("default".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .meta
        .id;
    let turns = |h: &Harness| h.items(&id).iter().filter(|i| i["kind"] == "turn").count();
    let send = |text: &str| {
        let (c, id, text) = (h.core.clone(), id.clone(), text.to_string());
        async move { c.send_message(&id, text, vec![]).await.unwrap() }
    };
    let ended = |h: &Harness, n: usize| turns(h) >= n && !h.agent(&id).status.is_active();

    send("Réponds seulement : A").await;
    wait_long(&h, "the first reply", 600, |h| ended(h, 1)).await;
    assert!(texts(&h, &id).iter().any(|t| t.contains('A')));
    assert_eq!(h.agent(&id).model, "ollama/qwen3-coder:30b-32k");

    send("Avec l'outil bash, lance la commande `git status --short`, puis dis-moi ce qu'elle a affiché.").await;
    wait_long(&h, "the permission", 600, |h| {
        waiting(h, &id, "permission").is_some()
    })
    .await;
    let card = waiting(&h, &id, "permission").unwrap();
    println!("PERMISSION {card:#}");
    assert_eq!(card["toolName"], "Bash");
    h.core
        .answer_permission(&id, card["id"].as_str().unwrap(), "allow", None)
        .unwrap();
    wait_long(&h, "the command's turn", 600, |h| ended(h, 2)).await;
    assert!(h
        .items(&id)
        .iter()
        .any(|i| i["kind"] == "tool" && i["name"] == "Bash" && i["status"] == "ok"));

    send("Pose-moi une question avec l'outil question : « Quelle couleur ? », avec les options « rouge » et « bleu ». Puis réponds seulement par la couleur choisie.").await;
    wait_long(&h, "the question", 600, |h| {
        waiting(h, &id, "question").is_some()
    })
    .await;
    let card = waiting(&h, &id, "question").unwrap();
    println!("QUESTION {card:#}");
    let q = card["questions"][0]["question"]
        .as_str()
        .unwrap()
        .to_string();
    let bleu = card["questions"][0]["options"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|o| o["label"].as_str())
        .find(|l| l.to_lowercase().contains("bleu"))
        .unwrap_or("bleu")
        .to_string();
    h.core
        .answer_question(&id, card["id"].as_str().unwrap(), json!({ q: bleu }))
        .unwrap();
    wait_long(&h, "the question's turn", 600, |h| ended(h, 3)).await;
    assert!(texts(&h, &id)
        .last()
        .is_some_and(|t| t.to_lowercase().contains("bleu")));

    send("Écris avec l'outil todowrite une liste de deux tâches (« Lire calc », « Relire calc »), puis marque-les toutes les deux terminées avec todowrite. Ne fais rien d'autre.").await;
    wait_long(&h, "the task list's turn", 600, |h| ended(h, 4)).await;
    let plan = h.agent(&id).plan.expect("its tasks");
    println!("TASKS {:?}", plan.tasks);
    assert!(!plan.tasks.is_empty());

    send("Utilise l'outil task avec le sous-agent « explore » pour lister les fichiers du dépôt. Ne fais rien d'autre toi-même.").await;
    // Its subagent's commands ask too (the rules of the server's config): each is allowed.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(900);
    let mut asked_by_sub = 0;
    while !ended(&h, 5) && std::time::Instant::now() < deadline {
        if let Some(card) = waiting(&h, &id, "permission") {
            println!("SUB PERMISSION {card:#}");
            if card["sub"].is_string() {
                asked_by_sub += 1;
            }
            h.core
                .answer_permission(&id, card["id"].as_str().unwrap(), "allow", None)
                .unwrap();
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    wait_long(&h, "the subagent's turn", 60, |h| ended(h, 5)).await;
    println!("PERMISSIONS ASKED BY THE SUBAGENT: {asked_by_sub}");
    let plan = h.agent(&id).plan.expect("its subagent");
    println!("SUBAGENTS {:?}", plan.agents);
    assert!(plan
        .agents
        .iter()
        .any(|a| a.status == crate::plan::RunStatus::Done));

    for i in h.items(&id) {
        let text = i["text"].as_str().unwrap_or_default();
        println!(
            "{} {} {} {}",
            i["kind"],
            i["name"].as_str().or(i["toolName"].as_str()).unwrap_or(""),
            i["status"].as_str().unwrap_or(""),
            crate::text::truncate(text, 120)
        );
    }
    h.core.stop_for_good();
}

/// What the fake `opencode` noted of its launches in the folder of an account
/// (`<OPENCODE_CONFIG_DIR>/launches.jsonl`).
fn launches(dir: &std::path::Path) -> Vec<Value> {
    std::fs::read_to_string(dir.join("launches.jsonl"))
        .unwrap_or_default()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

#[tokio::test]
async fn no_server_starts_without_a_model_of_its_providers_and_a_server_always_has_its_small_model()
{
    let h = harness("esc44-no-model");
    let (p, _) = h.project(false).await;
    let dir = h.dir.join("oc-work");
    std::fs::create_dir_all(&dir).unwrap();
    // No provider connected to OpenCode: nothing to run on.
    std::fs::write(
        dir.join("providers.json"),
        r#"{ "providers": [], "default": {} }"#,
    )
    .unwrap();
    h.set_settings(|s| {
        s.accounts.push(Account {
            id: "oc-work".into(),
            name: "Travail".into(),
            engine: EngineId::Opencode,
            config_dir: dir.to_string_lossy().into_owned(),
            claude_path: crate::engine::fake_opencode(),
            active: true,
            projects: Vec::new(),
        });
    });
    // A model of another harness (a handover, a setting of Claude Code's).
    let id = h
        .core
        .create_agent_with(
            &p.id,
            AgentOptions {
                engine: Some(EngineId::Opencode),
                model: Some("sonnet".into()),
                account: Some("oc-work".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .meta
        .id;
    let e = h
        .core
        .send_message(&id, "bonjour".into(), vec![])
        .await
        .err()
        .map(|e| format!("{e:#}"))
        .unwrap_or_default();
    let notices: Vec<String> = h
        .items(&id)
        .iter()
        .filter_map(|i| i["text"].as_str().map(str::to_string))
        .collect();
    assert!(
        e.contains("Aucun modèle d’OpenCode")
            || notices
                .iter()
                .any(|t| t.contains("Aucun modèle d’OpenCode")),
        "{e} / {notices:?}"
    );
    // Its models were asked (`opencode models`), and no server started.
    let asked = launches(&dir);
    assert!(asked.iter().all(|l| l["argv"][0] != "serve"), "{asked:?}");
    assert!(asked.iter().any(|l| l["argv"][0] == "models"), "{asked:?}");
    assert_eq!(h.agent(&id).model, "sonnet");

    // A provider connected: the agent takes its default model, and the server it starts has it as
    // its `model` and its `small_model`.
    std::fs::remove_file(dir.join("providers.json")).unwrap();
    h.turn(&id, "bonjour").await;
    assert_eq!(h.agent(&id).model, "ollama/qwen3-coder:30b-32k");
    let serve = launches(&dir)
        .into_iter()
        .find(|l| l["argv"][0] == "serve")
        .expect("its server");
    assert_eq!(serve["config"]["model"], "ollama/qwen3-coder:30b-32k");
    assert_eq!(serve["config"]["small_model"], "ollama/qwen3-coder:30b-32k");
    h.core.stop_for_good();
}

/// Real run (ESC-44): the models of the real OpenCode (`ESCOUADE_REAL_OPENCODE`, its folders by
/// `XDG_*` as for `real_opencode`), listed without a server. By hand only.
#[tokio::test]
#[ignore]
async fn real_opencode_models() {
    use crate::engine::Engine;
    let real = std::env::var("ESCOUADE_REAL_OPENCODE").expect("ESCOUADE_REAL_OPENCODE");
    let program = Program::Native(real.into());
    let models = OPENCODE
        .list_models(program, Vec::new(), &std::env::temp_dir())
        .await
        .unwrap()
        .expect("its models");
    println!("{models:#?}");
    assert!(models.iter().any(|m| m.id == "ollama/qwen3-coder:30b-32k"));
    assert_eq!(models.iter().filter(|m| m.default).count(), 1);
}
