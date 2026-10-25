//! Cursor CLI beside Claude Code, through the core (ESC-42): the real run of its adapter, by hand,
//! and what the core gives its agents. The fake's runs are the bench (`engine/cursor/bench.rs`) and
//! the e2e (`tests/e2e/cursor.spec.ts`).

use crate::core::AgentOptions;
use crate::core_tests::{harness, Harness};
use crate::model::*;
use serde_json::Value;
use std::time::Duration;

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
    let deadline = std::time::Instant::now() + Duration::from_secs(secs);
    while std::time::Instant::now() < deadline {
        if pred(h) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    panic!("no {what}: {:#}", Value::Array(h.items(id)));
}

/// Cursor's Principal, on `program`.
fn cursor_account(h: &Harness, program: &str) {
    let program = program.to_string();
    h.set_settings(|s| {
        s.accounts.push(Account {
            id: "principal-cursor".into(),
            name: "Principal".into(),
            engine: EngineId::Cursor,
            config_dir: String::new(),
            claude_path: program,
            active: true,
            ..Default::default()
        });
    });
}

async fn cursor_agent(h: &Harness, project: &str, model: &str) -> String {
    h.core
        .create_agent_with(
            project,
            AgentOptions {
                engine: Some(EngineId::Cursor),
                model: Some(model.into()),
                mode: Some("default".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .meta
        .id
}

#[tokio::test]
async fn each_cursor_agent_runs_in_a_configuration_folder_of_its_own_removed_with_it() {
    let h = harness("esc42-agent-home");
    let (p, _) = h.project(false).await;
    cursor_account(&h, &crate::engine::fake_cursor());
    let a = cursor_agent(&h, &p.id, "default").await;
    let b = cursor_agent(&h, &p.id, "default").await;
    for id in [&a, &b] {
        h.core
            .send_message(id, "bonjour".into(), vec![])
            .await
            .unwrap();
    }
    let ended = |h: &Harness, id: &str| {
        h.items(id).iter().any(|i| i["kind"] == "turn") && !h.agent(id).status.is_active()
    };
    wait_long(&h, &a, "a's turn", 30, |h| ended(h, &a)).await;
    wait_long(&h, &b, "b's turn", 30, |h| ended(h, &b)).await;
    assert!(texts(&h, &a).iter().any(|t| t == "Cursor a reçu : bonjour"));
    // Each its own folder, its session kept there: never the user's ~/.cursor, nor the other's.
    let (home_a, home_b) = (h.core.data.agent_home(&a), h.core.data.agent_home(&b));
    assert_ne!(home_a, home_b);
    let session = h.agent(&a).session_id.unwrap();
    assert!(home_a
        .join("acp-sessions")
        .join(format!("{session}.json"))
        .is_file());
    assert!(!home_b
        .join("acp-sessions")
        .join(format!("{session}.json"))
        .exists());
    h.core.delete_agent(&a, false).await.unwrap();
    assert!(!home_a.exists(), "gone with its agent");
    assert!(home_b.exists());
}

/// Real run (ESC-42), by hand: the real Cursor CLI (`ESCOUADE_REAL_CURSOR`, its `agent.cmd`) on the
/// user's account, signed in already (`agent login`, never done here): `cargo test --lib
/// real_cursor -- --ignored --nocapture`. The account pays: four short turns on Auto. It converses,
/// asks a command, allowed « Pour cet agent » (its rule in the agent's own folder, never in
/// `~/.cursor/cli-config.json`), writes a file beside its folder (its permission, with its diff),
/// then is stopped and resumed by `session/load`; it prints the conversation.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn real_cursor() {
    let real =
        std::env::var("ESCOUADE_REAL_CURSOR").expect("ESCOUADE_REAL_CURSOR: the path of agent.cmd");
    let h = harness("esc42-real");
    let (p, _) = h.project(false).await;
    cursor_account(&h, &real);
    let id = cursor_agent(&h, &p.id, "default").await;
    let turns = |h: &Harness| h.items(&id).iter().filter(|i| i["kind"] == "turn").count();
    let send = |text: &str| {
        let (c, id, text) = (h.core.clone(), id.clone(), text.to_string());
        async move { c.send_message(&id, text, vec![]).await.unwrap() }
    };
    let ended = |h: &Harness, n: usize| turns(h) >= n && !h.agent(&id).status.is_active();

    send("Réponds seulement : A").await;
    wait_long(&h, &id, "the first reply", 300, |h| ended(h, 1)).await;
    assert!(texts(&h, &id).iter().any(|t| t.contains('A')));
    let session = h.agent(&id).session_id.clone().expect("its session");
    let home = h.core.data.agent_home(&id);
    println!("SESSION {session} HOME {}", home.display());

    send("Avec ton outil shell, lance exactement `git status --short`, puis dis en une phrase ce qu'il a affiché.").await;
    wait_long(&h, &id, "the permission", 300, |h| {
        waiting(h, &id, "permission").is_some() || ended(h, 2)
    })
    .await;
    let card = waiting(&h, &id, "permission").expect("git status asks");
    println!("PERMISSION {card:#}");
    assert_eq!(card["toolName"], "Bash");
    assert_eq!(card["alwaysScope"], "agent");
    h.core
        .answer_permission(&id, card["id"].as_str().unwrap(), "always", None)
        .unwrap();
    wait_long(&h, &id, "the command's turn", 300, |h| ended(h, 2)).await;
    // Only its rules: the file holds the account's name and e-mail too.
    let config: Value =
        serde_json::from_str(&std::fs::read_to_string(home.join("cli-config.json")).unwrap())
            .unwrap();
    let rules = config["permissions"]["allow"].to_string();
    println!("RULES {rules}");
    assert!(rules.contains("Shell(git status"), "{rules}");

    send("Avec ton outil d'édition de fichiers (pas le shell), crée le fichier ../esc42-dehors.txt qui contient la ligne « bonjour », puis dis seulement : fait.").await;
    wait_long(&h, &id, "the write", 300, |h| {
        waiting(h, &id, "permission").is_some() || ended(h, 3)
    })
    .await;
    if let Some(card) = waiting(&h, &id, "permission") {
        println!("WRITE {card:#}");
        h.core
            .answer_permission(&id, card["id"].as_str().unwrap(), "allow", None)
            .unwrap();
    }
    wait_long(&h, &id, "the write's turn", 300, |h| ended(h, 3)).await;

    // Stopped as an idle agent is, then resumed in another process.
    let old = h.core.agent(&id).unwrap().lock().detach().unwrap();
    old.close_input();
    assert!(
        old.wait_exit(Duration::from_secs(10)).await,
        "killed shortly after its input closed"
    );
    send("Sans outil, en une phrase : quel fichier as-tu créé au tour précédent ?").await;
    wait_long(&h, &id, "the resumed turn", 300, |h| ended(h, 4)).await;
    assert_eq!(h.agent(&id).session_id.as_deref(), Some(session.as_str()));

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
                .take(140)
                .collect::<String>()
                .replace('\n', " ")
        );
    }
    h.core.archive_agent(&id, true).await.ok();
}
