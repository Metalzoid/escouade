//! « Vue Vibe »: the agent's conversation as Mistral Vibe's own interface (`vibe`, in a terminal)
//! writes it in the journal of its session's store (`logs/session/unified/<id>/journal/
//! <sequence>.jsonl` of the agent's `VIBE_HOME`, `engine/vibe/terminal.rs`), read as it is
//! written (`tui`), and what its hooks tell.
//!
//! A line of the journal is a record; those Escouade reads are its `projection_delta`, the changes
//! of the session's public state (`harness.public-session-state/v1`, as `vibe-app-server` sends
//! them), tried on 3.0.3 (`tests/fixtures/vibe/tui-journal.jsonl`):
//! - `append_entry` / `replace_entry` of an entry of its history: the user's message (`message`,
//!   `role: user`), the agent's (`role: assistant`, whole), a tool (`effect`, `detail.kind: tool`,
//!   `in_progress` then replaced `completed`), its reasoning and its notices (not shown);
//! - `set_envelope`: the state of the session, its `latestTurn` (`in_progress`, then `completed`,
//!   `interrupted` or `failed`, the session `idle`) and the callbacks it waits on
//!   (`activeCallbacks`).
//!
//! And its `callback_registered` / `callback_resolved`: a permission or a question it waits on,
//! answered in its interface (the callback in `payload.routing`), then answered.
//!
//! Its hooks (`pre_tool`, `post_tool`, `post_agent`) tell the session of the interface: a new one
//! (its interface started with none) is the agent's from then on, its journal read from its start.

use super::*;
use std::path::Path;

/// The tools of Vibe shown otherwise (its question, its tasks) or not at all (its search of tools).
const UNSHOWN: [&str; 3] = ["ask_user_question", "todo", "search_tool_functions"];

/// A tool of its journal (`file_system.bash`, `read_file`, `mcp_escouade.get_board`…) under the
/// name Claude Code gives it, its input as Escouade shows it; None for a tool not shown.
pub(super) fn journal_tool(name: &str, input: &Value, cwd: &str) -> Option<(String, Value)> {
    if let Some(rest) = name.strip_prefix("mcp_") {
        if let Some((server, tool)) = rest.split_once('.') {
            return Some((format!("mcp__{server}__{tool}"), input.clone()));
        }
    }
    let bare = name.rsplit('.').next().unwrap_or(name);
    if UNSHOWN.contains(&bare) {
        return None;
    }
    // Its file, as its tools name it (`file_path`, `filePath` in its public state), from the agent's folder.
    let file = ["file_path", "filePath", "path"]
        .iter()
        .find_map(|k| input[*k].as_str())
        .map(|p| json!(opencode::absolute(p, cwd)))
        .unwrap_or(Value::Null);
    Some(match bare {
        "bash" | "git_bash" | "powershell" | "windows_shell" => {
            ("Bash".into(), json!({ "command": input["command"] }))
        }
        "read_file" => ("Read".into(), json!({ "file_path": file.clone() })),
        "write_file" => ("Write".into(), json!({ "file_path": file.clone() })),
        "edit" | "search_replace" => ("Edit".into(), json!({ "file_path": file.clone() })),
        "grep" => (
            "Grep".into(),
            json!({ "pattern": input["pattern"], "path": input["path"] }),
        ),
        "web_fetch" => ("WebFetch".into(), json!({ "url": input["url"] })),
        "web_search" => ("WebSearch".into(), json!({ "query": input["query"] })),
        "task" | "spawn" => (
            "Task".into(),
            json!({ "description": input["task"], "prompt": input["task"], "subagent_type": input["agent"] }),
        ),
        _ => (bare.to_string(), input.clone()),
    })
}

/// The texts of an entry's `content` blocks, joined.
fn content_text(entry: &Value) -> String {
    entry["content"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|b| b["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n\n")
}

impl AgentRt {
    /// One record of the journal its Vibe interface writes.
    pub(crate) fn vibe_log(&mut self, record: &Value, fx: &mut Effects) {
        // Written since it started: it is up.
        if let Some(run) = self.tui.as_mut() {
            run.spoke = true;
        }
        match record["type"].as_str() {
            Some("projection_delta") => {}
            // A permission or a question it waits on, answered in its interface.
            Some("callback_registered") => {
                self.vibe_wait(&record["payload"]["routing"], fx);
                fx.agent_changed = true;
                return;
            }
            Some("callback_resolved") => {
                if self.meta.status == AgentStatus::Waiting {
                    self.set_status(AgentStatus::Running, fx);
                }
                fx.agent_changed = true;
                return;
            }
            _ => return,
        }
        for d in record["payload"]["delta"].as_array().into_iter().flatten() {
            match d["op"].as_str() {
                Some("append_entry" | "replace_entry") => self.vibe_entry(&d["entry"], fx),
                Some("set_envelope") => self.vibe_envelope(&d["state"], fx),
                _ => {}
            }
        }
        fx.agent_changed = true;
    }

    /// An entry of its history, added or replaced.
    fn vibe_entry(&mut self, e: &Value, fx: &mut Effects) {
        let Some(id) = e["id"].as_str() else {
            return;
        };
        match (e["type"].as_str(), e["role"].as_str()) {
            (Some("message"), Some("user")) if !self.conv.contains(id) => {
                let text = content_text(e);
                if !text.trim().is_empty() {
                    self.vibe_typed(id, text, fx);
                }
            }
            (Some("message"), Some("assistant")) if !self.conv.contains(id) => {
                let text = content_text(e);
                if text.trim().is_empty() || e["outcome"]["type"] == "discarded" {
                    return;
                }
                if !self.meta.status.is_active() {
                    self.set_status(AgentStatus::Running, fx);
                }
                self.cu_write(None, "text", &text, fx);
                self.cu_close("", fx);
            }
            (Some("effect"), _) if e["detail"]["kind"] == "tool" => self.vibe_tool(id, e, fx),
            _ => {}
        }
    }

    /// A tool of its interface: shown as it starts, its end patched in.
    fn vibe_tool(&mut self, id: &str, e: &Value, fx: &mut Effects) {
        let detail = &e["detail"];
        let name = detail["toolName"].as_str().unwrap_or("?");
        let Some((name, input)) = journal_tool(name, &detail["input"], &self.meta.cwd) else {
            return;
        };
        let state = &e["state"];
        let done = e["generationStatus"] == "completed" || state["status"] == "completed";
        let failed = state["display"]["success"] == false
            || matches!(
                state["decision"].as_str(),
                Some("deny" | "denied" | "reject")
            );
        let status = match (done, failed) {
            (false, _) => "running",
            (true, false) => "ok",
            (true, true) => "error",
        };
        if self.conv.contains(id) {
            self.patch(id, json!({ "status": status }), fx);
            return;
        }
        if !self.meta.status.is_active() {
            self.set_status(AgentStatus::Running, fx);
        }
        self.cu_close("", fx);
        self.final_text.clear();
        let activity = tool_activity(&name, &input, &self.meta.cwd);
        self.set_activity(activity, fx);
        let item = json!({
            "kind": "tool", "id": id, "name": name, "input": item_input(&name, &input),
            "status": status, "parent": null, "ts": now_ms(),
        });
        self.append(item, fx);
    }

    /// The state of its session: what it waits on, and the end of its turn.
    fn vibe_envelope(&mut self, state: &Value, fx: &mut Effects) {
        let open: Vec<&Value> = state["activeCallbacks"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|c| c["state"]["status"].as_str().is_none_or(|s| s == "open"))
            .collect();
        if let Some(c) = open.first() {
            self.vibe_wait(c, fx);
            return;
        }
        if self.meta.status == AgentStatus::Waiting {
            self.set_status(AgentStatus::Running, fx);
        }
        let turn = &state["latestTurn"];
        let idle = state["session"]["status"]["type"] == "idle";
        let id = turn["id"].as_str().map(str::to_string);
        // A turn already ended (a segment read again) does not start again.
        if id.is_some() && id == self.vibe.tui_ended {
            return;
        }
        match turn["status"].as_str() {
            Some("in_progress") if !self.meta.status.is_active() => {
                self.set_status(AgentStatus::Running, fx);
            }
            Some(end @ ("completed" | "interrupted" | "failed")) if idle => {
                if !self.meta.status.is_active() {
                    return;
                }
                match end {
                    "interrupted" => self.interrupted = true,
                    "failed" => {
                        let error = turn["error"]["message"].as_str().unwrap_or(end);
                        self.cursor.error = Some(error.to_string());
                    }
                    _ => {}
                }
                self.vibe.tui_ended = id;
                self.cursor_tui_end(fx);
            }
            _ => {}
        }
    }

    /// A callback it waits on (`callback`: a permission, `detail.kind: approval`, or a question,
    /// `user_input`): the card says it waits, and what for.
    fn vibe_wait(&mut self, c: &Value, fx: &mut Effects) {
        let detail = &c["detail"];
        let body = match detail["kind"].as_str() {
            Some("approval") => {
                let effect = &detail["effect"];
                let tool = effect["toolName"].as_str().unwrap_or_default();
                match journal_tool(tool, &effect["input"], &self.meta.cwd) {
                    Some((name, input)) => notify::permission_body(&name, &input, &self.meta.cwd),
                    None => c["title"].as_str().unwrap_or_default().to_string(),
                }
            }
            _ => detail["request"]["questions"][0]["question"]
                .as_str()
                .or(c["title"].as_str())
                .unwrap_or_default()
                .to_string(),
        };
        if !self.meta.status.is_active() {
            self.set_status(AgentStatus::Running, fx);
        }
        self.tui_wait(body, fx);
    }

    /// What the user typed in the interface (or Escouade pasted there): their message, a turn
    /// starts.
    fn vibe_typed(&mut self, id: &str, text: String, fx: &mut Effects) {
        self.unwritten_session = None;
        let item = json!({
            "kind": "user", "id": id, "text": text, "images": 0, "ts": now_ms(),
            "queued": false, "origin": "terminal",
        });
        self.meta.resume_at = None;
        self.append(item, fx);
        if self.tui_prompt.is_none() {
            self.turn_text.clear();
            self.final_text.clear();
            self.interrupted = false;
            if self.meta.plan.as_ref().is_some_and(PlanState::is_finished) {
                self.reset_plan(fx);
            }
        }
        if !self.meta.status.is_active() {
            self.set_status(AgentStatus::Running, fx);
        }
        self.meta.prompts += 1;
        self.meta.last_activity = now_ms();
        self.tui_prompt = Some(text);
        fx.agent_changed = true;
        fx.save = true;
    }

    /// One of the hooks its Vibe interface runs (`escouade-hook`): the session it is in.
    pub(crate) fn vibe_hook(&mut self, h: &Value, fx: &mut Effects) -> HookOutcome {
        let mut out = HookOutcome::default();
        if let Some(run) = self.tui.as_mut() {
            run.spoke = true;
        }
        // A subagent's hooks name its own session.
        if !h["parent_session_id"].is_null() {
            return out;
        }
        let Some(sid) = h["session_id"].as_str().filter(|s| !s.is_empty()) else {
            return out;
        };
        if self.meta.session_id.as_deref() == Some(sid) {
            return out;
        }
        // A session of its own (its interface started with none, or `/new`): its journal is read
        // from its start.
        if self.meta.session_id.is_some() {
            self.reset_plan(fx);
            self.notice(
                "info",
                tr!(
                    "Nouvelle conversation Vibe (contexte vidé)",
                    "New Vibe conversation (context cleared)"
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
        fx.agent_changed = true;
        out.transcript = h["transcript_path"]
            .as_str()
            .and_then(|dir| crate::engine::vibe::terminal::latest_segment(Path::new(dir)))
            .map(|p| p.to_string_lossy().into_owned());
        out
    }
}

#[cfg(test)]
#[path = "vibe_tui_tests.rs"]
mod tests;
