//! GitHub Copilot CLI beside Claude Code, through the core (ESC-39): the real run of its adapter,
//! by hand. The fake's runs are the bench (`engine/copilot/bench.rs`) and the e2e
//! (`tests/e2e/copilot.spec.ts`).

use crate::core::AgentOptions;
use crate::core_tests::{harness, Harness};
use crate::model::*;
use serde_json::{json, Value};

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

async fn wait_long(h: &Harness, id: &str, what: &str, secs: u64, pred: impl Fn(&Harness) -> bool) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(secs);
    while std::time::Instant::now() < deadline {
        if pred(h) {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    panic!("no {what}: {:#}", Value::Array(h.items(id)));
}

/// Real run (ESC-39), by hand: the real Copilot CLI 1.0.98 (`ESCOUADE_REAL_COPILOT`, its
/// `copilot.exe`), a `COPILOT_HOME` of its own and a token in the environment of this process
/// alone (`GH_TOKEN`, never printed): `cargo test --lib real_copilot -- --ignored --nocapture`.
/// Its credits are counted: four short turns. It converses, asks a command (allowed), a question
/// (answered), then plans and is sent back; it prints the conversation, tokens never in it.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn real_copilot() {
    let real = std::env::var("ESCOUADE_REAL_COPILOT")
        .expect("ESCOUADE_REAL_COPILOT: the path of the real copilot.exe");
    let home = std::env::var("COPILOT_HOME").expect("COPILOT_HOME: a folder of the trial's");
    assert!(
        !home.contains(".copilot"),
        "a COPILOT_HOME of the trial's, never the user's"
    );
    let h = harness("esc39-real");
    let (p, _) = h.project(false).await;
    h.set_settings(|s| {
        s.accounts.push(Account {
            id: "principal-copilot".into(),
            name: "Principal".into(),
            engine: EngineId::Copilot,
            config_dir: String::new(),
            claude_path: real.clone(),
            active: true,
            projects: Vec::new(),
            daily_budget: None,
        });
    });
    let id = h
        .core
        .create_agent_with(
            &p.id,
            AgentOptions {
                engine: Some(EngineId::Copilot),
                model: Some("gpt-6-luna".into()),
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
    wait_long(&h, &id, "the first reply", 300, |h| ended(h, 1)).await;
    assert!(texts(&h, &id).iter().any(|t| t.contains('A')));
    assert_eq!(h.agent(&id).model, "gpt-6-luna");

    send("Avec l'outil powershell, lance exactement `git status --short`, puis dis en une phrase ce qu'il a affiché.").await;
    wait_long(&h, &id, "the permission", 300, |h| {
        waiting(h, &id, "permission").is_some() || ended(h, 2)
    })
    .await;
    let card = waiting(&h, &id, "permission").expect("git status asks");
    println!("PERMISSION {card:#}");
    assert_eq!(card["toolName"], "Bash");
    h.core
        .answer_permission(&id, card["id"].as_str().unwrap(), "allow", None)
        .unwrap();
    wait_long(&h, &id, "the command's turn", 300, |h| ended(h, 2)).await;
    assert!(h
        .items(&id)
        .iter()
        .any(|i| i["kind"] == "tool" && i["name"] == "Bash" && i["status"] == "ok"));

    send("Pose-moi une question avec l'outil ask_user : « Quelle couleur ? », avec les choix rouge et bleu. Puis réponds seulement par la couleur choisie.").await;
    wait_long(&h, &id, "the question", 300, |h| {
        waiting(h, &id, "question").is_some()
    })
    .await;
    let card = waiting(&h, &id, "question").unwrap();
    println!("QUESTION {card:#}");
    let q = card["questions"][0]["question"]
        .as_str()
        .unwrap()
        .to_string();
    h.core
        .answer_question(&id, card["id"].as_str().unwrap(), json!({ q: "bleu" }))
        .unwrap();
    wait_long(&h, &id, "the question's turn", 300, |h| ended(h, 3)).await;
    assert!(texts(&h, &id)
        .last()
        .is_some_and(|t| t.to_lowercase().contains("bleu")));

    h.core
        .set_agent_options(&id, None, None, Some("plan".into()))
        .await
        .unwrap();
    send("Prépare un plan de deux étapes pour ajouter un fichier b.txt, sans rien modifier, puis demande sa validation avec exit_plan_mode, sans poser de question.").await;
    wait_long(&h, &id, "the plan", 300, |h| {
        waiting(h, &id, "permission").is_some_and(|c| c["toolName"] == "ExitPlanMode")
            || ended(h, 4)
    })
    .await;
    // Reads in its folder go without a card: only the plan is asked.
    let card = waiting(&h, &id, "permission").expect("the plan to approve");
    println!("PLAN {card:#}");
    assert_eq!(card["toolName"], "ExitPlanMode");
    // Sent back, Copilot plans again and asks again (seen on the real run of 2026-10-18, as on
    // ESC-23's): each plan is sent back until its turn ends.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
    while !ended(&h, 4) && std::time::Instant::now() < deadline {
        if let Some(card) = waiting(&h, &id, "permission") {
            h.core
                .answer_permission(
                    &id,
                    card["id"].as_str().unwrap(),
                    "deny",
                    Some("Pas maintenant : arrête-toi là, sans rien faire de plus.".into()),
                )
                .unwrap();
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    wait_long(&h, &id, "the plan's turn", 30, |h| ended(h, 4)).await;

    let a = h.agent(&id);
    for i in h.items(&id) {
        let text = i["text"].as_str().unwrap_or_default();
        println!(
            "{} {} {} {}",
            i["kind"],
            i["name"]
                .as_str()
                .or(i["toolName"].as_str())
                .unwrap_or_default(),
            i["status"]
                .as_str()
                .or(i["decision"].as_str())
                .unwrap_or_default(),
            text.chars()
                .take(100)
                .collect::<String>()
                .replace('\n', " ")
        );
    }
    println!(
        "TOKENS {} COST {:.5} $ SESSION {:?}",
        a.tokens, a.cost, a.session_id
    );
    assert!(a.tokens > 0 && a.cost > 0.0);
    h.core.archive_agent(&id, true).await.ok();
}
