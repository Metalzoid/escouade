//! « Vue Copilot »: Copilot CLI's own interface (`copilot`) in a terminal (`TerminalView`), as the
//! real runs of Copilot CLI 1.0.98 found it (docs/TODO-1.8.md, point 0, « Vue terminal », ESC-23
//! and ESC-48).
//!
//! - Its hooks are commands (`escouade-hook <event>`), in a plugin of the agent's own given by
//!   `--plugin-dir` (`<plugin>/plugin.json`, `<plugin>/hooks/hooks.json`): for this process alone,
//!   never in the `COPILOT_HOME` of the account, which the user's own sessions read too (tried:
//!   `hooks.discover` lists them as the plugin's, a server started without the option has none).
//!   Their payloads do not say their event: its name is the command's argument.
//! - Its log is the session's `session-state/<id>/events.jsonl`, the events of the session as its
//!   server sends them, translated by `AgentRt::copilot_log`; its hooks by `AgentRt::copilot_hook`.
//! - Escouade names a new session (`--session-id <uuid>`); a session is resumed by `--resume <id>`,
//!   in the same `COPILOT_HOME` as the server of Escouade's view (tried both ways). Its interface
//!   cannot copy a session: a copy is made first by a server of its own (`sessions.fork`).
//! - On a folder its account does not trust (`trustedFolders` of its `config.json`, the folder or
//!   one above it), it asks first, each time it starts unless told to remember the folder.
//!   Escouade never answers for the user, and pastes no message until it is past the question
//!   (`paste_refusal`).

use super::super::terminal::{bracketed, TerminalArgs, TerminalLaunch, TerminalView};
use super::super::{BoxFuture, Program};
use super::process::{frame, read_frame};
use super::{args as server_args, SECRETS};
use crate::agent::{AgentRt, Effects, HookOutcome};
use crate::tui::Registered;
use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

/// The hooks Escouade listens to.
pub(crate) const EVENTS: &[&str] = &[
    "sessionStart",
    "userPromptSubmitted",
    "preToolUse",
    "permissionRequest",
    "notification",
    "postToolUse",
    "postToolUseFailure",
    "agentStop",
    "sessionEnd",
];

/// What Copilot says, before it quits, of a session to resume that its folder does not have
/// (« Error: No session, task, or name matched '<id>'. », tried on 1.0.98).
const NO_SESSION: &str = "No session, task, or name matched";

/// The efforts its `--reasoning-effort` takes.
const EFFORTS: [&str; 7] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/// How long a hook may run, and the copy of a session take.
const HOOK_LIMIT_SECS: u64 = 10;
const COPY_LIMIT: Duration = Duration::from_secs(30);
/// How long after a first Escape the second goes, which interrupts the turn.
const INTERRUPT_AGAIN: Duration = Duration::from_millis(400);

/// Copilot's interface.
pub struct CopilotTerminal;

pub static COPILOT_TERMINAL: CopilotTerminal = CopilotTerminal;

/// The plugin of the agent's interface, beside its private file.
pub(crate) fn plugin_dir(private_file: &Path) -> PathBuf {
    private_file.with_extension("copilot-plugin")
}

/// The line that runs `command` for `event`, in PowerShell (Windows) or in a POSIX shell.
fn hook_line(command: &Path, event: &str, powershell: bool) -> String {
    let path = command.to_string_lossy();
    if powershell {
        format!("& '{}' {event}", path.replace('\'', "''"))
    } else {
        format!("'{}' {event}", path.replace('\'', r"'\''"))
    }
}

/// Its plugin's hooks (`hooks/hooks.json`): `escouade-hook <event>` for each event Escouade
/// listens to.
pub(crate) fn hooks_file(command: &Path) -> Value {
    let hooks: serde_json::Map<String, Value> = EVENTS
        .iter()
        .map(|e| {
            let entry = json!({
                "type": "command",
                "bash": hook_line(command, e, false),
                "powershell": hook_line(command, e, true),
                "timeoutSec": HOOK_LIMIT_SECS,
            });
            (e.to_string(), json!([entry]))
        })
        .collect();
    json!({ "version": 1, "hooks": hooks })
}

/// The arguments of an agent's interface: its session resumed or named, Escouade's options of its
/// server (no built-in MCP, nor the system's temporary folder, the tokens out of its commands), its
/// model, effort and mode, and its plugin (`plugin`) when there is `escouade-hook` to run.
pub(crate) fn tui_args(l: &TerminalLaunch, plugin: Option<&Path>) -> Vec<String> {
    let m = l.meta;
    let mut a: Vec<String> = Vec::new();
    match (&m.session_id, l.session) {
        (Some(s), _) => a.extend(["--resume".into(), s.clone()]),
        (None, Some(s)) => a.extend(["--session-id".into(), s.to_string()]),
        (None, None) => {}
    }
    a.extend([
        "--no-auto-update".into(),
        "--disable-builtin-mcps".into(),
        "--disallow-temp-dir".into(),
        format!("--secret-env-vars={SECRETS}"),
    ]);
    // Never `auto`, which picks a model itself.
    if !m.model.is_empty() && m.model != "auto" {
        a.extend(["--model".into(), m.model.clone()]);
    }
    if EFFORTS.contains(&m.effort.as_str()) {
        a.extend(["--reasoning-effort".into(), m.effort.clone()]);
    }
    // As Escouade's rules answer in its view: writes in its folder in « Édits auto » and « Auto »,
    // `git add` and `git commit` too in « Auto ».
    match m.mode.as_str() {
        "bypassPermissions" => a.push("--allow-all".into()),
        "plan" => a.extend(["--mode".into(), "plan".into()]),
        "acceptEdits" => a.push("--allow-tool=write".into()),
        "auto" => a.extend([
            "--mode".into(),
            "autopilot".into(),
            "--allow-tool=write".into(),
            "--allow-tool=shell(git add)".into(),
            "--allow-tool=shell(git commit)".into(),
        ]),
        _ => {}
    }
    if let Some(p) = plugin {
        a.extend(["--plugin-dir".into(), p.to_string_lossy().into_owned()]);
    }
    a
}

/// The folder of the session `session` in Copilot's folder `config_dir`.
fn session_dir(config_dir: &Path, session: &str) -> PathBuf {
    config_dir.join("session-state").join(session)
}

/// The log of `session`, once something is written in it (Copilot does not resume a session with
/// no event, tried).
pub fn find_events(config_dir: &Path, session: &str) -> Option<PathBuf> {
    let file = session_dir(config_dir, session).join("events.jsonl");
    std::fs::metadata(&file)
        .is_ok_and(|m| m.is_file() && m.len() > 0)
        .then_some(file)
}

/// A folder as Copilot's `config.json` names it, to compare: forward slashes, no trailing one,
/// and (Windows) no case.
fn folder_key(p: &str) -> String {
    let s = p
        .trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string();
    let s = s.strip_prefix("//?/").unwrap_or(&s).to_string();
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s
    }
}

/// The folders a `config.json` of Copilot trusts (`trustedFolders`; its first lines are comments).
pub(crate) fn trusted_folders(config: &str) -> Vec<String> {
    let json: String = config
        .lines()
        .filter(|l| !l.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    serde_json::from_str::<Value>(&json)
        .ok()
        .and_then(|v| v["trustedFolders"].as_array().cloned())
        .into_iter()
        .flatten()
        .filter_map(|f| f.as_str().map(folder_key))
        .collect()
}

/// Whether Copilot, in `cwd` with the folder `config_dir`, opens on its question about the trust
/// of the folder: neither it nor a folder above it trusted (tried: a parent trusted is enough).
pub(crate) fn asks_trust(config_dir: &Path, cwd: &str) -> bool {
    let config = std::fs::read_to_string(config_dir.join("config.json")).unwrap_or_default();
    let cwd = folder_key(cwd);
    !trusted_folders(&config)
        .iter()
        .any(|k| cwd == *k || cwd.starts_with(&format!("{k}/")))
}

/// Copies the session `of` (up to its event `at`, all of it with none) by a server of Copilot's
/// own, in `cwd` with `env`: the copy's id, its first events those of `of` (`sessions.fork`).
pub(crate) async fn fork_session(
    program: &Program,
    cwd: &str,
    env: &[(String, String)],
    of: &str,
    at: Option<&str>,
) -> Result<String> {
    use tokio::io::BufReader;
    let launch = program.launch(cwd, &server_args(), env)?;
    let mut cmd = tokio::process::Command::new(&launch.program);
    cmd.args(&launch.args)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    for (k, v) in &launch.env {
        cmd.env(k, v);
    }
    #[cfg(windows)]
    cmd.creation_flags(crate::proc::CREATE_NO_WINDOW);
    crate::job::isolate(&mut cmd);
    crate::proc::no_inherited_fds(&mut cmd);
    let mut child = cmd.spawn().context("copilot --server")?;
    let job = crate::job::Job::for_child(&child);
    let mut stdin = child.stdin.take().context("stdin")?;
    let mut stdout = BufReader::new(child.stdout.take().context("stdout")?);
    let talk = async {
        let mut rpc = Rpc {
            stdin: &mut stdin,
            stdout: &mut stdout,
            next: 0,
        };
        let mut ask = async |method: &str, params: Value| rpc.ask(method, params).await;
        ask("connect", json!({})).await?;
        let mut fork = json!({ "sessionId": of, "name": "Escouade" });
        if let Some(at) = at {
            let events = ask("sessions.readPersistedEvents", json!({ "sessionId": of })).await?;
            let list = events["events"].as_array().cloned().unwrap_or_default();
            // `toEventId` keeps what is before it: the event after `at`.
            let after = list
                .iter()
                .position(|e| e["id"] == at)
                .and_then(|i| list.get(i + 1))
                .and_then(|e| e["id"].as_str());
            if let Some(after) = after {
                fork["toEventId"] = json!(after);
            }
        }
        let copied = ask("sessions.fork", fork).await?;
        let _ = ask("runtime.shutdown", json!({})).await;
        copied["sessionId"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow!("sessions.fork: no session"))
    };
    let answer = tokio::time::timeout(COPY_LIMIT, talk)
        .await
        .map_err(|_| anyhow!("copilot did not copy the session in time"))?;
    let _ = child.start_kill();
    let _ = child.wait().await;
    drop(job);
    answer
}

/// Requests to a server of Copilot's, one at a time, each answer awaited.
struct Rpc<'a, W, R> {
    stdin: &'a mut W,
    stdout: &'a mut R,
    next: u64,
}

impl<W, R> Rpc<'_, W, R>
where
    W: tokio::io::AsyncWrite + Unpin,
    R: tokio::io::AsyncBufRead + Unpin,
{
    async fn ask(&mut self, method: &str, params: Value) -> Result<Value> {
        use tokio::io::AsyncWriteExt;
        self.next += 1;
        let id = self.next;
        let msg = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        self.stdin.write_all(&frame(&msg)).await?;
        self.stdin.flush().await?;
        while let Some(body) = read_frame(self.stdout).await? {
            let Ok(msg) = serde_json::from_slice::<Value>(&body) else {
                continue;
            };
            if msg["id"] == id && msg.get("method").is_none() {
                if let Some(e) = msg.get("error") {
                    bail!("{method}: {}", e["message"].as_str().unwrap_or("error"));
                }
                return Ok(msg["result"].clone());
            }
        }
        Err(anyhow!("copilot ended before it answered {method}"))
    }
}

/// Copies the folder `from` into `to`, its files and folders (not its locks).
fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let name = entry.file_name();
        if name.to_string_lossy().ends_with(".lock") {
            continue;
        }
        let (src, dst) = (entry.path(), to.join(&name));
        if entry.file_type()?.is_dir() {
            copy_dir(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst)?;
        }
    }
    Ok(())
}

impl TerminalView for CopilotTerminal {
    fn shell(&self) -> &'static str {
        "copilot"
    }

    fn launch(&self, l: &TerminalLaunch) -> TerminalArgs {
        let plugin = plugin_dir(l.private_file);
        let files = match l.hooks.command {
            Some(command) => vec![
                (
                    plugin.join("plugin.json"),
                    serde_json::to_vec_pretty(&json!({
                        "name": "escouade",
                        "description": "Escouade follows the agent of this interface.",
                        "version": env!("CARGO_PKG_VERSION"),
                    }))
                    .unwrap_or_default(),
                ),
                (
                    plugin.join("hooks").join("hooks.json"),
                    serde_json::to_vec_pretty(&hooks_file(command)).unwrap_or_default(),
                ),
            ],
            None => Vec::new(),
        };
        let with_plugin = (!files.is_empty()).then_some(plugin.as_path());
        TerminalArgs {
            args: tui_args(l, with_plugin),
            file: None,
            // `escouade-hook` posts to the hooks' server at this address.
            env: vec![(l.hooks.url_var.to_string(), l.hooks.url.to_string())],
            files,
        }
    }

    /// The hooks are its plugin's: without `escouade-hook`, there is none.
    fn prepare<'a>(
        &'a self,
        _program: &'a Program,
        _cwd: &'a str,
        args: &'a [String],
        _env: &'a [(String, String)],
    ) -> BoxFuture<'a, Result<Vec<String>>> {
        Box::pin(async move {
            if !args.iter().any(|a| a == "--plugin-dir") {
                bail!(tr!(
                    "escouade-hook est introuvable à côté de l’app",
                    "escouade-hook is not found beside the app"
                ));
            }
            Ok(Vec::new())
        })
    }

    fn read_dir_args(&self, dir: &Path) -> Vec<String> {
        vec![format!("--add-dir={}", dir.display())]
    }

    fn copy_first<'a>(
        &'a self,
        program: &'a Program,
        cwd: &'a str,
        env: &'a [(String, String)],
        of: &'a str,
        at: Option<&'a str>,
    ) -> Option<BoxFuture<'a, Result<String>>> {
        Some(Box::pin(fork_session(program, cwd, env, of, at)))
    }

    fn names_its_session(&self) -> bool {
        true
    }

    fn on_hook(&self, rt: &mut AgentRt, hook: &Value, fx: &mut Effects) -> HookOutcome {
        rt.copilot_hook(hook, fx)
    }

    fn running_dir(&self, _config_dir: &Path) -> Option<PathBuf> {
        None
    }

    fn find_running(&self, _: &Path, _: &str, _: Option<&Path>) -> Option<Registered> {
        None
    }

    fn find_log(&self, config_dir: &Path, session: &str) -> Option<PathBuf> {
        find_events(config_dir, session)
    }

    fn on_log_entry(&self, rt: &mut AgentRt, entry: &Value, fx: &mut Effects) {
        rt.copilot_log(entry, fx);
    }

    fn says_session_lost(&self, output: &[u8]) -> bool {
        String::from_utf8_lossy(output).contains(NO_SESSION)
    }

    /// Its folder (its log, its workspace), at the same place in the other folder.
    fn copy_session(&self, from: &Path, to: &Path, session: &str) -> Result<()> {
        let dir = session_dir(from, session);
        if find_events(from, session).is_none() {
            bail!("no events of {session} in {}", from.display());
        }
        copy_dir(&dir, &session_dir(to, session))
    }

    /// Until it told something, an interface on a folder its account does not trust may still be
    /// on its question about it (answered « Yes » for this session only, nothing is written).
    fn paste_refusal(&self, config_dir: &Path, cwd: &str, spoke: bool) -> Option<String> {
        (!spoke && asks_trust(config_dir, cwd)).then(|| {
            tr!(
                "Copilot demande si tu fais confiance à ce dossier : réponds dans son terminal, puis renvoie ton message (« Yes, and remember this folder » évite la question aux prochains lancements).",
                "Copilot asks whether you trust this folder: answer in its terminal, then send your message again (“Yes, and remember this folder” spares you the question next time)."
            )
        })
    }

    fn paste(&self, text: &str) -> Vec<u8> {
        bracketed(text)
    }

    fn submit(&self) -> &'static [u8] {
        b"\r"
    }

    fn image_types(&self) -> &'static [&'static str] {
        &[]
    }

    /// Escape (« esc interrupt »), which its log tells as `abort`.
    fn interrupt_key(&self) -> &'static [u8] {
        b"\x1b"
    }

    /// Escape again (« esc again to interrupt »): once only asks for it (tried, ESC-48).
    fn interrupt_again(&self) -> Option<Duration> {
        Some(INTERRUPT_AGAIN)
    }

    fn quit_key(&self) -> &'static [u8] {
        b"\x03"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::terminal::HookServer;
    use crate::engine::Escouade;
    use crate::model::AgentMeta;

    fn launch_of(meta: &AgentMeta, session: Option<&str>, command: Option<&Path>) -> TerminalArgs {
        let access = Escouade::Denied { file: None };
        COPILOT_TERMINAL.launch(&TerminalLaunch {
            meta,
            session,
            remote: None,
            private_file: Path::new("/data/tui/a1.json"),
            hooks: HookServer {
                url: "http://127.0.0.1:4120/hook",
                token_var: "ESCOUADE_HOOK_TOKEN",
                url_var: "ESCOUADE_HOOK_URL",
                command,
            },
            access: &access,
        })
    }

    #[test]
    fn a_new_session_is_named_a_known_one_resumed_with_the_agents_options() {
        let meta = AgentMeta {
            model: "gpt-6-luna".into(),
            effort: "high".into(),
            mode: "auto".into(),
            ..Default::default()
        };
        let hook = Path::new("/opt/escouade/escouade-hook");
        let new = launch_of(&meta, Some("u-1"), Some(hook));
        assert_eq!(new.args[..2], ["--session-id", "u-1"]);
        for flag in [
            "--no-auto-update",
            "--disable-builtin-mcps",
            "--disallow-temp-dir",
            "--allow-tool=write",
            "--allow-tool=shell(git commit)",
        ] {
            assert!(new.args.iter().any(|a| a == flag), "{flag}: {:?}", new.args);
        }
        let pair = |a: &[String], k: &str| a.windows(2).find(|w| w[0] == k).map(|w| w[1].clone());
        assert_eq!(pair(&new.args, "--model").as_deref(), Some("gpt-6-luna"));
        assert_eq!(
            pair(&new.args, "--reasoning-effort").as_deref(),
            Some("high")
        );
        assert_eq!(pair(&new.args, "--mode").as_deref(), Some("autopilot"));
        assert!(new.args.iter().any(|a| a.starts_with("--secret-env-vars=")));
        // Its plugin, beside its private file: the hooks of each event.
        let plugin = plugin_dir(Path::new("/data/tui/a1.json"));
        assert_eq!(
            pair(&new.args, "--plugin-dir").map(PathBuf::from),
            Some(plugin.clone())
        );
        let paths: Vec<&PathBuf> = new.files.iter().map(|(p, _)| p).collect();
        assert_eq!(
            paths,
            [
                &plugin.join("plugin.json"),
                &plugin.join("hooks").join("hooks.json")
            ]
        );
        let hooks: Value = serde_json::from_slice(&new.files[1].1).unwrap();
        assert_eq!(hooks["version"], 1);
        assert_eq!(
            hooks["hooks"]["agentStop"][0]["bash"],
            "'/opt/escouade/escouade-hook' agentStop"
        );
        assert_eq!(
            new.env,
            [(
                "ESCOUADE_HOOK_URL".to_string(),
                "http://127.0.0.1:4120/hook".to_string()
            )]
        );

        let known = AgentMeta {
            session_id: Some("s1".into()),
            model: "auto".into(),
            ..Default::default()
        };
        let resumed = launch_of(&known, None, None);
        assert_eq!(resumed.args[..2], ["--resume", "s1"]);
        assert!(!resumed
            .args
            .iter()
            .any(|a| a == "--model" || a == "--plugin-dir"));
        assert!(resumed.files.is_empty());
    }

    #[test]
    fn each_hook_runs_escouade_hook_with_its_event_quoted_for_its_shell() {
        let hooks = hooks_file(Path::new(r"C:\Program Files\Esc'ouade\escouade-hook.exe"));
        let entry = &hooks["hooks"]["notification"][0];
        assert_eq!(entry["type"], "command");
        assert_eq!(
            entry["powershell"],
            r"& 'C:\Program Files\Esc''ouade\escouade-hook.exe' notification"
        );
        assert_eq!(
            entry["bash"],
            r"'C:\Program Files\Esc'\''ouade\escouade-hook.exe' notification"
        );
        assert_eq!(hooks["hooks"].as_object().unwrap().len(), EVENTS.len());
    }

    #[test]
    fn a_folder_trusted_or_under_a_trusted_one_is_not_asked_about() {
        let config = "// User settings belong in settings.json.\n// This file is managed automatically.\n{\n  \"firstLaunchAt\": \"2026-10-18T09:59:47.522Z\",\n  \"trustedFolders\": [\n    \"C:\\\\Users\\\\u\\\\proj\"\n  ]\n}\n";
        assert_eq!(trusted_folders(config), [folder_key("C:/Users/u/proj")]);
        let home =
            std::env::temp_dir().join(format!("escouade-copilot-trust-{}", crate::model::new_id()));
        std::fs::create_dir_all(&home).unwrap();
        let proj = home.join("proj");
        let wt = proj.join("wt");
        let cwd = wt.to_string_lossy();
        assert!(asks_trust(&home, &cwd));
        assert!(COPILOT_TERMINAL.paste_refusal(&home, &cwd, false).is_some());
        // Past it (it told something since it started): nothing is refused.
        assert!(COPILOT_TERMINAL.paste_refusal(&home, &cwd, true).is_none());
        let trusted = json!({ "trustedFolders": [proj.to_string_lossy()] });
        std::fs::write(home.join("config.json"), format!("// x\n{trusted}")).unwrap();
        assert!(!asks_trust(&home, &cwd));
        assert!(!asks_trust(&home, &proj.to_string_lossy()));
        assert!(asks_trust(&home, &home.to_string_lossy()));
    }

    #[test]
    fn a_sessions_log_is_found_once_written_and_copied_with_its_folder() {
        let home = std::env::temp_dir().join(format!(
            "escouade-copilot-sessions-{}",
            crate::model::new_id()
        ));
        let dir = session_dir(&home, "s1");
        std::fs::create_dir_all(dir.join("checkpoints")).unwrap();
        std::fs::write(dir.join("workspace.yaml"), "id: s1\n").unwrap();
        std::fs::write(dir.join(".workspace-fork.lock"), "").unwrap();
        // Created, not written yet: Copilot would not resume it.
        std::fs::write(dir.join("events.jsonl"), "").unwrap();
        assert_eq!(find_events(&home, "s1"), None);
        std::fs::write(dir.join("events.jsonl"), "{\"type\":\"session.start\"}\n").unwrap();
        assert_eq!(find_events(&home, "s1"), Some(dir.join("events.jsonl")));
        std::fs::write(dir.join("checkpoints").join("index.md"), "x").unwrap();
        let other = home.join("other");
        COPILOT_TERMINAL.copy_session(&home, &other, "s1").unwrap();
        assert!(find_events(&other, "s1").is_some());
        assert!(session_dir(&other, "s1")
            .join("checkpoints")
            .join("index.md")
            .is_file());
        assert!(!session_dir(&other, "s1")
            .join(".workspace-fork.lock")
            .exists());
        assert!(COPILOT_TERMINAL.copy_session(&home, &other, "s2").is_err());
        assert!(COPILOT_TERMINAL.says_session_lost(
            b"Error: No session, task, or name matched 's9'.\r\nTo resume by session or task ID:"
        ));
    }
}
