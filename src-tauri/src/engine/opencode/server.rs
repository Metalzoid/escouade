//! An `opencode serve` (OpenCode 1.19, HTTP + SSE, docs/PROTOCOL.md, « OpenCode serve »), shared by
//! the agents of an account: started with the first, stopped with the last (docs/TODO-1.8.md,
//! point 0, « OpenCode »: 0,7 Go a server, and one serves every worktree by `?directory=`).
//!
//! It listens on 127.0.0.1, on the port it picks (`--port 0`: 4096 when it is free, so its address
//! is read on its output), behind a password drawn at random (`OPENCODE_SERVER_PASSWORD`, Basic
//! `opencode:<password>`) that never leaves Escouade. Its events are read on `/global/event` (all
//! its folders) and handed to the session they are about: each agent is a session of its own, and
//! the sessions its subagents open (`parentID`) go to the agent whose session opened them.

use crate::engine::Program;
use crate::i18n::{self, Lang};
use crate::job::Job;
use crate::text::truncate;
use anyhow::{anyhow, bail, Context, Result};
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Weak};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, watch};

/// How long a server may take to say where it listens (2,1 to 2,6 s on 1.19.3, tried).
const START_LIMIT: Duration = Duration::from_secs(60);
/// How long a request may take.
pub(super) const REQUEST_LIMIT: Duration = Duration::from_secs(60);

/// What hears the events of a session (and of its subagents'), and the end of its server.
pub(super) trait Listener: Send + Sync {
    fn event(&self, frame: Value);
    fn gone(&self, code: Option<i32>, said: String);
}

pub(super) struct Server {
    key: String,
    password: String,
    http: reqwest::Client,
    /// Its address once it listens, or why it never will.
    base: watch::Receiver<Option<Result<String, String>>>,
    /// Its event stream is read.
    connected: watch::Receiver<bool>,
    job: Option<Arc<Job>>,
    kill_tx: Mutex<Option<oneshot::Sender<()>>>,
    exited: Arc<AtomicBool>,
    /// Who hears each agent's session, by its id.
    listeners: Mutex<HashMap<String, Arc<dyn Listener>>>,
    /// The agent's session each session of a subagent belongs to.
    owners: Mutex<HashMap<String, String>>,
    /// How many agents work in each folder (OpenCode keeps an instance of each, which watches it).
    dirs: Mutex<HashMap<String, usize>>,
    /// The models of its connected providers, once read (`GET /config/providers`).
    pub(super) catalog: tokio::sync::Mutex<Option<Value>>,
}

/// The servers running, by what they were started with (`key`), with how many agents use each.
type Running = HashMap<String, (Arc<Server>, usize)>;
static SERVERS: Mutex<Option<Running>> = Mutex::new(None);

/// The server of `key`, started by `start` when none runs; one more agent uses it.
pub(super) fn acquire(
    key: &str,
    start: impl FnOnce() -> Result<Arc<Server>>,
) -> Result<Arc<Server>> {
    let mut all = SERVERS.lock();
    let map = all.get_or_insert_with(HashMap::new);
    if let Some((server, users)) = map.get_mut(key) {
        if !server.exited.load(Ordering::Acquire) {
            *users += 1;
            return Ok(server.clone());
        }
    }
    let server = start()?;
    map.insert(key.to_string(), (server.clone(), 1));
    Ok(server)
}

/// One agent less uses `server`: stopped once none does.
pub(super) fn release(server: &Arc<Server>) {
    let last = {
        let mut all = SERVERS.lock();
        let Some(map) = all.as_mut() else { return };
        match map.get_mut(&server.key) {
            Some((s, users)) if Arc::ptr_eq(s, server) => {
                *users = users.saturating_sub(1);
                if *users == 0 {
                    map.remove(&server.key);
                    true
                } else {
                    false
                }
            }
            _ => false,
        }
    };
    if last {
        log::info!("opencode: the last agent of its server stopped, the server too");
        server.kill();
    }
}

/// How many servers run (the tests).
#[cfg(test)]
pub(super) fn running() -> usize {
    SERVERS.lock().as_ref().map_or(0, |m| {
        m.values()
            .filter(|(s, _)| !s.exited.load(Ordering::Acquire))
            .count()
    })
}

impl Server {
    /// Starts `opencode serve` (`program`) with `env`, in `cwd`.
    pub(super) fn start(
        key: &str,
        program: &Program,
        cwd: &str,
        env: Vec<(String, String)>,
    ) -> Result<Arc<Server>> {
        let password = new_password();
        let args: Vec<String> = ["serve", "--hostname", "127.0.0.1", "--port", "0"]
            .map(String::from)
            .to_vec();
        let mut env = env;
        env.push(("OPENCODE_SERVER_PASSWORD".into(), password.clone()));
        let launch = program.launch(cwd, &args, &env)?;
        let mut cmd = Command::new(&launch.program);
        cmd.args(&launch.args)
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        for (k, v) in &launch.env {
            cmd.env(k, v);
        }
        #[cfg(windows)]
        cmd.creation_flags(crate::proc::CREATE_NO_WINDOW);
        crate::job::isolate(&mut cmd);
        crate::proc::no_inherited_fds(&mut cmd);
        let mut child = cmd
            .spawn()
            .with_context(|| cannot_start(i18n::ui(), &program.describe()))?;
        let job = Job::for_child(&child).map(Arc::new);
        if job.is_none() {
            log::warn!(
                "opencode (pid {:?}) is not in a job: its tree is not killed as a whole",
                child.id()
            );
        }
        let stdout = child.stdout.take().context("stdout")?;
        let stderr = child.stderr.take().context("stderr")?;
        let (base_tx, base) = watch::channel(None);
        let (connected_tx, connected) = watch::channel(false);
        let (kill_tx, mut kill_rx) = oneshot::channel::<()>();
        let exited = Arc::new(AtomicBool::new(false));
        let http = reqwest::Client::builder()
            .no_proxy()
            .build()
            .context("http client")?;
        let server = Arc::new(Server {
            key: key.to_string(),
            password,
            http,
            base,
            connected,
            job: job.clone(),
            kill_tx: Mutex::new(Some(kill_tx)),
            exited: exited.clone(),
            listeners: Mutex::default(),
            owners: Mutex::default(),
            dirs: Mutex::default(),
            catalog: tokio::sync::Mutex::new(None),
        });
        let tail = Arc::new(Mutex::new(VecDeque::<String>::new()));
        {
            let tail = tail.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).split(b'\n');
                while let Ok(Some(line)) = lines.next_segment().await {
                    let line = text_line(&line);
                    log::debug!("opencode stderr: {line}");
                    note(&tail, line);
                }
            });
        }
        let weak = Arc::downgrade(&server);
        let out_tail = tail.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).split(b'\n');
            let mut base_tx = Some(base_tx);
            let mut connected_tx = Some(connected_tx);
            loop {
                tokio::select! {
                    line = lines.next_segment() => match line {
                        Ok(Some(line)) => {
                            let line = text_line(&line);
                            log::debug!("opencode: {line}");
                            if let Some(url) = listening(&line) {
                                if let Some(tx) = base_tx.take() {
                                    let _ = tx.send(Some(Ok(url.clone())));
                                }
                                if let (Some(s), Some(c)) = (weak.upgrade(), connected_tx.take()) {
                                    tokio::spawn(read_events(Arc::downgrade(&s), url, c));
                                }
                            } else {
                                note(&out_tail, line);
                            }
                        }
                        _ => break,
                    },
                    _ = &mut kill_rx => {
                        let _ = child.start_kill();
                        break;
                    }
                }
            }
            let code = child.wait().await.ok().and_then(|s| s.code());
            exited.store(true, Ordering::Release);
            let said = tail.lock().iter().cloned().collect::<Vec<_>>().join("\n");
            if let Some(tx) = base_tx.take() {
                let _ = tx.send(Some(Err(said.clone())));
            }
            log::info!("opencode server exited ({code:?})");
            if let Some(s) = weak.upgrade() {
                // Not to be given to a new agent any more.
                {
                    let mut all = SERVERS.lock();
                    if let Some(map) = all.as_mut() {
                        if map.get(&s.key).is_some_and(|(x, _)| Arc::ptr_eq(x, &s)) {
                            map.remove(&s.key);
                        }
                    }
                }
                let listeners: Vec<_> = s.listeners.lock().drain().map(|(_, l)| l).collect();
                for l in listeners {
                    l.gone(code, said.clone());
                }
            }
            drop(job);
        });
        Ok(server)
    }

    pub(super) fn is_alive(&self) -> bool {
        !self.exited.load(Ordering::Acquire)
    }

    pub(super) fn pids(&self) -> Vec<u32> {
        self.job.as_ref().map(|j| j.pids()).unwrap_or_default()
    }

    fn kill(&self) {
        if let Some(job) = &self.job {
            job.terminate();
        }
        if let Some(k) = self.kill_tx.lock().take() {
            let _ = k.send(());
        }
    }

    /// Waits until it listens and its events are read.
    pub(super) async fn ready(&self) -> Result<()> {
        let mut base = self.base.clone();
        let wait = async {
            loop {
                if let Some(r) = base.borrow().clone() {
                    break r;
                }
                if base.changed().await.is_err() {
                    break Err(String::new());
                }
            }
        };
        match tokio::time::timeout(START_LIMIT, wait).await {
            Ok(Ok(_)) => {}
            Ok(Err(said)) => bail!(
                "{}{}",
                tr!(
                    "OpenCode s’est arrêté avant d’être prêt",
                    "OpenCode stopped before it was ready"
                ),
                if said.trim().is_empty() {
                    String::new()
                } else {
                    format!(" : {}", truncate(said.trim(), 2000))
                }
            ),
            Err(_) => bail!(tr!(
                "OpenCode ne s’est pas mis à l’écoute à temps",
                "OpenCode didn’t start listening in time"
            )),
        }
        let mut connected = self.connected.clone();
        let wait = async {
            while !*connected.borrow() {
                if connected.changed().await.is_err() {
                    return false;
                }
            }
            true
        };
        match tokio::time::timeout(START_LIMIT, wait).await {
            Ok(true) => Ok(()),
            _ => bail!(tr!(
                "Le flux d’événements d’OpenCode ne répond pas",
                "OpenCode’s event stream doesn’t answer"
            )),
        }
    }

    fn base(&self) -> Result<String> {
        match self.base.borrow().clone() {
            Some(Ok(url)) => Ok(url),
            _ => Err(anyhow!("OpenCode is not listening")),
        }
    }

    /// A request to the server, in the folder `dir`; its answer (null for none).
    pub(super) async fn call(
        &self,
        method: reqwest::Method,
        path: &str,
        dir: &str,
        body: Option<Value>,
    ) -> Result<Value> {
        let url = format!("{}{path}", self.base()?);
        let mut req = self
            .http
            .request(method.clone(), &url)
            .basic_auth("opencode", Some(&self.password))
            .timeout(REQUEST_LIMIT);
        if !dir.is_empty() {
            req = req.query(&[("directory", dir)]);
        }
        if let Some(b) = body {
            req = req.json(&b);
        }
        let res = req
            .send()
            .await
            .with_context(|| format!("{method} {path}"))?;
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if !status.is_success() {
            let said = serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| {
                    v["data"]["message"]
                        .as_str()
                        .or(v["message"].as_str())
                        .or(v["error"].as_str())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| truncate(text.trim(), 300));
            return Err(
                Status(status.as_u16(), format!("{method} {path}: {status} {said}")).into(),
            );
        }
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
    }

    /// The events of the session `session` (and of its subagents') go to `listener` from now on.
    pub(super) fn listen(&self, session: &str, listener: Arc<dyn Listener>) {
        self.listeners.lock().insert(session.to_string(), listener);
    }

    pub(super) fn forget(&self, session: &str) {
        self.listeners.lock().remove(session);
        self.owners.lock().retain(|_, root| root != session);
    }

    /// One more agent works in `dir`.
    pub(super) fn enter(&self, dir: &str) {
        *self.dirs.lock().entry(dir.to_string()).or_default() += 1;
    }

    /// One agent less works in `dir`: whether it was the last.
    pub(super) fn leave(&self, dir: &str) -> bool {
        let mut dirs = self.dirs.lock();
        let Some(n) = dirs.get_mut(dir) else {
            return false;
        };
        *n = n.saturating_sub(1);
        if *n == 0 {
            dirs.remove(dir);
            return true;
        }
        false
    }

    /// One event of `/global/event` (`{directory, payload}`), to the session it is about.
    fn dispatch(&self, event: Value) {
        let mut frame = if event["payload"].is_object() {
            event["payload"].clone()
        } else {
            event.clone()
        };
        if let Some(dir) = event.get("directory").filter(|d| d.is_string()) {
            frame["directory"] = dir.clone();
        }
        let props = &frame["properties"];
        let Some(session) = props["sessionID"]
            .as_str()
            .or(props["info"]["sessionID"].as_str())
            .or(props["part"]["sessionID"].as_str())
            .map(str::to_string)
        else {
            return;
        };
        let root = {
            let mut owners = self.owners.lock();
            if frame["type"] == "session.created" {
                if let Some(parent) = props["info"]["parentID"].as_str() {
                    let root = owners
                        .get(parent)
                        .cloned()
                        .unwrap_or_else(|| parent.to_string());
                    owners.insert(session.clone(), root);
                }
            }
            owners.get(&session).cloned().unwrap_or(session)
        };
        let listener = self.listeners.lock().get(&root).cloned();
        if let Some(l) = listener {
            l.event(frame);
        }
    }
}

/// A request the server answered with an error status.
#[derive(Debug)]
pub(super) struct Status(pub u16, pub String);

impl std::fmt::Display for Status {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.1)
    }
}

impl std::error::Error for Status {}

/// Whether `e` is the server's 404.
pub(super) fn not_found(e: &anyhow::Error) -> bool {
    e.downcast_ref::<Status>().is_some_and(|s| s.0 == 404)
}

/// Reads `/global/event` while the server runs, again when it drops.
async fn read_events(server: Weak<Server>, base: String, connected: watch::Sender<bool>) {
    loop {
        let Some(s) = server.upgrade().filter(|s| s.is_alive()) else {
            return;
        };
        let req = s
            .http
            .get(format!("{base}/global/event"))
            .basic_auth("opencode", Some(&s.password))
            .header("Accept", "text/event-stream");
        drop(s);
        match req.send().await {
            Ok(mut res) if res.status().is_success() => {
                let _ = connected.send(true);
                let mut buf: Vec<u8> = Vec::new();
                while let Ok(Some(chunk)) = res.chunk().await {
                    buf.extend_from_slice(&chunk);
                    while let Some(end) = block_end(&buf) {
                        let block: Vec<u8> = buf.drain(..end.0).collect();
                        buf.drain(..end.1);
                        if let (Some(v), Some(s)) = (sse_data(&block), server.upgrade()) {
                            s.dispatch(v);
                        }
                    }
                }
            }
            Ok(res) => log::warn!("opencode: /global/event: {}", res.status()),
            Err(e) => log::debug!("opencode: /global/event: {e}"),
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

/// Where the first event of `buf` ends: its length, and the length of the blank line after it.
fn block_end(buf: &[u8]) -> Option<(usize, usize)> {
    let lf = buf.windows(2).position(|w| w == b"\n\n").map(|i| (i, 2));
    let crlf = buf
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|i| (i, 4));
    match (lf, crlf) {
        (Some(a), Some(b)) => Some(if a.0 < b.0 { a } else { b }),
        (a, b) => a.or(b),
    }
}

/// The JSON of an event of the stream (its `data:` lines).
fn sse_data(block: &[u8]) -> Option<Value> {
    let text = String::from_utf8_lossy(block);
    let data: Vec<&str> = text
        .lines()
        .filter_map(|l| l.strip_prefix("data:"))
        .map(|l| l.strip_prefix(' ').unwrap_or(l))
        .collect();
    if data.is_empty() {
        return None;
    }
    serde_json::from_str(&data.join("\n")).ok()
}

/// The address of `opencode server listening on http://127.0.0.1:4096`.
fn listening(line: &str) -> Option<String> {
    let at = line.find("listening on ")?;
    let url = line[at + "listening on ".len()..].trim();
    url.starts_with("http")
        .then(|| url.trim_end_matches('/').to_string())
}

/// 24 bytes from the system's random generator, in hex.
fn new_password() -> String {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).expect("the system's random generator");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// A line a process wrote, as text: invalid UTF-8 replaced, without its `\r`.
fn text_line(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .trim_end_matches('\r')
        .replace('\0', "")
}

/// Keeps `line` among the last 30 of `tail`.
fn note(tail: &Mutex<VecDeque<String>>, line: String) {
    let mut t = tail.lock();
    t.push_back(line);
    if t.len() > 30 {
        t.pop_front();
    }
}

fn cannot_start(lang: Lang, program: &str) -> String {
    tr_in!(
        lang,
        "impossible de lancer {program}",
        "can’t start {program}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_address_is_read_on_its_output_and_its_events_in_their_blocks() {
        assert_eq!(
            listening("opencode server listening on http://127.0.0.1:4096").as_deref(),
            Some("http://127.0.0.1:4096")
        );
        assert_eq!(
            listening("Warning: OPENCODE_SERVER_PASSWORD is not set"),
            None
        );
        let buf = b"data: {\"a\":1}\n\nevent: x\r\ndata: {\"b\":\r\ndata: 2}\r\n\r\nrest";
        let (end, gap) = block_end(buf).unwrap();
        assert_eq!(sse_data(&buf[..end]), Some(json!({ "a": 1 })));
        let rest = &buf[end + gap..];
        let (end, _) = block_end(rest).unwrap();
        assert_eq!(sse_data(&rest[..end]), Some(json!({ "b": 2 })));
        assert_eq!(new_password().len(), 48);
    }
}
