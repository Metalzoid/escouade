//! The conformance bench of the harnesses (ESC-35, docs/ENGINES.md, « Le banc de conformité »):
//! the scenarios every engine plays through its fake, judged on what its translation makes of
//! them in the agent's conversation, never on its own frames.
//!
//! An engine plugs in by a `Target` (itself, its fake's program, the message that makes its fake
//! play each scenario), written beside it (`engine/claude/bench.rs`), and one test that calls
//! `run`: nothing of the bench nor of the core changes (`engine/minimal/` shows it).
//! What its capabilities (`EngineCaps`) say it cannot do is not asked of it (`Scenario::applies`).
//! Its recorded real streams are replayed by `replay`.

pub(crate) mod replay;

use super::registry::{EngineCaps, ForkPoint, QuotaKind};
use super::{Engine, Process, Program, Spawn, Start};
use crate::agent::{AgentRt, Effects};
use crate::board::TurnEnd;
use crate::model::{AgentMeta, AgentStatus};
use crate::plan::RunStatus;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

/// The scenarios of the bench, in the order `run` plays them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Scenario {
    /// A message, a reply, the end of the turn.
    Text,
    /// A reasoning shown before the reply.
    Thinking,
    /// A command that asks its approval, allowed, run.
    Approval,
    /// A file changed, among the agent's touched files.
    Edit,
    /// A question to the user, answered.
    Question,
    /// A turn interrupted while it runs.
    Interrupt,
    /// The end of the plan mode, a plan to approve (engines with the mode `plan`).
    PlanMode,
    /// A subagent launched, in the plan's rows, over by the end of the turn.
    Subagents,
    /// A turn stopped by the usage limit (engines with a quota).
    Limit,
    /// The conversation resumed by a new process, under its session.
    Resume,
    /// A copy of the conversation, under a session of its own (engines that copy).
    Fork,
    /// The quota of the account, as the process reads it (engines with a quota).
    Quota,
}

impl Scenario {
    pub(crate) const ALL: [Scenario; 12] = [
        Scenario::Text,
        Scenario::Thinking,
        Scenario::Approval,
        Scenario::Edit,
        Scenario::Question,
        Scenario::Interrupt,
        Scenario::PlanMode,
        Scenario::Subagents,
        Scenario::Limit,
        Scenario::Resume,
        Scenario::Fork,
        Scenario::Quota,
    ];

    /// Whether an engine that can do what `caps` says must pass it.
    pub(crate) fn applies(self, caps: &EngineCaps) -> bool {
        match self {
            Scenario::PlanMode => caps.modes.iter().any(|m| m.id == "plan"),
            Scenario::Limit | Scenario::Quota => caps.quota != QuotaKind::None,
            Scenario::Fork => caps.fork != ForkPoint::None,
            _ => true,
        }
    }
}

/// What an engine brings to the bench.
pub(crate) trait Target: Sync {
    fn engine(&self) -> &'static dyn Engine;
    /// Its fake's program.
    fn program(&self) -> Program;
    /// The variables its fake gets, run in `dir` (its own, each scenario's).
    fn env(&self, _dir: &Path) -> Vec<(String, String)> {
        Vec::new()
    }
    /// The message that makes its fake play `scenario`: for `Resume` and `Fork`, a plain turn
    /// before and after; for `Quota`, none is sent. None: its fake does not play it, and the bench
    /// fails if the scenario applies to it.
    fn prompt(&self, scenario: Scenario) -> Option<String>;
    /// The model of its agents, when its harness has its own ids (OpenCode: `<provider>/<model>`);
    /// None: Claude Code's `sonnet`, which its fake takes.
    fn model(&self) -> Option<String> {
        None
    }
}

/// Plays every scenario that applies to the engine of `target`, each in a folder of its own under
/// `dir`; panics on the first that fails, saying which. Returns those played.
pub(crate) async fn run(target: &dyn Target, dir: &Path) -> Vec<Scenario> {
    let caps = target.engine().caps();
    let mut played = Vec::new();
    for scenario in Scenario::ALL {
        if !scenario.applies(&caps) {
            continue;
        }
        let folder = dir.join(format!("{scenario:?}").to_lowercase());
        std::fs::create_dir_all(&folder).unwrap();
        play(target, scenario, &folder).await;
        played.push(scenario);
    }
    played
}

/// The message of `scenario` for `target`, which must have one.
fn prompt(target: &dyn Target, scenario: Scenario) -> String {
    target.prompt(scenario).unwrap_or_else(|| {
        panic!(
            "{}: its fake does not play the scenario {scenario:?}, which its capabilities call for",
            target.engine().name()
        )
    })
}

async fn play(target: &dyn Target, scenario: Scenario, dir: &Path) {
    let text = || prompt(target, scenario);
    let mut run = Run::start(target, dir, meta_of(target, dir), scenario).await;
    match scenario {
        Scenario::Text => {
            let end = run.turn(&text()).await;
            assert!(
                matches!(&end, TurnEnd::Finished(t) if !t.trim().is_empty()),
                "{end:?}"
            );
            run.expect_item(|i| i["kind"] == "text" && filled(&i["text"]));
            run.expect_turn_item(|t| t["isError"] == false);
            assert_eq!(run.rt.meta.status, AgentStatus::Done);
            assert!(run.rt.meta.session_id.is_some(), "a turn tells its session");
        }
        Scenario::Thinking => {
            let end = run.turn(&text()).await;
            assert!(matches!(end, TurnEnd::Finished(_)), "{end:?}");
            run.expect_item(|i| i["kind"] == "thinking" && filled(&i["text"]));
            run.expect_item(|i| i["kind"] == "text" && filled(&i["text"]));
        }
        Scenario::Approval | Scenario::PlanMode => {
            let tool = if scenario == Scenario::Approval {
                "Bash"
            } else {
                "ExitPlanMode"
            };
            run.send(&text());
            let asked = run.until("a permission", |r| r.waiting("permission")).await;
            let item = run.item(&asked).expect("the permission's card");
            assert_eq!(item["kind"], "permission");
            assert_eq!(item["toolName"], tool, "{item}");
            assert_eq!(run.rt.meta.status, AgentStatus::Waiting);
            let mut fx = Effects::default();
            run.rt
                .answer_permission_by(&asked, "allow", None, None, &mut fx)
                .unwrap();
            run.absorb(fx);
            let end = run.until_end().await;
            assert!(matches!(end, TurnEnd::Finished(_)), "{end:?}");
            assert_eq!(run.item(&asked).unwrap()["decision"], "allow");
            if scenario == Scenario::Approval {
                run.expect_item(|i| {
                    i["kind"] == "tool" && i["name"] == "Bash" && i["status"] == "ok"
                });
            }
        }
        Scenario::Edit => {
            let end = run.turn(&text()).await;
            assert!(matches!(end, TurnEnd::Finished(_)), "{end:?}");
            run.expect_item(|i| {
                i["kind"] == "tool"
                    && matches!(i["name"].as_str(), Some("Edit" | "Write" | "MultiEdit"))
                    && i["status"] == "ok"
            });
            assert!(
                run.files_changed && !run.rt.meta.touched_files.is_empty(),
                "the file is among those the agent touched"
            );
        }
        Scenario::Question => {
            run.send(&text());
            let asked = run.until("a question", |r| r.waiting("question")).await;
            let item = run.item(&asked).expect("the question's card");
            let q = &item["questions"][0];
            let choice = q["options"][0]["label"].clone();
            assert!(filled(&q["question"]) && filled(&choice), "{item}");
            let answers = json!({ q["question"].as_str().unwrap(): choice });
            let mut fx = Effects::default();
            run.rt
                .answer_question_by(&asked, answers.clone(), None, &mut fx)
                .unwrap();
            run.absorb(fx);
            let end = run.until_end().await;
            assert!(matches!(end, TurnEnd::Finished(_)), "{end:?}");
            assert_eq!(run.item(&asked).unwrap()["answers"], answers);
        }
        Scenario::Interrupt => {
            run.send(&text());
            run.until("the turn under way", |r| {
                r.items().iter().any(|i| i["kind"] == "text").then_some(())
            })
            .await;
            // As the core does it (`Core::interrupt`).
            run.rt.interrupted = true;
            let proc = run.proc();
            proc.interrupt(false, Duration::from_secs(15))
                .await
                .unwrap();
            let end = run.until_end().await;
            assert_eq!(end, TurnEnd::Interrupted);
            run.expect_turn_item(|t| t["interrupted"] == true);
            assert_ne!(run.rt.meta.status, AgentStatus::Running);
        }
        Scenario::Subagents => {
            let end = run.turn(&text()).await;
            assert!(matches!(end, TurnEnd::Finished(_)), "{end:?}");
            run.expect_item(|i| {
                i["kind"] == "tool" && matches!(i["name"].as_str(), Some("Task" | "Agent"))
            });
            let plan = run.rt.meta.plan.clone().expect("a plan with its subagent");
            assert!(!plan.agents.is_empty() && plan.launched >= 1);
            for a in &plan.agents {
                assert_eq!(a.status, RunStatus::Done, "{}", a.title);
            }
        }
        Scenario::Limit => {
            let end = run.turn(&text()).await;
            assert_eq!(end, TurnEnd::Limited);
            assert!(
                run.limited,
                "the core is told the limit (`Effects.limited`)"
            );
            run.expect_turn_item(|t| t["limited"] == true);
        }
        Scenario::Resume => {
            run.turn(&text()).await;
            let session = run.rt.meta.session_id.clone().expect("its session");
            run.stop().await;
            assert_eq!(
                Start::of(&run.rt.meta),
                Start::Resume {
                    session: session.clone()
                }
            );
            run.respawn(target, dir).await;
            let end = run.turn(&text()).await;
            assert!(matches!(end, TurnEnd::Finished(_)), "{end:?}");
            assert_eq!(run.rt.meta.session_id.as_deref(), Some(session.as_str()));
        }
        Scenario::Fork => {
            run.turn(&text()).await;
            let session = run.rt.meta.session_id.clone().expect("its session");
            if target.engine().caps().fork == ForkPoint::Entry {
                assert!(run.rt.meta.last_entry.is_some(), "where a copy forks it");
            }
            // The copy, as `Core::fork_agent` makes it: the original's session and its last entry.
            let mut copy = meta_of(target, dir);
            copy.fork_of = Some(session.clone());
            copy.fork_at = run.rt.meta.last_entry.clone();
            run.stop().await;
            let mut forked = Run::start(target, dir, copy, scenario).await;
            let end = forked.turn(&text()).await;
            assert!(matches!(end, TurnEnd::Finished(_)), "{end:?}");
            let own = forked
                .rt
                .meta
                .session_id
                .clone()
                .expect("a session of its own");
            assert_ne!(own, session, "the copy has a session of its own");
            assert_eq!(
                forked.rt.meta.fork_of, None,
                "its next starts resume its own"
            );
            forked.stop().await;
        }
        Scenario::Quota => {
            let read = run.proc().read_usage().await.unwrap();
            let meters = crate::usage::parse_windows(&read.expect("its windows"));
            assert!(!meters.is_empty(), "no meter read");
        }
    }
    run.stop().await;
}

/// A new agent of `target` in `dir`, on its model.
fn meta_of(target: &dyn Target, dir: &Path) -> AgentMeta {
    let mut m = meta(dir);
    if let Some(model) = target.model() {
        m.model = model;
    }
    m
}

/// A new agent in `dir`.
fn meta(dir: &Path) -> AgentMeta {
    AgentMeta {
        id: crate::model::new_id(),
        cwd: dir.to_string_lossy().to_string(),
        model: "sonnet".into(),
        effort: "medium".into(),
        mode: "default".into(),
        ..Default::default()
    }
}

fn filled(v: &Value) -> bool {
    v.as_str().is_some_and(|s| !s.trim().is_empty())
}

/// What a process says, as its engine's callbacks pass it on.
enum Heard {
    Frame(Value),
    Exit,
}

/// One process of an agent, driven as the core drives it, its frames translated by its engine.
struct Run {
    engine: &'static dyn Engine,
    scenario: Scenario,
    rt: AgentRt,
    heard: mpsc::UnboundedReceiver<Heard>,
    ends: Vec<TurnEnd>,
    limited: bool,
    files_changed: bool,
    exited: bool,
}

/// How long a scenario waits for what it expects.
const PATIENCE: Duration = Duration::from_secs(60);

impl Run {
    async fn start(target: &dyn Target, dir: &Path, meta: AgentMeta, scenario: Scenario) -> Run {
        let conv = dir.join("conv");
        let (tx, heard) = mpsc::unbounded_channel();
        let mut run = Run {
            engine: target.engine(),
            scenario,
            rt: AgentRt::new(meta, &conv),
            heard,
            ends: Vec::new(),
            limited: false,
            files_changed: false,
            exited: false,
        };
        run.spawn(target, dir, tx).await;
        run
    }

    async fn spawn(&mut self, target: &dyn Target, dir: &Path, tx: mpsc::UnboundedSender<Heard>) {
        let spawn = Spawn::of(&self.rt.meta, target.program(), target.env(dir));
        let exit = tx.clone();
        let proc = self
            .engine
            .spawn(
                spawn,
                Box::new(move |frame| {
                    let _ = tx.send(Heard::Frame(frame));
                }),
                Box::new(move |_, _| {
                    let _ = exit.send(Heard::Exit);
                }),
            )
            .unwrap_or_else(|e| panic!("{}: spawn: {e:#}", self.engine.name()));
        self.rt.attach(proc.clone());
        self.exited = false;
        proc.initialize()
            .await
            .unwrap_or_else(|e| panic!("{}: initialize: {e:#}", self.engine.name()));
    }

    /// A new process for the same agent, from where it was left (`Start::of`).
    async fn respawn(&mut self, target: &dyn Target, dir: &Path) {
        let (tx, heard) = mpsc::unbounded_channel();
        self.heard = heard;
        self.spawn(target, dir, tx).await;
    }

    fn proc(&self) -> Process {
        self.rt.proc.clone().expect("a live process")
    }

    /// Sends `text`, as `Core::deliver` does.
    fn send(&mut self, text: &str) {
        let message = self.engine.message(text, &[]).unwrap();
        let uid = uuid::Uuid::new_v4().to_string();
        self.proc().send_message(&uid, &message).unwrap();
        let mut fx = Effects::default();
        self.rt.push_user(&uid, text, 0, &[], &mut fx);
        self.absorb(fx);
    }

    /// Sends `text` and waits for the end of its turn.
    async fn turn(&mut self, text: &str) -> TurnEnd {
        self.send(text);
        self.until_end().await
    }

    async fn until_end(&mut self) -> TurnEnd {
        let before = self.ends.len();
        self.until("the end of the turn", |r| r.ends.get(before).cloned())
            .await
    }

    /// Translates what the process says until `pred` gives something.
    async fn until<T>(&mut self, what: &str, pred: impl Fn(&mut Run) -> Option<T>) -> T {
        let scenario = self.scenario;
        let deadline = Instant::now() + PATIENCE;
        loop {
            if let Some(v) = pred(self) {
                return v;
            }
            let left = deadline.saturating_duration_since(Instant::now());
            match tokio::time::timeout(left, self.heard.recv()).await {
                Ok(Some(Heard::Frame(frame))) => {
                    let mut fx = Effects::default();
                    self.engine.translate(&mut self.rt, &frame, &mut fx);
                    self.absorb(fx);
                }
                Ok(Some(Heard::Exit)) | Ok(None) if !self.exited => {
                    self.exited = true;
                }
                Ok(_) | Err(_) => panic!(
                    "{}, {scenario:?}: no {what} ({}); the conversation: {:#}",
                    self.engine.name(),
                    if self.exited {
                        "the process is gone"
                    } else {
                        "nothing more within the time"
                    },
                    Value::Array(self.items())
                ),
            }
        }
    }

    fn absorb(&mut self, fx: Effects) {
        if let Some(end) = fx.turn_end {
            self.ends.push(end);
        }
        self.limited |= fx.limited.is_some();
        self.files_changed |= fx.files_changed;
    }

    fn items(&mut self) -> Vec<Value> {
        self.rt.conv.items()
    }

    fn item(&mut self, id: &str) -> Option<Value> {
        self.rt.conv.get(id).cloned()
    }

    /// The request of kind `kind` (`permission`, `question`) waiting for an answer, if any.
    fn waiting(&mut self, kind: &str) -> Option<String> {
        self.rt
            .waiting_views()
            .find(|v| (v.kind == "question") == (kind == "question"))
            .map(|v| v.id.clone())
    }

    fn expect_item(&mut self, pred: impl Fn(&Value) -> bool) {
        let items = self.items();
        assert!(
            items.iter().any(&pred),
            "{}, {:?}: no such item in {:#}",
            self.engine.name(),
            self.scenario,
            Value::Array(items)
        );
    }

    fn expect_turn_item(&mut self, pred: impl Fn(&Value) -> bool) {
        let items = self.items();
        let last = items.iter().rev().find(|i| i["kind"] == "turn");
        assert!(
            last.is_some_and(&pred),
            "{}, {:?}: the turn's item is {last:?}",
            self.engine.name(),
            self.scenario
        );
    }

    /// Stops the process gently, as an idle agent is stopped (`AgentRt::detach`), and waits for it.
    async fn stop(&mut self) {
        if let Some(p) = self.rt.detach() {
            p.close_input();
            if !p.wait_exit(Duration::from_secs(10)).await {
                p.kill();
            }
        }
    }
}

/// A folder of its own for a bench run.
pub(crate) fn bench_dir(name: &str) -> PathBuf {
    crate::paths::test_dir(name)
}
