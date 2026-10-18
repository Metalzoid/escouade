//! Codex beside Claude Code, through the core (ESC-38): its accounts, their quota, the texts it
//! writes and Escouade's server given to its agents. Its agents run the fake `codex`
//! (tests/fixtures/fake-codex.mjs).

use crate::core::AgentOptions;
use crate::core_tests::{harness, Harness};
use crate::model::*;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;

/// Codex's Principal and an account « Work » of its own folder (`<test dir>/work`), both on the fake
/// `codex`.
fn codex_accounts(h: &Harness) {
    h.set_settings(|s| {
        for (id, dir) in [
            ("principal-codex", String::new()),
            ("work", h.dir.join("work").to_string_lossy().into_owned()),
        ] {
            s.accounts.push(Account {
                id: id.into(),
                name: id.into(),
                engine: EngineId::Codex,
                config_dir: dir,
                claude_path: crate::engine::fake_codex(),
                active: true,
                projects: Vec::new(),
                daily_budget: None,
            });
        }
    });
}

/// What the fake `codex exec` noted in the folder of the account « Work ».
fn execs(h: &Harness) -> Vec<Value> {
    std::fs::read_to_string(h.dir.join("work").join("exec.jsonl"))
        .unwrap_or_default()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

#[tokio::test]
async fn the_texts_written_by_codex_go_through_codex_exec_on_the_account_of_the_agent() {
    let h = harness("esc38-writer");
    let (p, _) = h.project(false).await;
    codex_accounts(&h);
    h.set_settings(|s| s.writer_engine = Some(EngineId::Codex));
    let id = h
        .core
        .create_agent_with(
            &p.id,
            AgentOptions {
                engine: Some(EngineId::Codex),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .meta
        .id;
    h.core.agent(&id).unwrap().lock().meta.account = "work".into();
    let answer = h
        .core
        .one_shot("Nomme la tâche.", "ajouter un bouton", Some(&id), None)
        .await
        .unwrap();
    assert_eq!(answer, "Réponse de Codex : ajouter un bouton");
    // On its account's folder, ephemeral, read only, its instructions before its question.
    let asked = execs(&h);
    assert_eq!(asked.len(), 1);
    let argv: Vec<&str> = asked[0]["argv"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a.as_str().unwrap())
        .collect();
    for a in [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "read-only",
        "--json",
    ] {
        assert!(argv.contains(&a), "{a}: {argv:?}");
    }
    let question = asked[0]["question"].as_str().unwrap();
    assert!(
        question.starts_with("<instructions>\nNomme la tâche."),
        "{question}"
    );
    // Its refusal says Codex's reason.
    let e = h
        .core
        .one_shot("Nomme.", "échoue", Some(&id), None)
        .await
        .unwrap_err();
    assert_eq!(format!("{e:#}"), "Le modèle a refusé.");
    // A question about no agent of Codex: as a new agent of Codex would go, never Claude Code's.
    let other = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    let answer = h
        .core
        .one_shot("Nomme.", "autre chose", Some(&other), None)
        .await
        .unwrap();
    assert_eq!(answer, "Réponse de Codex : autre chose");
    h.core.stop_for_good();
}

#[test]
fn a_new_codex_account_shares_its_settings_skills_and_instructions_and_never_its_sign_in() {
    use crate::accounts::{create_of, launch_env, principal_of, shareable_of, ShareMode};
    let dir = crate::paths::test_dir("esc38-codex-share");
    let principal = dir.join(".codex");
    std::fs::create_dir_all(principal.join("skills").join("revue")).unwrap();
    std::fs::write(
        principal.join("skills").join("revue").join("SKILL.md"),
        "# Revue",
    )
    .unwrap();
    std::fs::write(
        principal.join("config.toml"),
        "[windows]\nsandbox = \"elevated\"\n",
    )
    .unwrap();
    std::fs::write(principal.join("AGENTS.md"), "Sois bref.").unwrap();
    std::fs::write(principal.join("auth.json"), "{\"tokens\":{}}").unwrap();
    std::fs::create_dir_all(principal.join("sessions")).unwrap();
    // Offered: its settings, instructions and skills; never its sign-in nor its sessions.
    assert_eq!(
        shareable_of(EngineId::Codex, &principal),
        ["config.toml", "AGENTS.md", "skills"]
    );
    let mut s = Settings::default();
    s.accounts.push(principal_of(EngineId::Codex));
    let root = dir.join("data").join("codex");
    for refused in ["auth.json", "sessions", "../x"] {
        let e = create_of(
            EngineId::Codex,
            &s,
            &root,
            &principal,
            "Refusé",
            &[refused.to_string()],
            ShareMode::Copy,
        )
        .unwrap_err();
        assert!(
            e.to_string().contains("ne se partage pas"),
            "{refused}: {e}"
        );
    }
    let share: Vec<String> = shareable_of(EngineId::Codex, &principal);
    let made = create_of(
        EngineId::Codex,
        &s,
        &root,
        &principal,
        "Travail",
        &share,
        ShareMode::Copy,
    )
    .unwrap();
    assert_eq!(
        (made.id.as_str(), made.engine),
        ("travail", EngineId::Codex)
    );
    let own = std::path::PathBuf::from(&made.config_dir);
    assert_eq!(own, std::path::absolute(root.join("travail")).unwrap());
    assert_eq!(
        std::fs::read_to_string(own.join("AGENTS.md")).unwrap(),
        "Sois bref."
    );
    assert!(own.join("config.toml").is_file());
    assert!(own.join("skills").join("revue").join("SKILL.md").is_file());
    assert!(!own.join("auth.json").exists());
    assert!(!own.join("sessions").exists());
    // Its processes get its folder by CODEX_HOME; the Principal is launched without it.
    assert_eq!(
        launch_env(&made),
        [("CODEX_HOME".to_string(), made.config_dir.clone())]
    );
    assert!(launch_env(&principal_of(EngineId::Codex)).is_empty());
}

#[test]
fn a_codex_sign_in_is_read_from_its_auth_json_its_email_from_its_id_token() {
    use base64::Engine as _;
    let dir = crate::paths::test_dir("esc38-codex-auth");
    assert_eq!(crate::accounts::codex_sign_in(&dir), None);
    let b64 = |v: Value| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(v.to_string());
    let token = |email: &str| {
        format!(
            "{}.{}.sig",
            b64(serde_json::json!({ "alg": "RS256" })),
            b64(serde_json::json!({ "email": email }))
        )
    };
    let write = |id_token: &str| {
        let auth = serde_json::json!({ "auth_mode": "chatgpt", "OPENAI_API_KEY": null,
            "tokens": { "id_token": id_token, "access_token": "a", "refresh_token": "r", "account_id": "c" } });
        std::fs::write(dir.join("auth.json"), auth.to_string()).unwrap();
    };
    write(&token("moi@example.com"));
    let one = crate::accounts::codex_sign_in(&dir).unwrap();
    assert_eq!(one.email.as_deref(), Some("moi@example.com"));
    let stamp = one.stamp.unwrap();
    assert_eq!(stamp.len(), 16);
    assert!(!stamp.contains("sig"));
    // Signed in again: another stamp.
    write(&token("autre@example.com"));
    assert_ne!(
        crate::accounts::codex_sign_in(&dir).unwrap().stamp.unwrap(),
        stamp
    );
    // An API key: signed in, no email.
    std::fs::write(dir.join("auth.json"), r#"{"OPENAI_API_KEY":"sk-x"}"#).unwrap();
    assert_eq!(crate::accounts::codex_sign_in(&dir).unwrap().email, None);
    std::fs::write(dir.join("auth.json"), "{}").unwrap();
    assert_eq!(crate::accounts::codex_sign_in(&dir), None);
}

#[tokio::test]
async fn a_codex_account_is_added_then_signed_in_by_codex_login_in_a_terminal_of_its_folder() {
    use crate::accounts::ShareMode;
    let h = harness("esc38-codex-login");
    // The first account of Codex brings its Principal.
    let work = h
        .core
        .create_account(EngineId::Codex, "Travail", &[], ShareMode::Link)
        .unwrap();
    let dir = std::path::PathBuf::from(&work.config_dir);
    assert_eq!(
        dir,
        std::path::absolute(h.core.data.accounts_of(EngineId::Codex).join("travail")).unwrap()
    );
    let ids: Vec<String> = h
        .core
        .settings
        .read()
        .accounts
        .iter()
        .map(|a| a.id.clone())
        .collect();
    assert_eq!(ids, ["principal", "principal-codex", "travail"]);
    let work = h
        .core
        .update_claude_account(Account {
            claude_path: crate::engine::fake_codex(),
            ..work
        })
        .unwrap()
        .into_iter()
        .find(|a| a.id == "travail")
        .unwrap();
    let status = h.core.claude_account_status("travail").await.unwrap();
    assert!(!status.connected);
    assert_eq!(status.dir, work.config_dir);
    let out = Arc::new(parking_lot::Mutex::new(String::new()));
    let sink = out.clone();
    let info = h
        .core
        .claude_login("travail", (200, 30), move |b| {
            sink.lock().push_str(&String::from_utf8_lossy(&b))
        })
        .unwrap();
    assert_eq!(
        (info.name.as_str(), info.shell.as_str()),
        ("Travail", "codex")
    );
    let start = std::time::Instant::now();
    let mut answered = false;
    while !dir.join("auth.json").is_file() {
        if !answered && out.lock().contains("\x1b[6n") {
            h.core.pty.write(&info.id, b"\x1b[1;1R").unwrap();
            answered = true;
        }
        assert!(
            start.elapsed() < Duration::from_secs(30),
            "no sign-in: {:?}",
            out.lock()
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let status = h.core.claude_account_status("travail").await.unwrap();
    assert!(status.connected);
    assert_eq!(status.email.as_deref(), Some("codex@example.com"));
    // What `codex login` said is in its terminal.
    while !crate::core_tests::plain_text(&out.lock()).contains("Successfully logged in") {
        assert!(
            start.elapsed() < Duration::from_secs(30),
            "{:?}",
            out.lock()
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    h.core.stop_for_good();
}

/// The account « Work » signed in (an `auth.json` of the fake's), its quota `limits` when given.
fn signed_in(h: &Harness, limits: Option<Value>) {
    let dir = h.dir.join("work");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("auth.json"),
        r#"{"OPENAI_API_KEY":null,"tokens":{"id_token":"a.e30.s","account_id":"c"}}"#,
    )
    .unwrap();
    if let Some(limits) = limits {
        let quota = serde_json::json!({ "rateLimits": limits });
        std::fs::write(dir.join("quota.json"), quota.to_string()).unwrap();
    }
}

/// The launches of the fake `codex` with the account « Work » (`CODEX_HOME`).
fn launches(h: &Harness) -> Vec<Value> {
    std::fs::read_to_string(h.dir.join("work").join("launches.jsonl"))
        .unwrap_or_default()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

#[tokio::test]
async fn the_quota_of_a_codex_account_without_an_agent_is_read_by_an_app_server_of_its_own() {
    let h = harness("esc38-quota-apart");
    codex_accounts(&h);
    // The free plan's single window: 30 days.
    let resets = chrono::Utc::now().timestamp() + 86_400;
    signed_in(
        &h,
        Some(serde_json::json!({
            "primary": { "usedPercent": 40, "windowDurationMins": 43200, "resetsAt": resets },
            "secondary": null, "rateLimitReachedType": null,
        })),
    );
    h.core.refresh_usage().await;
    let usage = h.core.usage.lock().clone();
    let work = usage.account("work").unwrap();
    assert_eq!(work.meters.len(), 1, "{:?}", work.meters);
    assert_eq!(
        (work.meters[0].minutes, work.meters[0].pct),
        (Some(43200), 40.0)
    );
    assert_eq!(work.meters[0].resets_at, Some(resets * 1000));
    assert!(work.connected);
    // Started for that and gone: nothing of Escouade's server, no thread.
    let started = launches(&h);
    assert_eq!(started.len(), 1);
    assert_eq!(started[0]["argv"], serde_json::json!(["app-server"]));
    // Its Principal has no sign-in here: said so, no process started.
    let main = usage.account("principal-codex").unwrap();
    assert!(!main.connected);
    // Read again within five minutes: not asked again.
    h.core.refresh_usage().await;
    assert_eq!(launches(&h).len(), 1);
    h.core.stop_for_good();
}

#[tokio::test]
async fn a_codex_turn_stopped_by_the_limit_waits_for_the_reset_then_goes_on_by_itself() {
    let h = harness("esc38-limit");
    let (p, _) = h.project(false).await;
    codex_accounts(&h);
    signed_in(&h, None);
    let id = h
        .core
        .create_agent_with(
            &p.id,
            AgentOptions {
                engine: Some(EngineId::Codex),
                account: Some("work".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .meta
        .id;
    h.turn(&id, "limite").await;
    let turn = h
        .items(&id)
        .into_iter()
        .rfind(|i| i["kind"] == "turn")
        .unwrap();
    assert_eq!(turn["limited"], true);
    // Its resume is planned after the reset Codex told of its full window (`account/rateLimits/
    // updated`, in an hour with the fake), not from the quota the core reads besides: a reading
    // asked before the turn may be answered after it.
    let at = h.agent(&id).resume_at.expect("its resume planned");
    assert!(at >= now_ms() + 3_500_000, "after the reset: {at}");
    // Not due yet: nothing sent.
    h.core.resume_due().await;
    assert!(h.agent(&id).resume_at.is_some());
    // Its reset has come: it goes on by itself, on Codex.
    h.core.agent(&id).unwrap().lock().meta.resume_at = Some(now_ms() - 1_000);
    h.core.resume_due().await;
    h.wait("it goes on", |h| {
        h.items(&id)
            .iter()
            .any(|i| i["kind"] == "text" && i["text"] == "Bonjour, tu as dit : continue")
    })
    .await;
    assert_eq!(h.agent(&id).resume_at, None);
    h.core.stop_for_good();
}

#[tokio::test]
async fn new_codex_agents_go_to_the_next_codex_account_once_one_is_over_the_threshold() {
    let h = harness("esc38-switch");
    let (p, _) = h.project(false).await;
    codex_accounts(&h);
    let new_codex = |h: &Harness| {
        let core = h.core.clone();
        let p = p.id.clone();
        async move {
            core.create_agent_with(
                &p,
                AgentOptions {
                    engine: Some(EngineId::Codex),
                    ..Default::default()
                },
            )
            .await
            .unwrap()
            .meta
        }
    };
    assert_eq!(new_codex(&h).await.account, "principal-codex");
    // The Principal of Codex over the threshold (Claude Code's untouched): « Work », and said so.
    let full = |pct: f64| {
        crate::usage::Reading::Windows(vec![QuotaMeter::window(
            300,
            RateWindow {
                pct,
                resets_at: Some(now_ms() + 3_600_000),
            },
        )])
    };
    h.core.record_usage("principal-codex", full(100.0));
    assert_eq!(h.core.usage.lock().current[&EngineId::Codex], "work");
    assert_eq!(h.core.usage.lock().current[&EngineId::Claude], "principal");
    assert!(h.events.lock().iter().any(|e| e["type"] == "toast"));
    let a = new_codex(&h).await;
    assert_eq!(a.account, "work");
    // Its process gets the folder of « Work »; a new Claude Code agent stays on Claude Code's.
    signed_in(&h, None);
    h.turn(&a.id, "bonjour").await;
    let started = launches(&h);
    assert_eq!(
        started.last().unwrap()["codexHome"],
        h.dir.join("work").to_string_lossy().as_ref()
    );
    assert_eq!(
        h.core.create_agent(&p.id, None).await.unwrap().meta.account,
        "principal"
    );
    h.core.stop_for_good();
}
