//! « Vue Cursor »: the agent's conversation as Cursor's own interface (`agent`, in a terminal)
//! writes it in its transcript (`~/.cursor/projects/<folder>/agent-transcripts/<id>/<id>.jsonl`,
//! `engine/cursor/terminal.rs`), read as it is written (`tui`).
//!
//! A line is a message (`{role, message: {content}}`), the user's (its text wrapped in
//! `<timestamp>` and `<user_query>`) or the agent's (its texts, and its tools as `tool_use`, their
//! results never written), or the end of a turn (`{type: "turn_ended", status}`: `success`,
//! `aborted` when stopped by Ctrl+C, `error`). Tried on 2026.10.22 (`tests/fixtures/cursor/
//! transcript-tui.jsonl`, `transcript-print.jsonl`). Nothing says that a permission or a question
//! waits for the user, nor tokens: the view says what Escouade does not know.

use super::*;

/// The text the user typed, out of what the interface wrapped it in.
pub(super) fn typed_text(text: &str) -> String {
    let mut t = text.trim();
    if let Some(rest) = t.strip_prefix("<timestamp>") {
        t = rest
            .split_once("</timestamp>")
            .map_or(rest, |(_, r)| r)
            .trim();
    }
    if let Some(rest) = t.strip_prefix("<user_query>") {
        t = rest.strip_suffix("</user_query>").unwrap_or(rest);
    }
    t.trim().to_string()
}

/// A tool of the interface under the name Claude Code gives it, its input as Escouade shows it.
pub(super) fn tui_tool(name: &str, input: &Value) -> (String, Value) {
    let path = input["path"].clone();
    match name {
        "Shell" => (
            "Bash".into(),
            json!({ "command": input["command"], "description": input["description"] }),
        ),
        "Read" => ("Read".into(), json!({ "file_path": path })),
        "Write" => ("Write".into(), json!({ "file_path": path })),
        "StrReplace" | "Edit" | "MultiEdit" => ("Edit".into(), json!({ "file_path": path })),
        "Delete" => ("Delete".into(), json!({ "file_path": path })),
        "Grep" => (
            "Grep".into(),
            json!({ "pattern": input["pattern"], "path": path }),
        ),
        "Glob" => (
            "Glob".into(),
            json!({ "pattern": input["glob_pattern"].as_str().or(input["pattern"].as_str()) }),
        ),
        "WebFetch" => ("WebFetch".into(), json!({ "url": input["url"] })),
        "Task" => ("Task".into(), input.clone()),
        _ => (name.to_string(), input.clone()),
    }
}

impl AgentRt {
    /// One line of the transcript its Cursor interface writes.
    pub(crate) fn cursor_log(&mut self, e: &Value, fx: &mut Effects) {
        // Written since it started: it is past its question about the folder.
        if let Some(run) = self.tui.as_mut() {
            run.spoke = true;
        }
        if e["type"] == "turn_ended" {
            if !self.meta.status.is_active() {
                return;
            }
            match e["status"].as_str() {
                Some("aborted") => self.interrupted = true,
                Some("success") | None => {}
                Some(other) => {
                    let error = e["error"].as_str().unwrap_or(other);
                    self.cursor.error = Some(error.to_string());
                }
            }
            self.cursor_tui_end(fx);
            return;
        }
        let blocks = e["message"]["content"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        match e["role"].as_str() {
            Some("user") => {
                let text: Vec<String> = blocks
                    .iter()
                    .filter_map(|b| b["text"].as_str())
                    .map(typed_text)
                    .filter(|t| !t.is_empty())
                    .collect();
                if !text.is_empty() {
                    self.cursor_typed(text.join("\n\n"), fx);
                }
            }
            Some("assistant") => {
                if !self.meta.status.is_active() {
                    self.set_status(AgentStatus::Running, fx);
                }
                for b in &blocks {
                    match b["type"].as_str() {
                        Some("text") => {
                            let text = b["text"].as_str().unwrap_or_default();
                            if !text.trim().is_empty() {
                                self.cu_write(None, "text", text, fx);
                                self.cu_close("", fx);
                            }
                        }
                        Some("tool_use") => {
                            let (name, input) =
                                tui_tool(b["name"].as_str().unwrap_or("?"), &b["input"]);
                            self.final_text.clear();
                            let activity = tool_activity(&name, &input, &self.meta.cwd);
                            self.set_activity(activity, fx);
                            // Its result is never written: shown as done, with nothing to show.
                            let item = json!({
                                "kind": "tool", "id": new_id(), "name": name,
                                "input": item_input(&name, &input), "status": "ok",
                                "parent": null, "ts": now_ms(),
                            });
                            self.append(item, fx);
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
        fx.agent_changed = true;
    }

    /// What the user typed in the interface (or Escouade pasted there): their message, a turn
    /// starts.
    fn cursor_typed(&mut self, text: String, fx: &mut Effects) {
        self.unwritten_session = None;
        let item = json!({
            "kind": "user", "id": new_id(), "text": text, "images": 0, "ts": now_ms(),
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

    /// The running turn of its Cursor interface is over: its `turn_ended`, or its interface gone.
    pub(super) fn cursor_tui_end(&mut self, fx: &mut Effects) {
        if !self.meta.status.is_active() {
            return;
        }
        self.cu_turn_end(fx);
        self.tui_prompt = None;
    }
}

#[cfg(test)]
#[path = "cursor_tui_tests.rs"]
mod tests;
