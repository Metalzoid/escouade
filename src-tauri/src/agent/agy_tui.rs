//! « Vue Antigravity »: the agent's conversation as Antigravity CLI's own interface (`agy`, in a
//! terminal) writes it in its transcript (`brain/<id>/.system_generated/logs/transcript_full.jsonl`
//! of the agent's home, `engine/agy/terminal.rs`), read as it is written (`tui`), and what its hooks
//! tell.
//!
//! A line of the transcript is a step once written, tried on 1.4.9 (`tests/fixtures/agy/
//! tui-transcript-*.jsonl`): `USER_INPUT` (the user's message, in `<USER_REQUEST>`), `PLANNER_RESPONSE`
//! (the model's text `content`, its calls `tool_calls`, its reasoning `thinking`), `GENERIC` (the run
//! of a call: the steps after its answer, one a call, `DONE` or `ERROR`), `SYSTEM_MESSAGE` (not
//! shown). Its calls are put in ACP's form, as those of its `-p` stream (`agent/agy.rs`), named by
//! the step of their run. An answer without a call ends the turn: the last one, or the text it had
//! written when Escape stopped it (no hook then).
//!
//! Its hooks (`escouade-hook <event>`): `SessionStart` tells a new conversation (its interface
//! started with none, its transcript then read from its start); `Stop` the end of its loop (an
//! error's too). Nothing tells that a permission waits for the user in
//! its interface: only a question it asks (`ask_question`, from its transcript).

use super::*;
use crate::engine::agy::{acp_call, call_id, diff_of, path_of};

/// The text the user typed, out of what the interface wrapped it in (`<USER_REQUEST>`, followed by
/// its metadata).
pub(super) fn typed_text(content: &str) -> String {
    match content.split_once("<USER_REQUEST>") {
        Some((_, rest)) => rest
            .split_once("</USER_REQUEST>")
            .map_or(rest, |(t, _)| t)
            .trim()
            .to_string(),
        None => content.trim().to_string(),
    }
}

impl AgentRt {
    /// One step of the transcript its Antigravity interface writes.
    pub(crate) fn agy_log(&mut self, e: &Value, fx: &mut Effects) {
        // Written since it started: it is up.
        if let Some(run) = self.tui.as_mut() {
            run.spoke = true;
        }
        let Some(step) = e["step_index"].as_u64() else {
            return;
        };
        match (e["type"].as_str(), e["source"].as_str()) {
            (Some("USER_INPUT"), Some("USER_EXPLICIT")) => {
                let text = typed_text(e["content"].as_str().unwrap_or_default());
                if !text.is_empty() {
                    self.cursor_typed(text, fx);
                }
            }
            (Some("PLANNER_RESPONSE"), _) => self.agy_answer(step, e, fx),
            (Some("GENERIC"), _) => self.agy_run(step, e, fx),
            _ => return,
        }
        fx.agent_changed = true;
    }

    /// The session of the transcript read, the agent's.
    fn agy_session(&self) -> String {
        self.meta.session_id.clone().unwrap_or_default()
    }

    /// An answer of the model: its text, its calls (each run in the steps that follow it); with no
    /// call, the end of its turn.
    fn agy_answer(&mut self, step: u64, e: &Value, fx: &mut Effects) {
        if !self.meta.status.is_active() {
            self.set_status(AgentStatus::Running, fx);
        }
        let text = e["content"].as_str().unwrap_or_default();
        if !text.trim().is_empty() {
            self.cu_write(None, "text", text, fx);
            self.cu_close("", fx);
        }
        let calls = e["tool_calls"].as_array().cloned().unwrap_or_default();
        let session = self.agy_session();
        for (i, c) in calls.iter().enumerate() {
            let id = call_id(&session, step + 1 + i as u64);
            if self.conv.contains(&id) {
                continue;
            }
            let name = c["name"].as_str().unwrap_or_default();
            self.agy
                .tui_calls
                .insert(id.clone(), (name.to_string(), c["args"].clone()));
            let mut call = acp_call(name, &c["args"]);
            call["toolCallId"] = json!(id);
            call["sessionUpdate"] = json!("tool_call");
            call["status"] = json!("pending");
            let update = json!({ "method": "session/update", "params": { "sessionId": session, "update": call } });
            self.cursor_frame(&update, fx);
            // Its question waits for the user's answer in the interface.
            if name == "ask_question" {
                let question = c["args"]["questions"][0]["question"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
                self.tui_wait(question, fx);
            }
        }
        if calls.is_empty() && !text.trim().is_empty() {
            self.cursor_tui_end(fx);
        }
    }

    /// The run of a call (the step `step`), done or failed.
    fn agy_run(&mut self, step: u64, e: &Value, fx: &mut Effects) {
        let session = self.agy_session();
        let id = call_id(&session, step);
        if !self.conv.contains(&id) {
            return;
        }
        if self.meta.status == AgentStatus::Waiting {
            self.set_status(AgentStatus::Running, fx);
        }
        let failed = e["status"] == "ERROR";
        let said = if failed {
            e["error"].as_str().unwrap_or("error")
        } else {
            e["content"].as_str().unwrap_or_default()
        };
        // Its call as its start told it (a write's diff, from its arguments); a call told before the
        // view opened: its end alone.
        let mut end = match self.agy.tui_calls.remove(&id) {
            Some((name, args)) => {
                let mut call = acp_call(&name, &args);
                // A write whose text it did not tell: written, its diff unknown.
                if !failed && call["kind"] == "edit" && diff_of(&name, &args).is_none() {
                    if let Some(path) = path_of(&args) {
                        call["content"] =
                            json!([{ "type": "diff", "path": path, "oldText": "", "newText": "" }]);
                    }
                }
                call
            }
            None => json!({ "kind": "other" }),
        };
        end["sessionUpdate"] = json!("tool_call_update");
        end["toolCallId"] = json!(id);
        end["status"] = json!(if failed { "failed" } else { "completed" });
        end["rawOutput"] = super::agy::output(&end["kind"], said, failed);
        let update = json!({ "method": "session/update", "params": { "sessionId": session, "update": end } });
        self.cursor_frame(&update, fx);
    }

    /// One of the hooks its Antigravity interface runs (`escouade-hook <event>`).
    pub(crate) fn agy_hook(&mut self, h: &Value, fx: &mut Effects) -> HookOutcome {
        let mut out = HookOutcome::default();
        if let Some(run) = self.tui.as_mut() {
            run.spoke = true;
        }
        if let Some(sid) = h["conversationId"].as_str().filter(|s| !s.is_empty()) {
            if self.meta.session_id.as_deref() != Some(sid) {
                // A conversation of its own (its interface started with none, or `/clear`): its
                // transcript is read from its start.
                if self.meta.session_id.is_some() {
                    self.reset_plan(fx);
                    self.notice(
                        "info",
                        tr!(
                            "Nouvelle conversation Antigravity (contexte vidé)",
                            "New Antigravity conversation (context cleared)"
                        ),
                        fx,
                    );
                }
                self.meta.session_id = Some(sid.to_string());
                self.meta.last_entry = None;
                self.meta.fork_of = None;
                self.meta.fork_at = None;
                self.unwritten_session = None;
                fx.save = true;
                out.transcript = h["transcriptPath"].as_str().map(str::to_string);
            }
        }
        match h[crate::tui::EVENT_KEY].as_str().unwrap_or_default() {
            "PreToolUse" => {
                if !self.meta.status.is_active() {
                    self.set_status(AgentStatus::Running, fx);
                }
            }
            "PostToolUse" => {
                if self.meta.status == AgentStatus::Waiting {
                    self.set_status(AgentStatus::Running, fx);
                }
            }
            "Stop" => {
                match h["terminationReason"].as_str() {
                    Some("USER_CANCELED") => self.interrupted = true,
                    Some("ERROR") => {
                        let error = h["error"].as_str().filter(|e| !e.is_empty());
                        self.cursor.error = Some(error.unwrap_or("error").to_string());
                    }
                    _ => {}
                }
                out.stopped = true;
            }
            _ => {}
        }
        fx.agent_changed = true;
        out
    }
}

#[cfg(test)]
#[path = "agy_tui_tests.rs"]
mod tests;
