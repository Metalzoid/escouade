//! Integration tests: the real process driver and agent runtime against a fake `claude`
//! (tests/fixtures/fake-claude.mjs, run with node).

use crate::agent::{AgentHandle, AgentRt, Effects};
use crate::board::TurnEnd;
use crate::engine::claude_args;
use crate::engine::{ClaudeProcess, SpawnOpts};
use crate::model::{AgentMeta, AgentStatus};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("fake-claude.mjs")
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ccm-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("src")).unwrap();
    dir
}

fn new_agent(dir: &std::path::Path) -> AgentHandle {
    let meta = AgentMeta {
        id: dir.file_name().unwrap().to_string_lossy().to_string(),
        project_id: "p".into(),
        name: "test".into(),
        model: "sonnet".into(),
        effort: "medium".into(),
        mode: "auto".into(),
        cwd: dir.to_string_lossy().to_string(),
        ..Default::default()
    };
    Arc::new(parking_lot::Mutex::new(AgentRt::new(
        meta,
        &dir.join("conversations"),
    )))
}

/// Spawns the fake CLI for `h`, wiring frames and exit into the runtime like Core does.
fn spawn(h: &AgentHandle, log: &std::path::Path) -> Arc<ClaudeProcess> {
    spawn_recording(h, log, Arc::default())
}

/// Like `spawn`, noting how each turn ends in `ends` (what Core hands to the board).
fn spawn_recording(
    h: &AgentHandle,
    log: &std::path::Path,
    ends: Arc<parking_lot::Mutex<Vec<TurnEnd>>>,
) -> Arc<ClaudeProcess> {
    spawn_with(h, log, None, ends, Arc::default())
}

/// What a launch of the fake CLI saw: its turns' ends, the quota windows it told.
type Rates = Arc<parking_lot::Mutex<Vec<Vec<crate::model::QuotaMeter>>>>;

/// Like `spawn_recording`, with `CLAUDE_CONFIG_DIR` set to `config_dir` when given (an account
/// of its own), and the quota windows it tells noted in `rates`.
fn spawn_with(
    h: &AgentHandle,
    log: &std::path::Path,
    config_dir: Option<&std::path::Path>,
    ends: Arc<parking_lot::Mutex<Vec<TurnEnd>>>,
    rates: Rates,
) -> Arc<ClaudeProcess> {
    let (opts, gen) = {
        let mut rt = h.lock();
        rt.gen += 1;
        let mut args = vec![fixture().to_string_lossy().to_string()];
        args.extend(claude_args(&rt.meta));
        let mut env = vec![("FAKE_CLAUDE_LOG".into(), log.to_string_lossy().to_string())];
        if let Some(dir) = config_dir {
            env.push((
                "CLAUDE_CONFIG_DIR".into(),
                dir.to_string_lossy().to_string(),
            ));
        }
        let opts = SpawnOpts {
            program: crate::engine::Program::Native(PathBuf::from("node")),
            cwd: rt.meta.cwd.clone(),
            args,
            env,
        };
        (opts, rt.gen)
    };
    let (h1, h2) = (h.clone(), h.clone());
    let (ends1, ends2) = (ends.clone(), ends);
    let proc = ClaudeProcess::spawn(
        opts,
        move |frame| {
            let mut rt = h1.lock();
            if rt.gen == gen {
                let mut fx = Effects::default();
                rt.handle_frame(&frame, &mut fx);
                ends1.lock().extend(fx.turn_end);
                rates.lock().extend(fx.rate);
            }
        },
        move |code, stderr| {
            let mut fx = Effects::default();
            h2.lock().on_exit(gen, code, &stderr, &mut fx);
            ends2.lock().extend(fx.turn_end);
        },
    )
    .expect("node must be installed to run the process tests");
    h.lock().attach(proc.clone());
    proc
}

fn send(h: &AgentHandle, proc: &ClaudeProcess, text: &str) {
    let uid = uuid::Uuid::new_v4().to_string();
    proc.send(&json!({ "type": "user", "message": { "role": "user", "content": text }, "parent_tool_use_id": null, "uuid": uid }))
        .unwrap();
    h.lock()
        .push_user(&uid, text, 0, &[], &mut Effects::default());
}

async fn wait_for(h: &AgentHandle, what: &str, pred: impl Fn(&mut AgentRt) -> bool) {
    for _ in 0..500 {
        if pred(&mut h.lock()) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    let rt = h.lock();
    panic!(
        "timed out waiting for {what}; status = {:?}",
        rt.meta.status
    );
}

fn items(h: &AgentHandle) -> Vec<Value> {
    h.lock().conv.items()
}

fn launches(log: &std::path::Path) -> Vec<Vec<String>> {
    std::fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .map(|l| {
            serde_json::from_str::<Value>(l).unwrap()["argv"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| a.as_str().unwrap().to_string())
                .collect()
        })
        .collect()
}

#[tokio::test]
async fn streams_a_reply_and_records_usage() {
    let dir = temp_dir("reply");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));
    let init = proc
        .control(json!({ "subtype": "initialize" }), Duration::from_secs(10))
        .await
        .unwrap();
    assert_eq!(init["commands"][0]["name"], "compact");

    send(&h, &proc, "Bonjour");
    wait_for(&h, "turn end", |rt| rt.meta.status == AgentStatus::Done).await;

    let all = items(&h);
    let text = all.iter().find(|i| i["kind"] == "text").unwrap();
    assert_eq!(text["text"], "Bonjour, tu as dit : Bonjour");
    assert_eq!(text["streaming"], false);
    let turn = all.iter().find(|i| i["kind"] == "turn").unwrap();
    assert_eq!(turn["tokens"], 1120);
    let rt = h.lock();
    assert_eq!(rt.meta.tokens, 1120);
    assert!((rt.meta.cost - 0.05).abs() < 1e-9);
    assert!(rt.meta.session_id.as_deref().unwrap().starts_with("sess-"));
}

#[tokio::test]
async fn idle_stop_keeps_the_conversation_and_the_next_message_resumes_the_session() {
    let dir = temp_dir("idle");
    let log = dir.join("log.jsonl");
    let h = new_agent(&dir);
    let proc = spawn(&h, &log);
    send(&h, &proc, "Premier");
    wait_for(&h, "first turn", |rt| rt.meta.status == AgentStatus::Done).await;
    let session = h.lock().meta.session_id.clone().unwrap();

    // Idle stop: the process is detached at once, so a message sent right after never
    // reaches the closing process.
    let old = h.lock().detach().expect("a running process");
    old.close_input();
    assert!(h.lock().proc.is_none());

    let proc = spawn(&h, &log);
    send(&h, &proc, "Second");
    wait_for(&h, "second turn", |rt| {
        rt.meta.status == AgentStatus::Done
            && rt
                .conv
                .items()
                .iter()
                .filter(|i| i["kind"] == "turn")
                .count()
                == 2
    })
    .await;
    tokio::time::sleep(Duration::from_millis(300)).await; // let the old process exit

    let rt = h.lock();
    assert_eq!(
        rt.meta.status,
        AgentStatus::Done,
        "the old process exit must not flag an error"
    );
    assert_eq!(rt.meta.session_id.as_deref(), Some(session.as_str()));
    drop(rt);
    let texts: Vec<String> = items(&h)
        .iter()
        .filter(|i| i["kind"] == "text")
        .map(|i| i["text"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(
        texts,
        vec![
            "Bonjour, tu as dit : Premier",
            "Bonjour, tu as dit : Second"
        ]
    );
    let runs = launches(&log);
    assert_eq!(runs.len(), 2);
    assert!(!runs[0].iter().any(|a| a.starts_with("--resume")));
    assert!(runs[1].contains(&format!("--resume={session}")));
}

#[tokio::test]
async fn answering_a_question_resumes_the_turn() {
    let dir = temp_dir("question");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));
    send(&h, &proc, "question");
    wait_for(&h, "question", |rt| rt.meta.status == AgentStatus::Waiting).await;
    assert_eq!(h.lock().view().pending, vec!["req_question".to_string()]);

    h.lock()
        .answer_question_by(
            "req_question",
            json!({ "Quelle base de données ?": "SQLite" }),
            None,
            &mut Effects::default(),
        )
        .unwrap();
    wait_for(&h, "turn end", |rt| rt.meta.status == AgentStatus::Done).await;

    let all = items(&h);
    let q = all.iter().find(|i| i["kind"] == "question").unwrap();
    assert_eq!(q["answers"]["Quelle base de données ?"], "SQLite");
    assert!(all
        .iter()
        .any(|i| i["kind"] == "text" && i["text"] == "Choix retenu : SQLite"));
    assert!(h.lock().view().pending.is_empty());
}

#[tokio::test]
async fn permission_always_forwards_the_suggested_rules_and_deny_forwards_the_reason() {
    let dir = temp_dir("perm");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));

    send(&h, &proc, "permission");
    wait_for(&h, "permission", |rt| {
        rt.meta.status == AgentStatus::Waiting
    })
    .await;
    h.lock()
        .answer_permission_by("req_perm", "always", None, None, &mut Effects::default())
        .unwrap();
    wait_for(&h, "turn end", |rt| rt.meta.status == AgentStatus::Done).await;
    assert!(items(&h)
        .iter()
        .any(|i| i["text"] == "Commande exécutée (règle enregistrée)."));

    send(&h, &proc, "permission encore");
    wait_for(&h, "permission 2", |rt| {
        rt.meta.status == AgentStatus::Waiting
    })
    .await;
    h.lock()
        .answer_permission_by(
            "req_perm",
            "deny",
            Some("utilise npm run clean".into()),
            None,
            &mut Effects::default(),
        )
        .unwrap();
    wait_for(&h, "turn end 2", |rt| {
        rt.meta.status == AgentStatus::Done
            && rt
                .conv
                .items()
                .iter()
                .filter(|i| i["kind"] == "turn")
                .count()
                == 2
    })
    .await;
    let all = items(&h);
    assert!(all
        .iter()
        .any(|i| i["text"] == "Compris : utilise npm run clean"));
    let tool = all
        .iter()
        .rev()
        .find(|i| i["kind"] == "tool" && i["name"] == "Bash")
        .unwrap();
    assert_eq!(tool["status"], "error");
}

#[tokio::test]
async fn an_answer_given_through_the_server_says_who_gave_it_to_the_conversation_and_to_claude() {
    let dir = temp_dir("answer-by");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));

    // A question answered in the window has no author: the card keeps saying nothing of one.
    send(&h, &proc, "question");
    wait_for(&h, "question", |rt| rt.meta.status == AgentStatus::Waiting).await;
    h.lock()
        .answer_question_by(
            "req_question",
            json!({ "Quelle base de données ?": "SQLite" }),
            None,
            &mut Effects::default(),
        )
        .unwrap();
    wait_for(&h, "turn end", |rt| rt.meta.status == AgentStatus::Done).await;
    let all = items(&h);
    let q = all.iter().find(|i| i["kind"] == "question").unwrap();
    assert!(q.get("by").is_none(), "{q}");
    // Claude reads the user's answer as it is, with no author.
    assert!(all
        .iter()
        .any(|i| i["kind"] == "text" && i["text"] == "Choix retenu : SQLite"));

    // The same question answered through the server: the item keeps who answered.
    send(&h, &proc, "question encore");
    wait_for(&h, "question 2", |rt| {
        rt.meta.status == AgentStatus::Waiting
    })
    .await;
    h.lock()
        .answer_question_by(
            "req_question",
            json!({ "Quelle base de données ?": "PostgreSQL" }),
            Some("agent-2"),
            &mut Effects::default(),
        )
        .unwrap();
    wait_for(&h, "turn end 2", |rt| rt.meta.status == AgentStatus::Done).await;
    let all = items(&h);
    let q = all.iter().rfind(|i| i["kind"] == "question").unwrap();
    // The card keeps the answer as it was given; Claude reads it with who gave it.
    assert_eq!(q["answers"]["Quelle base de données ?"], "PostgreSQL");
    assert_eq!(q["by"], "agent-2");
    assert!(all.iter().any(|i| i["kind"] == "text"
        && i["text"] == "Choix retenu : PostgreSQL (réponse de agent-2 via Escouade)"));

    // A permission allowed through the server: the item says by whom.
    send(&h, &proc, "permission");
    wait_for(&h, "permission", |rt| {
        rt.meta.status == AgentStatus::Waiting
    })
    .await;
    h.lock()
        .answer_permission_by(
            "req_perm",
            "allow",
            None,
            Some("Claude (hors Escouade)"),
            &mut Effects::default(),
        )
        .unwrap();
    wait_for(&h, "turn end 3", |rt| rt.meta.status == AgentStatus::Done).await;
    let all = items(&h);
    let p = all.iter().rfind(|i| i["kind"] == "permission").unwrap();
    assert_eq!(
        (p["decision"].as_str(), p["by"].as_str()),
        (Some("allow"), Some("Claude (hors Escouade)"))
    );

    // Refused with a message: Claude is told who refused (never « L'utilisateur a refusé »), the
    // card keeps the message as it was written.
    send(&h, &proc, "permission encore");
    wait_for(&h, "permission 2", |rt| {
        rt.meta.status == AgentStatus::Waiting
    })
    .await;
    h.lock()
        .answer_permission_by(
            "req_perm",
            "deny",
            Some("utilise npm run clean".into()),
            Some("agent-2"),
            &mut Effects::default(),
        )
        .unwrap();
    wait_for(&h, "turn end 4", |rt| rt.meta.status == AgentStatus::Done).await;
    let all = items(&h);
    assert!(all
        .iter()
        .any(|i| i["text"] == "Compris : Refusé par agent-2 via Escouade : utilise npm run clean"));
    let p = all.iter().rfind(|i| i["kind"] == "permission").unwrap();
    assert_eq!(
        (
            p["decision"].as_str(),
            p["message"].as_str(),
            p["by"].as_str()
        ),
        (Some("deny"), Some("utilise npm run clean"), Some("agent-2"))
    );

    // Refused without a word: Claude is still told who refused.
    send(&h, &proc, "permission encore une fois");
    wait_for(&h, "permission 3", |rt| {
        rt.meta.status == AgentStatus::Waiting
    })
    .await;
    h.lock()
        .answer_permission_by(
            "req_perm",
            "deny",
            None,
            Some("agent-2"),
            &mut Effects::default(),
        )
        .unwrap();
    wait_for(&h, "turn end 5", |rt| rt.meta.status == AgentStatus::Done).await;
    assert!(items(&h)
        .iter()
        .any(|i| i["text"] == "Compris : Refusé par agent-2 via Escouade."));
}

#[tokio::test]
async fn a_request_answered_twice_says_it_was_answered_and_one_that_never_was_says_it_is_not_found()
{
    let dir = temp_dir("answer-twice");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));
    send(&h, &proc, "permission");
    wait_for(&h, "permission", |rt| {
        rt.meta.status == AgentStatus::Waiting
    })
    .await;
    let mut fx = Effects::default();
    h.lock()
        .answer_permission_by("req_perm", "allow", None, None, &mut fx)
        .unwrap();
    // The window (or a client) answers what has just been answered.
    let again = h
        .lock()
        .answer_permission_by("req_perm", "deny", None, None, &mut fx)
        .unwrap_err()
        .to_string();
    assert_eq!(again, "Cette demande a déjà reçu une réponse.");
    // An id that never was: not found.
    let never = h
        .lock()
        .answer_permission_by("nope", "allow", None, None, &mut fx)
        .unwrap_err()
        .to_string();
    assert_eq!(never, "demande introuvable");
    wait_for(&h, "turn end", |rt| rt.meta.status == AgentStatus::Done).await;

    send(&h, &proc, "question");
    wait_for(&h, "question", |rt| rt.meta.status == AgentStatus::Waiting).await;
    let answers = json!({ "Quelle base de données ?": "SQLite" });
    h.lock()
        .answer_question_by("req_question", answers.clone(), None, &mut fx)
        .unwrap();
    let again = h
        .lock()
        .answer_question_by("req_question", answers, None, &mut fx)
        .unwrap_err()
        .to_string();
    assert_eq!(again, "Cette demande a déjà reçu une réponse.");
    let never = h
        .lock()
        .answer_question_by("nope", json!({}), None, &mut fx)
        .unwrap_err()
        .to_string();
    assert_eq!(never, "question introuvable");
}

#[tokio::test]
async fn edits_are_counted_and_attributed_to_the_agent() {
    let dir = temp_dir("edit");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));
    send(&h, &proc, "edit");
    wait_for(&h, "turn end", |rt| rt.meta.status == AgentStatus::Done).await;
    let all = items(&h);
    let tool = all
        .iter()
        .find(|i| i["kind"] == "tool" && i["name"] == "Edit")
        .unwrap();
    assert_eq!(tool["result"]["add"], 2);
    assert_eq!(tool["result"]["del"], 1);
    assert_eq!(h.lock().meta.touched_files, vec!["src/app.ts".to_string()]);
}

#[tokio::test]
async fn interrupt_ends_the_turn_without_error() {
    let dir = temp_dir("interrupt");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));
    send(&h, &proc, "slow");
    wait_for(&h, "streaming", |rt| {
        rt.conv.items().iter().any(|i| i["kind"] == "text")
    })
    .await;
    h.lock().interrupted = true;
    proc.control(json!({ "subtype": "interrupt" }), Duration::from_secs(5))
        .await
        .unwrap();
    wait_for(&h, "turn end", |rt| !rt.meta.status.is_active()).await;
    assert_eq!(h.lock().meta.status, AgentStatus::Done);
    let turn = items(&h).into_iter().find(|i| i["kind"] == "turn").unwrap();
    assert_eq!(turn["interrupted"], true);
    assert_eq!(turn["isError"], false);
}

/// Under Windows, an agent is gone when its job holds no process any more: a program it started
/// (a dev server, here the fake CLI's detached « grandchild ») lives on, and keeps its folder, after
/// the process itself has ended.
#[cfg(windows)]
#[tokio::test]
async fn an_agent_is_gone_only_once_what_it_started_is_gone_too() {
    let dir = temp_dir("wait-gone");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));
    send(&h, &proc, "grandchild [detached]");
    wait_for(&h, "turn end", |rt| rt.meta.status == AgentStatus::Done).await;

    // The process ends with its input; its grandchild stays in the job.
    proc.close_input();
    assert!(proc.wait_exit(Duration::from_secs(10)).await);
    assert!(proc.usage().unwrap().processes >= 1);
    assert!(!proc.wait_gone(Duration::from_millis(300)).await);

    proc.kill();
    assert!(proc.wait_gone(Duration::from_secs(10)).await);
    assert_eq!(proc.usage().unwrap().processes, 0);
}

#[tokio::test]
async fn a_new_process_starts_without_the_activity_or_text_of_a_turn_that_never_ended() {
    let dir = temp_dir("fresh-turn");
    let log = dir.join("log.jsonl");
    let h = new_agent(&dir);
    let proc = spawn(&h, &log);
    send(&h, &proc, "slow");
    wait_for(&h, "the text of the turn", |rt| {
        rt.view().activity.as_deref() == Some("Rédige")
            && rt
                .conv
                .items()
                .iter()
                .any(|i| i["kind"] == "text" && i["streaming"] == false)
    })
    .await;

    // A new process takes over before the turn ever ended (no result, no exit seen); what the
    // old one still says is ignored.
    let old = proc;
    let proc = spawn(&h, &log);
    old.kill();
    assert_eq!(h.lock().view().activity, None);
    // The text of the lost turn does not leak into the next one's.
    let mut fx = Effects::default();
    h.lock().handle_frame(
        &json!({"type":"result","subtype":"success","is_error":false,"duration_ms":1,"result":"Résumé"}),
        &mut fx,
    );
    assert_eq!(fx.turn_end, Some(TurnEnd::Finished("Résumé".into())));
    proc.close_input();
}

#[tokio::test]
async fn a_session_claude_code_does_not_know_still_ends_the_turn_sent_to_it() {
    let dir = temp_dir("lost-session");
    let h = new_agent(&dir);
    {
        // The agent resumes a session that is gone, and a message is waiting for it.
        let mut rt = h.lock();
        rt.meta.session_id = Some("missing-1".into());
        rt.push_user("u1", "Bonjour", 0, &[], &mut Effects::default());
    }
    let ends = Arc::<parking_lot::Mutex<Vec<TurnEnd>>>::default();
    spawn_recording(&h, &dir.join("log.jsonl"), ends.clone());
    for _ in 0..500 {
        if !ends.lock().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(
        *ends.lock(),
        vec![TurnEnd::Error(
            "Session Claude introuvable : une nouvelle session sera démarrée au prochain message."
                .into()
        )]
    );
    let rt = h.lock();
    assert_eq!(rt.meta.status, AgentStatus::Done);
    assert_eq!(rt.meta.session_id, None);
}

/// The `projects/*/<session>.jsonl` of a Claude Code configuration folder.
fn session_files(config_dir: &std::path::Path, session: &str) -> Vec<PathBuf> {
    std::fs::read_dir(config_dir.join("projects"))
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path().join(format!("{session}.jsonl")))
        .filter(|p| p.is_file())
        .collect()
}

fn logged(log: &std::path::Path) -> Vec<Value> {
    std::fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

async fn wait_ends(ends: &parking_lot::Mutex<Vec<TurnEnd>>, n: usize) {
    for _ in 0..500 {
        if ends.lock().len() >= n {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("timed out waiting for {n} turn ends: {:?}", ends.lock());
}

/// Waits until `n` quota readings were told: the fake CLI sends one in a frame of its own, right
/// after a turn's end, which a test that waited for the end may read before.
async fn wait_rates(rates: &Rates, n: usize) {
    for _ in 0..500 {
        if rates.lock().len() >= n {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!(
        "timed out waiting for {n} quota readings: {:?}",
        rates.lock()
    );
}

#[tokio::test]
async fn an_account_keeps_its_sessions_in_its_folder_and_resumes_them_from_there() {
    let dir = temp_dir("account-sessions");
    let (log, config) = (dir.join("log.jsonl"), dir.join("pro"));
    let h = new_agent(&dir);
    let proc = spawn_with(&h, &log, Some(&config), Arc::default(), Arc::default());
    send(&h, &proc, "Premier");
    wait_for(&h, "first turn", |rt| rt.meta.status == AgentStatus::Done).await;
    let session = h.lock().meta.session_id.clone().unwrap();
    // Where Claude Code keeps it: in a folder named after the project's, every character but
    // letters and digits a dash.
    let files = session_files(&config, &session);
    assert_eq!(files.len(), 1, "{files:?}");
    let folder = files[0].parent().unwrap().file_name().unwrap();
    let ours = format!("ccm-test-account-sessions-{}", std::process::id())
        .replace(|c: char| !c.is_ascii_alphanumeric(), "-");
    assert!(folder.to_string_lossy().ends_with(&ours), "{folder:?}");
    assert_eq!(
        logged(&log)[0]["configDir"],
        json!(config.to_string_lossy())
    );

    // A new process of the same account finds it.
    let old = h.lock().detach().expect("a running process");
    old.close_input();
    let proc = spawn_with(&h, &log, Some(&config), Arc::default(), Arc::default());
    send(&h, &proc, "Second");
    wait_for(&h, "second turn", |rt| {
        rt.meta.status == AgentStatus::Done
            && rt
                .conv
                .items()
                .iter()
                .filter(|i| i["kind"] == "turn")
                .count()
                == 2
    })
    .await;
    assert_eq!(h.lock().meta.session_id.as_deref(), Some(session.as_str()));
    assert!(launches(&log)[1].contains(&format!("--resume={session}")));
    let texts: Vec<Value> = items(&h)
        .into_iter()
        .filter(|i| i["kind"] == "text")
        .map(|i| i["text"].clone())
        .collect();
    assert_eq!(
        texts,
        [
            json!("Bonjour, tu as dit : Premier"),
            json!("Bonjour, tu as dit : Second")
        ]
    );
}

#[tokio::test]
async fn a_session_absent_from_the_accounts_folder_is_not_found() {
    let dir = temp_dir("account-elsewhere");
    let h = new_agent(&dir);
    {
        // A session kept in another account's folder, and a message waiting for it.
        let mut rt = h.lock();
        rt.meta.session_id = Some("sess-ailleurs".into());
        rt.push_user("u1", "Bonjour", 0, &[], &mut Effects::default());
    }
    let ends = Arc::<parking_lot::Mutex<Vec<TurnEnd>>>::default();
    let log = dir.join("log.jsonl");
    spawn_with(
        &h,
        &log,
        Some(&dir.join("pro")),
        ends.clone(),
        Arc::default(),
    );
    wait_ends(&ends, 1).await;
    assert_eq!(
        *ends.lock(),
        vec![TurnEnd::Error(
            "Session Claude introuvable : une nouvelle session sera démarrée au prochain message."
                .into()
        )]
    );
    assert_eq!(h.lock().meta.session_id, None);
}

#[tokio::test]
async fn a_session_kept_under_another_project_folder_of_the_account_is_resumed() {
    // A copy of an agent made in a worktree of its own resumes the original's session from
    // another folder: Claude Code finds it among all the account's projects.
    let dir = temp_dir("account-other-folder");
    let config = dir.join("pro");
    let elsewhere = config.join("projects").join("C--Users-x-ailleurs");
    std::fs::create_dir_all(&elsewhere).unwrap();
    std::fs::write(
        elsewhere.join("sess-ailleurs.jsonl"),
        "{\"type\":\"user\",\"sessionId\":\"sess-ailleurs\"}\n",
    )
    .unwrap();
    let h = new_agent(&dir);
    h.lock().meta.session_id = Some("sess-ailleurs".into());
    let (ends, log) = (
        Arc::<parking_lot::Mutex<Vec<TurnEnd>>>::default(),
        dir.join("log.jsonl"),
    );
    let proc = spawn_with(&h, &log, Some(&config), ends.clone(), Arc::default());
    send(&h, &proc, "Bonjour");
    wait_ends(&ends, 1).await;
    assert!(
        matches!(ends.lock()[0], TurnEnd::Finished(_)),
        "{:?}",
        ends.lock()
    );
    assert!(launches(&log)[0].contains(&"--resume=sess-ailleurs".to_string()));
    assert_eq!(h.lock().meta.session_id.as_deref(), Some("sess-ailleurs"));
}

#[tokio::test]
async fn an_accounts_fake_limit_stops_every_turn_at_the_limit_at_100_percent() {
    let dir = temp_dir("account-limit");
    let config = dir.join("pro");
    std::fs::create_dir_all(&config).unwrap();
    std::fs::write(config.join("fake-limit"), "").unwrap();
    let h = new_agent(&dir);
    let (ends, rates) = (
        Arc::<parking_lot::Mutex<Vec<TurnEnd>>>::default(),
        Rates::default(),
    );
    let proc = spawn_with(
        &h,
        &dir.join("log.jsonl"),
        Some(&config),
        ends.clone(),
        rates.clone(),
    );
    let five_hour = |usage: Value| usage["rate_limits"]["five_hour"]["utilization"].clone();
    let usage = proc
        .control(json!({ "subtype": "get_usage" }), Duration::from_secs(10))
        .await
        .unwrap();
    assert_eq!(five_hour(usage), json!(100));
    send(&h, &proc, "Bonjour");
    wait_ends(&ends, 1).await;
    assert_eq!(*ends.lock(), vec![TurnEnd::Limited]);
    let told = rates.lock().clone();
    assert_eq!(told.len(), 1, "{told:?}");
    assert_eq!(
        told[0].first().map(|w| (w.minutes, w.pct)),
        Some((Some(300), 100.0))
    );

    // The file gone, the account has quota again.
    std::fs::remove_file(config.join("fake-limit")).unwrap();
    send(&h, &proc, "Encore");
    wait_ends(&ends, 2).await;
    assert!(matches!(ends.lock()[1], TurnEnd::Finished(_)));
    wait_rates(&rates, 2).await;
    let pct = rates.lock()[1].first().map(|w| w.pct).unwrap();
    assert!((pct - 12.0).abs() < 1e-9, "{pct}");
    let usage = proc
        .control(json!({ "subtype": "get_usage" }), Duration::from_secs(10))
        .await
        .unwrap();
    assert_eq!(five_hour(usage), json!(12));
}

#[tokio::test]
async fn a_crash_during_a_turn_flags_the_agent_in_error() {
    let dir = temp_dir("crash");
    let h = new_agent(&dir);
    let proc = spawn(&h, &dir.join("log.jsonl"));
    send(&h, &proc, "crash");
    wait_for(&h, "exit", |rt| rt.proc.is_none()).await;
    assert_eq!(h.lock().meta.status, AgentStatus::Error);
    assert!(items(&h).iter().any(|i| i["kind"] == "notice"
        && i["level"] == "error"
        && i["text"].as_str().unwrap().contains("code 3")));
}

/// A `claude` installed in WSL, driven through `wsl.exe` as an agent's: its arguments (an empty
/// one, a file of the app's by its Linux path, text with quotes and `$`) and its variables reach
/// it as they are, it runs in the agent's folder under `/mnt/…`, and the stream goes both ways.
/// Only where WSL has a distribution (not on the CI's Windows runners).
#[tokio::test]
async fn a_claude_of_wsl_gets_its_arguments_folder_and_variables_in_linux() {
    let machine = crate::wsl::Machine::this();
    let (Some(exe), Some(distro)) = (machine.exe.clone(), machine.default.clone()) else {
        eprintln!("no WSL distribution: skipped");
        return;
    };
    let dir = temp_dir("wsl-claude");
    let fake = fixture().with_file_name("fake-claude-wsl");
    let to_linux =
        |p: &std::path::Path| crate::wsl::to_linux(&p.to_string_lossy(), &distro, "/mnt/").unwrap();
    let program = crate::wsl::Program {
        exe,
        distro: distro.clone(),
        path: to_linux(&std::fs::canonicalize(&fake).unwrap()),
        home: "/root".into(),
        mount_root: "/mnt/".into(),
    };
    let config = dir.join("compte pro");
    let (frames, exit) = (
        Arc::new(parking_lot::Mutex::new(Vec::<Value>::new())),
        Arc::new(parking_lot::Mutex::new(None)),
    );
    let (f, x) = (frames.clone(), exit.clone());
    let proc = ClaudeProcess::spawn(
        SpawnOpts {
            program: crate::engine::Program::Wsl(program.clone()),
            cwd: dir.to_string_lossy().into_owned(),
            args: [
                "--mcp-config",
                &dir.join("mcp").join("a1.json").to_string_lossy(),
                "--tools",
                "",
                "--system-prompt",
                r#"l'été "cité" $HOME `ls`"#,
            ]
            .map(String::from)
            .to_vec(),
            env: vec![
                (
                    "CLAUDE_CONFIG_DIR".into(),
                    config.to_string_lossy().into_owned(),
                ),
                ("FAKE_VAR".into(), "a b;c".into()),
            ],
        },
        move |frame| f.lock().push(frame),
        move |code, stderr| *x.lock() = Some((code, stderr)),
    )
    .unwrap();
    let started = async {
        loop {
            if let Some(s) = frames.lock().iter().find(|f| f["type"] == "started") {
                return s.clone();
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    };
    let started = tokio::time::timeout(Duration::from_secs(60), started)
        .await
        .unwrap_or_else(|_| panic!("no first frame; exit: {:?}", exit.lock()));
    assert_eq!(
        started["argv"],
        json!([
            "--mcp-config",
            format!("{}/mcp/a1.json", to_linux(&dir)),
            "--tools",
            "",
            "--system-prompt",
            r#"l'été "cité" $HOME `ls`"#,
        ])
    );
    assert_eq!(started["cwd"], json!(to_linux(&dir)));
    assert_eq!(started["configDir"], json!(to_linux(&config)));
    assert_eq!(started["var"], json!("a b;c"));

    let answer = proc
        .control(json!({ "subtype": "initialize" }), Duration::from_secs(10))
        .await
        .unwrap();
    assert_eq!(answer, json!({ "ok": true }));
    proc.send(&json!({ "type": "user", "message": { "role": "user", "content": "Bonjour" } }))
        .unwrap();
    proc.close_input();
    assert!(
        proc.wait_exit(Duration::from_secs(30)).await,
        "still running"
    );
    assert_eq!(
        exit.lock().as_ref().map(|e| e.0),
        Some(Some(0)),
        "{:?}",
        exit.lock()
    );
    assert!(frames
        .lock()
        .iter()
        .any(|f| f["type"] == "echo" && f["line"]["message"]["content"] == "Bonjour"));

    // A folder Linux does not have (here, drives said to be mounted elsewhere): the program does
    // not start in another one (wsl.exe would take the home folder), and the exit says why.
    let lost = crate::wsl::Program {
        mount_root: "/nowhere/".into(),
        ..program
    };
    let gone = Arc::new(parking_lot::Mutex::new(None));
    let g = gone.clone();
    let proc = ClaudeProcess::spawn(
        SpawnOpts {
            program: crate::engine::Program::Wsl(lost),
            cwd: dir.to_string_lossy().into_owned(),
            args: vec![],
            env: vec![],
        },
        |_| {},
        move |code, said| *g.lock() = Some((code, said)),
    )
    .unwrap();
    assert!(
        proc.wait_exit(Duration::from_secs(60)).await,
        "still running"
    );
    let (code, said) = gone.lock().clone().unwrap();
    assert_eq!(code, Some(126), "{said}");
    assert!(said.contains("/nowhere/c/"), "{said}");
}

/// « Approuver le plan » (ESC-277): Claude Code goes on in the mode the agent was in before Plan,
/// told by a `setMode` of the answer (the fake goes out of Plan in it, else in `default`, as Claude
/// Code does); « Approuver et accepter les édits » in acceptEdits; Haiku 4.5, which has no auto
/// mode, in `default`.
#[tokio::test]
async fn an_approved_plan_resumes_in_the_mode_before_plan() {
    for (model, decision, want) in [
        ("sonnet", "allow", "auto"),
        ("sonnet", "always", "acceptEdits"),
        ("claude-haiku-4-5", "allow", "default"),
    ] {
        let dir = temp_dir(&format!("plan-resume-{decision}-{model}"));
        let h = new_agent(&dir);
        h.lock().meta.model = model.into();
        let proc = spawn(&h, &dir.join("log.jsonl"));
        // Auto, then Plan (as Claude Code's `permissionMode` tells it).
        h.lock().meta.set_mode("plan");
        send(&h, &proc, "exit plan");
        wait_for(&h, "the plan", |rt| rt.meta.status == AgentStatus::Waiting).await;
        h.lock()
            .answer_permission_by("req_plan", decision, None, None, &mut Effects::default())
            .unwrap();
        // Its mode at once, before Claude Code tells it.
        assert_eq!(h.lock().meta.mode, want, "{model} {decision}");
        wait_for(&h, "turn end", |rt| rt.meta.status == AgentStatus::Done).await;
        assert_eq!(
            h.lock().meta.mode,
            want,
            "as the fake says, {model} {decision}"
        );
        assert!(items(&h).iter().any(|i| i["text"]
            == if want == "acceptEdits" {
                "Plan approuvé (édits acceptés)."
            } else {
                "Plan approuvé."
            }));
    }
}
