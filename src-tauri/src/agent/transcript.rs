//! « Vue Claude Code »: the agent's conversation as Claude Code's own interface (its TUI, in a
//! terminal) writes it in its transcript, and what its hooks tell while it runs (`tui`).
//!
//! The transcript's `assistant` and `user` entries have the shape of the stream's frames: they go
//! through the same handlers. What the stream alone tells is made up from the rest: a turn ends
//! with its `system`/`turn_duration` entry (or the marker of an interruption), and its cost is
//! worked out from the usage of its API messages at list prices, the interface reporting none per
//! turn (`cost-state` comes when it exits).

use super::*;

/// What the core does after a hook (`AgentRt::on_hook`).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct HookOutcome {
    /// The conversation goes on in another session (`/clear`, `/resume`): its transcript is
    /// read from the start of this file.
    pub transcript: Option<String>,
    /// The turn may be over (`Stop`): the transcript is read again soon, and the turn ended if
    /// it still did not say so.
    pub stopped: bool,
}

/// The texts Claude Code writes as the user's when a turn is interrupted (also in a subagent's
/// transcript: `sidechain`).
pub(super) const INTERRUPTED: &[&str] = &[
    "[Request interrupted by user",
    "[Request interrupted by user for tool use",
];

impl AgentRt {
    /// Its Claude Code interface starts: what was counted of the one before is gone with it.
    pub fn start_tui(&mut self) {
        self.meta.last_activity = now_ms();
        self.blocks.clear();
        self.current_msg.clear();
        self.pending.clear();
        self.last_usage.clear();
        self.live.clear();
        self.tui_usage.clear();
        self.tui_error = None;
        self.forget_turn();
        self.interrupted = false;
        self.queued = 0;
        self.foreground_tasks.clear();
        self.announced_tasks.clear();
        self.interrupt_plan();
    }

    /// One entry of the transcript its Claude Code interface writes.
    pub fn on_transcript(&mut self, e: &Value, fx: &mut Effects) {
        // A subagent's entries are in files of their own; one here would be told as the agent's.
        if e["isSidechain"] == true {
            return;
        }
        match e["type"].as_str().unwrap_or("") {
            "user" => self.on_tui_user(e, fx),
            "assistant" => self.on_tui_assistant(e, fx),
            "system" => match e["subtype"].as_str().unwrap_or("") {
                "turn_duration" => self.end_tui_turn(e["durationMs"].as_u64(), fx),
                "compact_boundary" => self.handle_frame(e, fx),
                _ => {}
            },
            // « Shift+Tab » in the interface: the agent's mode is the one it shows.
            "permission-mode" => {
                if let Some(mode) = e["permissionMode"].as_str() {
                    if self.meta.mode != mode {
                        self.meta.mode = mode.to_string();
                        fx.agent_changed = true;
                        fx.save = true;
                    }
                }
            }
            _ => {}
        }
    }

    fn on_tui_user(&mut self, e: &Value, fx: &mut Effects) {
        // Claude Code's own (the caveat of a local command, a compaction's summary).
        if e["isMeta"] == true || e["isCompactSummary"] == true {
            return;
        }
        let content = &e["message"]["content"];
        let blocks = content.as_array().map(Vec::as_slice).unwrap_or_default();
        if blocks.iter().any(|b| b["type"] == "tool_result") {
            let frame = json!({
                "type": "user", "message": e["message"], "uuid": e["uuid"],
                "parent_tool_use_id": null, "tool_use_result": e["toolUseResult"],
            });
            return self.on_user(&frame, fx);
        }
        let text = match content.as_str() {
            Some(s) => s.to_string(),
            None => blocks
                .iter()
                .filter_map(|b| b["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n"),
        };
        if INTERRUPTED.iter().any(|m| text.starts_with(m)) {
            if self.meta.status.is_active() {
                self.interrupted = true;
                self.end_tui_turn(None, fx);
            }
            return;
        }
        // What a local command (`/model`, `/cost`) printed.
        if text.contains("<local-command-stdout>") || text.contains("<local-command-stderr>") {
            let frame = json!({ "type": "user", "message": { "content": text } });
            return self.on_user(&frame, fx);
        }
        // A command typed in the interface: shown as typed.
        let text = match text.split_once("<command-name>") {
            Some((_, rest)) => {
                let name = rest.split("</command-name>").next().unwrap_or("").trim();
                let args = rest
                    .split_once("<command-args>")
                    .and_then(|(_, a)| a.split("</command-args>").next())
                    .unwrap_or("")
                    .trim();
                if args.is_empty() {
                    name.to_string()
                } else {
                    format!("{name} {args}")
                }
            }
            None => text,
        };
        let kind = e["origin"]["kind"].as_str();
        if kind.is_some_and(|k| k != "human") {
            // A subagent's report, a background task that ended…: as the stream tells them.
            let frame = json!({
                "type": "user", "isReplay": true, "uuid": e["uuid"], "message": e["message"],
                "origin": e["origin"],
            });
            return self.on_replay(&frame, fx);
        }
        let images = blocks.iter().filter(|b| b["type"] == "image").count() as u32;
        if text.trim().is_empty() && images == 0 {
            return;
        }
        let id = e["uuid"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(new_id);
        if self.conv.contains(&id) {
            return;
        }
        let mut item = json!({
            "kind": "user", "id": id, "text": text, "images": images, "ts": now_ms(),
            "queued": false, "origin": "terminal",
        });
        if text.trim().is_empty() {
            item["text"] = json!("");
        }
        self.meta.resume_at = None;
        self.append(item, fx);
        if self.tui_prompt.is_none() {
            self.turn_text.clear();
            self.final_text.clear();
            self.interrupted = false;
            self.tui_error = None;
            if self.meta.plan.as_ref().is_some_and(PlanState::is_finished) {
                self.reset_plan(fx);
            }
        }
        self.set_status(AgentStatus::Running, fx);
        self.meta.prompts += 1;
        self.meta.last_activity = now_ms();
        self.tui_prompt = Some(text);
        fx.agent_changed = true;
        fx.save = true;
    }

    fn on_tui_assistant(&mut self, e: &Value, fx: &mut Effects) {
        let msg = &e["message"];
        if let (Some(mid), Some(model)) = (msg["id"].as_str(), msg["model"].as_str()) {
            // Each block of a message is an entry of its own, with the message's usage.
            if model != "<synthetic>" {
                self.main_model = model.to_string();
                self.tui_usage.insert(
                    mid.to_string(),
                    (model.to_string(), Usage::from_api(&msg["usage"])),
                );
                let u = &msg["usage"];
                self.context_tokens = [
                    &u["input_tokens"],
                    &u["cache_read_input_tokens"],
                    &u["cache_creation_input_tokens"],
                ]
                .iter()
                .filter_map(|v| v.as_u64())
                .sum();
            }
        }
        let mut frame = json!({
            "type": "assistant", "message": msg, "uuid": e["uuid"], "parent_tool_use_id": null,
        });
        if e["isApiErrorMessage"] == true {
            let error = e["error"].as_str().unwrap_or("api_error");
            frame["error"] = json!(error);
            if error == "rate_limit" {
                self.rate_limited = true;
            }
            let text = msg["content"][0]["text"].as_str().unwrap_or(error);
            self.tui_error = Some(text.to_string());
        }
        if !self.meta.status.is_active() {
            self.set_status(AgentStatus::Running, fx);
        }
        self.on_assistant(&frame, fx);
        fx.agent_changed = true;
    }

    /// The running turn of its interface is over: told as the stream's result tells it, with the
    /// usage of the process so far (cumulative, as the stream's figures are).
    pub fn end_tui_turn(&mut self, duration_ms: Option<u64>, fx: &mut Effects) {
        if !self.meta.status.is_active() {
            return;
        }
        let mut models = serde_json::Map::new();
        for (model, u) in self.tui_usage.values() {
            let entry = models.entry(model.clone()).or_insert_with(|| {
                json!({ "inputTokens": 0, "outputTokens": 0, "cacheReadInputTokens": 0,
                        "cacheCreationInputTokens": 0, "costUSD": 0.0 })
            });
            let add = |v: &mut Value, n: u64| *v = json!(v.as_u64().unwrap_or(0) + n);
            add(&mut entry["inputTokens"], u.input);
            add(&mut entry["outputTokens"], u.output);
            add(&mut entry["cacheReadInputTokens"], u.cache_read);
            add(
                &mut entry["cacheCreationInputTokens"],
                u.write_5m + u.write_1h,
            );
            let cost = entry["costUSD"].as_f64().unwrap_or(0.0)
                + pricing::estimate(model, u).unwrap_or(0.0);
            entry["costUSD"] = json!(cost);
        }
        let error = self.tui_error.take();
        let result = json!({
            "type": "result",
            "subtype": if error.is_some() { "error_during_execution" } else { "success" },
            "is_error": error.is_some(),
            "result": error,
            "duration_ms": duration_ms,
            "modelUsage": models,
        });
        self.tui_prompt = None;
        self.on_result(&result, fx);
    }

    /// One of the hooks its Claude Code interface calls (`tui::tui_settings`).
    pub fn on_hook(&mut self, h: &Value, fx: &mut Effects) -> HookOutcome {
        let mut out = HookOutcome::default();
        if let Some(sid) = h["session_id"].as_str() {
            if self.meta.session_id.as_deref() != Some(sid) {
                // `/clear`, `/resume`: another conversation, whose transcript is another file.
                self.reset_plan(fx);
                self.notice(
                    "info",
                    tr!(
                        "Nouvelle conversation Claude (contexte vidé)",
                        "New Claude conversation (context cleared)"
                    ),
                    fx,
                );
                self.meta.session_id = Some(sid.to_string());
                self.meta.last_entry = None;
                self.meta.fork_of = None;
                self.meta.fork_at = None;
                fx.save = true;
                out.transcript = h["transcript_path"].as_str().map(str::to_string);
            }
        }
        let tool = h["tool_name"].as_str().unwrap_or("");
        match h["hook_event_name"].as_str().unwrap_or("") {
            "UserPromptSubmit" => {
                if !self.meta.status.is_active() {
                    self.set_status(AgentStatus::Running, fx);
                }
            }
            "PermissionRequest" => {
                let body = notify::permission_body(tool, &h["tool_input"], &self.meta.cwd);
                self.tui_wait(body, fx);
            }
            "PreToolUse" if tool == "AskUserQuestion" => {
                let body = notify::question_body(&h["tool_input"]);
                self.tui_wait(body, fx);
            }
            "Notification" if h["notification_type"] == "elicitation_dialog" => {
                let body = h["message"].as_str().unwrap_or_default().to_string();
                self.tui_wait(body, fx);
            }
            "PostToolUse" | "PostToolUseFailure" => {
                if self.meta.status == AgentStatus::Waiting {
                    self.set_status(AgentStatus::Running, fx);
                }
            }
            "Stop" | "StopFailure" => out.stopped = true,
            _ => {}
        }
        fx.agent_changed = true;
        out
    }

    /// The interface waits for the user (a permission, a question): it is told, as the stream's
    /// requests are.
    fn tui_wait(&mut self, body: String, fx: &mut Effects) {
        if self.meta.status == AgentStatus::Waiting {
            return;
        }
        self.set_status(AgentStatus::Waiting, fx);
        fx.notify = Some(AgentAlert::new(NotifyKind::Question, body));
    }

    /// Its interface is gone: a turn it was running is over, as interrupted.
    pub fn stop_tui(&mut self, fx: &mut Effects) {
        if self.meta.status.is_active() {
            self.interrupted = true;
            self.end_tui_turn(None, fx);
        }
        self.tui = None;
        self.tui_prompt = None;
        fx.agent_changed = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TRANSCRIPT: &str = include_str!("../../../tests/fixtures/tui-transcript.jsonl");
    const HOOKS: &str = include_str!("../../../tests/fixtures/tui-hooks.jsonl");

    fn agent() -> AgentRt {
        let dir = std::env::temp_dir().join(format!("escouade-tui-{}", new_id()));
        let meta = AgentMeta {
            id: "a1".into(),
            cwd: "/work/demo".into(),
            session_id: Some("55555555-2222-3333-4444-555555555555".into()),
            ..Default::default()
        };
        let mut a = AgentRt::new(meta, &dir);
        a.start_tui();
        a
    }

    fn entries(text: &str) -> Vec<Value> {
        text.lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }

    #[test]
    fn a_real_transcript_gives_the_conversation_and_its_turns() {
        let mut a = agent();
        let mut fx = Effects::default();
        let mut turns = Vec::new();
        for e in entries(TRANSCRIPT) {
            a.on_transcript(&e, &mut fx);
            turns.extend(fx.turn_end.take());
        }
        let items = a.conv.items();
        let users: Vec<&str> = items
            .iter()
            .filter(|i| i["kind"] == "user")
            .filter_map(|i| i["text"].as_str())
            .collect();
        assert_eq!(users.len(), 3, "{users:?}");
        assert!(users[0].starts_with("Run the shell command"));
        assert!(items
            .iter()
            .all(|i| i["kind"] != "user" || i["origin"] == "terminal"));
        // The command, its result and the replies.
        let bash = items
            .iter()
            .find(|i| i["kind"] == "tool" && i["name"] == "Bash")
            .unwrap();
        assert_eq!(bash["status"], "ok");
        assert!(items.iter().any(|i| i["kind"] == "text"
            && i["text"]
                .as_str()
                .is_some_and(|t| t.to_lowercase().contains("bonjour"))));
        // Three turns ended, each counted.
        assert_eq!(turns.len(), 3);
        assert!(turns.iter().all(|t| matches!(t, TurnEnd::Finished(_))));
        assert_eq!(items.iter().filter(|i| i["kind"] == "turn").count(), 3);
        assert_eq!(a.meta.prompts, 3);
        assert_eq!(a.meta.status, AgentStatus::Done);
        assert!(a.meta.cost > 0.0 && a.meta.tokens > 0);
        // Each turn its own share: the rows sum to the agent's cost.
        let rows: f64 = fx.turns.iter().map(|t| t.cost).sum();
        assert!((rows - a.meta.cost).abs() < 1e-9);
        // The mode as the interface showed it.
        assert_eq!(a.meta.mode, "default");
    }

    #[test]
    fn the_hooks_tell_when_it_runs_waits_and_stops() {
        let mut a = agent();
        let mut fx = Effects::default();
        let mut seen = Vec::new();
        for h in entries(HOOKS) {
            let out = a.on_hook(&h, &mut fx);
            assert_eq!(out.transcript, None, "same session");
            seen.push((
                h["hook_event_name"].as_str().unwrap().to_string(),
                a.meta.status,
                fx.notify.take().map(|n| n.body),
                out.stopped,
            ));
        }
        let at = |name: &str| seen.iter().find(|s| s.0 == name).unwrap();
        assert_eq!(at("UserPromptSubmit").1, AgentStatus::Running);
        let asked = at("PermissionRequest");
        assert_eq!(asked.1, AgentStatus::Waiting);
        assert!(
            asked.2.as_deref().is_some_and(|b| b.contains("echo hi")),
            "{asked:?}"
        );
        assert_eq!(at("PostToolUse").1, AgentStatus::Running);
        assert!(at("Stop").3);
    }

    #[test]
    fn another_session_in_a_hook_is_read_from_its_own_transcript() {
        let mut a = agent();
        let mut fx = Effects::default();
        let h = json!({
            "hook_event_name": "UserPromptSubmit", "session_id": "other",
            "transcript_path": "/home/u/.claude/projects/x/other.jsonl",
        });
        let out = a.on_hook(&h, &mut fx);
        assert_eq!(
            out.transcript.as_deref(),
            Some("/home/u/.claude/projects/x/other.jsonl")
        );
        assert_eq!(a.meta.session_id.as_deref(), Some("other"));
    }

    #[test]
    fn an_interruption_ends_the_turn_as_interrupted_and_a_late_end_counts_nothing_more() {
        let mut a = agent();
        let mut fx = Effects::default();
        let user = |text: &str| {
            json!({ "type": "user", "uuid": new_id(), "origin": { "kind": "human" },
                    "message": { "role": "user", "content": text } })
        };
        a.on_transcript(&user("Count to 200"), &mut fx);
        assert_eq!(a.meta.status, AgentStatus::Running);
        a.on_transcript(&user("[Request interrupted by user]"), &mut fx);
        assert_eq!(fx.turn_end.take(), Some(TurnEnd::Interrupted));
        assert_eq!(a.meta.status, AgentStatus::Done);
        a.on_transcript(
            &json!({ "type": "system", "subtype": "turn_duration", "durationMs": 5 }),
            &mut fx,
        );
        assert_eq!(fx.turn_end, None);
        // The marker is no message of the user's.
        let users = a
            .conv
            .items()
            .iter()
            .filter(|i| i["kind"] == "user")
            .count();
        assert_eq!(users, 1);
    }

    #[test]
    fn a_command_typed_in_the_interface_shows_as_typed() {
        let mut a = agent();
        let mut fx = Effects::default();
        let e = json!({ "type": "user", "uuid": "u1", "message": { "role": "user",
            "content": "<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>opus</command-args>" } });
        a.on_transcript(&e, &mut fx);
        let item = a
            .conv
            .items()
            .into_iter()
            .find(|i| i["kind"] == "user")
            .unwrap();
        assert_eq!(item["text"], "/model opus");
        // Read again (the transcript from its start): listed once.
        a.on_transcript(&e, &mut fx);
        assert_eq!(
            a.conv
                .items()
                .iter()
                .filter(|i| i["kind"] == "user")
                .count(),
            1
        );
    }

    #[test]
    fn its_interface_gone_mid_turn_ends_the_turn() {
        let mut a = agent();
        let mut fx = Effects::default();
        a.on_hook(&json!({ "hook_event_name": "UserPromptSubmit" }), &mut fx);
        a.stop_tui(&mut fx);
        assert_eq!(fx.turn_end, Some(TurnEnd::Interrupted));
        assert!(!a.meta.status.is_active());
    }
}
