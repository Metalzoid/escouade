//! A `copilot --server --stdio` process driven over the protocol of its SDK (JSON-RPC 2.0 framed by
//! `Content-Length` headers, protocol 3, docs/PROTOCOL.md, « Copilot SDK »).
//!
//! The process answers its own requests (`connect`, `session.create`…) and passes the events of its
//! session (`session.event`, its subagents' included: they share its session, told apart by their
//! `agentId`) to `on_frame`, with a few of its own (`escouade.*`): the session it opened, the tasks
//! read once they changed, a message refused, the account it runs on. It keeps what a card's answer
//! needs: the requests of the session that wait (permissions, questions, forms, the end of a plan)
//! and the requests Copilot makes of the client for the same question or plan (`userInput.request`,
//! `exitPlanMode.request`): each is answered both ways, the first answer wins.
//!
//! Never a token in the log: `account.getAllUsers` and `account.getCurrentAuth` give it in clear,
//! and Escouade calls neither; what it logs of a frame is its method alone.

use super::{agent_mode, catalog, permission_mode, takes_effort, Settings};
use crate::engine::{
    BoxFuture, EngineProcess, Message, OnExit, OnFrame, PermissionAnswer, Program, Ready, Remote,
    Start,
};
use crate::i18n::{self, Lang};
use crate::job::{Job, JobUsage};
use anyhow::{anyhow, bail, Context, Result};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot};

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;

/// How long a request of the process to Copilot may take.
const REQUEST_LIMIT: Duration = Duration::from_secs(60);

/// The version of the protocol Escouade speaks (`connect`).
pub(super) const PROTOCOL: u64 = 3;

/// A request of the session waiting for its answer (its event, by its `requestId`).
#[derive(Debug, Clone)]
pub(super) struct Asked {
    /// `permission`, `user_input`, `elicitation`, `exit_plan_mode` or `session_limits_exhausted`.
    pub kind: String,
    pub data: Value,
}

/// What the process knows of its conversation.
#[derive(Default)]
pub(super) struct State {
    /// Its session (the agent's), once opened.
    pub session: Option<String>,
    /// A message sent, its turn not over (`session.idle` not come): the next one goes in at once.
    pub busy: bool,
    /// The model, effort and mode in force.
    pub settings: Settings,
    /// The requests of the session that wait, by their `requestId`.
    pub asked: HashMap<String, Asked>,
    /// The requests Copilot made of the client for a question or a plan (`userInput.request`,
    /// `exitPlanMode.request`), not answered yet: their id, method and parameters.
    pub requests: Vec<(Value, String, Value)>,
    /// Tasks being read (`session.todos_changed`): another change meanwhile reads them again.
    pub reading_todos: bool,
    pub todos_again: bool,
}

pub struct CopilotProcess {
    tx: Mutex<Option<mpsc::UnboundedSender<Vec<u8>>>>,
    pending: Pending,
    next_id: AtomicU64,
    kill_tx: Mutex<Option<oneshot::Sender<()>>>,
    exited: Arc<AtomicBool>,
    job: Option<Arc<Job>>,
    state: Arc<Mutex<State>>,
    start: Start,
    cwd: String,
    instructions: Option<String>,
    escouade: bool,
    /// Its account has a folder of its own (`COPILOT_HOME`): not its Principal.
    own_home: bool,
    /// The last lines of its standard error: what its exit tells in the conversation.
    tail: Arc<Mutex<VecDeque<String>>>,
    on_frame: Arc<OnFrame>,
}

/// How its server is started, and its conversation.
pub(super) struct Opts {
    pub program: Program,
    pub cwd: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub start: Start,
    pub settings: Settings,
    /// The instructions added to its session (`systemMessage`, given again at each resume: Copilot
    /// forgets them otherwise, tried).
    pub instructions: Option<String>,
    /// Escouade's server is given to it (`--additional-mcp-config`): its entry stays on.
    pub escouade: bool,
}

/// The variables a token of GitHub reaches Copilot in, taken before its own sign-in.
pub(super) const INHERITED_TOKENS: [&str; 3] = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];

/// Whether the variables of a process give it a folder of its own (an account other than its
/// Principal).
pub(super) fn own_home(env: &[(String, String)]) -> bool {
    env.iter()
        .any(|(k, v)| k == "COPILOT_HOME" && !v.is_empty())
}

/// Whether `auth.getStatus` says Copilot is signed in as the account: an account of its own
/// never on the GitHub CLI's (`gh-cli`), which Copilot takes by itself without a sign-in of its
/// own and is the same for every account.
pub(super) fn signed_in(auth: &Value, own_home: bool) -> bool {
    auth["isAuthenticated"] == true && !(own_home && auth["authType"] == "gh-cli")
}

/// The quota of an account none of whose agents runs, by a server of its own started then stopped
/// (`program` with `args` and `env`): `account.getQuota`'s snapshots, None when the account is not
/// signed in. No session is opened, no model asked.
pub(super) async fn read_quota(
    program: Program,
    args: Vec<String>,
    env: Vec<(String, String)>,
    cwd: String,
) -> Result<Option<Value>> {
    let opts = Opts {
        program,
        cwd,
        args,
        env,
        start: Start::New,
        settings: Settings::default(),
        instructions: None,
        escouade: false,
    };
    let p = CopilotProcess::spawn(opts, Box::new(|_| {}), Box::new(|_, _| {}))?;
    let read = async {
        p.request(
            "connect",
            json!({ "supportedTaskKinds": ["agent", "client", "shell"] }),
            REQUEST_LIMIT,
        )
        .await?;
        let auth = p
            .request("auth.getStatus", json!({}), REQUEST_LIMIT)
            .await?;
        if !signed_in(&auth, p.own_home) {
            return Ok(None);
        }
        let quota = p
            .request("account.getQuota", json!({}), REQUEST_LIMIT)
            .await?;
        Ok(Some(quota["quotaSnapshots"].clone()))
    };
    let read = read.await;
    p.kill();
    p.wait_gone(Duration::from_secs(5)).await;
    read
}

/// One message of a stream framed by `Content-Length` headers, read from `r`: None once it ends.
pub(super) async fn read_frame<R: tokio::io::AsyncBufRead + Unpin>(
    r: &mut R,
) -> std::io::Result<Option<Vec<u8>>> {
    let mut len: Option<usize> = None;
    loop {
        let mut line = String::new();
        if r.read_line(&mut line).await? == 0 {
            return Ok(None);
        }
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            if let Some(n) = len {
                let mut body = vec![0; n];
                r.read_exact(&mut body).await?;
                return Ok(Some(body));
            }
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                len = v.trim().parse().ok();
            }
        }
    }
}

/// `msg` framed for Copilot.
pub(super) fn frame(msg: &Value) -> Vec<u8> {
    let body = msg.to_string();
    let mut out = format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes();
    out.extend_from_slice(body.as_bytes());
    out
}

impl CopilotProcess {
    pub(super) fn spawn(opts: Opts, on_frame: OnFrame, on_exit: OnExit) -> Result<Arc<Self>> {
        let Opts {
            program,
            cwd,
            args,
            env,
            start,
            settings,
            instructions,
            escouade,
        } = opts;
        let own_home = own_home(&env);
        let launch = program.launch(&cwd, &args, &env)?;
        let mut cmd = Command::new(&launch.program);
        cmd.args(&launch.args)
            .current_dir(&cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        // An account of its own signs in by itself (`copilot login`): a token of the app's
        // environment would make it another one, the same for every account.
        if own_home {
            for var in INHERITED_TOKENS {
                cmd.env_remove(var);
            }
        }
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
                "copilot (pid {:?}) is not in a job: its tree is not killed as a whole",
                child.id()
            );
        }
        let mut stdin = child.stdin.take().context("stdin")?;
        let stdout = child.stdout.take().context("stdout")?;
        let stderr = child.stderr.take().context("stderr")?;

        let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
        tokio::spawn(async move {
            while let Some(bytes) = rx.recv().await {
                if stdin.write_all(&bytes).await.is_err() || stdin.flush().await.is_err() {
                    break;
                }
            }
        });

        let tail = Arc::new(Mutex::new(VecDeque::<String>::new()));
        {
            let tail = tail.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).split(b'\n');
                while let Ok(Some(line)) = lines.next_segment().await {
                    let line = String::from_utf8_lossy(&line)
                        .trim_end_matches('\r')
                        .to_string();
                    log::debug!("copilot stderr: {line}");
                    note(&tail, line);
                }
            });
        }

        let pending: Pending = Arc::default();
        let state: Arc<Mutex<State>> = Arc::new(Mutex::new(State {
            settings,
            ..Default::default()
        }));
        let on_frame = Arc::new(on_frame);
        let (kill_tx, mut kill_rx) = oneshot::channel::<()>();
        let exited = Arc::new(AtomicBool::new(false));
        let proc = Arc::new(Self {
            tx: Mutex::new(Some(tx)),
            pending: pending.clone(),
            next_id: AtomicU64::new(1),
            kill_tx: Mutex::new(Some(kill_tx)),
            exited: exited.clone(),
            job: job.clone(),
            state: state.clone(),
            start,
            cwd,
            instructions,
            escouade,
            own_home,
            tail: tail.clone(),
            on_frame: on_frame.clone(),
        });
        let weak = Arc::downgrade(&proc);
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            loop {
                tokio::select! {
                    body = read_frame(&mut reader) => match body {
                        Ok(Some(body)) => match serde_json::from_slice::<Value>(&body) {
                            Ok(msg) => {
                                if let Some(p) = weak.upgrade() {
                                    p.read(msg);
                                } else {
                                    break;
                                }
                            }
                            Err(e) => log::warn!("unparsable copilot message ({e}), {} bytes", body.len()),
                        },
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
            on_exit(code, said);
            for (_, tx) in pending.lock().drain() {
                let _ = tx.send(Err("process exited".into()));
            }
            drop(job);
        });
        Ok(proc)
    }

    fn write(&self, msg: &Value) -> Result<()> {
        if !self.is_alive() {
            bail!("process exited");
        }
        let guard = self.tx.lock();
        let tx = guard
            .as_ref()
            .ok_or_else(|| anyhow!("process input closed"))?;
        tx.send(frame(msg))
            .map_err(|_| anyhow!("process input closed"))
    }

    fn id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Refused to start for `reason`: the process stops, its exit telling `reason` in the
    /// conversation (as its standard error's last line).
    async fn refuse(&self, reason: String) -> anyhow::Error {
        note(&self.tail, reason.clone());
        self.kill();
        self.wait_exit(Duration::from_secs(5)).await;
        anyhow!(reason)
    }

    /// A request to Copilot, its result.
    pub async fn request(&self, method: &str, params: Value, timeout: Duration) -> Result<Value> {
        let id = self.id();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().insert(id, tx);
        if let Err(e) =
            self.write(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
        {
            self.pending.lock().remove(&id);
            return Err(e);
        }
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(Ok(v))) => Ok(v),
            Ok(Ok(Err(e))) => Err(anyhow!("{method}: {e}")),
            Ok(Err(_)) => Err(anyhow!("{method}: dropped")),
            Err(_) => {
                self.pending.lock().remove(&id);
                Err(anyhow!("{method}: no answer in time"))
            }
        }
    }

    /// A request whose answer is read later, on a task of its own: what it says goes to `then`.
    fn fire(
        self: &Arc<Self>,
        method: &'static str,
        params: Value,
        then: impl FnOnce(&Arc<Self>, Result<Value>) + Send + 'static,
    ) -> Result<()> {
        let id = self.id();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().insert(id, tx);
        if let Err(e) =
            self.write(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
        {
            self.pending.lock().remove(&id);
            return Err(e);
        }
        let me = self.clone();
        tokio::spawn(async move {
            let got = match tokio::time::timeout(REQUEST_LIMIT, rx).await {
                Ok(Ok(Ok(v))) => Ok(v),
                Ok(Ok(Err(e))) => Err(anyhow!("{method}: {e}")),
                _ => Err(anyhow!("{method}: no answer")),
            };
            then(&me, got);
        });
        Ok(())
    }

    fn session(&self) -> Result<String> {
        self.state
            .lock()
            .session
            .clone()
            .ok_or_else(|| anyhow!("Copilot has no session yet"))
    }

    /// One message of Copilot: an answer to a request of the process, a request of Copilot, or an
    /// event of a session.
    fn read(self: &Arc<Self>, msg: Value) {
        let method = msg["method"].as_str().map(str::to_string);
        let Some(method) = method else {
            let Some(id) = msg["id"].as_u64() else {
                return;
            };
            let error = msg.get("error").filter(|e| !e.is_null());
            if let Some(tx) = self.pending.lock().remove(&id) {
                let _ = tx.send(match error {
                    Some(e) => Err(e["message"].as_str().unwrap_or("error").to_string()),
                    None => Ok(msg["result"].clone()),
                });
            }
            return;
        };
        if !msg["id"].is_null() {
            // A request of Copilot to the client.
            match method.as_str() {
                "userInput.request" | "exitPlanMode.request" => {
                    let p = msg["params"].clone();
                    self.state
                        .lock()
                        .requests
                        .push((msg["id"].clone(), method, p));
                }
                other => {
                    log::debug!("copilot asks {other}: refused");
                    let _ = self.write(&json!({
                        "jsonrpc": "2.0", "id": msg["id"],
                        "error": { "code": -32601, "message": format!("unsupported: {other}") },
                    }));
                }
            }
            return;
        }
        if method != "session.event" {
            return;
        }
        let p = &msg["params"];
        let own = {
            let s = self.state.lock();
            s.session.is_some() && p["sessionId"].as_str() == s.session.as_deref()
        };
        if !own {
            return;
        }
        let event = &p["event"];
        let data = &event["data"];
        match event["type"].as_str().unwrap_or_default() {
            "session.idle" if event["agentId"].is_null() => {
                self.state.lock().busy = false;
            }
            kind @ ("permission.requested"
            | "user_input.requested"
            | "elicitation.requested"
            | "exit_plan_mode.requested"
            | "session_limits_exhausted.requested") => {
                if let Some(rid) = data["requestId"].as_str() {
                    let kind = kind.trim_end_matches(".requested").to_string();
                    self.state.lock().asked.insert(
                        rid.to_string(),
                        Asked {
                            kind,
                            data: data.clone(),
                        },
                    );
                }
            }
            "permission.completed"
            | "user_input.completed"
            | "elicitation.completed"
            | "exit_plan_mode.completed"
            | "session_limits_exhausted.completed" => {
                if let Some(rid) = data["requestId"].as_str() {
                    self.state.lock().asked.remove(rid);
                }
            }
            "session.todos_changed" => self.read_todos(),
            _ => {}
        }
        (self.on_frame)(msg);
    }

    /// The tasks of the session (`session.plan.readSqlTodosWithDependencies`), passed on as
    /// `escouade.todos` once read.
    fn read_todos(self: &Arc<Self>) {
        {
            let mut s = self.state.lock();
            if s.reading_todos {
                s.todos_again = true;
                return;
            }
            s.reading_todos = true;
        }
        let Ok(session) = self.session() else {
            return;
        };
        let sent = self.fire(
            "session.plan.readSqlTodosWithDependencies",
            json!({ "sessionId": session.clone() }),
            move |me, got| {
                match got {
                    Ok(todos) => (me.on_frame)(json!({
                        "method": "escouade.todos",
                        "params": { "sessionId": session, "todos": todos },
                    })),
                    Err(e) => log::warn!("copilot: tasks not read: {e:#}"),
                }
                let again = {
                    let mut s = me.state.lock();
                    s.reading_todos = false;
                    std::mem::take(&mut s.todos_again)
                };
                if again {
                    me.read_todos();
                }
            },
        );
        if sent.is_err() {
            self.state.lock().reading_todos = false;
        }
    }

    /// Replies to the request Copilot made for what the event `kind` asked too (the same question,
    /// the same plan), if one is there: `result` is its answer.
    fn reply_request(&self, method: &str, matches: impl Fn(&Value) -> bool, result: Value) {
        let found = {
            let mut s = self.state.lock();
            let at = s
                .requests
                .iter()
                .position(|(_, m, p)| m == method && matches(p));
            at.map(|i| s.requests.remove(i))
        };
        if let Some((id, _, _)) = found {
            let _ = self.write(&json!({ "jsonrpc": "2.0", "id": id, "result": result }));
        }
    }

    /// The answer to a request of the session: by its method, a result its handler takes.
    fn answer_pending(
        &self,
        method: &str,
        request_id: &str,
        key: &str,
        answer: Value,
    ) -> Result<()> {
        let session = self.session()?;
        let mut params = json!({ "sessionId": session, "requestId": request_id });
        params[key] = answer;
        // Its answer (`success: false` once the other way answered first) is not waited for.
        let id = self.id();
        self.write(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
    }

    /// The modes of `settings` given to the session: its permissions and its agent's mode.
    async fn apply_mode(&self, session: &str, mode: &str) -> Result<()> {
        self.request(
            "session.permissions.setMode",
            json!({ "sessionId": session, "mode": permission_mode(mode) }),
            REQUEST_LIMIT,
        )
        .await?;
        self.request(
            "session.mode.set",
            json!({ "sessionId": session, "mode": agent_mode(mode) }),
            REQUEST_LIMIT,
        )
        .await?;
        Ok(())
    }

    /// What `session.create` and `session.resume` are given.
    fn session_params(&self) -> Value {
        let s = self.state.lock();
        let mut p = json!({
            "clientName": "escouade",
            "workingDirectory": self.cwd,
            "streaming": true,
            "requestPermission": true,
            "requestUserInput": true,
            "requestElicitation": true,
            "requestExitPlanMode": true,
            "envValueMode": "direct",
        });
        // Never `auto`: it picks a model itself (docs/TODO-1.8.md, point 0).
        if !s.settings.model.is_empty() {
            p["model"] = json!(s.settings.model);
        }
        if !s.settings.effort.is_empty() && takes_effort(&s.settings.model) {
            p["reasoningEffort"] = json!(s.settings.effort);
        }
        if let Some(i) = &self.instructions {
            p["systemMessage"] = json!({ "mode": "append", "content": i });
        }
        p
    }

    /// Opens the agent's session as `start` says: its id, and how it was opened (`new`, `resume`,
    /// `fork`). A session to resume that is gone gives a new one.
    async fn open(&self) -> Result<(String, &'static str)> {
        let params = self.session_params();
        let resume = |id: String| {
            let mut p = params.clone();
            p["sessionId"] = json!(id);
            p
        };
        match &self.start {
            Start::New => {}
            Start::Resume { session } => {
                match self
                    .request("session.resume", resume(session.clone()), REQUEST_LIMIT)
                    .await
                {
                    Ok(r) => {
                        let id = r["sessionId"].as_str().unwrap_or(session).to_string();
                        return Ok((id, "resume"));
                    }
                    Err(e) => log::warn!("copilot: session {session} not resumed: {e:#}"),
                }
            }
            Start::Fork { of, at } => {
                let mut fork = json!({ "sessionId": of, "name": "Escouade" });
                if let Some(boundary) = self.fork_boundary(of, at.as_deref()).await {
                    fork["toEventId"] = json!(boundary);
                }
                match self.request("sessions.fork", fork, REQUEST_LIMIT).await {
                    Ok(r) => {
                        if let Some(id) = r["sessionId"].as_str() {
                            let r = self
                                .request("session.resume", resume(id.to_string()), REQUEST_LIMIT)
                                .await?;
                            let id = r["sessionId"].as_str().unwrap_or(id).to_string();
                            return Ok((id, "fork"));
                        }
                    }
                    Err(e) => log::warn!("copilot: session {of} not copied: {e:#}"),
                }
            }
        }
        let r = self
            .request("session.create", params.clone(), REQUEST_LIMIT)
            .await?;
        let id = r["sessionId"]
            .as_str()
            .ok_or_else(|| anyhow!("session.create: no session"))?
            .to_string();
        Ok((id, "new"))
    }

    /// Where a copy of `of` made at its event `at` stops: the event after it (`toEventId` keeps
    /// what is before), none when `at` is its last one or is not found (all of it copied).
    async fn fork_boundary(&self, of: &str, at: Option<&str>) -> Option<String> {
        let at = at?;
        let events = self
            .request(
                "sessions.readPersistedEvents",
                json!({ "sessionId": of }),
                REQUEST_LIMIT,
            )
            .await
            .ok()?;
        let list = events["events"].as_array()?;
        let i = list.iter().position(|e| e["id"] == at)?;
        list.get(i + 1)?["id"].as_str().map(str::to_string)
    }

    /// The models of the account: `models.list`, else the session's (`session.model.list`), with
    /// the price category of each when that is all it says.
    async fn models(&self, session: &str) -> Option<Vec<crate::engine::registry::ToldModel>> {
        let listed = self
            .request("models.list", json!({}), REQUEST_LIMIT)
            .await
            .ok();
        if let Some(prices) = listed.as_ref().map(super::prices).filter(|p| !p.is_empty()) {
            (self.on_frame)(json!({ "method": "escouade.prices", "params": {
                "sessionId": session, "prices": prices,
            } }));
        }
        let of_session = self
            .request(
                "session.model.list",
                json!({ "sessionId": session }),
                REQUEST_LIMIT,
            )
            .await
            .ok();
        catalog(listed.as_ref(), of_session.as_ref())
    }
}

impl EngineProcess for CopilotProcess {
    fn is_alive(&self) -> bool {
        !self.exited.load(Ordering::Acquire)
    }

    fn usage(&self) -> Option<JobUsage> {
        self.job.as_ref()?.usage()
    }

    fn still_running(&self) -> u32 {
        let in_job = self.usage().map_or(0, |u| u.processes);
        in_job.max(u32::from(self.is_alive()))
    }

    fn pids(&self) -> Vec<u32> {
        self.job.as_ref().map(|j| j.pids()).unwrap_or_default()
    }

    /// `runtime.shutdown`, then its input closed: it saves its session and exits.
    fn close_input(&self) {
        let id = self.id();
        let _ = self.write(
            &json!({ "jsonrpc": "2.0", "id": id, "method": "runtime.shutdown", "params": {} }),
        );
        self.tx.lock().take();
    }

    fn kill(&self) {
        self.tx.lock().take();
        if let Some(job) = &self.job {
            job.terminate();
        }
        if let Some(k) = self.kill_tx.lock().take() {
            let _ = k.send(());
        }
    }

    fn wait_exit(&self, within: Duration) -> BoxFuture<'_, bool> {
        Box::pin(async move {
            let started = std::time::Instant::now();
            while self.is_alive() {
                if started.elapsed() >= within {
                    return false;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            true
        })
    }

    fn wait_gone(&self, within: Duration) -> BoxFuture<'_, bool> {
        Box::pin(async move {
            let started = std::time::Instant::now();
            if !self.wait_exit(within).await {
                return false;
            }
            #[cfg(windows)]
            while self.usage().is_some_and(|u| u.processes > 0) {
                if started.elapsed() >= within {
                    return false;
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
            #[cfg(not(windows))]
            let _ = started;
            true
        })
    }

    /// The handshake, the account, the session (new, resumed or copied) on its modes, then the
    /// models of the account.
    fn initialize(&self) -> BoxFuture<'_, Result<Ready>> {
        Box::pin(async move {
            let lang = i18n::ui();
            let hello = self
                .request(
                    "connect",
                    json!({ "supportedTaskKinds": ["agent", "client", "shell"] }),
                    REQUEST_LIMIT,
                )
                .await?;
            if hello["protocolVersion"].as_u64() != Some(PROTOCOL) {
                return Err(self
                    .refuse(super::protocol_refused(lang, &hello["protocolVersion"]))
                    .await);
            }
            // Never a token: `auth.getStatus` tells how it is signed in, no more.
            let auth = self
                .request("auth.getStatus", json!({}), REQUEST_LIMIT)
                .await?;
            if !signed_in(&auth, self.own_home) {
                return Err(self.refuse(super::not_signed_in(lang)).await);
            }
            // None opened: the process is of no use, and its exit says why in the conversation.
            let (session, how) = match self.open().await {
                Ok(opened) => opened,
                Err(e) => return Err(self.refuse(super::session_refused(lang, &e)).await),
            };
            self.state.lock().session = Some(session.clone());
            let mode = self.state.lock().settings.mode.clone();
            if let Err(e) = self.apply_mode(&session, &mode).await {
                log::warn!("copilot: mode {mode} not applied: {e:#}");
            }
            // Escouade's server refused: an entry of the user's of its name is off for the session
            // (`--disable-mcp-server` does nothing in the server mode, tried).
            if !self.escouade {
                let off = json!({ "sessionId": session, "serverName": crate::engine::mcp::SERVER });
                if let Err(e) = self
                    .request("session.mcp.disable", off, REQUEST_LIMIT)
                    .await
                {
                    log::debug!("copilot: session.mcp.disable: {e:#}");
                }
            }
            // A resumed session keeps its model; the agent's is the one it runs on.
            let (model, effort) = {
                let s = self.state.lock();
                (s.settings.model.clone(), s.settings.effort.clone())
            };
            if how != "new" && !model.is_empty() {
                let mut p = json!({ "sessionId": session, "modelId": model });
                if !effort.is_empty() && takes_effort(&model) {
                    p["reasoningEffort"] = json!(effort);
                }
                if let Err(e) = self
                    .request("session.model.switchTo", p, REQUEST_LIMIT)
                    .await
                {
                    log::warn!("copilot: model {model} not set: {e:#}");
                }
            }
            (self.on_frame)(json!({ "method": "escouade.session", "params": {
                "sessionId": session, "start": how, "authType": auth["authType"],
            } }));
            let models = self.models(&session).await;
            Ok(Ready {
                commands: Vec::new(),
                models: Value::Null,
                catalog: models,
            })
        })
    }

    /// While a turn runs, the message goes into it at once (`immediate`); else it starts one.
    fn send_message(&self, _uuid: &str, message: &Message) -> Result<()> {
        let session = self.session()?;
        let mut params = message.0.clone();
        params["sessionId"] = json!(session);
        {
            let mut s = self.state.lock();
            params["mode"] = json!(if s.busy { "immediate" } else { "enqueue" });
            s.busy = true;
        }
        let id = self.id();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().insert(id, tx);
        self.write(
            &json!({ "jsonrpc": "2.0", "id": id, "method": "session.send", "params": params }),
        )?;
        let on_frame = self.on_frame.clone();
        let state = self.state.clone();
        tokio::spawn(async move {
            if let Ok(Ok(Err(e))) = tokio::time::timeout(REQUEST_LIMIT, rx).await {
                state.lock().busy = false;
                on_frame(json!({ "method": "escouade.refused", "params": {
                    "sessionId": session, "message": e,
                } }));
            }
        });
        Ok(())
    }

    fn interrupt(&self, _cancel_queued: bool, timeout: Duration) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            let Ok(session) = self.session() else {
                return Ok(());
            };
            self.request("session.abort", json!({ "sessionId": session }), timeout)
                .await
                .map(|_| ())
        })
    }

    /// At once, even during a turn (`session.model.switchTo`).
    fn set_model<'a>(&'a self, model: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let effort = {
                let mut s = self.state.lock();
                s.settings.model = model.to_string();
                s.settings.effort.clone()
            };
            let session = self.session()?;
            let mut p = json!({ "sessionId": session, "modelId": model });
            if !effort.is_empty() && takes_effort(model) {
                p["reasoningEffort"] = json!(effort);
            }
            self.request("session.model.switchTo", p, REQUEST_LIMIT)
                .await
                .map(|_| ())
        })
    }

    fn set_effort<'a>(&'a self, effort: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let model = {
                let mut s = self.state.lock();
                s.settings.effort = effort.to_string();
                s.settings.model.clone()
            };
            let session = self.session()?;
            let mut p = json!({ "sessionId": session, "modelId": model });
            if !effort.is_empty() && takes_effort(&model) {
                p["reasoningEffort"] = json!(effort);
            }
            self.request("session.model.switchTo", p, REQUEST_LIMIT)
                .await
                .map(|_| ())
        })
    }

    fn set_mode<'a>(&'a self, mode: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            self.state.lock().settings.mode = mode.to_string();
            let session = self.session()?;
            self.apply_mode(&session, mode).await
        })
    }

    fn answer_permission(&self, request_id: &str, answer: PermissionAnswer) -> Result<()> {
        let Some(asked) = self.state.lock().asked.get(request_id).cloned() else {
            bail!("Copilot no longer waits for this answer");
        };
        if asked.kind == "exit_plan_mode" {
            // The plan approved: its work starts, its edits accepted with « Pour cette session »;
            // sent back, the planning goes on with what the user said.
            let (response, mode) = match &answer {
                PermissionAnswer::Allow { .. } => (
                    json!({ "approved": true, "selectedAction": "interactive" }),
                    Some("default"),
                ),
                PermissionAnswer::Always { .. } => (
                    json!({ "approved": true, "selectedAction": "interactive", "autoApproveEdits": true }),
                    Some("acceptEdits"),
                ),
                PermissionAnswer::Deny { message, .. } => {
                    (json!({ "approved": false, "feedback": message }), None)
                }
            };
            self.answer_pending(
                "session.ui.handlePendingExitPlanMode",
                request_id,
                "response",
                response.clone(),
            )?;
            let summary = asked.data["summary"].clone();
            self.reply_request(
                "exitPlanMode.request",
                |p| p["summary"] == summary,
                response,
            );
            if let Some(mode) = mode {
                self.state.lock().settings.mode = mode.to_string();
                let session = self.session()?;
                // Told on a task of its own: the answer is given with the agent held, which its
                // frames need.
                let on_frame = self.on_frame.clone();
                tokio::spawn(async move {
                    on_frame(json!({ "method": "escouade.mode", "params": {
                        "sessionId": session, "mode": mode,
                    } }));
                });
            }
            return Ok(());
        }
        let result = match &answer {
            PermissionAnswer::Allow { .. } => json!({ "kind": "approve-once" }),
            PermissionAnswer::Always { .. } => super::session_approval(&asked.data),
            PermissionAnswer::Deny { message, .. } => {
                let bare = [Lang::Fr, Lang::En]
                    .iter()
                    .any(|l| crate::agent::refused_action(*l) == *message);
                if message.trim().is_empty() || bare {
                    json!({ "kind": "reject" })
                } else {
                    json!({ "kind": "reject", "feedback": message })
                }
            }
        };
        self.answer_pending(
            "session.permissions.handlePendingPermissionRequest",
            request_id,
            "result",
            result,
        )
    }

    /// `input.questions` are the card's, `input.answers` its answers by question.
    fn answer_question(&self, request_id: &str, _call: &str, input: Value) -> Result<()> {
        let Some(asked) = self.state.lock().asked.get(request_id).cloned() else {
            bail!("Copilot no longer waits for this answer");
        };
        if asked.kind == "session_limits_exhausted" {
            let text = super::limit_question(i18n::ui(), &asked.data);
            let answer = input["answers"][text.as_str()].as_str().unwrap_or_default();
            return self.answer_pending(
                "session.ui.handlePendingSessionLimitsExhausted",
                request_id,
                "response",
                super::limit_answer(&asked.data, answer),
            );
        }
        if asked.kind == "elicitation" {
            let content = super::form_content(&asked.data["requestedSchema"], &input);
            return self.answer_pending(
                "session.ui.handlePendingElicitation",
                request_id,
                "result",
                json!({ "action": "accept", "content": content }),
            );
        }
        let question = asked.data["question"].as_str().unwrap_or_default();
        let answer = input["answers"][question]
            .as_str()
            .map(str::to_string)
            .unwrap_or_default();
        let freeform = !asked.data["choices"]
            .as_array()
            .is_some_and(|c| c.iter().any(|x| x.as_str() == Some(&answer)));
        let response = json!({ "answer": answer, "wasFreeform": freeform });
        self.answer_pending(
            "session.ui.handlePendingUserInput",
            request_id,
            "response",
            response.clone(),
        )?;
        let q = asked.data["question"].clone();
        self.reply_request("userInput.request", |p| p["question"] == q, response);
        Ok(())
    }

    /// The credits of the month (`session.quota.get`), as meters.
    fn read_usage(&self) -> BoxFuture<'_, Result<Option<Value>>> {
        Box::pin(async move {
            let session = self.session()?;
            let read = self
                .request(
                    "session.quota.get",
                    json!({ "sessionId": session }),
                    REQUEST_LIMIT,
                )
                .await?;
            let now = chrono::Utc::now().timestamp_millis();
            Ok(super::credits(&read["snapshots"], now).map(|m| json!({ "meters": [m] })))
        })
    }

    fn rename<'a>(&'a self, title: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let session = self.session()?;
            self.request(
                "session.name.set",
                json!({ "sessionId": session, "name": title }),
                REQUEST_LIMIT,
            )
            .await
            .map(|_| ())
        })
    }

    fn stop_task<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async { Err(anyhow!(unsupported())) })
    }

    fn task_output<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<Value>> {
        Box::pin(async { Err(anyhow!(unsupported())) })
    }

    fn remote_control(&self, _: Remote, _: Duration) -> BoxFuture<'_, Result<Value>> {
        Box::pin(async { Err(anyhow!(unsupported())) })
    }

    /// A request in Copilot's protocol: `{"method", "params"}`.
    fn control(&self, request: Value, timeout: Duration) -> BoxFuture<'_, Result<Value>> {
        Box::pin(async move {
            let method = request["method"].as_str().unwrap_or_default().to_string();
            self.request(&method, request["params"].clone(), timeout)
                .await
        })
    }

    fn reply(&self, request_id: &str, answer: std::result::Result<Value, String>) -> Result<()> {
        match answer {
            Ok(result) => {
                self.write(&json!({ "jsonrpc": "2.0", "id": request_id, "result": result }))
            }
            Err(message) => self.write(&json!({
                "jsonrpc": "2.0", "id": request_id, "error": { "code": -32601, "message": message },
            })),
        }
    }
}

fn unsupported() -> String {
    tr!("Copilot ne le permet pas", "Copilot doesn’t support it")
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

    #[tokio::test]
    async fn a_frame_is_read_whole_whatever_its_headers() {
        let a = frame(&json!({ "id": 1, "result": "é" }));
        let mut bytes = a.clone();
        bytes.extend_from_slice(b"Content-Type: x\r\ncontent-length: 2\r\n\r\n{}");
        let mut r = tokio::io::BufReader::new(&bytes[..]);
        let first = read_frame(&mut r).await.unwrap().unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&first).unwrap()["result"],
            "é"
        );
        assert_eq!(read_frame(&mut r).await.unwrap().unwrap(), b"{}");
        assert!(read_frame(&mut r).await.unwrap().is_none());
    }
}
