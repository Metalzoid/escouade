//! « Codex peut piloter Escouade »: the server declared in the `config.toml` of each Codex account,
//! beside Claude Code's declaration, kept in step with the switches (ESC-50).

use super::install::{current, wanted, Entry, MASK};
use crate::core_tests::{harness, Harness};
use crate::engine::{Engine, CLAUDE, CODEX};
use crate::model::*;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

/// What the user had in Principal's `config.toml` before Escouade wrote in it.
const USERS: &str =
    "# mon modèle\nmodel = \"gpt-5\"\n\n[mcp_servers.node_repl]\ncommand = 'node.exe' # le mien\n";

/// Principal's `config.toml` in a test: in the core's data folder (`Core::user_config_file`).
fn principal_toml(h: &Harness) -> PathBuf {
    h.dir.join("data").join("codex-home").join("config.toml")
}

fn runs(h: &Harness) -> usize {
    h.core.mcp.runs.load(Ordering::Acquire)
}

async fn run_after(h: &Harness, before: usize) {
    h.wait("the declaration run", |h| runs(h) > before).await;
}

/// Turns `change` and waits for the declaration run it causes.
async fn after(h: &Harness, change: impl FnOnce(&Harness)) {
    let before = runs(h);
    change(h);
    run_after(h, before).await;
}

fn now_wanted(h: &Harness) -> Entry {
    wanted(
        h.core.mcp.status().port,
        &h.core.mcp.external_token().unwrap(),
    )
}

/// Principal's `config.toml` with the user's own lines, and a second Codex account, its own
/// folder, and a third one switched off.
fn codex_accounts(h: &Harness) -> (PathBuf, PathBuf) {
    std::fs::create_dir_all(principal_toml(h).parent().unwrap()).unwrap();
    std::fs::write(principal_toml(h), USERS).unwrap();
    let (pro, off) = (h.dir.join("codex-pro"), h.dir.join("codex-off"));
    let mut s = h.core.settings.read().clone();
    s.accounts
        .push(crate::accounts::principal_of(EngineId::Codex));
    for (id, dir, active) in [("codex-pro", &pro, true), ("codex-off", &off, false)] {
        s.accounts.push(Account {
            id: id.into(),
            name: id.into(),
            engine: EngineId::Codex,
            config_dir: dir.to_string_lossy().into(),
            active,
            ..Default::default()
        });
    }
    h.core.save_settings(s).unwrap();
    (pro.join("config.toml"), off.join("config.toml"))
}

#[tokio::test]
async fn codex_gets_the_server_in_the_config_toml_of_each_active_account_with_its_own_switch() {
    let h = harness("mcp-codex-on");
    let (pro, off) = codex_accounts(&h);
    let claude_json = h.dir.join("data").join("claude-home").join(".claude.json");

    // « Claude et les agents… » alone: Claude Code gets it, Codex's accounts nothing.
    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    assert_eq!(current(&CLAUDE, &claude_json), Some(now_wanted(&h)));
    assert_eq!(std::fs::read_to_string(principal_toml(&h)).unwrap(), USERS);
    assert!(!pro.exists());
    assert!(h
        .core
        .mcp
        .declared()
        .iter()
        .all(|d| d.engine == EngineId::Claude));

    after(&h, |h| {
        h.core.set_mcp_harness(EngineId::Codex, true).unwrap()
    })
    .await;
    assert_eq!(h.core.settings.read().mcp_harnesses, [EngineId::Codex]);
    let want = now_wanted(&h);
    for file in [principal_toml(&h), pro.clone()] {
        assert_eq!(current(&CODEX, &file), Some(want.clone()), "{file:?}");
    }
    assert!(!off.exists(), "an account switched off gets nothing");
    // The user's lines and comments as they were, the entry after them.
    let text = std::fs::read_to_string(principal_toml(&h)).unwrap();
    assert!(text.starts_with(USERS), "{text}");
    // The window is told each account, with what to paste by hand (its token hidden) and where.
    let declared = h.core.mcp.declared();
    let codex: Vec<_> = declared
        .iter()
        .filter(|d| d.engine == EngineId::Codex)
        .collect();
    assert_eq!(
        codex
            .iter()
            .map(|d| (d.account.as_str(), d.ok))
            .collect::<Vec<_>>(),
        [("principal-codex", true), ("codex-pro", true)]
    );
    assert_eq!(
        codex[1].file.as_deref(),
        Some(pro.to_string_lossy().as_ref())
    );
    assert!(
        codex[1].command.contains("[mcp_servers.escouade]"),
        "{}",
        codex[1].command
    );
    assert!(
        codex[1].command.contains(&format!("Bearer {MASK}")),
        "{}",
        codex[1].command
    );
    let everything = serde_json::to_string(&*h.events.lock()).unwrap();
    assert!(
        !everything.contains(&want.token),
        "a token went to the window"
    );
    // « Copier » gives the real one.
    let real = h.core.mcp_manual_command("codex-pro").unwrap();
    assert!(real.contains(&format!("Bearer {}", want.token)), "{real}");
    // Claude Code's declaration is still there, with the same token.
    assert_eq!(current(&CLAUDE, &claude_json), Some(want));
    h.core.shutdown();
}

#[tokio::test]
async fn turning_codex_off_changes_the_token_first_then_leaves_its_files_as_they_were() {
    let h = harness("mcp-codex-off");
    let (pro, _) = codex_accounts(&h);
    let claude_json = h.dir.join("data").join("claude-home").join(".claude.json");
    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    after(&h, |h| {
        h.core.set_mcp_harness(EngineId::Codex, true).unwrap()
    })
    .await;
    let old = h.core.mcp.external_token().unwrap();
    assert!(h.core.mcp.caller(&old).is_some());

    // The run cannot start yet: what happens is the switch's own.
    let held = h.core.mcp.declaring.lock().await;
    let before = runs(&h);
    h.core.set_mcp_harness(EngineId::Codex, false).unwrap();
    // The old token opens nothing at once, though it is still in Codex's files.
    assert_eq!(h.core.mcp.caller(&old), None);
    assert_eq!(current(&CODEX, &principal_toml(&h)).unwrap().token, old);
    drop(held);
    run_after(&h, before).await;

    // Codex's files as they were: Principal's the user's own, byte for byte; the other one emptied.
    assert_eq!(std::fs::read_to_string(principal_toml(&h)).unwrap(), USERS);
    assert_eq!(std::fs::read_to_string(&pro).unwrap(), "");
    assert!(h.core.settings.read().mcp_harnesses.is_empty());
    // Claude Code keeps the server, with the new token.
    let new = h.core.mcp.external_token().unwrap();
    assert_ne!(new, old);
    assert_eq!(current(&CLAUDE, &claude_json).unwrap().token, new);
    assert!(h
        .core
        .mcp
        .declared()
        .iter()
        .all(|d| d.engine == EngineId::Claude));
    h.core.shutdown();
}

#[tokio::test]
async fn turning_the_server_off_takes_it_out_of_codex_too_and_on_again_puts_it_back() {
    let h = harness("mcp-codex-all-off");
    let (pro, off) = codex_accounts(&h);
    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    after(&h, |h| {
        h.core.set_mcp_harness(EngineId::Codex, true).unwrap()
    })
    .await;
    let old = h.core.mcp.external_token().unwrap();
    // A leftover in the account switched off (it was on once).
    std::fs::create_dir_all(off.parent().unwrap()).unwrap();
    std::fs::write(&off, format!("[mcp_servers.escouade]\nurl = \"http://127.0.0.1:1/mcp\"\nhttp_headers = {{ Authorization = \"Bearer {old}\" }}\n")).unwrap();

    after(&h, |h| h.core.set_mcp_enabled(false).unwrap()).await;
    assert_eq!(std::fs::read_to_string(principal_toml(&h)).unwrap(), USERS);
    for file in [&pro, &off] {
        assert_eq!(current(&CODEX, file), None, "{file:?}");
    }
    assert_eq!(h.core.mcp.caller(&old), None);
    // Its own switch is kept: on again, Codex gets the new token.
    assert_eq!(h.core.settings.read().mcp_harnesses, [EngineId::Codex]);
    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    let new = h.core.mcp.external_token().unwrap();
    assert_eq!(current(&CODEX, &principal_toml(&h)).unwrap().token, new);
    h.core.shutdown();
}

#[tokio::test]
async fn with_no_codex_account_yet_its_principal_config_is_the_one_declared_in() {
    let h = harness("mcp-codex-principal");
    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    after(&h, |h| {
        h.core.set_mcp_harness(EngineId::Codex, true).unwrap()
    })
    .await;
    assert_eq!(current(&CODEX, &principal_toml(&h)), Some(now_wanted(&h)));
    // No Principal of Codex saved for it (it is made at Codex's first agent).
    assert!(h
        .core
        .settings
        .read()
        .accounts
        .iter()
        .all(|a| a.engine == EngineId::Claude));
    assert!(h.core.mcp_manual_command("principal-codex").is_ok());
    h.core.shutdown();
}

#[tokio::test]
async fn a_codex_config_that_is_no_toml_is_told_and_left_alone() {
    let h = harness("mcp-codex-invalid");
    std::fs::create_dir_all(principal_toml(&h).parent().unwrap()).unwrap();
    std::fs::write(principal_toml(&h), "model = = 1\n").unwrap();
    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    after(&h, |h| {
        h.core.set_mcp_harness(EngineId::Codex, true).unwrap()
    })
    .await;
    let d = h
        .core
        .mcp
        .declared()
        .into_iter()
        .find(|d| d.engine == EngineId::Codex)
        .expect("Codex's account told");
    assert!(!d.ok);
    assert!(
        d.error.as_deref().unwrap_or_default().contains("TOML"),
        "{d:?}"
    );
    assert_eq!(
        std::fs::read_to_string(principal_toml(&h)).unwrap(),
        "model = = 1\n"
    );
    h.core.shutdown();
}

#[tokio::test]
async fn only_a_harness_with_a_user_config_has_a_switch_and_the_window_never_flips_it() {
    let h = harness("mcp-codex-refused");
    assert!(h.core.set_mcp_harness(EngineId::Claude, true).is_err());
    assert!(h.core.set_mcp_harness(EngineId::Cursor, true).is_err());
    assert!(h.core.settings.read().mcp_harnesses.is_empty());
    assert!(CODEX.user_config().is_some() && CLAUDE.user_config().is_none());

    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    after(&h, |h| {
        h.core.set_mcp_harness(EngineId::Codex, true).unwrap()
    })
    .await;
    let mut stale = h.core.settings.read().clone();
    stale.mcp_harnesses.clear();
    stale.sound = !stale.sound;
    h.core.save_window_settings(stale).unwrap();
    assert_eq!(h.core.settings.read().mcp_harnesses, [EngineId::Codex]);
    h.core.shutdown();
}

/// Real run (ESC-50): « Codex peut piloter Escouade » on the machine's own `~/.codex/config.toml`,
/// with the real `codex` that `ESCOUADE_REAL_CODEX` names. The entry Escouade writes is read by
/// Codex, which lists the server's tools with the token it holds; taken out, the file is the one
/// saved before, byte for byte. By hand only (`cargo test --lib real_codex_drives_escouade --
/// --ignored --nocapture`); the file is put back from its copy whatever happens.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn real_codex_drives_escouade() {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let program = std::env::var("ESCOUADE_REAL_CODEX").expect("ESCOUADE_REAL_CODEX");
    let home = dirs::home_dir().unwrap().join(".codex");
    let file = home.join("config.toml");
    let saved = std::fs::read(&file).expect("a config.toml to try it on");
    /// Puts the user's file back, whatever the test did.
    struct Back(PathBuf, Vec<u8>);
    impl Drop for Back {
        fn drop(&mut self) {
            std::fs::write(&self.0, &self.1).unwrap();
        }
    }
    let _back = Back(file.clone(), saved.clone());

    let h = harness("mcp-codex-real");
    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    let want = now_wanted(&h);
    let user = CODEX.user_config().unwrap();
    user.add(&file, &want).unwrap();
    // Every line of the user's, in its order: the entry goes beside their other servers.
    let written = std::fs::read_to_string(&file).unwrap();
    let mut rest = written.lines();
    for line in String::from_utf8_lossy(&saved).lines() {
        assert!(rest.any(|l| l == line), "{line:?} lost:\n{written}");
    }
    println!("{written}");

    // Codex's app-server, on the user's own folder: its MCP servers as it reads them.
    let mut child = tokio::process::Command::new(&program)
        .arg("app-server")
        .env("CODEX_HOME", &home)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
    let send = |v: serde_json::Value| format!("{v}\n");
    stdin
        .write_all(send(serde_json::json!({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "escouade-essai", "version": "0"}, "capabilities": {"experimentalApi": true}}})).as_bytes())
        .await
        .unwrap();
    stdin
        .write_all(send(serde_json::json!({"method": "initialized"})).as_bytes())
        .await
        .unwrap();
    let mut tools: Vec<String> = Vec::new();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
    let mut id = 2;
    while tools.is_empty() && std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        stdin
            .write_all(
                send(serde_json::json!({"id": id, "method": "mcpServerStatus/list", "params": {}}))
                    .as_bytes(),
            )
            .await
            .unwrap();
        loop {
            let line = tokio::time::timeout(std::time::Duration::from_secs(30), lines.next_line())
                .await
                .unwrap()
                .unwrap()
                .expect("codex answers");
            let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            if msg["id"] != id {
                continue;
            }
            for server in msg["result"]["data"].as_array().into_iter().flatten() {
                if server["name"] == "escouade" {
                    println!(
                        "escouade, as Codex sees it: authStatus {}, toolsError {}",
                        server["authStatus"], server["toolsError"]
                    );
                    tools = server["tools"]
                        .as_object()
                        .map(|t| t.keys().cloned().collect())
                        .unwrap_or_default();
                }
            }
            break;
        }
        id += 1;
    }
    drop(stdin);
    let _ = child.kill().await;
    println!("tools listed by Codex: {}", tools.len());
    assert!(tools.iter().any(|t| t == "list_projects"), "{tools:?}");
    // The server saw Claude outside Escouade's token: Codex came in as the user's client.
    assert!(h
        .core
        .mcp
        .activity
        .entries()
        .iter()
        .all(|e| e.outcome != "refused"));

    user.remove(&file).unwrap();
    assert_eq!(
        std::fs::read(&file).unwrap(),
        saved,
        "the file as it was, byte for byte"
    );
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(!text.contains(&want.token) && !text.contains("[mcp_servers.escouade]"));
    h.core.shutdown();
}

#[cfg(unix)]
#[tokio::test]
async fn an_account_whose_config_toml_is_a_link_to_principals_keeps_its_link_and_the_file_is_written_once(
) {
    let h = harness("mcp-codex-link");
    std::fs::create_dir_all(principal_toml(&h).parent().unwrap()).unwrap();
    std::fs::write(principal_toml(&h), USERS).unwrap();
    // A Codex account that shares its Principal's settings (`accounts::link_file`).
    let dir = h.dir.join("codex-lie");
    std::fs::create_dir_all(&dir).unwrap();
    let linked = dir.join("config.toml");
    std::os::unix::fs::symlink(principal_toml(&h), &linked).unwrap();
    let mut s = h.core.settings.read().clone();
    s.accounts
        .push(crate::accounts::principal_of(EngineId::Codex));
    s.accounts.push(Account {
        id: "codex-lie".into(),
        name: "Lié".into(),
        engine: EngineId::Codex,
        config_dir: dir.to_string_lossy().into(),
        active: true,
        ..Default::default()
    });
    h.core.save_settings(s).unwrap();
    let is_link = || {
        std::fs::symlink_metadata(&linked)
            .unwrap()
            .file_type()
            .is_symlink()
    };

    after(&h, |h| h.core.set_mcp_enabled(true).unwrap()).await;
    after(&h, |h| {
        h.core.set_mcp_harness(EngineId::Codex, true).unwrap()
    })
    .await;
    assert!(is_link(), "the link is still a link");
    let text = std::fs::read_to_string(principal_toml(&h)).unwrap();
    assert_eq!(text.matches("[mcp_servers.escouade]").count(), 1, "{text}");
    assert_eq!(current(&CODEX, &principal_toml(&h)), Some(now_wanted(&h)));
    // Each account told what is true: declared, both, in Principal's file.
    let codex: Vec<_> = h
        .core
        .mcp
        .declared()
        .into_iter()
        .filter(|d| d.engine == EngineId::Codex)
        .collect();
    assert_eq!(codex.len(), 2);
    assert!(codex.iter().all(|d| d.ok), "{codex:?}");
    let real = std::fs::canonicalize(principal_toml(&h)).unwrap();
    assert_eq!(
        codex[1].file.as_deref(),
        Some(real.to_string_lossy().as_ref())
    );

    // The linked account removed: Principal still wants the entry, it stays.
    let before = runs(&h);
    h.core.remove_claude_account("codex-lie").unwrap();
    // Its declaration run, and the removal of its entry.
    h.wait("the removal", |h| runs(h) > before + 1).await;
    assert!(current(&CODEX, &principal_toml(&h)).is_some());

    after(&h, |h| {
        h.core.set_mcp_harness(EngineId::Codex, false).unwrap()
    })
    .await;
    assert!(is_link(), "the link is still a link");
    assert_eq!(std::fs::read_to_string(principal_toml(&h)).unwrap(), USERS);
    h.core.shutdown();
}
