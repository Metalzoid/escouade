//! « Vue Gemini »: the agent's conversation as Gemini CLI's own interface (`gemini`, in a terminal,
//! `engine/gemini/terminal.rs`) tells it by its hooks (`escouade-hook <event>`, its payload as its
//! code builds it, 0.66.0): its log, which writes a message anew each time it changes, is not read.
//!
//! - `SessionStart` (`session_id`): the session it runs, the agent's from then on;
//! - `BeforeAgent` (`prompt`): the user's message, a turn starts; a turn it did not end (Escape, an
//!   error: no hook then) is over, interrupted;
//! - `BeforeTool` / `AfterTool` (`tool_name`, `tool_input`, `tool_response`, `mcp_context`): a call
//!   and its end, put in ACP's form for Cursor's translation, named by Escouade in their order;
//! - `Notification` (`ToolPermission`): a permission waits for the user in its interface;
//! - `AfterAgent` (`prompt_response`): the end of the turn, its whole answer.

use super::*;

/// What the hooks of its interface keep between them: the calls started, not ended yet.
#[derive(Default)]
pub(crate) struct GeminiTuiState {
    /// Each call started (`BeforeTool`), its id, tool and input, until its `AfterTool`.
    calls: Vec<(String, String, Value)>,
}

/// A path of Gemini's tools' input.
fn path_in(input: &Value) -> Option<&str> {
    ["file_path", "absolute_path", "dir_path", "path"]
        .iter()
        .find_map(|k| input[*k].as_str())
}

/// A call of Gemini's tool `name` (its `input`; `mcp`: its server's context, for an MCP tool) in
/// ACP's form, as Cursor's translation reads it.
pub(crate) fn acp_call(name: &str, input: &Value, mcp: &Value) -> Value {
    let path = path_in(input);
    let (kind, raw) = if mcp.is_object() {
        (
            "other",
            json!({
                "providerIdentifier": mcp["server_name"], "toolName": mcp["tool_name"].as_str().unwrap_or(name),
                "args": input,
            }),
        )
    } else {
        match name {
            "run_shell_command" => ("execute", json!({ "command": input["command"] })),
            "write_file" | "replace" => ("edit", json!({ "path": path })),
            "read_file" | "read_many_files" => ("read", json!({ "path": path })),
            "list_directory" | "glob" | "grep_search" | "search_file_content" => (
                "search",
                json!({ "pattern": input["pattern"].as_str().unwrap_or_default(), "path": path }),
            ),
            "web_fetch" | "google_web_search" => (
                "fetch",
                json!({ "url": input["url"].as_str().or(input["query"].as_str()).or(input["prompt"].as_str()) }),
            ),
            "invoke_agent" => (
                "other",
                json!({
                    "_toolName": "task",
                    "description": input["agent_name"].as_str().unwrap_or("subagent"),
                    "prompt": input["prompt"].as_str().or(input["query"].as_str()),
                    "subagentType": input["agent_name"],
                }),
            ),
            _ => {
                let mut raw = if input.is_object() {
                    input.clone()
                } else {
                    json!({})
                };
                raw["_toolName"] = json!(name);
                ("other", raw)
            }
        }
    };
    let mut call = json!({ "kind": kind, "title": name, "rawInput": raw });
    let diff = match (name, path) {
        ("write_file", Some(p)) => input["content"]
            .as_str()
            .map(|t| json!({ "type": "diff", "path": p, "oldText": null, "newText": t })),
        ("replace", Some(p)) => {
            match (input["old_string"].as_str(), input["new_string"].as_str()) {
                (Some(o), Some(n)) => {
                    Some(json!({ "type": "diff", "path": p, "oldText": o, "newText": n }))
                }
                _ => None,
            }
        }
        _ => None,
    };
    if let Some(d) = diff {
        call["content"] = json!([d]);
    }
    call
}

/// What a call answered (`tool_response`: its `llmContent`, a text or parts, else what it showed),
/// and whether it failed.
fn response_text(r: &Value) -> (String, bool) {
    let failed = !r["error"].is_null() && r.get("error").is_some();
    let text = match &r["llmContent"] {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|p| p["text"].as_str().or(p.as_str()))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => r["returnDisplay"].as_str().unwrap_or_default().to_string(),
    };
    let text = if failed && text.is_empty() {
        r["error"]["message"]
            .as_str()
            .or(r["error"].as_str())
            .unwrap_or("error")
            .to_string()
    } else {
        text
    };
    (text, failed)
}

impl AgentRt {
    /// Its turn stopped by Escape: no hook tells it, it ends here.
    pub(crate) fn gemini_interrupted(&mut self, fx: &mut Effects) {
        if self.meta.status.is_active() && self.tui_prompt.is_some() {
            self.interrupted = true;
            self.cursor_tui_end(fx);
        }
        self.gemini_tui.calls.clear();
    }

    /// One of the hooks its Gemini interface runs (`escouade-hook <event>`).
    pub(crate) fn gemini_hook(&mut self, h: &Value, fx: &mut Effects) -> HookOutcome {
        let mut out = HookOutcome::default();
        if let Some(run) = self.tui.as_mut() {
            run.spoke = true;
        }
        if let Some(sid) = h["session_id"].as_str().filter(|s| !s.is_empty()) {
            if self.meta.session_id.as_deref() != Some(sid) {
                // A session of its own (`/clear`, `/resume`): the conversation goes on there.
                if self.meta.session_id.is_some() {
                    self.reset_plan(fx);
                    self.notice(
                        "info",
                        tr!(
                            "Nouvelle session Gemini (contexte vidé)",
                            "New Gemini session (context cleared)"
                        ),
                        fx,
                    );
                }
                self.meta.session_id = Some(sid.to_string());
                self.meta.last_entry = None;
                self.meta.fork_of = None;
                self.meta.fork_at = None;
                fx.save = true;
            }
            self.unwritten_session = None;
        }
        let event = h[crate::tui::EVENT_KEY]
            .as_str()
            .or(h["hook_event_name"].as_str())
            .unwrap_or_default();
        let session = self.meta.session_id.clone().unwrap_or_default();
        let forward = |u: Value| json!({ "method": "session/update", "params": { "sessionId": session, "update": u } });
        match event {
            "BeforeAgent" => {
                // A turn it ended without a word (Escape typed there, an error): over, interrupted.
                self.gemini_interrupted(fx);
                let text = h["prompt"].as_str().unwrap_or_default().trim().to_string();
                if !text.is_empty() {
                    self.cursor_typed(text, fx);
                }
            }
            "BeforeTool" => {
                if !self.meta.status.is_active() {
                    self.set_status(AgentStatus::Running, fx);
                }
                let name = h["tool_name"].as_str().unwrap_or_default().to_string();
                let input = h["tool_input"].clone();
                let id = format!("gemini-tui-{}", new_id());
                let mut call = acp_call(&name, &input, &h["mcp_context"]);
                call["toolCallId"] = json!(id);
                call["sessionUpdate"] = json!("tool_call");
                call["status"] = json!("pending");
                self.cu_close("", fx);
                self.cursor_frame(&forward(call), fx);
                self.gemini_tui.calls.push((id, name, input));
            }
            "AfterTool" => {
                let name = h["tool_name"].as_str().unwrap_or_default();
                let input = &h["tool_input"];
                let at = self
                    .gemini_tui
                    .calls
                    .iter()
                    .position(|(_, n, i)| n == name && i == input)
                    .or_else(|| self.gemini_tui.calls.iter().position(|(_, n, _)| n == name));
                if let Some(at) = at {
                    let (id, name, input) = self.gemini_tui.calls.remove(at);
                    if self.meta.status == AgentStatus::Waiting {
                        self.set_status(AgentStatus::Running, fx);
                    }
                    let (said, failed) = response_text(&h["tool_response"]);
                    let mut end = acp_call(&name, &input, &h["mcp_context"]);
                    end["sessionUpdate"] = json!("tool_call_update");
                    end["toolCallId"] = json!(id);
                    end["status"] = json!(if failed { "failed" } else { "completed" });
                    end["rawOutput"] = super::agy::output(&end["kind"], &said, failed);
                    if end["kind"] == "execute" && !failed {
                        end["rawOutput"] = json!({ "stdout": said, "content": said });
                    }
                    self.cursor_frame(&forward(end), fx);
                }
            }
            "Notification" if h["notification_type"] == "ToolPermission" => {
                let said = h["message"].as_str().unwrap_or_default().to_string();
                self.tui_wait(said, fx);
            }
            "AfterAgent" => {
                let text = h["prompt_response"].as_str().unwrap_or_default();
                if !text.trim().is_empty() {
                    self.cu_write(None, "text", text, fx);
                    self.cu_close("", fx);
                }
                self.gemini_tui.calls.clear();
                self.cursor_tui_end(fx);
                out.stopped = true;
            }
            _ => {}
        }
        fx.agent_changed = true;
        out
    }
}

#[cfg(test)]
#[path = "gemini_tui_tests.rs"]
mod tests;
