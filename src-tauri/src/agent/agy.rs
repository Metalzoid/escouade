//! Antigravity CLI's events (`agy -p`, stream-json, docs/TODO-1.8.md, point 0, « Antigravity CLI »)
//! translated into the agent's conversation: the engine `Agy` hands them here (`Engine::translate`).
//!
//! `agy` tells its turn step by step (`step_update`: `user_input`, `agent_response` with the deltas
//! of its text, `tool` and `subagent` with their call, each `ACTIVE` then `DONE` or `ERROR`). They
//! are put in ACP's form, which Cursor's translation reads (`agent/cursor.rs`):
//! - its text is `agent_message_chunk`, its reasoning (read by the process in its transcript)
//!   `agent_thought_chunk`;
//! - a call is `tool_call` then `tool_call_update`, named by its step (`engine::agy::call_id`), its
//!   kind and input as `engine::agy::acp_call` says, a write's diff from its arguments;
//! - its process's own frames (`escouade.*`, the permissions and questions it asks once the turn is
//!   over, the plan of the mode `plan`) go as they are, Cursor's translation reading them so.
//! - its tokens are its steps' (`usage`), told with the end of the turn; it tells no cost.
//!
//! A recorded stream (`tests/fixtures/agy/`, the events as `agy` wrote them) is read as it came: its
//! `init` opens the session, its `result` ends the turn.

use super::*;
use crate::engine::agy::{acp_call, call_id, diff_of};

/// What the translation keeps of Antigravity's conversation between its events (not saved).
#[derive(Default)]
pub(crate) struct AgyState {
    /// The tokens of the turn told so far (a turn that asked the user goes on after its answers).
    input: u64,
    output: u64,
    cached: u64,
    /// The calls its interface's transcript told and did not run yet (« Vue Antigravity »), by
    /// their id: their tool and arguments, for their end.
    pub(super) tui_calls: std::collections::HashMap<String, (String, Value)>,
}

impl AgentRt {
    /// One event of `agy`, or a frame of its process (`escouade.*`, its requests).
    pub(crate) fn agy_frame(&mut self, f: &Value, fx: &mut Effects) {
        if let Some(event) = f.get("event").and_then(Value::as_str) {
            self.agy_event(event, f, fx);
            return;
        }
        let p = &f["params"];
        match f["method"].as_str().unwrap_or_default() {
            "escouade.spent" => self.ag_spent(&p["usage"]),
            "escouade.prompt_end" => {
                self.ag_spent(&p["usage"]);
                self.ag_turn_spent();
                self.cursor_frame(f, fx);
            }
            crate::engine::agy::PLAN_REQUEST => {
                self.ag_spent(&f["usage"]);
                // The plan is whole: what comes once it is approved is another text.
                self.cu_close("", fx);
                let frame = json!({ "method": "cursor/create_plan", "id": f["id"], "params": { "plan": p["plan"] } });
                self.cursor_frame(&frame, fx);
            }
            _ => self.cursor_frame(f, fx),
        }
    }

    /// Tokens of the turn.
    fn ag_spent(&mut self, u: &Value) {
        let n = |k: &str| u[k].as_u64().unwrap_or(0);
        self.agy.input += n("input");
        self.agy.output += n("output");
        self.agy.cached += n("cached");
    }

    /// The turn over: its tokens, for its card and the stats (no cost: `agy` tells none).
    fn ag_turn_spent(&mut self) {
        let s = std::mem::take(&mut self.agy);
        let model = if self.meta.model.is_empty() {
            crate::engine::agy::DEFAULT.to_string()
        } else {
            self.meta.model.clone()
        };
        self.cursor.spent = Some(TurnRow {
            engine: self.meta.engine,
            model,
            input: s.input.saturating_sub(s.cached),
            cache: s.cached,
            output: s.output,
            cost: 0.0,
        });
    }

    /// An event of `agy`'s stream.
    fn agy_event(&mut self, event: &str, f: &Value, fx: &mut Effects) {
        match event {
            // A recorded stream: the conversation it opened.
            "init" => {
                let opened = json!({ "method": "escouade.session", "params": {
                    "sessionId": f["conversation_id"], "start": "recorded",
                } });
                self.cursor_frame(&opened, fx);
            }
            // A recorded stream: its turn's end.
            "result" => {
                let r = &f["result"];
                let u = &r["usage"];
                let mut params = json!({
                    "sessionId": r["conversation_id"], "stopReason": "end_turn",
                    "usage": {
                        "input": u["input_tokens"], "cached": u["cache_read_tokens"],
                        "output": u["output_tokens"].as_u64().unwrap_or(0) + u["thinking_tokens"].as_u64().unwrap_or(0),
                    },
                });
                if r["status"] == "ERROR" {
                    params["error"] = r["error"].clone();
                }
                let end = json!({ "method": "escouade.prompt_end", "params": params });
                self.agy_frame(&end, fx);
            }
            "step_update" => self.ag_step(&f["step_update"], fx),
            _ => {}
        }
    }

    /// One step of the turn, in ACP's form.
    fn ag_step(&mut self, s: &Value, fx: &mut Effects) {
        let Some(session) = self
            .meta
            .session_id
            .clone()
            .or_else(|| s["conversation_id"].as_str().map(str::to_string))
        else {
            return;
        };
        let update = |u: Value| json!({ "method": "session/update", "params": { "sessionId": session, "update": u } });
        let state = s["state"].as_str().unwrap_or_default();
        match s["step_type"].as_str().unwrap_or_default() {
            // A turn under way (a recorded stream's, which tells no message sent).
            "user_input" => {
                let start = json!({ "method": "escouade.prompt_start", "params": { "sessionId": session } });
                self.cursor_frame(&start, fx);
            }
            "agent_response" => {
                if let Some(th) = s["escouade"]["thinking"].as_str() {
                    let chunk = json!({ "sessionUpdate": "agent_thought_chunk", "content": { "type": "text", "text": th } });
                    self.cursor_frame(&update(chunk), fx);
                    self.cu_close("", fx);
                }
                let delta = s["text_delta"].as_str().unwrap_or_default();
                // The `DONE` of a text ends it with a line break alone.
                if !(delta.is_empty() || (state == "DONE" && delta.trim().is_empty())) {
                    let chunk = json!({ "sessionUpdate": "agent_message_chunk", "content": { "type": "text", "text": delta } });
                    self.cursor_frame(&update(chunk), fx);
                }
                // Each step's text an item of its own.
                if state == "DONE" {
                    self.cu_close("", fx);
                }
            }
            "tool" | "subagent" => {
                let Some(step) = s["step_index"].as_u64() else {
                    return;
                };
                let id = call_id(&session, step);
                let name = s["tool_name"].as_str().unwrap_or_default();
                let args = match &s["escouade"]["args"] {
                    a if a.is_object() => a.clone(),
                    _ => s["tool_info"]["parameters"].clone(),
                };
                let mut call = acp_call(name, &args);
                call["toolCallId"] = json!(id);
                if !self.conv.contains(&id) {
                    let mut start = call.clone();
                    start["sessionUpdate"] = json!("tool_call");
                    start["status"] = json!("pending");
                    if let Some(o) = start.as_object_mut() {
                        o.remove("content");
                    }
                    self.cursor_frame(&update(start), fx);
                }
                if state == "ACTIVE" {
                    return;
                }
                let failed = state == "ERROR";
                let info = &s["tool_info"];
                let said = if failed {
                    info["error"]["message"]
                        .as_str()
                        .unwrap_or("error")
                        .to_string()
                } else if let Some(sub) = s["subagent_info"]["subagents"].as_array() {
                    sub.iter()
                        .filter_map(|a| a["initial_prompt"].as_str())
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    info["output"].as_str().unwrap_or_default().to_string()
                };
                let mut end = call;
                end["sessionUpdate"] = json!("tool_call_update");
                end["status"] = json!(if failed { "failed" } else { "completed" });
                end["rawOutput"] = output(&end["kind"], &said, failed);
                // An end that tells no call (a subagent's): its start's input kept.
                if !args.is_object() {
                    if let Some(o) = end.as_object_mut() {
                        o.remove("rawInput");
                    }
                }
                // A write whose text `agy` did not tell (a recorded stream): written, its diff unknown.
                if !failed && end["kind"] == "edit" && diff_of(name, &args).is_none() {
                    if let Some(path) = crate::engine::agy::path_of(&args) {
                        end["content"] =
                            json!([{ "type": "diff", "path": path, "oldText": "", "newText": "" }]);
                    }
                }
                self.cursor_frame(&update(end), fx);
            }
            _ => {}
        }
    }
}

/// What a call of `kind` said, as Cursor's translation reads it: a command's output and code
/// (`Command exited with code 0.\n\nCommand output:\n…`), its refusal on its error.
pub(super) fn output(kind: &Value, said: &str, failed: bool) -> Value {
    if kind != "execute" {
        return json!({ "content": said });
    }
    if failed {
        return json!({ "stderr": said, "content": said });
    }
    // In its interface's transcript, after the times it ran (`Created At: …`).
    let code = said
        .split_once("Command exited with code ")
        .and_then(|(_, r)| r.split(['.', ' ']).next())
        .and_then(|c| c.parse::<i64>().ok());
    let text = said
        .split_once("Command output:\n")
        .map_or(said, |(_, o)| o)
        .trim_end();
    json!({ "stdout": text, "content": text, "exitCode": code })
}

#[cfg(test)]
#[path = "agy_tests.rs"]
mod tests;
