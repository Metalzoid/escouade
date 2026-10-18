//! An agent's session on its account's `opencode serve` (`server`): what `EngineProcess` is for
//! OpenCode.
//!
//! It creates, resumes or copies its session, sends its messages (`prompt_async`), answers its
//! permissions and questions, and passes on the events of its session and of its subagents'
//! (`server::Listener`). A message sent while a turn runs would be taken into it at once, the
//! first one's request lost (`mid-turn.jsonl`): Escouade holds it until the turn ends
//! (`session.idle` of the agent's own session, once it was seen busy: an `idle` of the turn before
//! can come after the next message is sent).

use super::server::{self, Listener, Server};
use super::{agent_of, rules, split_model, Settings};
use crate::engine::terminal::Attach;
use crate::engine::{
    BoxFuture, EngineProcess, Message, OnExit, OnFrame, PermissionAnswer, Ready, Remote, Start,
};
use crate::i18n::{self, Lang};
use crate::job::JobUsage;
use anyhow::{anyhow, bail, Result};
use parking_lot::Mutex;
use reqwest::Method;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Weak};
use std::time::Duration;

/// What the session knows of its conversation.
#[derive(Default)]
struct State {
    /// Its session, once created, resumed or copied.
    session: Option<String>,
    /// A turn of its session runs: one Escouade started, or one seen busy (a message typed in
    /// `opencode attach`).
    busy: bool,
    /// Its session was seen busy since the last message sent: its next `idle` ends the turn.
    saw_busy: bool,
    /// The parts of the messages held while a turn runs: sent as one once it ends.
    held: Vec<Value>,
    settings: Settings,
    /// The variants of each model (`variants`): an effort is passed to a model that has it.
    variants: HashMap<String, Vec<String>>,
    /// Stopped gently while a turn ran: released once it ends.
    closing: bool,
    /// The prompts sent whose message the session has not shown yet.
    unseen_prompts: u32,
    /// Whether each message of the user in the session was Escouade's (true) or typed in another
    /// client (`opencode attach`), by its id: decided once, at its first `message.updated`.
    by_escouade: HashMap<String, bool>,
}

pub struct OpencodeProcess {
    inner: Arc<Inner>,
}

struct Inner {
    server: Arc<Server>,
    cwd: String,
    start: Start,
    /// The instructions added to it (a ticket's protocol): the `system` of each prompt, which
    /// holds for that prompt alone (tried, docs/TODO-1.8.md, point 0).
    instructions: Option<String>,
    /// The title of a new session: given, it is not written by a model (`small_model`).
    title: String,
    state: Mutex<State>,
    on_frame: OnFrame,
    on_exit: Mutex<Option<OnExit>>,
    exited: AtomicBool,
    released: AtomicBool,
    /// Its folder counted among the server's (`Server::enter`).
    entered: AtomicBool,
    /// Its folder let go by the server, when it was the last agent there (`POST /instance/dispose`
    /// answered, or no need): what `wait_gone` waits for.
    let_go: Arc<AtomicBool>,
}

/// How a session is opened.
pub(super) struct Opts {
    pub server: Arc<Server>,
    pub cwd: String,
    pub start: Start,
    pub settings: Settings,
    pub instructions: Option<String>,
    pub title: String,
}

/// Hears the server for the session (weakly: a session dropped is not kept alive by it).
struct Hears(Weak<Inner>);

impl Listener for Hears {
    fn event(&self, frame: Value) {
        if let Some(inner) = self.0.upgrade() {
            Inner::on_event(&inner, frame);
        }
    }

    fn gone(&self, code: Option<i32>, said: String) {
        if let Some(inner) = self.0.upgrade() {
            inner.released.store(true, Ordering::Release);
            inner.finish(code, said);
        }
    }
}

impl OpencodeProcess {
    pub(super) fn new(opts: Opts, on_frame: OnFrame, on_exit: OnExit) -> Arc<Self> {
        let Opts {
            server,
            cwd,
            start,
            settings,
            instructions,
            title,
        } = opts;
        Arc::new(OpencodeProcess {
            inner: Arc::new(Inner {
                server,
                cwd,
                start,
                instructions,
                title,
                state: Mutex::new(State {
                    settings,
                    ..Default::default()
                }),
                on_frame,
                on_exit: Mutex::new(Some(on_exit)),
                exited: AtomicBool::new(false),
                released: AtomicBool::new(false),
                entered: AtomicBool::new(false),
                let_go: Arc::new(AtomicBool::new(true)),
            }),
        })
    }
}

impl Inner {
    fn session(&self) -> Result<String> {
        self.state
            .lock()
            .session
            .clone()
            .ok_or_else(|| anyhow!("OpenCode has no session yet"))
    }

    /// An event of its session or of a subagent's.
    fn on_event(self: &Arc<Self>, mut frame: Value) {
        let kind = frame["type"].as_str().unwrap_or_default().to_string();
        let sid = frame["properties"]["sessionID"]
            .as_str()
            .map(str::to_string);
        let mut next: Option<Vec<Value>> = None;
        let mut close = false;
        {
            let mut s = self.state.lock();
            let own = sid.is_some() && sid == s.session;
            match kind.as_str() {
                "message.updated" if own && frame["properties"]["info"]["role"] == "user" => {
                    let id = frame["properties"]["info"]["id"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string();
                    let State {
                        unseen_prompts,
                        by_escouade,
                        ..
                    } = &mut *s;
                    // Escouade's while a prompt it sent is still to be seen: the server keeps the
                    // messages of a session in the order they came.
                    let ours = *by_escouade.entry(id).or_insert_with(|| {
                        let ours = *unseen_prompts > 0;
                        *unseen_prompts = unseen_prompts.saturating_sub(1);
                        ours
                    });
                    if !ours {
                        frame["properties"]["typedElsewhere"] = json!(true);
                    }
                }
                "session.status" if own => {
                    if frame["properties"]["status"]["type"] == "busy" {
                        s.busy = true;
                        s.saw_busy = true;
                    }
                }
                "session.idle" if own => {
                    // An `idle` of the turn before, come after the message: not this turn's end.
                    if !s.saw_busy {
                        return;
                    }
                    s.busy = false;
                    s.saw_busy = false;
                    if !s.held.is_empty() {
                        next = Some(std::mem::take(&mut s.held));
                    } else if s.closing {
                        close = true;
                    }
                }
                _ => {}
            }
        }
        (self.on_frame)(frame);
        if let Some(parts) = next {
            let _ = self.prompt(parts);
        } else if close {
            self.release();
        }
    }

    /// Sends `parts` as a prompt of its session, with the settings of its next turn.
    fn prompt(self: &Arc<Self>, parts: Vec<Value>) -> Result<()> {
        let session = self.session()?;
        let body = {
            let mut s = self.state.lock();
            let Some((provider, model)) =
                split_model(&s.settings.model).map(|(p, m)| (p.to_string(), m.to_string()))
            else {
                bail!(no_model(i18n::ui()));
            };
            s.busy = true;
            s.saw_busy = false;
            s.unseen_prompts += 1;
            let mut body = json!({
                "parts": parts,
                "agent": agent_of(&s.settings.mode),
                "model": { "providerID": provider, "modelID": model },
            });
            let effort = &s.settings.effort;
            if !effort.is_empty()
                && s.variants
                    .get(&s.settings.model)
                    .is_some_and(|v| v.contains(effort))
            {
                body["variant"] = json!(effort);
            }
            if let Some(i) = &self.instructions {
                body["system"] = json!(i);
            }
            body
        };
        let me = self.clone();
        tokio::spawn(async move {
            let path = format!("/session/{session}/prompt_async");
            if let Err(e) = me
                .server
                .call(Method::POST, &path, &me.cwd, Some(body))
                .await
            {
                log::warn!("opencode: {e:#}");
                {
                    let mut s = me.state.lock();
                    s.busy = false;
                    s.unseen_prompts = s.unseen_prompts.saturating_sub(1);
                }
                (me.on_frame)(json!({
                    "type": "escouade.prompt.failed",
                    "properties": { "sessionID": session, "message": format!("{e:#}") },
                }));
            }
        });
        Ok(())
    }

    /// A request sent without waiting for its answer (a failure is only logged).
    fn fire(self: &Arc<Self>, method: Method, path: String, body: Option<Value>) {
        let me = self.clone();
        tokio::spawn(async move {
            if let Err(e) = me.server.call(method, &path, &me.cwd, body).await {
                log::warn!("opencode: {e:#}");
            }
        });
    }

    /// The rules of its mode set on its session (OpenCode merges them, the last one of a
    /// permission winning: each mode gives all of them).
    fn set_rules(self: &Arc<Self>) {
        let Ok(session) = self.session() else { return };
        let mode = self.state.lock().settings.mode.clone();
        self.fire(
            Method::PATCH,
            format!("/session/{session}"),
            Some(json!({ "permission": rules(&mode) })),
        );
    }

    /// The agent no longer uses its server: told gone, the server stopped with its last agent.
    fn release(self: &Arc<Self>) {
        if self.released.swap(true, Ordering::AcqRel) {
            return;
        }
        if let Some(session) = self.state.lock().session.clone() {
            self.server.forget(&session);
        }
        // The last agent of its folder gone, the server lets it go: its instance watches the
        // folder, which a worktree removed under Windows would find held.
        if self.entered.load(Ordering::Acquire)
            && self.server.leave(&self.cwd)
            && self.server.is_alive()
        {
            self.let_go.store(false, Ordering::Release);
            let (me, done) = (self.clone(), self.let_go.clone());
            tokio::spawn(async move {
                let said = me
                    .server
                    .call(Method::POST, "/instance/dispose", &me.cwd, None)
                    .await;
                if let Err(e) = said {
                    log::debug!("opencode: dispose: {e:#}");
                }
                done.store(true, Ordering::Release);
            });
        }
        server::release(&self.server);
        self.finish(Some(0), String::new());
    }

    fn finish(&self, code: Option<i32>, said: String) {
        if self.exited.swap(true, Ordering::AcqRel) {
            return;
        }
        // Never within the call that stopped it: the core may hold the agent's lock there, which
        // its `on_exit` takes.
        if let Some(f) = self.on_exit.lock().take() {
            later(move || f(code, said));
        }
    }

    /// Its session: a new one, the one it resumes, or a copy of its original's.
    async fn open(self: &Arc<Self>) -> Result<(Value, &'static str)> {
        let mode = self.state.lock().settings.mode.clone();
        let new = || json!({ "title": self.title, "permission": rules(&mode) });
        let srv = &self.server;
        match &self.start {
            Start::Resume { session } => {
                match srv
                    .call(Method::GET, &format!("/session/{session}"), &self.cwd, None)
                    .await
                {
                    Ok(info) => return Ok((info, "resume")),
                    Err(e) if server::not_found(&e) => {
                        log::warn!("opencode: session {session} gone, a new one");
                    }
                    Err(e) => return Err(e),
                }
            }
            Start::Fork { of, at } => {
                // OpenCode copies the messages before the one it is given: the one after `at`,
                // none when `at` is the last (all of them).
                let messages = srv
                    .call(
                        Method::GET,
                        &format!("/session/{of}/message"),
                        &self.cwd,
                        None,
                    )
                    .await;
                match messages {
                    Ok(list) => {
                        let ids: Vec<&str> = list
                            .as_array()
                            .into_iter()
                            .flatten()
                            .filter_map(|m| m["info"]["id"].as_str())
                            .collect();
                        let cut = at
                            .as_deref()
                            .and_then(|at| ids.iter().position(|id| *id == at))
                            .and_then(|i| ids.get(i + 1));
                        let body = match cut {
                            Some(id) => json!({ "messageID": id }),
                            None => json!({}),
                        };
                        let info = srv
                            .call(
                                Method::POST,
                                &format!("/session/{of}/fork"),
                                &self.cwd,
                                Some(body),
                            )
                            .await?;
                        return Ok((info, "fork"));
                    }
                    Err(e) if server::not_found(&e) => {
                        log::warn!("opencode: session {of} to copy gone, a new one");
                    }
                    Err(e) => return Err(e),
                }
            }
            Start::New => {}
        }
        let info = srv
            .call(Method::POST, "/session", &self.cwd, Some(new()))
            .await?;
        Ok((info, "new"))
    }
}

/// `f` run on a task of its own, once the caller is done (at once without a runtime).
fn later(f: impl FnOnce() + Send + 'static) {
    match tokio::runtime::Handle::try_current() {
        Ok(rt) => {
            rt.spawn(async move { f() });
        }
        Err(_) => f(),
    }
}

fn ready<'a, T: Send + 'a>(v: T) -> BoxFuture<'a, T> {
    Box::pin(std::future::ready(v))
}

impl EngineProcess for OpencodeProcess {
    fn is_alive(&self) -> bool {
        !self.inner.exited.load(Ordering::Acquire) && self.inner.server.is_alive()
    }

    /// The server is shared by the agents of its account: its use is no agent's own.
    fn usage(&self) -> Option<JobUsage> {
        None
    }

    fn still_running(&self) -> u32 {
        u32::from(self.is_alive())
    }

    fn pids(&self) -> Vec<u32> {
        if self.is_alive() {
            self.inner.server.pids()
        } else {
            Vec::new()
        }
    }

    fn close_input(&self) {
        let busy = {
            let mut s = self.inner.state.lock();
            s.closing = true;
            s.busy
        };
        if !busy {
            self.inner.release();
        }
    }

    fn kill(&self) {
        let (busy, session) = {
            let s = self.inner.state.lock();
            (s.busy, s.session.clone())
        };
        if let (true, Some(session)) = (busy, session) {
            self.inner
                .fire(Method::POST, format!("/session/{session}/abort"), None);
        }
        self.inner.release();
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

    /// Gone, and its folder let go by the server that goes on for other agents (a worktree is
    /// removed next).
    fn wait_gone(&self, within: Duration) -> BoxFuture<'_, bool> {
        Box::pin(async move {
            let started = std::time::Instant::now();
            if !self.wait_exit(within).await {
                return false;
            }
            while !self.inner.let_go.load(Ordering::Acquire) {
                if started.elapsed() >= within {
                    return false;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            true
        })
    }

    /// `opencode attach` on its server, on its session, in its folder; the password in its
    /// environment only.
    fn attach(&self) -> Option<Attach> {
        if !self.is_alive() {
            return None;
        }
        let session = self.inner.state.lock().session.clone()?;
        let url = self.inner.server.base().ok()?;
        Some(attach_to(
            &url,
            &session,
            &self.inner.cwd,
            self.inner.server.password(),
        ))
    }

    /// The server ready, the session opened and heard, then the models of the connected providers.
    fn initialize(&self) -> BoxFuture<'_, Result<Ready>> {
        Box::pin(async move {
            let inner = &self.inner;
            inner.server.ready().await?;
            let (info, how) = inner.open().await?;
            let id = info["id"]
                .as_str()
                .ok_or_else(|| anyhow!("OpenCode gave no session"))?
                .to_string();
            inner.state.lock().session = Some(id.clone());
            inner
                .server
                .listen(&id, Arc::new(Hears(Arc::downgrade(inner))));
            inner.server.enter(&inner.cwd);
            inner.entered.store(true, Ordering::Release);
            // A copy or a resumed session takes the rules of its mode (a copy has none).
            if how != "new" {
                inner.set_rules();
            }
            (inner.on_frame)(json!({
                "type": "escouade.session",
                "properties": { "sessionID": id, "info": info, "start": how },
            }));
            let catalog = super::read_catalog(&inner.server, &inner.cwd).await;
            let models = match catalog {
                Ok(c) => {
                    let mut s = inner.state.lock();
                    s.variants = c
                        .models
                        .iter()
                        .map(|m| (m.id.clone(), m.efforts.clone()))
                        .collect();
                    // A model OpenCode does not offer (or none): its default one, never one of its
                    // own choosing (OpenCode Zen without an account, tried).
                    if !c.models.iter().any(|m| m.id == s.settings.model) {
                        if let Some(m) = c.models.iter().find(|m| m.default).or(c.models.first()) {
                            s.settings.model = m.id.clone();
                            drop(s);
                            (inner.on_frame)(json!({
                                "type": "escouade.model",
                                "properties": { "sessionID": id, "model": m.id },
                            }));
                        }
                    }
                    Some(c.models).filter(|m| !m.is_empty())
                }
                Err(e) => {
                    log::warn!("opencode: models: {e:#}");
                    None
                }
            };
            Ok(Ready {
                commands: Vec::new(),
                models: Value::Null,
                catalog: models,
            })
        })
    }

    fn send_message(&self, _uuid: &str, message: &Message) -> Result<()> {
        let parts: Vec<Value> = message.0.as_array().cloned().unwrap_or_default();
        {
            let mut s = self.inner.state.lock();
            if s.session.is_none() {
                bail!("OpenCode has no session yet");
            }
            if s.busy {
                s.held.extend(parts);
                return Ok(());
            }
        }
        self.inner.prompt(parts)
    }

    fn interrupt(&self, cancel_queued: bool, timeout: Duration) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            let session = {
                let mut s = self.inner.state.lock();
                if cancel_queued {
                    s.held.clear();
                }
                if !s.busy {
                    return Ok(());
                }
                s.session.clone()
            };
            let Some(session) = session else {
                return Ok(());
            };
            let path = format!("/session/{session}/abort");
            tokio::time::timeout(
                timeout,
                self.inner
                    .server
                    .call(Method::POST, &path, &self.inner.cwd, None),
            )
            .await
            .map_err(|_| anyhow!("abort: no answer in time"))?
            .map(|_| ())
        })
    }

    /// OpenCode takes the model, the effort (`variant`) and the agent of the mode at each prompt.
    fn set_model<'a>(&'a self, model: &'a str) -> BoxFuture<'a, Result<()>> {
        self.inner.state.lock().settings.model = model.to_string();
        ready(Ok(()))
    }

    fn set_effort<'a>(&'a self, effort: &'a str) -> BoxFuture<'a, Result<()>> {
        self.inner.state.lock().settings.effort = effort.to_string();
        ready(Ok(()))
    }

    /// Its agent at the next prompt; its rules at once.
    fn set_mode<'a>(&'a self, mode: &'a str) -> BoxFuture<'a, Result<()>> {
        self.inner.state.lock().settings.mode = mode.to_string();
        self.inner.set_rules();
        ready(Ok(()))
    }

    fn answer_permission(&self, request_id: &str, answer: PermissionAnswer) -> Result<()> {
        // The plan of the mode Plan, its turn over on it: approved, its work starts in the mode
        // left for it; sent back, the planning goes on with what the user said.
        if super::is_plan_approval(request_id) {
            let lang = i18n::claude();
            let (text, mode) = match answer {
                PermissionAnswer::Allow { .. } => (implement_plan(lang), Some("default")),
                PermissionAnswer::Always { .. } => (implement_plan(lang), Some("acceptEdits")),
                PermissionAnswer::Deny { message, .. } => (message, None),
            };
            if let Some(mode) = mode {
                self.inner.state.lock().settings.mode = mode.to_string();
                self.inner.set_rules();
                let session = self.inner.session().unwrap_or_default();
                // After the answer: the core holds the agent's lock while it answers.
                let inner = self.inner.clone();
                later(move || {
                    (inner.on_frame)(json!({
                        "type": "escouade.mode",
                        "properties": { "sessionID": session, "mode": mode },
                    }))
                });
            }
            return self
                .inner
                .prompt(vec![json!({ "type": "text", "text": text })]);
        }
        let body = match answer {
            PermissionAnswer::Allow { .. } => json!({ "reply": "once" }),
            // OpenCode keeps the pattern it proposed (`always`) for the rest of the session.
            PermissionAnswer::Always { .. } => json!({ "reply": "always" }),
            // Told the message, the agent goes on with it.
            PermissionAnswer::Deny { message, .. } => {
                json!({ "reply": "reject", "message": message })
            }
        };
        self.inner.fire(
            Method::POST,
            format!("/permission/{request_id}/reply"),
            Some(body),
        );
        Ok(())
    }

    /// `input.questions` are OpenCode's, in its order; `input.answers` the card's, by question.
    fn answer_question(&self, request_id: &str, _call: &str, input: Value) -> Result<()> {
        self.inner.fire(
            Method::POST,
            format!("/question/{request_id}/reply"),
            Some(json!({ "answers": super::answers(&input) })),
        );
        Ok(())
    }

    /// OpenCode has no quota of its own: it goes through the providers' APIs.
    fn read_usage(&self) -> BoxFuture<'_, Result<Option<Value>>> {
        ready(Ok(None))
    }

    fn rename<'a>(&'a self, title: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let session = self.inner.session()?;
            self.inner
                .server
                .call(
                    Method::PATCH,
                    &format!("/session/{session}"),
                    &self.inner.cwd,
                    Some(json!({ "title": title })),
                )
                .await
                .map(|_| ())
        })
    }

    fn stop_task<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<()>> {
        ready(Err(anyhow!(unsupported())))
    }

    fn task_output<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<Value>> {
        ready(Err(anyhow!(unsupported())))
    }

    fn remote_control(&self, _: Remote, _: Duration) -> BoxFuture<'_, Result<Value>> {
        ready(Err(anyhow!(unsupported())))
    }

    /// A request to the server: `{"method", "path", "body"}`, in the agent's folder.
    fn control(&self, request: Value, timeout: Duration) -> BoxFuture<'_, Result<Value>> {
        Box::pin(async move {
            let method = request["method"]
                .as_str()
                .unwrap_or("GET")
                .parse::<Method>()
                .map_err(|e| anyhow!("{e}"))?;
            let path = request["path"].as_str().unwrap_or("/").to_string();
            let body = request.get("body").filter(|b| !b.is_null()).cloned();
            tokio::time::timeout(
                timeout,
                self.inner.server.call(method, &path, &self.inner.cwd, body),
            )
            .await
            .map_err(|_| anyhow!("{path}: no answer in time"))?
        })
    }

    /// OpenCode makes no request of its own but its permissions and questions.
    fn reply(&self, _request_id: &str, _answer: std::result::Result<Value, String>) -> Result<()> {
        Ok(())
    }
}

/// What the agent is told when its plan is approved.
fn implement_plan(lang: Lang) -> String {
    tr_in!(lang, "Mets le plan en œuvre.", "Implement the plan.")
}

fn unsupported() -> String {
    tr!("OpenCode ne le permet pas", "OpenCode doesn’t support it")
}

/// No model of a connected provider to send a message with.
/// `opencode attach` on the server at `url` (its password `password`), on `session`, in `dir`
/// (docs/TODO-1.8.md, point 0, « Vue terminal »).
pub(super) fn attach_to(url: &str, session: &str, dir: &str, password: &str) -> Attach {
    Attach {
        args: ["attach", url, "--session", session, "--dir", dir]
            .map(str::to_string)
            .to_vec(),
        env: vec![("OPENCODE_SERVER_PASSWORD".into(), password.into())],
    }
}

pub(super) fn no_model(lang: Lang) -> String {
    tr_in!(
        lang,
        "Aucun modèle d’OpenCode à utiliser : connecte un fournisseur à OpenCode (opencode auth login) ou déclare-en un dans sa config, puis choisis son modèle.",
        "No OpenCode model to use: connect a provider to OpenCode (opencode auth login) or declare one in its config, then pick its model."
    )
}
