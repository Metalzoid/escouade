//! Integration tests of « Vue Claude Code » (`tui`): the fake `claude` plays Claude Code's
//! interface in a real terminal, calls the hooks of its settings over HTTP and writes its
//! transcript, which the core reads as it comes.

use crate::core::AgentOptions;
use crate::core_tests::{agent_on, harness, plain_text, second_account, Harness};
use crate::model::*;
use std::sync::Arc;

/// An agent on a Claude account of its own (the fake keeps its transcripts in its folder), in the
/// Claude Code view, its interface started.
async fn agent_in_tui(h: &Harness) -> String {
    let (p, _) = h.project(false).await;
    second_account(h);
    let id = agent_on(h, &p, "pro").await.id;
    h.core.set_agent_view(&id, true).await.unwrap();
    let screen = Arc::new(parking_lot::Mutex::new(String::new()));
    let sink = screen.clone();
    let info = h
        .core
        .open_agent_terminal(&id, (100, 30), move |b| {
            sink.lock().push_str(&String::from_utf8_lossy(&b))
        })
        .await
        .unwrap();
    let start = std::time::Instant::now();
    let mut answered = false;
    while !plain_text(&screen.lock()).contains("fake-claude-tui") {
        // As xterm.js does in the window: the pseudo-console (Windows) asks where the cursor is
        // before it runs anything.
        if !answered && screen.lock().contains("\x1b[6n") {
            h.core.pty.write(&info.id, b"\x1b[1;1R").unwrap();
            answered = true;
        }
        assert!(
            start.elapsed() < std::time::Duration::from_secs(60),
            "the interface's first screen not in {:?}",
            screen.lock()
        );
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    id
}

fn texts(h: &Harness, id: &str, kind: &str) -> Vec<String> {
    h.items(id)
        .iter()
        .filter(|i| i["kind"] == kind)
        .map(|i| i["text"].as_str().unwrap_or_default().to_string())
        .collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_message_goes_through_the_interface_and_its_turn_comes_back_from_the_transcript() {
    let h = harness("tui-turn");
    let id = agent_in_tui(&h).await;
    let a = h.agent(&id);
    assert!(a.terminal);
    let session = a
        .session_id
        .clone()
        .expect("a session of its own from the start");
    // No stream's process: the interface has the session.
    assert!(!h.alive(&id));
    assert!(h.core.agent(&id).unwrap().lock().tui.is_some());

    h.core
        .send_message(&id, "bonjour".into(), Vec::new())
        .await
        .unwrap();
    h.wait("the turn's end", |h| {
        h.items(&id).iter().any(|i| i["kind"] == "turn")
    })
    .await;
    let user = h
        .items(&id)
        .into_iter()
        .find(|i| i["kind"] == "user")
        .unwrap();
    assert_eq!(user["text"], "bonjour");
    assert_eq!(user["origin"], "terminal");
    assert_eq!(texts(&h, &id, "text"), ["Fini : bonjour"]);
    let a = h.agent(&id);
    assert_eq!(a.status, AgentStatus::Done);
    assert_eq!(a.prompts, 1);
    assert!(a.cost > 0.0, "counted at list prices");
    assert_eq!(a.session_id.as_deref(), Some(session.as_str()));
    // Where the read stopped is kept, for the next start.
    let (file, offset) = a.transcript_read.clone().unwrap();
    assert!(file.ends_with(&format!("{session}.jsonl")));
    assert_eq!(offset, std::fs::metadata(&file).unwrap().len());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_permission_asked_in_the_interface_is_told_and_answered_there() {
    let h = harness("tui-permission");
    let id = agent_in_tui(&h).await;
    h.core
        .send_message(&id, "permission".into(), Vec::new())
        .await
        .unwrap();
    h.wait("the agent waiting", |h| {
        h.agent(&id).status == AgentStatus::Waiting
    })
    .await;
    assert!(
        h.core.alerts.lock().iter().any(|a| a.contains("echo tui")),
        "{:?}",
        h.core.alerts.lock()
    );
    // A message would go to its dialog: refused.
    let refused = h.core.send_message(&id, "et ça ?".into(), Vec::new()).await;
    assert!(refused.is_err());
    // Answered in its terminal (Enter: « Yes »).
    let term = h
        .core
        .agent(&id)
        .unwrap()
        .lock()
        .view()
        .terminal_id
        .unwrap();
    h.core.pty.write(&term, b"\r").unwrap();
    h.wait("the turn's end", |h| {
        h.agent(&id).status == AgentStatus::Done
    })
    .await;
    let tool = h
        .items(&id)
        .into_iter()
        .find(|i| i["kind"] == "tool")
        .unwrap();
    assert_eq!(
        (tool["name"].as_str(), tool["status"].as_str()),
        (Some("Bash"), Some("ok"))
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn an_interrupt_from_the_window_is_escape_in_the_interface() {
    let h = harness("tui-interrupt");
    let id = agent_in_tui(&h).await;
    h.core
        .send_message(&id, "lent".into(), Vec::new())
        .await
        .unwrap();
    h.wait("the turn running", |h| {
        h.agent(&id).status == AgentStatus::Running
    })
    .await;
    h.core.interrupt(&id).await.unwrap();
    h.wait("the turn interrupted", |h| {
        h.items(&id)
            .iter()
            .any(|i| i["kind"] == "turn" && i["interrupted"] == true)
    })
    .await;
}

/// `text` typed in the interface, until its turn comes back from the transcript.
async fn say_in_tui(h: &Harness, id: &str, text: &str) {
    let turns = |h: &Harness| h.items(id).iter().filter(|i| i["kind"] == "turn").count();
    let before = turns(h);
    h.core
        .send_message(id, text.into(), Vec::new())
        .await
        .unwrap();
    h.wait("the turn's end", |h| {
        turns(h) > before && !h.agent(id).status.is_active()
    })
    .await;
}

#[tokio::test(flavor = "multi_thread")]
async fn in_the_claude_code_view_commands_do_not_name_the_agent_but_the_next_ordinary_message_does()
{
    let h = harness("tui-name-after-commands");
    h.core.settings.write().claude_language = "en".into();
    let id = agent_in_tui(&h).await;
    for command in ["/clear", "/impeccable"] {
        say_in_tui(&h, &id, command).await;
        let a = h.agent(&id);
        assert_eq!((a.named, a.name.as_str()), (false, "agent-1"), "{command}");
        assert!(!h.core.agent(&id).unwrap().lock().naming_asked, "{command}");
    }
    say_in_tui(&h, &id, "Create the hello file").await;
    h.wait("named", |h| h.agent(&id).named).await;
    assert_eq!(h.agent(&id).name, "create-the-fake-en");
}

#[tokio::test(flavor = "multi_thread")]
async fn in_the_claude_code_view_the_automatic_resume_never_names_the_agent() {
    let h = harness("tui-name-not-by-continue");
    h.core.settings.write().claude_language = "en".into();
    let id = agent_in_tui(&h).await;
    say_in_tui(&h, &id, "/impeccable").await;
    // « continue », typed by the app itself after the usage limit: its entry in the transcript is
    // read like any other, and is no task.
    let turns = |h: &Harness| h.items(&id).iter().filter(|i| i["kind"] == "turn").count();
    let before = turns(&h);
    h.core.send_continue(&id).await.unwrap();
    h.wait("the resumed turn's end", |h| {
        turns(h) > before && !h.agent(&id).status.is_active()
    })
    .await;
    assert_eq!(texts(&h, &id, "user"), ["/impeccable", "continue"]);
    let a = h.agent(&id);
    assert_eq!((a.named, a.name.as_str()), (false, "agent-1"));
    assert!(!h.core.agent(&id).unwrap().lock().naming_asked);
    say_in_tui(&h, &id, "Create the hello file").await;
    h.wait("named", |h| h.agent(&id).named).await;
    assert_eq!(h.agent(&id).name, "create-the-fake-en");
}

#[tokio::test(flavor = "multi_thread")]
async fn in_the_claude_code_view_a_skill_with_arguments_names_the_agent_from_them() {
    let h = harness("tui-name-from-skill");
    h.core.settings.write().claude_language = "en".into();
    let id = agent_in_tui(&h).await;
    say_in_tui(&h, &id, "/impeccable propose un nouveau design").await;
    h.wait("named", |h| h.agent(&id).named).await;
    assert_eq!(h.agent(&id).name, "impeccable-propose-fake-en");
}

#[tokio::test(flavor = "multi_thread")]
async fn an_interface_refused_escouades_tools_is_started_without_its_server() {
    // « Claude et les agents peuvent piloter Escouade » off: the interface's tools of Escouade are
    // refused, and the server itself denied in the one settings file it is given (its hooks'),
    // else an entry of the user's config would still give it the server's instructions (ESC-91).
    let h = harness("tui-escouade-refused");
    let id = agent_in_tui(&h).await;
    let cwd = std::path::PathBuf::from(h.agent(&id).cwd);
    let launch = h
        .launch_log(&cwd)
        .into_iter()
        .rfind(|l| !l["argv"].to_string().contains("stream-json"))
        .expect("the interface's launch");
    let argv: Vec<String> = launch["argv"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|a| a.as_str().map(str::to_string))
        .collect();
    assert!(
        argv.windows(2)
            .any(|w| w == ["--disallowedTools", "mcp__escouade"]),
        "{argv:?}"
    );
    let settings: Vec<&String> = argv
        .windows(2)
        .filter(|w| w[0] == "--settings")
        .map(|w| &w[1])
        .collect();
    assert_eq!(settings.len(), 1, "{argv:?}");
    let s: serde_json::Value =
        serde_json::from_slice(&std::fs::read(settings[0]).unwrap()).unwrap();
    assert!(s["hooks"]["PermissionRequest"].is_array(), "{s}");
    assert_eq!(
        s["deniedMcpServers"],
        serde_json::json!([{ "serverName": "escouade" }])
    );
    // Turned on: the interface says it gets Escouade at its next start.
    let next = |h: &Harness| h.core.agent(&id).unwrap().lock().view().escouade_next;
    assert!(!next(&h));
    h.core.set_mcp_enabled(true).unwrap();
    assert!(next(&h));
    h.core.mcp.stop();
}

#[tokio::test(flavor = "multi_thread")]
async fn an_interface_killed_and_replaced_by_relancer_leaves_the_new_one_its_hooks_token() {
    let h = harness("tui-relaunch-hooks");
    let id = agent_in_tui(&h).await;
    let run = |h: &Harness| {
        let agent = h.core.agent(&id).unwrap();
        let rt = agent.lock();
        let t = rt.tui.as_ref().expect("an interface");
        (t.gen, t.term_id.clone())
    };
    let (old_gen, old_term) = run(&h);
    assert!(h.core.hooks.holds(&id));
    // « Relancer » in the Claude Code view: the window kills the interface, then opens another one,
    // which takes its place and gets a token of its own.
    h.core.pty.kill(&old_term);
    let info = h
        .core
        .open_agent_terminal(&id, (100, 30), |_| {})
        .await
        .unwrap();
    let (new_gen, new_term) = run(&h);
    assert_eq!(new_term, info.id);
    assert!(new_gen > old_gen);
    assert!(h.core.hooks.holds(&id));
    // The old interface's end, however late it comes: the new one keeps its token and its run.
    h.core.tui_ended(&id, old_gen);
    assert!(h.core.hooks.holds(&id));
    assert_eq!(run(&h).0, new_gen);
    // Its own end does take them.
    h.core.tui_ended(&id, new_gen);
    assert!(!h.core.hooks.holds(&id));
    assert!(h.core.agent(&id).unwrap().lock().tui.is_none());
}

#[tokio::test(flavor = "multi_thread")]
async fn back_in_escouades_view_the_stream_resumes_the_same_session() {
    let h = harness("tui-back");
    let id = agent_in_tui(&h).await;
    h.core
        .send_message(&id, "bonjour".into(), Vec::new())
        .await
        .unwrap();
    h.wait("the turn's end", |h| {
        h.agent(&id).status == AgentStatus::Done
    })
    .await;
    let session = h.agent(&id).session_id.unwrap();
    let cwd = std::path::PathBuf::from(h.agent(&id).cwd);
    // The warm-up when the agent was made started one already, with no session to resume.
    let streams = |h: &Harness| {
        h.launch_log(&cwd)
            .into_iter()
            .filter(|l| l["argv"].to_string().contains("stream-json"))
            .collect::<Vec<_>>()
    };
    let before = streams(&h).len();
    h.core.set_agent_view(&id, false).await.unwrap();
    assert!(!h.agent(&id).terminal);
    assert!(h.core.agent(&id).unwrap().lock().tui.is_none());
    h.wait("the stream's process", |h| streams(h).len() > before)
        .await;
    let last = streams(&h).pop().unwrap();
    let args: Vec<&str> = last["argv"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|a| a.as_str())
        .collect();
    assert!(
        args.contains(&format!("--resume={session}").as_str()),
        "{args:?}"
    );
    assert!(args.contains(&"stream-json"));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_tickets_agent_never_goes_to_the_claude_code_view() {
    let h = harness("tui-ticket");
    let (p, _) = h.project(false).await;
    let a = h
        .core
        .create_agent_with(
            &p.id,
            AgentOptions {
                ticket_id: Some("t1".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .meta;
    assert!(h.core.set_agent_view(&a.id, true).await.is_err());
    assert!(!h.agent(&a.id).terminal);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_hook_without_the_token_of_an_interface_is_refused() {
    let h = harness("tui-token");
    let _id = agent_in_tui(&h).await;
    let port = h.core.hooks_port().unwrap();
    let call = |auth: Option<&str>| {
        let mut req = format!(
            "POST /hook HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n"
        );
        if let Some(a) = auth {
            req.push_str(&format!("Authorization: Bearer {a}\r\n"));
        }
        req.push_str("\r\n{}");
        use std::io::{Read, Write};
        let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(std::time::Duration::from_secs(10)))
            .unwrap();
        s.write_all(req.as_bytes()).unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        out.lines().next().unwrap_or_default().to_string()
    };
    assert!(call(None).contains("401"));
    assert!(call(Some("not-a-token")).contains("401"));
}

/// The first bytes of an image of each format Claude Code reads.
const PNG: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
const JPEG: [u8; 4] = [0xff, 0xd8, 0xff, 0xe0];
const GIF: &[u8] = b"GIF89a";
const WEBP: &[u8] = b"RIFF\x24\0\0\0WEBPVP8 ";

fn b64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[tokio::test(flavor = "multi_thread")]
async fn an_image_pasted_in_the_interface_is_written_to_a_file_whose_path_is_typed_there() {
    let h = harness("tui-paste");
    let id = agent_in_tui(&h).await;
    let pastes = h.dir.join("data").join("tui").join("pastes");
    // Claude Code keeps the image in its transcript and resumes without the file: it serves the
    // paste, then the model, told its path, in the turns that follow. Kept a day: older ones go as
    // the next one comes.
    std::fs::create_dir_all(&pastes).unwrap();
    let aged = |name: &str, hours: u64| {
        let f = pastes.join(name);
        std::fs::write(&f, b"old").unwrap();
        std::fs::File::options()
            .write(true)
            .open(&f)
            .unwrap()
            .set_modified(
                std::time::SystemTime::now() - std::time::Duration::from_secs(hours * 3600),
            )
            .unwrap();
        f
    };
    let (old, recent) = (aged("old.png", 25), aged("recent.png", 23));

    let path = h.core.paste_image(&id, "image/png", &b64(&PNG)).unwrap();
    let file = std::path::Path::new(&path);
    assert_eq!(file.parent(), Some(pastes.as_path()));
    assert_eq!(file.extension().unwrap(), "png");
    assert_eq!(std::fs::read(file).unwrap(), PNG);
    assert!(!old.exists());
    assert!(recent.exists());

    // Each paste its own file, named after what it holds (a file copied under a wrong name).
    for (head, extension) in [(&JPEG[..], "jpg"), (GIF, "gif"), (WEBP, "webp")] {
        let other = h.core.paste_image(&id, "image/png", &b64(head)).unwrap();
        assert!(other.ends_with(&format!(".{extension}")), "{other}");
        assert_ne!(other, path);
    }
    let written = std::fs::read_dir(&pastes).unwrap().count();

    // Refused, and nothing written: a type Claude Code does not read, content that is no image of
    // those (whatever its type says), more than 18 MB (all the files of a message in the composer).
    for refused in ["application/pdf", "image/svg+xml"] {
        assert!(
            h.core.paste_image(&id, refused, &b64(&PNG)).is_err(),
            "{refused}"
        );
    }
    let e = h
        .core
        .paste_image(&id, "image/png", &b64(b"%PDF-1.7"))
        .unwrap_err();
    assert!(e.to_string().contains("PNG, JPEG, GIF"), "{e}");
    assert!(h
        .core
        .paste_image(&id, "image/png", "pas du base64")
        .is_err());
    let mut big = PNG.to_vec();
    big.resize((18 << 20) + 1, 0);
    let e = h
        .core
        .paste_image(&id, "image/png", &b64(&big))
        .unwrap_err();
    assert!(e.to_string().contains("18 Mo"), "{e}");
    assert_eq!(std::fs::read_dir(&pastes).unwrap().count(), written);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_image_is_pasted_only_where_claude_codes_interface_runs() {
    use base64::Engine;
    let h = harness("tui-paste-none");
    let (p, _) = h.project(false).await;
    let id = agent_on(&h, &p, "principal").await.id;
    let data = base64::engine::general_purpose::STANDARD.encode([1u8]);
    let e = h.core.paste_image(&id, "image/png", &data).unwrap_err();
    assert!(e.to_string().contains("vue Claude Code"), "{e}");
    // In the view, its interface stopped (« Claude Code s’est arrêté », « Relancer »).
    h.core.set_agent_view(&id, true).await.unwrap();
    let e = h.core.paste_image(&id, "image/png", &data).unwrap_err();
    assert!(e.to_string().contains("relance"), "{e}");
}

#[tokio::test(flavor = "multi_thread")]
async fn the_images_pasted_go_with_their_agent_and_old_ones_at_the_next_start() {
    let h = harness("tui-paste-gone");
    let id = agent_in_tui(&h).await;
    let mine = h.core.paste_image(&id, "image/png", &b64(&PNG)).unwrap();
    let pastes = h.dir.join("data").join("tui").join("pastes");
    let other = pastes.join("autre-4f2a.png");
    std::fs::write(&other, b"png").unwrap();
    let old = pastes.join("autre-ancienne.png");
    std::fs::write(&old, b"png").unwrap();
    std::fs::File::options()
        .write(true)
        .open(&old)
        .unwrap()
        .set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(25 * 3600))
        .unwrap();

    h.core.delete_agent(&id, false).await.unwrap();
    assert!(!std::path::Path::new(&mine).exists());
    assert!(other.exists());

    // Nobody pastes any more: the next start clears what is older than a day.
    let app = tauri::test::mock_app();
    let (_reloaded, _rx) = crate::core::Core::load(app.handle().clone(), h.core.data.clone());
    assert!(!old.exists());
    assert!(other.exists());
}

#[tokio::test(flavor = "multi_thread")]
async fn removing_the_project_stops_its_agents_interfaces_and_clears_their_pasted_images() {
    let h = harness("tui-paste-project");
    let id = agent_in_tui(&h).await;
    let project = h.agent(&id).project_id;
    let mine = h.core.paste_image(&id, "image/png", &b64(&PNG)).unwrap();
    assert!(h.core.pty.list().iter().any(|t| t.shell == "claude"));

    h.core.remove_project(&project, false).await.unwrap();
    assert!(!std::path::Path::new(&mine).exists());
    assert!(
        !h.core.pty.list().iter().any(|t| t.shell == "claude"),
        "Claude Code's interface still runs"
    );
}

/// What Claude Code 2.1.300 wrote of a real subagent (`tests/fixtures`), and its call and task.
const SIDECHAIN: &str = include_str!("../../tests/fixtures/real-sidechain.jsonl");
const SIDECHAIN_META: &str = include_str!("../../tests/fixtures/real-sidechain.meta.json");
const SUB_CALL: &str = "toolu_01SdqbgNzZvBJ1FgjQC3Gg6L";
const SUB_TASK: &str = "a3c004cb08b483eb9";

/// The folder where Claude Code keeps a session's subagents' transcripts, next to its own, written
/// in the account `config_dir` (`projects/<folder>/<session>/subagents`); the transcript itself empty.
fn subagents_folder(config_dir: &str, session: &str) -> std::path::PathBuf {
    let folder = std::path::Path::new(config_dir)
        .join("projects")
        .join("-work-demo");
    let subs = folder.join(session).join("subagents");
    std::fs::create_dir_all(&subs).unwrap();
    std::fs::write(folder.join(format!("{session}.jsonl")), "").unwrap();
    subs
}

#[tokio::test(flavor = "multi_thread")]
async fn the_conversation_of_a_subagent_is_read_from_its_own_transcript_in_the_claude_code_view() {
    let h = harness("tui-sidechain");
    let (p, _) = h.project(false).await;
    let pro = second_account(&h);
    let id = agent_on(&h, &p, "pro").await.id;
    // The stream view has the thread in its conversation: nothing to read there.
    assert!(h.core.subagent_transcript(&id, SUB_CALL, None).is_err());
    h.core.set_agent_view(&id, true).await.unwrap();
    let session = "55555555-2222-3333-4444-555555555555";
    h.core.agent(&id).unwrap().lock().meta.session_id = Some(session.into());

    // No file yet: nothing, not an error (and no cursor: the next read looks for it again).
    let none = h.core.subagent_transcript(&id, SUB_CALL, None);
    let none = none.unwrap().unwrap();
    assert!(none.items.is_empty() && none.cursor.is_none() && none.ended.is_none());

    // Found by the meta file that names its call, in the account's folder.
    let subs = subagents_folder(&pro.config_dir, session);
    std::fs::write(subs.join(format!("agent-{SUB_TASK}.jsonl")), SIDECHAIN).unwrap();
    std::fs::write(
        subs.join(format!("agent-{SUB_TASK}.meta.json")),
        SIDECHAIN_META,
    )
    .unwrap();
    let items = thread(&h, &id, SUB_CALL);
    assert_eq!(items.len(), 4);
    assert!(items.iter().all(|i| i["parent"] == SUB_CALL));
    assert_eq!(items[0]["name"], "Write");
    assert_eq!(items[0]["status"], "ok");
    assert_eq!(thread(&h, &id, "toolu_nobody").len(), 0);
    assert!(h
        .core
        .subagent_transcript("nobody", SUB_CALL, None)
        .is_err());

    // Found by its task, which the row of the plan tells, without a meta file. (The path found
    // before is kept: forgotten here, for it to be looked for again.)
    std::fs::remove_file(subs.join(format!("agent-{SUB_TASK}.meta.json"))).unwrap();
    h.core.forget_sidechains(&id);
    assert!(thread(&h, &id, SUB_CALL).is_empty());
    h.core.agent(&id).unwrap().lock().meta.plan = Some(crate::plan::PlanState {
        agents: vec![crate::plan::SubAgent {
            id: SUB_CALL.into(),
            task_id: Some(SUB_TASK.into()),
            ..Default::default()
        }],
        ..Default::default()
    });
    assert_eq!(thread(&h, &id, SUB_CALL).len(), 4);

    // The transcript the interface is read from is the one it looks beside, wherever it is.
    let elsewhere = h.dir.join("elsewhere");
    let there = elsewhere.join("s9").join("subagents");
    std::fs::create_dir_all(&there).unwrap();
    std::fs::write(elsewhere.join("s9.jsonl"), "").unwrap();
    std::fs::write(
        there.join(format!("agent-{SUB_TASK}.jsonl")),
        SIDECHAIN.lines().take(4).collect::<Vec<_>>().join("\n"),
    )
    .unwrap();
    h.core.agent(&id).unwrap().lock().meta.transcript_read =
        Some((elsewhere.join("s9.jsonl").to_string_lossy().into(), 0));
    h.core.forget_sidechains(&id);
    assert_eq!(thread(&h, &id, SUB_CALL).len(), 1);
}

/// What a first read (no cursor) of the thread of `call` gives: it always gives something.
fn thread(h: &Harness, id: &str, call: &str) -> Vec<serde_json::Value> {
    h.core
        .subagent_transcript(id, call, None)
        .unwrap()
        .expect("a first read gives the thread")
        .items
}

/// An agent in the Claude Code view whose transcript is `<h.dir>/<name>/s9.jsonl`, and the folder
/// of its subagents' beside it.
async fn agent_with_subagents(h: &Harness, name: &str) -> (String, std::path::PathBuf) {
    let (p, _) = h.project(false).await;
    second_account(h);
    let id = agent_on(h, &p, "pro").await.id;
    h.core.set_agent_view(&id, true).await.unwrap();
    let root = h.dir.join(name);
    let subs = root.join("s9").join("subagents");
    std::fs::create_dir_all(&subs).unwrap();
    std::fs::write(root.join("s9.jsonl"), "").unwrap();
    h.core.agent(&id).unwrap().lock().meta.transcript_read =
        Some((root.join("s9.jsonl").to_string_lossy().into(), 0));
    (id, subs)
}

/// The agent's plan has a row for each of `rows` (call, task, background), running, and its
/// conversation the call of each.
fn run_subagents(h: &Harness, id: &str, rows: &[(&str, Option<&str>, bool)]) {
    let handle = h.core.agent(id).unwrap();
    let mut rt = handle.lock();
    for (call, ..) in rows {
        rt.conv.apply(&ConvOp::Append {
            item: serde_json::json!({
                "kind": "tool", "id": call, "name": "Agent", "status": "ok",
                "input": { "description": "Lent", "prompt": "Attends." }, "ts": 1,
            }),
        });
    }
    rt.meta.plan = Some(crate::plan::PlanState {
        agents: rows
            .iter()
            .map(|(call, task, background)| crate::plan::SubAgent {
                id: call.to_string(),
                title: "Lent".into(),
                task_id: task.map(str::to_string),
                background: *background,
                started_at: 1,
                ..Default::default()
            })
            .collect(),
        launched: rows.len() as u32,
        ..Default::default()
    });
}

/// The status of the row of `call` in the agent's plan.
fn row_status(h: &Harness, id: &str, call: &str) -> crate::plan::RunStatus {
    h.agent(id)
        .plan
        .unwrap()
        .agents
        .iter()
        .find(|a| a.id == call)
        .unwrap()
        .status
}

/// How many times the window was sent the agent `id`.
fn agent_events(h: &Harness, id: &str) -> usize {
    h.events
        .lock()
        .iter()
        .filter(|e| e["type"] == "agent" && e["agent"]["id"] == id)
        .count()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_transcript_is_read_again_only_when_it_changed_and_the_path_found_is_kept() {
    let h = harness("tui-sidechain-cursor");
    let (id, subs) = agent_with_subagents(&h, "cursor").await;
    let file = subs.join(format!("agent-{SUB_TASK}.jsonl"));
    let meta = subs.join(format!("agent-{SUB_TASK}.meta.json"));
    let lines: Vec<&str> = SIDECHAIN.lines().collect();
    std::fs::write(&file, lines[..6].join("\n") + "\n").unwrap();
    std::fs::write(&meta, format!(r#"{{"toolUseId":"{SUB_CALL}"}}"#)).unwrap();
    let read = |since| h.core.subagent_transcript(&id, SUB_CALL, since).unwrap();

    // The first read, which finds it by its meta file: all of it, and the cursor to give back.
    let first = read(None).unwrap();
    assert_eq!(first.items.len(), 2);
    let cursor = first.cursor.unwrap();
    assert_eq!(cursor.len, std::fs::metadata(&file).unwrap().len());
    // Nothing changed since: nothing to say.
    assert!(read(first.cursor).is_none());

    // The path is kept: the meta files are not looked at again, whatever becomes of them.
    std::fs::write(&meta, "{}").unwrap();
    assert_eq!(read(None).unwrap().items.len(), 2);
    std::fs::rename(&meta, subs.join("elsewhere.json")).unwrap();
    assert_eq!(read(None).unwrap().items.len(), 2);
    assert_eq!(h.core.sidechains.lock().len(), 1);

    // It grows: the new items, and the cursor of what was read.
    let mut text = std::fs::read_to_string(&file).unwrap();
    text.push_str(&(lines[6..10].join("\n") + "\n"));
    std::fs::write(&file, text).unwrap();
    let grown = read(first.cursor).unwrap();
    let names: Vec<_> = grown
        .items
        .iter()
        .map(|i| i["name"].as_str().unwrap_or("-"))
        .collect();
    assert_eq!(names, ["Write", "Bash", "-", "Bash"]);
    assert!(grown.cursor.unwrap().len > cursor.len);
    assert!(read(grown.cursor).is_none());

    // The file is gone: nothing (and no cursor), until it is found again, where it is now.
    std::fs::remove_file(&file).unwrap();
    let gone = read(grown.cursor).unwrap();
    assert!(gone.items.is_empty() && gone.cursor.is_none());
    assert_eq!(
        h.core.sidechains.lock().len(),
        0,
        "the path it had is forgotten"
    );
    std::fs::write(subs.join("agent-other.jsonl"), first_four()).unwrap();
    std::fs::write(
        subs.join("agent-other.meta.json"),
        format!(r#"{{"toolUseId":"{SUB_CALL}"}}"#),
    )
    .unwrap();
    let moved = read(grown.cursor).unwrap();
    assert_eq!(moved.items.len(), 1);
    assert_eq!(h.core.sidechains.lock().len(), 1);
}

fn first_four() -> String {
    SIDECHAIN.lines().take(4).collect::<Vec<_>>().join("\n") + "\n"
}

/// An agent whose subagent `SUB_CALL` was read once, so that its path is kept.
async fn agent_with_a_path_kept(h: &Harness, name: &str) -> String {
    let (id, subs) = agent_with_subagents(h, name).await;
    std::fs::write(subs.join(format!("agent-{SUB_TASK}.jsonl")), first_four()).unwrap();
    std::fs::write(
        subs.join(format!("agent-{SUB_TASK}.meta.json")),
        SIDECHAIN_META,
    )
    .unwrap();
    assert_eq!(thread(h, &id, SUB_CALL).len(), 1);
    assert!(h.core.sidechains.lock().has(&id, SUB_CALL));
    id
}

#[tokio::test(flavor = "multi_thread")]
async fn the_path_kept_of_a_subagent_goes_with_its_agent() {
    let h = harness("tui-sidechain-path-agent");
    let id = agent_with_a_path_kept(&h, "path-agent").await;
    h.core.delete_agent(&id, false).await.unwrap();
    assert_eq!(h.core.sidechains.lock().len(), 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_path_kept_of_a_subagent_goes_with_its_project() {
    let h = harness("tui-sidechain-path-project");
    let id = agent_with_a_path_kept(&h, "path-project").await;
    let project = h.agent(&id).project_id;
    h.core.remove_project(&project, false).await.unwrap();
    assert_eq!(h.core.sidechains.lock().len(), 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_subagent_stopped_in_the_interface_ends_its_row_when_its_transcript_is_read() {
    use crate::agent::sidechain::Ended;
    use crate::plan::RunStatus;
    let h = harness("tui-sidechain-ended");
    let (id, subs) = agent_with_subagents(&h, "ended").await;
    run_subagents(&h, &id, &[(SUB_CALL, Some(SUB_TASK), true)]);
    let file = subs.join(format!("agent-{SUB_TASK}.jsonl"));
    // Not over: its meta file does not say, and its transcript ends on a tool's result.
    std::fs::write(
        &file,
        SIDECHAIN.lines().take(10).collect::<Vec<_>>().join("\n") + "\n",
    )
    .unwrap();
    std::fs::write(
        subs.join(format!("agent-{SUB_TASK}.meta.json")),
        format!(r#"{{"toolUseId":"{SUB_CALL}"}}"#),
    )
    .unwrap();
    let running = h
        .core
        .subagent_transcript(&id, SUB_CALL, None)
        .unwrap()
        .unwrap();
    assert_eq!(running.ended, None);
    assert_eq!(row_status(&h, &id, SUB_CALL), RunStatus::Running);
    let sent = agent_events(&h, &id);

    // The user stops it in the interface: the interruption comes in its transcript.
    std::fs::write(&file, SIDECHAIN).unwrap();
    let read = h
        .core
        .subagent_transcript(&id, SUB_CALL, running.cursor)
        .unwrap()
        .unwrap();
    assert_eq!(read.ended, Some(Ended::Stopped));
    let row = h.agent(&id).plan.unwrap().agents[0].clone();
    assert_eq!(row.status, RunStatus::Stopped);
    assert!(row.ended_at.is_some_and(|at| at >= row.started_at));
    // What it was is kept with its call, and the window is sent the agent: the sidebar changes.
    let call = h
        .items(&id)
        .into_iter()
        .find(|i| i["id"] == SUB_CALL)
        .unwrap();
    assert_eq!(call["run"]["status"], "stopped");
    assert_eq!(agent_events(&h, &id), sent + 1);
    assert!(h.events.lock().iter().any(|e| e["type"] == "agent"
        && e["agent"]["id"] == id.as_str()
        && e["agent"]["plan"]["agents"][0]["status"] == "stopped"));
    // Read again: nothing changed, nothing sent.
    assert!(h
        .core
        .subagent_transcript(&id, SUB_CALL, read.cursor)
        .unwrap()
        .is_none());
    assert_eq!(agent_events(&h, &id), sent + 1);
    // And once it ended, however it is read, nothing more is sent.
    h.core
        .subagent_transcript(&id, SUB_CALL, None)
        .unwrap()
        .unwrap();
    assert_eq!(agent_events(&h, &id), sent + 1);

    // One that failed: the API gave up on it.
    let mut failed: serde_json::Value =
        serde_json::from_str(SIDECHAIN.lines().nth(7).unwrap()).unwrap();
    failed["isApiErrorMessage"] = serde_json::json!(true);
    std::fs::write(
        subs.join("agent-late.jsonl"),
        format!("{}\n{failed}\n", first_four().trim_end()),
    )
    .unwrap();
    std::fs::write(
        subs.join("agent-late.meta.json"),
        r#"{"toolUseId":"toolu_late"}"#,
    )
    .unwrap();
    run_subagents(
        &h,
        &id,
        &[(SUB_CALL, Some(SUB_TASK), true), ("toolu_late", None, true)],
    );
    let read = h
        .core
        .subagent_transcript(&id, "toolu_late", None)
        .unwrap()
        .unwrap();
    assert_eq!(read.ended, Some(Ended::Failed));
    assert_eq!(row_status(&h, &id, "toolu_late"), RunStatus::Failed);
    assert_eq!(
        row_status(&h, &id, SUB_CALL),
        RunStatus::Running,
        "not that one"
    );

    // A row that ended otherwise (its hand-back came first) stays as it was; the window is told nothing.
    let sent = agent_events(&h, &id);
    h.core
        .agent(&id)
        .unwrap()
        .lock()
        .meta
        .plan
        .as_mut()
        .unwrap()
        .agents[0]
        .status = RunStatus::Done;
    let read = h
        .core
        .subagent_transcript(&id, SUB_CALL, None)
        .unwrap()
        .unwrap();
    assert_eq!(read.ended, Some(Ended::Stopped));
    assert_eq!(row_status(&h, &id, SUB_CALL), RunStatus::Done);
    assert_eq!(agent_events(&h, &id), sent);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_end_of_a_turn_ends_the_background_subagents_the_user_stopped_in_the_interface() {
    use crate::plan::RunStatus;
    let h = harness("tui-sidechain-stop-hook");
    let id = agent_in_tui(&h).await;
    let session = h.agent(&id).session_id.unwrap();
    let pro = h
        .core
        .settings
        .read()
        .accounts
        .last()
        .unwrap()
        .config_dir
        .clone();
    // The interface wrote its transcript at start; its subagents' are beside it.
    h.wait("the transcript", |_| {
        crate::tui::find_transcript(std::path::Path::new(&pro), &session).is_some()
    })
    .await;
    let main = crate::tui::find_transcript(std::path::Path::new(&pro), &session).unwrap();
    let subs = main.parent().unwrap().join(&session).join("subagents");
    std::fs::create_dir_all(&subs).unwrap();
    // A subagent's files: its transcript, and its meta file that says whether the user stopped it.
    let files = |task: &str, stopped: bool| {
        std::fs::write(subs.join(format!("agent-{task}.jsonl")), first_four()).unwrap();
        std::fs::write(
            subs.join(format!("agent-{task}.meta.json")),
            format!(r#"{{"toolUseId":"call-{task}","stoppedByUser":{stopped}}}"#),
        )
        .unwrap();
    };
    files("stopped", true);
    files("running", false);
    files("foreground", true);
    files("over", true);
    // One whose task is not told yet, found by its meta file; one with no file at all.
    files("notask", true);
    run_subagents(
        &h,
        &id,
        &[
            ("call-stopped", Some("stopped"), true),
            ("call-running", Some("running"), true),
            ("call-foreground", Some("foreground"), false),
            ("call-over", Some("over"), true),
            ("call-notask", None, true),
            ("call-nofile", Some("nofile"), true),
        ],
    );
    h.core
        .agent(&id)
        .unwrap()
        .lock()
        .meta
        .plan
        .as_mut()
        .unwrap()
        .agents[3]
        .status = RunStatus::Done;
    let sent = agent_events(&h, &id);

    // Not at any hook: at the end of a turn.
    h.core.on_tui_hook(
        &id,
        serde_json::json!({ "hook_event_name": "PostToolUse", "session_id": session }),
    );
    assert_eq!(row_status(&h, &id, "call-stopped"), RunStatus::Running);
    h.core.on_tui_hook(
        &id,
        serde_json::json!({ "hook_event_name": "Stop", "session_id": session }),
    );
    let status = |call: &str| row_status(&h, &id, call);
    assert_eq!(status("call-stopped"), RunStatus::Stopped);
    assert_eq!(status("call-notask"), RunStatus::Stopped);
    assert_eq!(status("call-running"), RunStatus::Running);
    // A subagent in the foreground ends with the turn of its agent, as it always did.
    assert_eq!(status("call-foreground"), RunStatus::Running);
    assert_eq!(status("call-over"), RunStatus::Done);
    assert_eq!(status("call-nofile"), RunStatus::Running);
    let call = h
        .items(&id)
        .into_iter()
        .find(|i| i["id"] == "call-stopped")
        .unwrap();
    assert_eq!(call["run"]["status"], "stopped");
    assert!(agent_events(&h, &id) > sent);
    // The paths found are kept, for the next end of a turn.
    assert!(h.core.sidechains.lock().len() >= 2);
}
