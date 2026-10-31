//! « Vue Gemini » alone: its arguments, settings and sessions (ESC-275).

use super::*;

#[test]
fn its_interface_resumes_a_session_it_has_and_starts_one_under_its_id_otherwise() {
    let a = tui_args(
        Some("abc12345-x"),
        true,
        "gemini-3.8-flash",
        "acceptEdits",
        None,
    );
    assert_eq!(
        a,
        [
            "--resume",
            "abc12345-x",
            "--model",
            "gemini-3.8-flash",
            "--approval-mode",
            "auto_edit"
        ]
    );
    let policy = Path::new("C:/h/escouade-policy.toml");
    let a = tui_args(
        Some("abc12345-x"),
        false,
        "auto",
        "bypassPermissions",
        Some(policy),
    );
    assert_eq!(
        a,
        [
            "--session-id",
            "abc12345-x",
            "--approval-mode",
            "yolo",
            "--policy",
            "C:/h/escouade-policy.toml"
        ]
    );
    assert_eq!(
        tui_args(None, false, "", "plan", None),
        ["--approval-mode", "plan"]
    );
    assert!(
        GEMINI_TERMINAL.says_session_lost(b"Error resuming session: Invalid session identifier")
    );
    assert!(!GEMINI_TERMINAL.says_session_lost(b"fake-gemini-tui"));
}

#[test]
fn its_sessions_are_found_by_their_short_id_in_any_project() {
    let home = crate::paths::test_dir("esc275-sessions");
    let chats = home
        .join(".gemini")
        .join("tmp")
        .join("abcdef")
        .join("chats");
    std::fs::create_dir_all(&chats).unwrap();
    let id = "9f2c1a7b-1111-2222-3333-444455556666";
    assert!(session_file(&home, id).is_none());
    let file = chats.join("session-2026-10-29T10-00-9f2c1a7b.jsonl");
    std::fs::write(&file, "{}\n").unwrap();
    assert_eq!(session_file(&home, id), Some(file));
    assert!(session_file(&home, "../etc/passwd").is_none());
    assert!(session_file(&home, "short").is_none());
}

#[test]
fn its_settings_get_its_hooks_and_escouades_server_and_lose_them_for_its_process() {
    let before = r#"{"ui":{"theme":"x"},"mcpServers":{"mine":{"command":"m"}}}"#;
    let doc = view_settings(
        before,
        Some(Path::new("/opt/escouade/escouade-hook")),
        Some(("http://127.0.0.1:4100/mcp", "secret")),
        &["ESCOUADE_HOOK_URL", "ESCOUADE_HOOK_TOKEN"],
    );
    assert_eq!(doc["ui"]["theme"], "x");
    assert_eq!(doc["hooksConfig"]["enabled"], true);
    for event in EVENTS {
        let line = doc["hooks"][event][0]["hooks"][0]["command"]
            .as_str()
            .unwrap();
        assert!(
            line.contains("escouade-hook") && line.ends_with(event),
            "{line}"
        );
        assert_eq!(doc["hooks"][event][0]["hooks"][0]["timeout"], HOOK_LIMIT_MS);
    }
    assert_eq!(
        doc["mcpServers"]["escouade"]["headers"]["Authorization"],
        "Bearer secret"
    );
    assert_eq!(doc["mcpServers"]["mine"]["command"], "m");
    let allowed = &doc["security"]["environmentVariableRedaction"]["allowed"];
    assert_eq!(
        *allowed,
        json!(["ESCOUADE_HOOK_URL", "ESCOUADE_HOOK_TOKEN"])
    );
    // Refused: no server of Escouade's.
    let denied = view_settings(&doc.to_string(), None, None, &[]);
    assert!(denied["mcpServers"]["escouade"].is_null());
    // Its process starts: its view's hooks and Escouade's server go, the user's server stays.
    let mut back = doc.clone();
    forget_view(&mut back);
    assert!(back["hooks"].is_null() && back["hooksConfig"].is_null());
    assert!(back["mcpServers"]["escouade"].is_null());
    assert_eq!(back["mcpServers"]["mine"]["command"], "m");
    let mut alone = view_settings("{}", None, Some(("u", "t")), &[]);
    forget_view(&mut alone);
    assert!(alone.get("mcpServers").is_none());
}
