//! « Vue Claude Code »: an agent run in Claude Code's own interface (its TUI) in a terminal, in
//! place of the stream that Escouade's conversation view drives. A session has one process at a
//! time: switching stops the one and resumes the session in the other (`--resume`).
//!
//! The window still knows what the agent does, from two sources (docs/PROTOCOL.md, « Vue Claude
//! Code »):
//! - its hooks, given to it with `--settings` as HTTP hooks to a server of Escouade's on
//!   127.0.0.1, behind a token of its own (in its environment, never on its command line): it
//!   runs, it waits for the user, it stopped;
//! - its transcript, read as it is written (`agent::transcript`): the conversation, its turns and
//!   what they cost, the plan.
//!
//! A ticket's agent never runs there: its board drives it over the stream.

use crate::accounts;
use crate::agent::{Effects, TuiRun};
use crate::core::Core;
use crate::mcp::AgentAccess;
use crate::model::*;
use crate::pty::TermInfo;
use anyhow::{anyhow, bail, Context, Result};
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{header, Method, Request, Response, StatusCode};
use hyper_util::rt::{TokioIo, TokioTimer};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::io::{Read, Seek, SeekFrom};
use std::net::{Ipv4Addr, TcpListener};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Weak};
use std::time::Duration;
use tauri::Runtime;

/// The path of the hooks' endpoint.
const PATH: &str = "/hook";
/// The variable that gives an interface its token.
const TOKEN_VAR: &str = "ESCOUADE_HOOK_TOKEN";
/// How often the transcript of a running interface is read.
const READ_EVERY: Duration = Duration::from_millis(400);
/// The most a hook may send (its tool's input, a prompt with a pasted file).
const MAX_BODY: usize = 4 << 20;
/// The hooks Escouade listens to.
const EVENTS: &[&str] = &[
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Notification",
    "Stop",
    "StopFailure",
];

/// The server the interfaces' hooks call: started with the first interface, until the app quits.
#[derive(Default)]
pub struct Hooks {
    port: Mutex<Option<u16>>,
    /// Each running interface's token, and its agent.
    tokens: Mutex<HashMap<String, String>>,
}

impl Hooks {
    pub(crate) fn grant(&self, agent_id: &str) -> String {
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        self.tokens
            .lock()
            .insert(token.clone(), agent_id.to_string());
        token
    }

    pub(crate) fn revoke(&self, agent_id: &str) {
        self.tokens.lock().retain(|_, a| a != agent_id);
    }

    fn agent_of(&self, token: &str) -> Option<String> {
        self.tokens.lock().get(token).cloned()
    }

    /// The agent has an interface's token.
    #[cfg(test)]
    pub(crate) fn holds(&self, agent_id: &str) -> bool {
        self.tokens.lock().values().any(|a| a == agent_id)
    }
}

/// The settings an interface is started with (`--settings <file>`): its hooks, each an HTTP call
/// to `port` with the token of its environment, and, Escouade's tools refused to it (`access`),
/// the server itself kept out (`AgentAccess::refusal`: Claude Code reads the last `--settings`
/// only, so both are in this one).
pub fn tui_settings(port: u16, access: &AgentAccess) -> Value {
    let hook = json!([{ "hooks": [{
        "type": "http",
        "url": format!("http://127.0.0.1:{port}{PATH}"),
        "headers": { "Authorization": format!("Bearer ${TOKEN_VAR}") },
        "allowedEnvVars": [TOKEN_VAR],
        "timeout": 5,
    }] }]);
    let hooks: serde_json::Map<String, Value> = EVENTS
        .iter()
        .map(|e| (e.to_string(), hook.clone()))
        .collect();
    let mut settings = json!({ "hooks": hooks });
    if let Some(Value::Object(refusal)) = access.refusal() {
        settings.as_object_mut().unwrap().extend(refusal);
    }
    settings
}

/// The arguments of an agent's interface, as its stream's are (`claude_args`) less the stream's
/// own; `session` is the session it starts or forks into, when it resumes none.
pub fn tui_args(m: &AgentMeta, session: Option<&str>, settings_file: &Path) -> Vec<String> {
    let mut a: Vec<String> = vec!["--model".into(), m.model.clone()];
    if crate::core::supports_effort(&m.model) {
        a.extend(["--effort".into(), m.effort.clone()]);
    }
    a.extend([
        "--permission-mode".into(),
        m.mode.clone(),
        "--allow-dangerously-skip-permissions".into(),
    ]);
    if let Some(p) = m.append_prompt.as_deref().filter(|p| !p.trim().is_empty()) {
        let one_line = p.split_whitespace().collect::<Vec<_>>().join(" ");
        a.extend(["--append-system-prompt".into(), one_line]);
    }
    match (&m.session_id, &m.fork_of) {
        (Some(s), _) => a.push(format!("--resume={s}")),
        (None, Some(f)) => {
            a.extend([format!("--resume={f}"), "--fork-session".into()]);
            if let Some(at) = &m.fork_at {
                a.push(format!("--resume-session-at={at}"));
            }
            a.extend(session.map(|s| format!("--session-id={s}")));
        }
        (None, None) => a.extend(session.map(|s| format!("--session-id={s}"))),
    }
    a.extend([
        "--settings".into(),
        settings_file.to_string_lossy().into_owned(),
    ]);
    a
}

/// The transcript of `session` in an account's folder: `projects/<folder>/<session>.jsonl`, the
/// one written last if several folders have it.
pub fn find_transcript(config_dir: &Path, session: &str) -> Option<PathBuf> {
    let file = format!("{session}.jsonl");
    std::fs::read_dir(config_dir.join("projects"))
        .ok()?
        .flatten()
        .filter_map(|folder| {
            let path = folder.path().join(&file);
            let at = std::fs::metadata(&path).ok()?.modified().ok()?;
            Some((at, path))
        })
        .max_by_key(|(at, _)| *at)
        .map(|(_, path)| path)
}

/// An interface that stops sooner than this after it started, other than by its user's wish
/// (`/exit`, code 0), stopped « as soon as it started ».
pub(crate) const QUICK_EXIT: Duration = Duration::from_secs(20);
/// An automatic start is refused once this many interfaces in a row stopped as soon as they
/// started.
const QUICK_EXITS_MAX: u32 = 2;
/// How much of an interface's first output is kept, to read what it said when it stopped at once.
const OUTPUT_KEPT: usize = 8 << 10;
/// What Claude Code says, before it quits, of a session to resume that its folder does not have.
const NO_CONVERSATION: &str = "No conversation found";

/// What the check before a start found of the session the interface is to resume.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionCheck {
    /// None to resume: the interface starts a session of its own.
    Fresh,
    /// Its transcript is in the account's folder: resumed.
    Found,
    /// Not in the account's folder, but in the folder of another account (its name, its folder).
    InOtherAccount { account: String, dir: PathBuf },
    /// Nowhere: Claude Code would refuse it.
    Missing,
}

/// The session whose transcript Claude Code must find to start the interface: the agent's own,
/// else the original's of a copy that has not started its own yet (`tui_args`).
fn session_to_resume(m: &AgentMeta) -> Option<&str> {
    m.session_id.as_deref().or(m.fork_of.as_deref())
}

/// Whether the session the interface is to resume (`m`) is where Claude Code will look for it, in
/// the account's folder `config_dir`, or else in the folder of one of the `others` (looked for
/// only then: their name and folder). Claude Code quits at once on a session it does not find.
pub fn check_session(
    m: &AgentMeta,
    config_dir: &Path,
    others: impl FnOnce() -> Vec<(String, PathBuf)>,
) -> SessionCheck {
    let Some(session) = session_to_resume(m) else {
        return SessionCheck::Fresh;
    };
    if find_transcript(config_dir, session).is_some() {
        return SessionCheck::Found;
    }
    others()
        .into_iter()
        .find(|(_, dir)| find_transcript(dir, session).is_some())
        .map_or(SessionCheck::Missing, |(account, dir)| {
            SessionCheck::InOtherAccount { account, dir }
        })
}

/// The accounts a session may be found in, other than `own`: the name and the folder of each,
/// those of the same side as `own` only (`in_wsl`: Claude Code finds a session by the folder it
/// runs in, which WSL names in its own way, so a session does not go from Windows to WSL, nor
/// back), and none that shares `own`'s folder.
pub fn other_accounts(
    settings: &Settings,
    own: &Account,
    in_wsl: impl Fn(&Account) -> bool,
) -> Vec<(String, PathBuf)> {
    let (own_dir, side) = (accounts::config_dir(own, settings), in_wsl(own));
    settings
        .accounts
        .iter()
        .filter(|a| a.id != own.id && in_wsl(a) == side)
        .map(|a| {
            (
                accounts::name_in(crate::i18n::ui(), a),
                accounts::config_dir(a, settings),
            )
        })
        .filter(|(_, dir)| *dir != own_dir)
        .collect()
}

/// `bytes` added to the output kept of an interface, up to `OUTPUT_KEPT`: its first lines, which
/// say why it stopped at once.
fn keep_output(kept: &mut Vec<u8>, bytes: &[u8]) {
    let room = OUTPUT_KEPT.saturating_sub(kept.len());
    kept.extend_from_slice(&bytes[..bytes.len().min(room)]);
}

/// Whether the output says Claude Code could not find the session it was told to resume.
fn says_no_conversation(output: &[u8]) -> bool {
    String::from_utf8_lossy(output).contains(NO_CONVERSATION)
}

/// How an interface that ran for `elapsed` ended with `code` (None: killed), having written
/// `output`. Quick: soon after it started, and not by its user's wish (`/exit` ends with code 0).
/// The session is lost when it was quick and the output says Claude Code did not find it.
pub fn classify_exit(elapsed: Duration, code: Option<u32>, output: &[u8]) -> TuiExit {
    let quick = elapsed < QUICK_EXIT && code != Some(0);
    TuiExit {
        code,
        quick,
        session_lost: quick && says_no_conversation(output),
    }
}

/// Whether a start is refused: it is automatic (`manual`: the user asked for it), and the
/// interface stopped as soon as it started `quick_exits` times in a row.
fn starts_too_fast(manual: bool, quick_exits: u32) -> bool {
    !manual && quick_exits >= QUICK_EXITS_MAX
}

/// What an interface wrote, once its last bytes are in: the terminal's reader may still be behind
/// when the exit is told. Waits a moment for more while it has not said the session was not
/// found, and its output still grows.
fn settled_output(kept: &Mutex<Vec<u8>>) -> Vec<u8> {
    let mut seen = None;
    for _ in 0..12 {
        let len = {
            let output = kept.lock();
            if says_no_conversation(&output) {
                break;
            }
            output.len()
        };
        if seen == Some(len) {
            break;
        }
        seen = Some(len);
        std::thread::sleep(Duration::from_millis(40));
    }
    kept.lock().clone()
}

/// Why the interface starts a new session: Claude Code could not find the one it was to resume.
pub(crate) fn session_lost_notice() -> String {
    tr!(
        "Session Claude introuvable : l’interface repart en nouvelle session.",
        "Claude session not found: the interface starts a new session."
    )
}

/// The same, for a copy: it is its original's session that is gone.
pub(crate) fn original_lost_notice() -> String {
    tr!(
        "La session de l’original est introuvable : la copie repart en nouvelle session.",
        "The original’s session was not found: the copy starts a new session."
    )
}

/// The complete lines of `path` from `offset` on (a line still being written waits for the next
/// read), and the offset after them.
pub fn read_lines(path: &Path, offset: u64) -> std::io::Result<(Vec<Value>, u64)> {
    let mut f = std::fs::File::open(path)?;
    let len = f.metadata()?.len();
    // Written again from the start (another file under the same name): read from there.
    let offset = if len < offset { 0 } else { offset };
    f.seek(SeekFrom::Start(offset))?;
    let mut buf = Vec::new();
    f.take(len - offset).read_to_end(&mut buf)?;
    let Some(end) = buf.iter().rposition(|b| *b == b'\n') else {
        return Ok((Vec::new(), offset));
    };
    let lines = buf[..end]
        .split(|b| *b == b'\n')
        .filter_map(|l| serde_json::from_slice::<Value>(l).ok())
        .collect();
    Ok((lines, offset + end as u64 + 1))
}

/// An entry written before `since` (ms): one of the conversation's history (a session forked or
/// resumed with no read kept), which its view already has.
fn before(e: &Value, since: i64) -> bool {
    e["timestamp"]
        .as_str()
        .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
        .is_some_and(|t| t.timestamp_millis() < since)
}

/// `NO_PROXY` with the loopback in it: the hooks' calls never go through a proxy.
fn no_proxy(env: &mut Vec<(String, String)>) {
    const LOOPBACK: &str = "127.0.0.1,localhost,::1";
    for key in ["NO_PROXY", "no_proxy"] {
        match env.iter_mut().find(|(k, _)| k == key) {
            Some((_, v)) if !v.trim().is_empty() => *v = format!("{v},{LOOPBACK}"),
            Some((_, v)) => *v = LOOPBACK.into(),
            None => env.push((key.into(), LOOPBACK.into())),
        }
    }
}

/// How long `send_to_tui` waits for a message's paste to be written to the terminal before it
/// goes on (a program that reads nothing: the paste stays queued, and the Enter follows it).
const PASTE_WRITTEN_WITHIN: Duration = Duration::from_secs(5);

/// How long an image pasted in an interface is kept. Claude Code reads the file as it is pasted
/// and keeps the image in its transcript (base64), which a resume sends again without the file
/// (seen on 2.1.300); but it tells the model the file's path (« [Image: source: …] »), which the
/// model may open in the turns that follow.
const PASTES_KEPT: Duration = Duration::from_secs(24 * 3600);

/// The most a pasted image may weigh, as all the files of a message in the composer (`MAX_TOTAL`).
const MAX_PASTE: usize = 18 << 20;

/// The types of the images Claude Code reads.
const IMAGE_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/// The extension Claude Code knows an image by, from its first bytes; None for anything but the
/// images it reads.
fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

/// Removes the pasted images older than `PASTES_KEPT` from `dir`.
pub(crate) fn clear_pastes(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let aged = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age > PASTES_KEPT);
        if aged {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Refused: a ticket's agent is driven by its board, over the stream.
fn ticket_refusal() -> anyhow::Error {
    anyhow!(tr!(
        "Un agent de ticket reste dans la vue d’Escouade : son tableau le pilote.",
        "A ticket’s agent stays in Escouade’s view: its board drives it."
    ))
}

impl<R: Runtime> Core<R> {
    /// The port of the hooks' server, once started.
    #[cfg(test)]
    pub(crate) fn hooks_port(&self) -> Option<u16> {
        *self.hooks.port.lock()
    }

    /// The port of the hooks' server, started the first time.
    fn hook_port(self: &Arc<Self>) -> Result<u16> {
        let mut port = self.hooks.port.lock();
        if let Some(p) = *port {
            return Ok(p);
        }
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let p = listener.local_addr()?.port();
        listener.set_nonblocking(true)?;
        let me = Arc::downgrade(self);
        tauri::async_runtime::spawn(serve(listener, me, p));
        *port = Some(p);
        Ok(p)
    }

    /// « Vue Claude Code » on or off for the agent. On, its stream's process stops (the window
    /// then opens its interface, `open_agent_terminal`); off, its interface stops and the stream
    /// takes its session up again.
    pub async fn set_agent_view(self: &Arc<Self>, id: &str, terminal: bool) -> Result<()> {
        let h = self.agent(id)?;
        let lock = self.spawn_lock(id);
        let _guard = lock.lock().await;
        {
            let rt = h.lock();
            if rt.meta.terminal == terminal {
                return Ok(());
            }
            if terminal && rt.meta.ticket_id.is_some() {
                return Err(ticket_refusal());
            }
            if terminal && rt.meta.remote_control {
                bail!(tr!(
                    "Coupe d’abord le remote control : dans l’interface de Claude Code, c’est sa commande /remote-control qui le fait.",
                    "Turn remote control off first: in Claude Code’s interface, its /remote-control command does it."
                ));
            }
            if rt.meta.status.is_active() && rt.tui.is_none() {
                bail!(tr!(
                    "L’agent travaille encore : change de vue quand son tour est fini.",
                    "The agent is still working: switch views once its turn is over."
                ));
            }
        }
        if terminal {
            let stopped = {
                let mut rt = h.lock();
                rt.meta.terminal = true;
                // The user chose this view: the interface it starts is a fresh try.
                rt.tui_quick_exits = 0;
                rt.tui_exit = None;
                rt.detach()
            };
            if let Some(p) = stopped {
                p.close_input();
                stop_and_wait(&p).await;
            }
        } else {
            self.read_transcript(id);
            let term = {
                let mut fx = Effects::default();
                let mut rt = h.lock();
                rt.meta.terminal = false;
                rt.tui_exit = None;
                rt.gen += 1;
                let term = rt.tui.as_ref().map(|t| t.term_id.clone());
                rt.stop_tui(&mut fx);
                term
            };
            self.hooks.revoke(id);
            if let Some(t) = term {
                self.pty.kill(&t);
            }
        }
        self.emit_agent(&h);
        self.request_save();
        if !terminal {
            self.warm(id);
        }
        Ok(())
    }

    /// Claude Code's interface for the agent, in a terminal the window shows (`on_data`): its
    /// session resumed, or started. One it had already stops first.
    ///
    /// The session to resume is looked for first, where Claude Code will look (`settle_session`):
    /// found in another account's folder, it is copied into the agent's; found nowhere, it is given
    /// up and a new one starts, instead of an interface that quits at once.
    ///
    /// `manual`: the user asked for it (« Relancer »). The window's own start (it opened the view)
    /// is refused once the interface stopped as soon as it started twice in a row: it would only
    /// loop. A manual start always goes, and begins the count again.
    pub async fn open_agent_terminal(
        self: &Arc<Self>,
        id: &str,
        size: (u16, u16),
        manual: bool,
        on_data: impl Fn(Vec<u8>) + Send + 'static,
    ) -> Result<TermInfo> {
        let h = self.agent(id)?;
        let lock = self.spawn_lock(id);
        let _guard = lock.lock().await;
        if self.quitting.load(std::sync::atomic::Ordering::Acquire) {
            bail!(crate::core::quitting_refusal());
        }
        {
            let mut rt = h.lock();
            if !rt.meta.terminal {
                bail!(tr!(
                    "L’agent n’est pas en vue Claude Code.",
                    "The agent is not in the Claude Code view."
                ));
            }
            if rt.meta.ticket_id.is_some() {
                return Err(ticket_refusal());
            }
            if rt.meta.archived {
                bail!(tr!("L’agent est archivé.", "The agent is archived."));
            }
            if starts_too_fast(manual, rt.tui_quick_exits) {
                bail!(tr!(
                    "Claude Code s’arrête dès son lancement ({n} fois de suite) : regarde sa sortie, puis clique sur « Relancer ».",
                    "Claude Code stops as soon as it starts ({n} times in a row): read its output, then click “Restart”.",
                    n = rt.tui_quick_exits
                ));
            }
            if manual {
                rt.tui_quick_exits = 0;
            }
        }
        // Never two processes on one session.
        let stopped = h.lock().detach();
        if let Some(p) = stopped {
            p.close_input();
            stop_and_wait(&p).await;
        }
        if let Some(old) = h.lock().tui.take() {
            self.pty.kill(&old.term_id);
        }
        self.hooks.revoke(id);
        let settings = self.settings.read().clone();
        let account = accounts::get(&settings, &h.lock().meta.account);
        let program = accounts::program(&account, &settings).ok_or_else(|| {
            anyhow!(tr!(
                "Claude Code introuvable. Installe-le ou indique son chemin dans les réglages.",
                "Claude Code not found. Install it or give its path in the settings."
            ))
        })?;
        let port = self.hook_port()?;
        let dir = self.data.root().join("tui");
        std::fs::create_dir_all(&dir)?;
        let settings_file = dir.join(format!("{id}.json"));
        let config_dir = accounts::config_dir(&account, &settings);
        self.settle_session(id, &settings, &account, &program, &config_dir)
            .await;
        let started = now_ms();
        let (args, cwd, name, gen, transcript, since) = {
            let mut rt = h.lock();
            // A session of its own from the start: its transcript is known before any hook.
            let new_session = rt
                .meta
                .session_id
                .is_none()
                .then(|| uuid::Uuid::new_v4().to_string());
            let args = tui_args(&rt.meta, new_session.as_deref(), &settings_file);
            if let Some(s) = new_session {
                rt.meta.session_id = Some(s);
                rt.meta.fork_of = None;
                rt.meta.fork_at = None;
            }
            let sid = rt.meta.session_id.clone().unwrap_or_default();
            let file = find_transcript(&config_dir, &sid);
            // Where the last read stopped, when it was this file; else from now on.
            let kept = rt
                .meta
                .transcript_read
                .clone()
                .filter(|(p, _)| file.as_deref() == Some(Path::new(p)));
            let (transcript, offset, since) = match (kept, file) {
                (Some((p, off)), _) => (Some(PathBuf::from(p)), off, None),
                (None, Some(f)) => {
                    let len = std::fs::metadata(&f).map(|m| m.len()).unwrap_or(0);
                    (Some(f), len, None)
                }
                (None, None) => (None, 0, Some(started - 2_000)),
            };
            rt.gen += 1;
            rt.start_tui();
            (
                args,
                rt.meta.cwd.clone(),
                rt.meta.name.clone(),
                rt.gen,
                (transcript, offset),
                since,
            )
        };
        if !Path::new(&cwd).is_dir() {
            bail!(tr!(
                "Le dossier {dir} n'existe plus",
                "The folder {dir} no longer exists",
                dir = cwd
            ));
        }
        self.ready_for_wsl(&program, &h);
        let mut args = args;
        let access = self.agent_access(id);
        args.extend(access.args());
        // Its hooks, and Escouade's server kept out of it when its tools are refused.
        let written = serde_json::to_vec_pretty(&tui_settings(port, &access))
            .map_err(anyhow::Error::from)
            .and_then(|b| Ok(std::fs::write(&settings_file, b)?));
        if let Err(e) = written {
            if let Some(t) = access.token() {
                self.mcp.release_agent(id, t);
            }
            return Err(e);
        }
        let token = self.hooks.grant(id);
        let mut env = [settings.agent_env(), accounts::launch_env(&account)].concat();
        env.push((TOKEN_VAR.into(), token));
        no_proxy(&mut env);
        let info = TermInfo {
            id: new_id(),
            // No project's: the window lists it with no project's terminals.
            project_id: String::new(),
            name,
            shell: "claude".into(),
        };
        log::info!(
            "agent {id}: starting Claude Code's interface {} {} in {cwd} (account {})",
            program.describe(),
            args.join(" "),
            account.id
        );
        let (me, agent, term, granted) = (
            Arc::downgrade(self),
            id.to_string(),
            info.id.clone(),
            access.token().map(str::to_string),
        );
        // Its first output is kept: what it says when it stops at once (a session it does not
        // find) is read from it, by its exit.
        let output = Arc::new(Mutex::new(Vec::new()));
        let kept = output.clone();
        let on_data = move |bytes: Vec<u8>| {
            {
                let mut kept = kept.lock();
                if kept.len() < OUTPUT_KEPT {
                    keep_output(&mut kept, &bytes);
                }
            }
            on_data(bytes);
        };
        let spawned = self.pty.spawn_program(
            info.clone(),
            &program,
            &args,
            &cwd,
            size,
            env,
            // Everything it started goes with it.
            false,
            on_data,
            move |code| {
                if let Some(c) = me.upgrade() {
                    if let Some(t) = &granted {
                        c.mcp.release_agent(&agent, t);
                    }
                    c.on_tui_exit(&agent, gen, &term, code, &output);
                }
            },
        );
        if let Err(e) = spawned {
            self.hooks.revoke(id);
            if let Some(t) = access.token() {
                self.mcp.release_agent(id, t);
            }
            return Err(e);
        }
        {
            let mut rt = h.lock();
            rt.tui = Some(TuiRun {
                term_id: info.id.clone(),
                gen,
                started: now_ms(),
                transcript: transcript.0,
                offset: transcript.1,
                program,
            });
            rt.tui_since = since;
            // Under its lock, as a process's start does it (`start_process_of`).
            let given = access.token().is_some_and(|t| self.mcp.caller(t).is_some());
            rt.started_with_escouade(given, self.escouade_granted());
        }
        self.emit_agent(&h);
        self.request_save();
        let (c, agent) = (self.clone(), id.to_string());
        tauri::async_runtime::spawn(async move { c.read_loop(&agent, gen).await });
        Ok(info)
    }

    /// An image pasted in the agent's interface (base64 `data`), which reads the clipboard's only
    /// on a key of its own: written to a file, whose path the window types there. Claude Code takes
    /// a pasted path to an image for the image, as a file dropped on a terminal. The path is the
    /// one its `claude` reads (in WSL, the Linux one).
    pub fn paste_image(&self, id: &str, media_type: &str, data: &str) -> Result<String> {
        use base64::Engine;
        let program = {
            let h = self.agent(id)?;
            let rt = h.lock();
            match &rt.tui {
                Some(t) => t.program.clone(),
                None if rt.meta.terminal => bail!(tr!(
                    "Claude Code s’est arrêté : relance-le pour y coller une image.",
                    "Claude Code stopped: restart it to paste an image into it."
                )),
                None => bail!(tr!(
                    "L’agent n’est pas en vue Claude Code.",
                    "The agent is not in the Claude Code view."
                )),
            }
        };
        if !IMAGE_TYPES.contains(&media_type) {
            bail!(tr!(
                "Claude Code ne lit pas les images {media_type}",
                "Claude Code does not read {media_type} images",
                media_type = media_type
            ));
        }
        let too_big = || {
            anyhow!(tr!(
                "L’image dépasse 18 Mo : Claude Code ne la recevra pas.",
                "The image is over 18 MB: Claude Code will not get it."
            ))
        };
        // Measured before it is decoded.
        if data.len() > MAX_PASTE.div_ceil(3) * 4 {
            return Err(too_big());
        }
        let bytes = base64::engine::general_purpose::STANDARD.decode(data)?;
        if bytes.len() > MAX_PASTE {
            return Err(too_big());
        }
        // What it holds, whatever its type says (a file copied under a wrong name).
        let Some(extension) = image_extension(&bytes) else {
            bail!(tr!(
                "Ce n’est pas une image PNG, JPEG, GIF ou WebP : Claude Code ne la lit pas.",
                "This is no PNG, JPEG, GIF or WebP image: Claude Code does not read it."
            ));
        };
        let dir = self.pastes_dir();
        std::fs::create_dir_all(&dir)?;
        clear_pastes(&dir);
        // Named after its agent, whose deletion takes it away.
        let file = dir.join(format!(
            "{id}-{}.{extension}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::write(&file, bytes).with_context(|| file.display().to_string())?;
        Ok(program.file_path(&file))
    }

    /// Where the images pasted in the interfaces are kept.
    pub(crate) fn pastes_dir(&self) -> PathBuf {
        self.data.root().join("tui").join("pastes")
    }

    /// Removes the images pasted in the interface of the agent `id`, which is deleted.
    pub(crate) fn forget_pastes(&self, id: &str) {
        let Ok(entries) = std::fs::read_dir(self.pastes_dir()) else {
            return;
        };
        let prefix = format!("{id}-");
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with(&prefix) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    /// Reads the transcript of the agent's interface `gen` as it is written, until it stops.
    async fn read_loop(self: Arc<Self>, id: &str, gen: u64) {
        loop {
            tokio::time::sleep(READ_EVERY).await;
            let Ok(h) = self.agent(id) else { return };
            if h.lock().tui.as_ref().is_none_or(|t| t.gen != gen) {
                return;
            }
            self.read_transcript(id);
        }
    }

    /// What the agent's interface wrote in its transcript since the last read.
    pub(crate) fn read_transcript(self: &Arc<Self>, id: &str) {
        let Ok(h) = self.agent(id) else { return };
        let (gen, path, offset, account, sid) = {
            let rt = h.lock();
            let Some(t) = rt.tui.as_ref() else { return };
            (
                t.gen,
                t.transcript.clone(),
                t.offset,
                rt.meta.account.clone(),
                rt.meta.session_id.clone(),
            )
        };
        // Not written yet when the interface started: looked for until it is.
        let path = match path {
            Some(p) => p,
            None => {
                let settings = self.settings.read().clone();
                let account = accounts::get(&settings, &account);
                let Some(found) = sid
                    .and_then(|s| find_transcript(&accounts::config_dir(&account, &settings), &s))
                else {
                    return;
                };
                found
            }
        };
        let (lines, next) = match read_lines(&path, offset) {
            Ok(read) => read,
            Err(e) => {
                log::debug!("agent {id}: transcript not read: {e}");
                return;
            }
        };
        let mut fx = Effects::default();
        let (pid, name, view, naming) = {
            let mut rt = h.lock();
            if rt.tui.as_ref().is_none_or(|t| t.gen != gen) {
                return;
            }
            let mut naming = None;
            for e in &lines {
                if rt.tui_since.is_some_and(|since| before(e, since)) {
                    continue;
                }
                let prompts = rt.meta.prompts;
                rt.on_transcript(e, &mut fx);
                // A message of the user's names the agent, as one sent from the window does: the
                // first that gives a text to name it from (not a command with nothing to say, nor
                // what the app typed by itself).
                if rt.meta.prompts > prompts {
                    let prompt = rt.tui_prompt.clone().unwrap_or_default();
                    if !rt.took_unprompted(&prompt) && naming.is_none() {
                        naming = rt.name_from(&prompt);
                    }
                }
            }
            if let Some(t) = rt.tui.as_mut() {
                t.transcript = Some(path.clone());
                t.offset = next;
            }
            let read = Some((path.to_string_lossy().into_owned(), next));
            if rt.meta.transcript_read != read {
                rt.meta.transcript_read = read;
            }
            let view = fx.agent_changed.then(|| rt.view());
            (
                rt.meta.project_id.clone(),
                rt.meta.name.clone(),
                view,
                naming,
            )
        };
        if lines.is_empty() && fx.ops.is_empty() {
            return;
        }
        self.apply(id, &pid, &name, fx, view);
        if let Some(text) = naming {
            let (c, id) = (self.clone(), id.to_string());
            tauri::async_runtime::spawn(async move { c.auto_name(&id, &text).await });
        }
    }

    /// A hook of the agent's interface: what it tells, after what its transcript said before.
    pub(crate) fn on_tui_hook(self: &Arc<Self>, id: &str, hook: Value) {
        self.read_transcript(id);
        let Ok(h) = self.agent(id) else { return };
        // A `claude` of WSL tells its transcript by its Linux path.
        let wsl = {
            let settings = self.settings.read().clone();
            let account = accounts::get(&settings, &h.lock().meta.account);
            accounts::program(&account, &settings).and_then(|p| p.wsl().cloned())
        };
        let mut fx = Effects::default();
        let (out, pid, name, view, gen) = {
            let mut rt = h.lock();
            let Some(gen) = rt.tui.as_ref().map(|t| t.gen) else {
                return;
            };
            let out = rt.on_hook(&hook, &mut fx);
            if let Some(path) = &out.transcript {
                let path = match &wsl {
                    Some(wsl) if path.starts_with('/') => wsl.windows_path(path),
                    _ => PathBuf::from(path),
                };
                if let Some(t) = rt.tui.as_mut() {
                    t.transcript = Some(path);
                    t.offset = 0;
                }
                rt.tui_since = None;
            }
            let view = fx.agent_changed.then(|| rt.view());
            (
                out,
                rt.meta.project_id.clone(),
                rt.meta.name.clone(),
                view,
                gen,
            )
        };
        self.apply(id, &pid, &name, fx, view);
        if out.stopped {
            // A background subagent the user stopped in the interface says so only in its files.
            self.end_stopped_subagents(id);
            // The transcript tells the end of the turn right after the hook; if it still did not
            // after a moment (a version that does not write it), the turn ends here.
            let (c, id) = (self.clone(), id.to_string());
            tauri::async_runtime::spawn(async move {
                for wait in [300, 1500] {
                    tokio::time::sleep(Duration::from_millis(wait)).await;
                    c.read_transcript(&id);
                }
                let _ = c.with_agent(&id, |rt, fx| {
                    if rt.tui.as_ref().is_some_and(|t| t.gen == gen) {
                        rt.end_tui_turn(None, fx);
                    }
                    Ok(())
                });
            });
        }
    }

    /// The agent's interface `gen` ended (`/exit`, closed, killed), having written `output` (its
    /// first bytes). How it ended is told to the window (`AgentView::tui_exit`): one that quit at
    /// once because Claude Code did not find the session to resume gives that session up.
    fn on_tui_exit(
        self: &Arc<Self>,
        id: &str,
        gen: u64,
        term: &str,
        code: Option<u32>,
        output: &Mutex<Vec<u8>>,
    ) {
        self.hub.emit(UiEvent::TerminalExit {
            id: term.to_string(),
            code,
        });
        if self.quitting.load(std::sync::atomic::Ordering::Acquire) {
            return;
        }
        log::info!("agent {id}: Claude Code's interface exited (code {code:?})");
        let started = self.agent(id).ok().and_then(|h| {
            let rt = h.lock();
            rt.tui.as_ref().filter(|t| t.gen == gen).map(|t| t.started)
        });
        let Some(started) = started else { return };
        self.read_transcript(id);
        let elapsed = Duration::from_millis((now_ms() - started).max(0) as u64);
        // Only what a quick exit may have said is read, and waited for.
        let said = if elapsed < QUICK_EXIT && code != Some(0) {
            settled_output(output)
        } else {
            Vec::new()
        };
        let exit = classify_exit(elapsed, code, &said);
        if exit.session_lost {
            log::info!("agent {id}: Claude Code did not find the session to resume");
        }
        self.tui_ended_with(id, gen, Some(exit));
    }

    /// The interface `gen` of the agent is over: its hooks' token is refused and the agent's run of
    /// it ends, only if, under the agent's lock, it is still the one running. A newer one, which
    /// takes its place under that lock before it is given a token, keeps its own (« Relancer » kills
    /// a live interface just before the next one starts, and the old one's exit may come after).
    #[cfg(test)]
    pub(crate) fn tui_ended(self: &Arc<Self>, id: &str, gen: u64) {
        self.tui_ended_with(id, gen, None);
    }

    /// `tui_ended`, with how the interface ended when it is known (`exit`): the agent keeps it for
    /// its view, counts the quick exits in a row, and gives its session up when Claude Code did not
    /// find it (its next start is a new session).
    fn tui_ended_with(self: &Arc<Self>, id: &str, gen: u64, exit: Option<TuiExit>) {
        let _ = self.with_agent(id, |rt, fx| {
            if rt.tui.as_ref().is_some_and(|t| t.gen == gen) {
                self.hooks.revoke(id);
                rt.stop_tui(fx);
                if let Some(exit) = exit {
                    if exit.session_lost {
                        rt.forget_session();
                        rt.notice("warn", session_lost_notice(), fx);
                    }
                    rt.tui_quick_exits = if exit.quick {
                        rt.tui_quick_exits + 1
                    } else {
                        0
                    };
                    rt.tui_exit = Some(exit);
                }
                fx.save = true;
            }
            Ok(())
        });
    }

    /// Before the agent's interface starts: the session it is to resume is looked for where Claude
    /// Code will look, in the account's folder (`check_session`).
    /// - In another account's folder only (the agent changed account, its session was left
    ///   behind): copied into this one's, resumed, and the conversation says so.
    /// - Nowhere (the agent never sent a message, so there is no transcript; the transcript is
    ///   gone; a copy whose original is): given up, and the interface starts a new session, which
    ///   the conversation says when the agent had a conversation to lose.
    ///
    /// Nobody writes the session meanwhile: the agent's processes are stopped, and the interface is
    /// not started yet.
    async fn settle_session(
        self: &Arc<Self>,
        id: &str,
        settings: &Settings,
        account: &Account,
        program: &crate::claude::Program,
        config_dir: &Path,
    ) {
        let Ok(h) = self.agent(id) else { return };
        let meta = h.lock().meta.clone();
        let Some(session) = session_to_resume(&meta).map(str::to_string) else {
            return;
        };
        // A `claude` of WSL: its folder is read through the distribution, which may not answer
        // (not running): then nothing is known of the session, and Claude Code is left to tell.
        if program.wsl().is_some() && !config_dir.is_dir() {
            return;
        }
        let (all, own, dir, m) = (
            settings.clone(),
            account.clone(),
            config_dir.to_path_buf(),
            meta.clone(),
        );
        let checked = tokio::task::spawn_blocking(move || {
            check_session(&m, &dir, || {
                let in_wsl =
                    |a: &Account| accounts::program(a, &all).is_some_and(|p| p.wsl().is_some());
                other_accounts(&all, &own, in_wsl)
            })
        })
        .await;
        let Ok(check) = checked else { return };
        let is_copy = meta.session_id.is_none();
        // A conversation to lose: messages sent, or entries of it read.
        let had_conversation = meta.prompts > 0 || meta.last_entry.is_some();
        let to = accounts::name_in(crate::i18n::ui(), account);
        let lost = |notice: Option<String>| {
            let _ = self.with_agent(id, |rt, fx| {
                rt.forget_session();
                fx.save = true;
                if let Some(text) = notice {
                    rt.notice("warn", text, fx);
                }
                Ok(())
            });
        };
        match check {
            SessionCheck::Fresh | SessionCheck::Found => {}
            SessionCheck::Missing => {
                log::info!("agent {id}: session {session} not found in any account's folder");
                let notice = if is_copy {
                    Some(original_lost_notice())
                } else {
                    had_conversation.then(session_lost_notice)
                };
                lost(notice);
            }
            SessionCheck::InOtherAccount { account: from, dir } => {
                log::info!("agent {id}: session {session} found in the folder of account {from}");
                let (target, sid) = (config_dir.to_path_buf(), session.clone());
                let copied = tokio::task::spawn_blocking(move || {
                    accounts::copy_session(&dir, &target, &sid)
                })
                .await
                .map_err(anyhow::Error::from)
                .and_then(|r| r);
                match copied {
                    Ok(()) => {
                        let _ = self.with_agent(id, |rt, fx| {
                            let text = tr!(
                                "La session était dans le dossier du compte « {from} » : elle a été copiée dans celui de « {to} » pour être reprise.",
                                "The session was in the folder of the “{from}” account: it was copied into the one of “{to}” to be resumed.",
                                from = from,
                                to = to
                            );
                            rt.notice("info", text, fx);
                            Ok(())
                        });
                    }
                    Err(e) => {
                        log::warn!("agent {id}: session {session} not copied from {from}: {e:#}");
                        let text = tr!(
                            "La session est dans le dossier du compte « {from} », mais elle n’a pas pu être copiée dans celui de « {to} » ({error}) : l’interface repart en nouvelle session.",
                            "The session is in the folder of the “{from}” account, but it could not be copied into the one of “{to}” ({error}): the interface starts a new session.",
                            from = from,
                            to = to,
                            error = format!("{e:#}")
                        );
                        lost(Some(text));
                    }
                }
            }
        }
    }

    /// A message for an agent in the Claude Code view: typed in its interface, as pasted text
    /// then Enter. Refused while it waits for an answer there (the text would go to its dialog).
    pub(crate) fn send_to_tui(&self, id: &str, text: &str) -> Result<()> {
        let h = self.agent(id)?;
        let term = {
            let rt = h.lock();
            if rt.meta.status == AgentStatus::Waiting {
                bail!(tr!(
                    "L’agent attend une réponse dans son terminal : réponds-y d’abord.",
                    "The agent is waiting for an answer in its terminal: answer there first."
                ));
            }
            rt.tui.as_ref().map(|t| t.term_id.clone())
        };
        let Some(term) = term else {
            bail!(tr!(
                "L’agent est en vue Claude Code : ouvre-le pour démarrer son terminal.",
                "The agent is in the Claude Code view: open it to start its terminal."
            ));
        };
        // Line breaks pasted stay in the message (Enter alone would send it).
        let pasted = format!("\x1b[200~{}\x1b[201~", text.replace('\x1b', ""));
        // The pause starts once the paste is really written, not queued: under load the terminal's
        // input thread may be behind, and the queue would then join the paste and the Enter into
        // one write, which is what the pause keeps apart.
        self.pty
            .write_and_wait(&term, pasted.as_bytes(), PASTE_WRITTEN_WITHIN)?;
        std::thread::sleep(Duration::from_millis(150));
        self.pty.write(&term, b"\r").map(|_| ())
    }

    /// Interrupts the turn of the agent's interface, as Escape does there.
    pub(crate) fn interrupt_tui(&self, id: &str) -> Result<bool> {
        let h = self.agent(id)?;
        let term = h.lock().tui.as_ref().map(|t| t.term_id.clone());
        match term {
            Some(t) => self.pty.write(&t, b"\x1b").map(|_| true),
            None => Ok(false),
        }
    }
}

/// Waits a moment for a stream's process asked to stop to be gone (its session is then free),
/// then kills it.
async fn stop_and_wait(p: &Arc<crate::claude::ClaudeProcess>) {
    for _ in 0..50 {
        if !p.is_alive() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    p.kill();
}

/// Answers the hooks on `listener` until the app quits.
async fn serve<R: Runtime>(listener: TcpListener, core: Weak<Core<R>>, port: u16) {
    let listener = match tokio::net::TcpListener::from_std(listener) {
        Ok(l) => l,
        Err(e) => {
            log::error!("hooks: cannot listen: {e}");
            return;
        }
    };
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            tokio::time::sleep(Duration::from_millis(50)).await;
            continue;
        };
        if core.strong_count() == 0 {
            return;
        }
        let core = core.clone();
        tauri::async_runtime::spawn(async move {
            let service = service_fn(move |req| {
                let core = core.clone();
                async move { Ok::<_, Infallible>(answer(req, &core, port).await) }
            });
            let _ = http1::Builder::new()
                .timer(TokioTimer::new())
                .header_read_timeout(Duration::from_secs(10))
                .serve_connection(TokioIo::new(stream), service)
                .await;
        });
    }
}

/// One hook call: from a program of this machine that holds an interface's token (a browser's
/// page gives itself away by its `Origin` or its `Host`). Always answered at once, with nothing
/// decided: the interface goes on as without the hook.
async fn answer<R: Runtime>(
    req: Request<Incoming>,
    core: &Weak<Core<R>>,
    port: u16,
) -> Response<Full<Bytes>> {
    let reply = |status: StatusCode, body: &'static str| {
        let mut r = Response::new(Full::new(Bytes::from_static(body.as_bytes())));
        *r.status_mut() = status;
        r.headers_mut().insert(
            header::CONTENT_TYPE,
            header::HeaderValue::from_static("application/json"),
        );
        r
    };
    let headers = req.headers();
    let host_ok = headers
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .is_some_and(|h| {
            [format!("127.0.0.1:{port}"), format!("localhost:{port}")]
                .iter()
                .any(|m| m.eq_ignore_ascii_case(h))
        });
    if !host_ok || headers.contains_key(header::ORIGIN) {
        return reply(StatusCode::FORBIDDEN, "{}");
    }
    if req.method() != Method::POST || req.uri().path() != PATH {
        return reply(StatusCode::NOT_FOUND, "{}");
    }
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().split_once(' '))
        .filter(|(scheme, _)| scheme.eq_ignore_ascii_case("bearer"))
        .map(|(_, t)| t.trim().to_string());
    let Some(core) = core.upgrade() else {
        return reply(StatusCode::SERVICE_UNAVAILABLE, "{}");
    };
    let Some(agent) = token.and_then(|t| core.hooks.agent_of(&t)) else {
        return reply(StatusCode::UNAUTHORIZED, "{}");
    };
    let body = match Limited::new(req.into_body(), MAX_BODY).collect().await {
        Ok(b) => b.to_bytes(),
        Err(_) => return reply(StatusCode::PAYLOAD_TOO_LARGE, "{}"),
    };
    let Ok(hook) = serde_json::from_slice::<Value>(&body) else {
        return reply(StatusCode::BAD_REQUEST, "{}");
    };
    // Off the connection: the interface does not wait for what Escouade makes of it.
    tauri::async_runtime::spawn_blocking(move || core.on_tui_hook(&agent, hook));
    reply(StatusCode::OK, "{}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta() -> AgentMeta {
        AgentMeta {
            model: "sonnet".into(),
            effort: "high".into(),
            mode: "default".into(),
            ..Default::default()
        }
    }

    #[test]
    fn a_new_agent_starts_a_session_of_its_own_and_a_known_one_is_resumed() {
        let f = Path::new("/data/tui/a1.json");
        let a = tui_args(&meta(), Some("s-new"), f);
        assert!(a.contains(&"--session-id=s-new".to_string()));
        assert!(a
            .windows(2)
            .any(|w| w == ["--settings", "/data/tui/a1.json"]));
        assert!(a.windows(2).any(|w| w == ["--permission-mode", "default"]));
        // Nothing of the stream's.
        assert!(!a.iter().any(|x| x.contains("stream-json") || x == "-p"));
        let resumed = AgentMeta {
            session_id: Some("s1".into()),
            ..meta()
        };
        let a = tui_args(&resumed, None, f);
        assert!(a.contains(&"--resume=s1".to_string()));
        assert!(!a.iter().any(|x| x.starts_with("--session-id")));
        // A copy forks its original's into its own.
        let copy = AgentMeta {
            fork_of: Some("s0".into()),
            fork_at: Some("e1".into()),
            ..meta()
        };
        let a = tui_args(&copy, Some("s2"), f);
        for x in [
            "--resume=s0",
            "--fork-session",
            "--resume-session-at=e1",
            "--session-id=s2",
        ] {
            assert!(a.contains(&x.to_string()), "{x} in {a:?}");
        }
    }

    #[test]
    fn the_hooks_call_the_server_with_the_token_of_the_environment() {
        let granted = AgentAccess::Granted {
            config: PathBuf::from("/data/mcp/a1.json"),
            token: "t".into(),
        };
        let s = tui_settings(4321, &granted);
        let h = &s["hooks"]["PermissionRequest"][0]["hooks"][0];
        assert_eq!(h["type"], "http");
        assert_eq!(h["url"], "http://127.0.0.1:4321/hook");
        assert_eq!(h["headers"]["Authorization"], "Bearer $ESCOUADE_HOOK_TOKEN");
        assert_eq!(h["allowedEnvVars"][0], TOKEN_VAR);
        for e in EVENTS {
            assert!(s["hooks"][e].is_array(), "{e}");
        }
        assert!(s.get("deniedMcpServers").is_none(), "{s}");
    }

    #[test]
    fn an_interface_refused_escouades_tools_is_kept_from_its_server_by_the_same_settings() {
        // Claude Code reads the last `--settings` only: the refusal goes into the hooks' file.
        let s = tui_settings(4321, &AgentAccess::Denied);
        assert!(s["hooks"]["PermissionRequest"].is_array(), "{s}");
        assert_eq!(
            s["deniedMcpServers"],
            json!([{ "serverName": "escouade" }]),
            "{s}"
        );
    }

    #[test]
    fn the_transcript_is_read_by_complete_lines() {
        let dir = std::env::temp_dir().join(format!("escouade-tui-read-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("s.jsonl");
        std::fs::write(&path, "{\"a\":1}\n{\"b\":2}\n{\"c\":").unwrap();
        let (lines, off) = read_lines(&path, 0).unwrap();
        assert_eq!(lines.len(), 2);
        assert_eq!(off, 16);
        // The rest of the line comes.
        std::fs::write(&path, "{\"a\":1}\n{\"b\":2}\n{\"c\":3}\n").unwrap();
        let (lines, off) = read_lines(&path, off).unwrap();
        assert_eq!(lines, vec![json!({ "c": 3 })]);
        assert_eq!(off, 24);
        // Shorter than what was read: written again, read from the start.
        std::fs::write(&path, "{\"d\":4}\n").unwrap();
        assert_eq!(read_lines(&path, off).unwrap().0, vec![json!({ "d": 4 })]);
    }

    #[test]
    fn the_transcript_of_a_session_is_found_in_its_accounts_folder() {
        let dir = std::env::temp_dir().join(format!("escouade-tui-find-{}", new_id()));
        let folder = dir.join("projects").join("-work-demo");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("s1.jsonl"), "").unwrap();
        assert_eq!(find_transcript(&dir, "s1"), Some(folder.join("s1.jsonl")));
        assert_eq!(find_transcript(&dir, "s2"), None);
    }

    #[test]
    fn the_loopback_goes_round_the_proxy() {
        let mut env = vec![("NO_PROXY".to_string(), "corp.lan".to_string())];
        no_proxy(&mut env);
        let get = |k: &str| env.iter().find(|(x, _)| x == k).map(|(_, v)| v.clone());
        assert_eq!(get("NO_PROXY").unwrap(), "corp.lan,127.0.0.1,localhost,::1");
        assert_eq!(get("no_proxy").unwrap(), "127.0.0.1,localhost,::1");
    }

    #[test]
    fn an_entry_of_the_history_is_left_out() {
        let e = json!({ "timestamp": "2026-10-12T11:15:35.144Z" });
        let at = chrono::DateTime::parse_from_rfc3339("2026-10-12T11:15:35.144Z")
            .unwrap()
            .timestamp_millis();
        assert!(before(&e, at + 1));
        assert!(!before(&e, at));
        assert!(!before(&json!({}), at));
    }

    /// An account's folder with the transcript of each session in `sessions`.
    fn folder_with(name: &str, sessions: &[&str]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("escouade-tui-{name}-{}", new_id()));
        let project = dir.join("projects").join("-work-demo");
        std::fs::create_dir_all(&project).unwrap();
        for s in sessions {
            std::fs::write(project.join(format!("{s}.jsonl")), "{}\n").unwrap();
        }
        dir
    }

    fn nobody_else() -> Vec<(String, PathBuf)> {
        panic!("the other accounts are looked at only when the session is not in the agent's own")
    }

    #[test]
    fn an_agent_with_no_session_starts_a_fresh_one_without_looking_anywhere() {
        let own = folder_with("fresh", &[]);
        assert_eq!(
            check_session(&meta(), &own, nobody_else),
            SessionCheck::Fresh
        );
    }

    #[test]
    fn a_session_whose_transcript_is_in_the_accounts_folder_is_resumed() {
        let own = folder_with("found", &["s1"]);
        let m = AgentMeta {
            session_id: Some("s1".into()),
            ..meta()
        };
        assert_eq!(check_session(&m, &own, nobody_else), SessionCheck::Found);
    }

    #[test]
    fn a_session_in_another_accounts_folder_is_told_with_that_account() {
        let own = folder_with("own", &[]);
        let nothing = folder_with("nothing", &["s0"]);
        let there = folder_with("there", &["s1"]);
        let also = folder_with("also", &["s1"]);
        let m = AgentMeta {
            session_id: Some("s1".into()),
            ..meta()
        };
        let others = || {
            vec![
                ("Rien".to_string(), nothing.clone()),
                ("Là".to_string(), there.clone()),
                ("Aussi".to_string(), also.clone()),
            ]
        };
        assert_eq!(
            check_session(&m, &own, others),
            SessionCheck::InOtherAccount {
                account: "Là".into(),
                dir: there.clone()
            }
        );
    }

    #[test]
    fn a_session_found_nowhere_is_missing() {
        let own = folder_with("own-m", &["other"]);
        let elsewhere = folder_with("else-m", &["another"]);
        let m = AgentMeta {
            session_id: Some("s1".into()),
            // The session's own comes first: the original is not asked for.
            fork_of: Some("another".into()),
            ..meta()
        };
        assert_eq!(
            check_session(&m, &own, || vec![("Autre".to_string(), elsewhere.clone())]),
            SessionCheck::Missing
        );
        // A folder that is not even there.
        let gone = std::env::temp_dir().join(format!("escouade-tui-gone-{}", new_id()));
        assert_eq!(check_session(&m, &gone, Vec::new), SessionCheck::Missing);
    }

    #[test]
    fn a_copy_is_checked_by_its_originals_transcript() {
        let own = folder_with("copy-own", &["s0"]);
        let there = folder_with("copy-there", &["s9"]);
        let copy = |original: &str| AgentMeta {
            session_id: None,
            fork_of: Some(original.into()),
            fork_at: Some("e1".into()),
            ..meta()
        };
        assert_eq!(
            check_session(&copy("s0"), &own, nobody_else),
            SessionCheck::Found
        );
        assert_eq!(
            check_session(&copy("s9"), &own, || vec![(
                "Là".to_string(),
                there.clone()
            )]),
            SessionCheck::InOtherAccount {
                account: "Là".into(),
                dir: there.clone()
            }
        );
        assert_eq!(
            check_session(&copy("s7"), &own, || vec![(
                "Là".to_string(),
                there.clone()
            )]),
            SessionCheck::Missing
        );
    }

    #[test]
    fn a_session_given_up_is_replaced_by_a_new_one_in_the_arguments() {
        let f = Path::new("/data/tui/a1.json");
        for lost in [
            AgentMeta {
                session_id: Some("s1".into()),
                last_entry: Some("e9".into()),
                ..meta()
            },
            // A copy whose original's session is gone.
            AgentMeta {
                fork_of: Some("s0".into()),
                fork_at: Some("e1".into()),
                ..meta()
            },
        ] {
            let dir = std::env::temp_dir().join(format!("escouade-tui-forget-{}", new_id()));
            let mut rt = crate::agent::AgentRt::new(lost, &dir);
            rt.forget_session();
            let a = tui_args(&rt.meta, Some("s-new"), f);
            assert!(a.contains(&"--session-id=s-new".to_string()), "{a:?}");
            assert!(
                !a.iter()
                    .any(|x| x.starts_with("--resume") || x == "--fork-session"),
                "{a:?}"
            );
            assert_eq!(
                (
                    &rt.meta.session_id,
                    &rt.meta.last_entry,
                    &rt.meta.fork_of,
                    &rt.meta.fork_at
                ),
                (&None, &None, &None, &None)
            );
        }
    }

    #[test]
    fn an_exit_is_quick_when_it_comes_soon_and_is_no_wish_of_the_user() {
        let said = b"\x1b[31mNo conversation found with session ID: s1\x1b[0m\r\n";
        let secs = Duration::from_secs;
        // /exit (code 0) at once: the user's wish, nothing to hold against the interface.
        let ok = classify_exit(secs(3), Some(0), said);
        assert_eq!(
            ok,
            TuiExit {
                code: Some(0),
                quick: false,
                session_lost: false
            }
        );
        // Stopped at once with an error, and nothing about a session.
        let crashed = classify_exit(secs(3), Some(1), b"boom");
        assert_eq!(
            crashed,
            TuiExit {
                code: Some(1),
                quick: true,
                session_lost: false
            }
        );
        // Killed (no code) at once: quick too.
        assert!(classify_exit(secs(3), None, b"").quick);
        // The same after a long while: it lived, whatever it said.
        let late = classify_exit(secs(30), Some(1), said);
        assert_eq!((late.quick, late.session_lost), (false, false));
        // The session refused, at once.
        let lost = classify_exit(secs(3), Some(1), said);
        assert_eq!((lost.quick, lost.session_lost), (true, true));
        // The limit itself: QUICK_EXIT is the first moment that is no longer quick.
        assert!(classify_exit(QUICK_EXIT - Duration::from_millis(1), Some(1), b"").quick);
        assert!(!classify_exit(QUICK_EXIT, Some(1), b"").quick);
    }

    #[test]
    fn the_first_bytes_of_the_output_are_kept_up_to_a_cap() {
        let mut kept = Vec::new();
        keep_output(&mut kept, b"hello ");
        keep_output(&mut kept, &vec![b'x'; OUTPUT_KEPT]);
        assert_eq!(kept.len(), OUTPUT_KEPT);
        assert!(kept.starts_with(b"hello xxx"));
        keep_output(&mut kept, b"more");
        assert_eq!(kept.len(), OUTPUT_KEPT);
    }

    #[test]
    fn an_automatic_start_is_refused_after_two_quick_exits_in_a_row_a_manual_one_never() {
        assert!(!starts_too_fast(false, 0));
        assert!(!starts_too_fast(false, 1));
        assert!(starts_too_fast(false, 2));
        assert!(starts_too_fast(false, 7));
        assert!(!starts_too_fast(true, 7));
    }

    #[test]
    fn a_session_is_looked_for_in_the_accounts_of_the_same_side_only() {
        let (own_dir, a_dir, b_dir) = (
            folder_with("o-own", &[]),
            folder_with("o-a", &[]),
            folder_with("o-b", &[]),
        );
        let account = |id: &str, name: &str, dir: &Path| crate::model::Account {
            id: id.into(),
            name: name.into(),
            config_dir: dir.to_string_lossy().into(),
            ..Default::default()
        };
        let own = account("own", "Propre", &own_dir);
        let settings = Settings {
            accounts: vec![
                accounts::principal(),
                own.clone(),
                account("a", "A", &a_dir),
                account("b", "B (WSL)", &b_dir),
                // The same folder as the agent's own: nothing to copy from it.
                account("twin", "Jumeau", &own_dir),
            ],
            claude_path: crate::core_tests::fake_cli(),
            ..Default::default()
        };
        let others = other_accounts(&settings, &own, |a| a.id == "b" || a.id == "x");
        let names: Vec<&str> = others.iter().map(|(n, _)| n.as_str()).collect();
        // Principal (Windows side) and A; not B (WSL while the agent's account is not), nor itself.
        assert_eq!(names.len(), 2, "{names:?}");
        assert!(names.contains(&"A"), "{names:?}");
        assert!(others.iter().any(|(n, d)| n == "A" && *d == a_dir));
        // The agent's account in WSL: only the accounts there are candidates.
        let in_wsl = other_accounts(&settings, &own, |a| a.id == "own" || a.id == "b");
        let names: Vec<&str> = in_wsl.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["B (WSL)"], "{names:?}");
    }
}
