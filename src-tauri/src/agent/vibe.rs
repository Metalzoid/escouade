//! Mistral Vibe's updates (`vibe-acp`, ACP v1, docs/TODO-1.8.md, point 0, « Mistral Vibe ») translated
//! into the agent's conversation: the engine `Vibe` hands them here (`Engine::translate`).
//!
//! Both speak ACP: what Vibe says is put in the form Cursor's translation reads (`agent/cursor.rs`),
//! which does the rest. What differs:
//! - its own tools are named in `_meta.tool_name`: `agents.spawn` is a subagent (`Task`), a tool of
//!   an MCP server is `mcp_<server>.<tool>`, its task list (`vibe.todo`) is told by `plan` and its
//!   question (`ui.ask_user_question`) by `elicitation/create`, both left out as calls, as its
//!   search of tools (`search_tool_functions`);
//! - its files are named from the agent's folder (`b.txt`): made absolute;
//! - its permission names its call alone: the call as its `tool_call` told it is put back in it;
//! - a write's diff is in its `tool_call`: kept for its result;
//! - its questions are a form (`elicitation/create`), shown as Cursor's `cursor/ask_question`;
//! - the plan of Escouade's mode Plan (`escouade/plan`, its process's own) is the card « Plan à
//!   approuver », as Cursor's `cursor/create_plan`;
//! - its mode is set by Escouade alone: its `current_mode_update` is not read (its agent `ask` is
//!   Escouade's « Demander » and « Plan » both).
//!
//! A recorded stream (`tests/fixtures/vibe/`, one `{"dir": "in" | "out", "msg"}` a line) is read as
//! it came, the history `session/load` replays left out as the process leaves it out.

use super::*;

/// What the translation keeps of Vibe's conversation between its updates (not saved).
#[derive(Default)]
pub(crate) struct VibeState {
    /// The calls as their `tool_call` told them, put in Cursor's form: what a permission and a
    /// result need of them.
    calls: HashMap<String, Value>,
    /// A recorded stream: the `session/load` under way (its request's id), whose replay is left
    /// out; and the forms asked, by their request, for the answers recorded.
    loading: Option<Value>,
    forms: HashMap<String, Value>,
}

/// The tools of Vibe shown otherwise than as calls (or not at all).
const UNSHOWN: [&str; 3] = ["ui.ask_user_question", "vibe.todo", "search_tool_functions"];

/// The MCP server and tool of Vibe's name for it (`mcp_escouade.get_board`).
fn mcp_tool(name: &str) -> Option<(&str, &str)> {
    name.strip_prefix("mcp_")?.split_once('.')
}

/// Vibe's call `u` (a `tool_call` or `tool_call_update`) in the form Cursor's translation reads, in
/// the agent's folder `cwd`; None for a tool shown otherwise.
pub(super) fn normalized(u: &Value, cwd: &str) -> Option<Value> {
    let tool = u["_meta"]["tool_name"].as_str().unwrap_or_default();
    if UNSHOWN.contains(&tool) {
        return None;
    }
    let mut n = u.clone();
    let raw = &u["rawInput"];
    if tool == "agents.spawn" {
        n["kind"] = json!("other");
        if raw.is_object() {
            n["rawInput"] = json!({
                "_toolName": "task", "description": raw["task"], "prompt": raw["task"],
                "subagentType": raw["agent"],
            });
        }
    } else if let Some((server, name)) = mcp_tool(tool) {
        if raw.is_object() {
            n["rawInput"] =
                json!({ "providerIdentifier": server, "toolName": name, "args": raw.clone() });
        }
    } else if !tool.is_empty()
        && !matches!(
            u["kind"].as_str(),
            Some("execute" | "edit" | "read" | "search" | "fetch" | "delete" | "think")
        )
        && raw.is_object()
    {
        // Its own tool (`skill`, `run_typescript`, `cron`…), shown by its name.
        n["rawInput"]["_toolName"] = json!(tool);
    }
    // Its files named from the agent's folder.
    if let Some(content) = n["content"].as_array_mut() {
        for c in content.iter_mut().filter(|c| c["type"] == "diff") {
            if let Some(p) = c["path"].as_str() {
                c["path"] = json!(opencode::absolute(p, cwd));
            }
        }
    }
    // A command's code (`returncode`), as Cursor's (`exitCode`).
    if let Some(code) = n["rawOutput"]["returncode"].as_i64() {
        n["rawOutput"]["exitCode"] = json!(code);
    }
    Some(n)
}

/// The first diff of a call's `content`.
fn diff_in(content: &Value) -> Option<&Value> {
    content.as_array()?.iter().find(|c| c["type"] == "diff")
}

/// Vibe's form (`elicitation/create`) as Cursor's `cursor/ask_question`.
fn as_question(p: &Value) -> Value {
    let questions: Vec<Value> = crate::engine::vibe::elicitation_questions(p)
        .into_iter()
        .map(|(key, q)| {
            let options: Vec<Value> = q["options"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|o| json!({ "id": o["label"], "label": o["label"] }))
                .collect();
            json!({
                "id": key, "prompt": q["question"], "options": options,
                "allowMultiple": q["multiSelect"],
            })
        })
        .collect();
    json!({ "toolCallId": p["toolCallId"], "questions": questions })
}

impl AgentRt {
    /// One message of its `vibe-acp`, or of the process itself (`escouade.*`).
    pub(crate) fn vibe_frame(&mut self, f: &Value, fx: &mut Effects) {
        if let Some(dir) = f.get("dir").and_then(Value::as_str) {
            self.vibe_recorded(dir, &f["msg"], fx);
            return;
        }
        let p = &f["params"];
        match f["method"].as_str().unwrap_or_default() {
            "session/update" => self.vb_update(p, fx),
            "session/request_permission" => {
                let mut params = p.clone();
                let call = p["toolCall"]["toolCallId"].as_str().unwrap_or_default();
                // The call as its `tool_call` told it (the process put it back live; a recorded
                // stream has it here only).
                if let Some(known) = self.vibe.calls.get(call) {
                    let mut tc = known.clone();
                    for (k, v) in p["toolCall"].as_object().into_iter().flatten() {
                        if tc.get(k).is_none_or(Value::is_null) {
                            tc[k] = v.clone();
                        }
                    }
                    params["toolCall"] = tc;
                } else if let Some(n) = normalized(&p["toolCall"], &self.meta.cwd) {
                    params["toolCall"] = n;
                }
                let frame = json!({ "method": "session/request_permission", "id": f["id"], "params": params });
                self.cursor_frame(&frame, fx);
            }
            "elicitation/create" => {
                if let Some(rid) = f["id"].as_str() {
                    self.vibe.forms.insert(rid.to_string(), p.clone());
                }
                let frame = json!({ "method": "cursor/ask_question", "id": f["id"], "params": as_question(p) });
                self.cursor_frame(&frame, fx);
            }
            crate::engine::vibe::PLAN_REQUEST => {
                // The plan written is whole: what comes once it is approved is another text.
                self.cu_close("", fx);
                let frame = json!({ "method": "cursor/create_plan", "id": f["id"], "params": { "plan": p["plan"] } });
                self.cursor_frame(&frame, fx);
            }
            _ => self.cursor_frame(f, fx),
        }
    }

    /// One update of its session.
    fn vb_update(&mut self, p: &Value, fx: &mut Effects) {
        let u = &p["update"];
        let forward = |u: Value| json!({ "method": "session/update", "params": { "sessionId": p["sessionId"], "update": u } });
        match u["sessionUpdate"].as_str().unwrap_or_default() {
            "tool_call" => {
                let Some(id) = u["toolCallId"].as_str() else {
                    return;
                };
                let Some(n) = normalized(u, &self.meta.cwd) else {
                    return;
                };
                self.vibe.calls.insert(id.to_string(), n.clone());
                self.cursor_frame(&forward(n.clone()), fx);
                // A call told once it is over (its search of tools, a hook's refusal).
                if matches!(n["status"].as_str(), Some("completed" | "failed")) {
                    let mut end = n;
                    end["sessionUpdate"] = json!("tool_call_update");
                    self.cursor_frame(&forward(end), fx);
                }
            }
            "tool_call_update" => {
                let Some(id) = u["toolCallId"].as_str() else {
                    return;
                };
                let known = self.vibe.calls.get(id).cloned();
                let mut whole = u.clone();
                if whole["_meta"]["tool_name"].is_null() {
                    if let Some(k) = &known {
                        whole["_meta"] = k["_meta"].clone();
                    }
                }
                let Some(mut n) = normalized(&whole, &self.meta.cwd) else {
                    return;
                };
                // A write's diff, told by its `tool_call` only.
                let done = n["status"] == "completed";
                if done && diff_in(&n["content"]).is_none() {
                    if let Some(d) = known.as_ref().and_then(|k| diff_in(&k["content"])).cloned() {
                        match n["content"].as_array_mut() {
                            Some(list) => list.insert(0, d),
                            None => n["content"] = json!([d]),
                        }
                    }
                }
                if done || n["status"] == "failed" {
                    self.vibe.calls.remove(id);
                }
                self.cursor_frame(&forward(n), fx);
            }
            // Its mode is Escouade's to set (`ask` is « Demander » and « Plan » both); its usage comes
            // with ESC-267; the invite it echoes is the conversation's already.
            "current_mode_update" | "usage_update" | "user_message_chunk" => {}
            _ => self.cursor_frame(&forward(u.clone()), fx),
        }
    }

    /// A line of a recorded stream, read as the process would pass it on.
    fn vibe_recorded(&mut self, dir: &str, msg: &Value, fx: &mut Effects) {
        match dir {
            "out" if msg["method"] == "session/load" => {
                self.vibe.loading = Some(msg["id"].clone());
                let opened = json!({ "method": "escouade.session", "params": {
                    "sessionId": msg["params"]["sessionId"], "start": "recorded",
                } });
                self.vibe_frame(&opened, fx);
            }
            // The trial's answer to a permission: its card says it.
            "out" if msg["method"].is_null() && msg["result"]["outcome"].is_object() => {
                let rid = format!("recorded-{}", msg["id"]);
                if let Some(req) = self.take_pending(&rid) {
                    let decision = match msg["result"]["outcome"]["optionId"].as_str() {
                        Some(o) if o.starts_with("allow_always") => "always",
                        Some(o) if o.starts_with("allow") => "allow",
                        _ => "deny",
                    };
                    self.patch(&req.item_id, json!({ "decision": decision }), fx);
                    self.after_answer(fx);
                }
            }
            // The trial's answer to a question: its card says it, by question.
            "out" if msg["method"].is_null() && msg["result"]["action"].is_string() => {
                let rid = format!("recorded-{}", msg["id"]);
                let form = self.vibe.forms.remove(&rid).unwrap_or_default();
                if let Some(req) = self.take_pending(&rid) {
                    let mut answers = serde_json::Map::new();
                    for (key, q) in crate::engine::vibe::elicitation_questions(&form) {
                        let given = &msg["result"]["content"][&key];
                        let text = match given.as_array() {
                            Some(list) => list
                                .iter()
                                .filter_map(Value::as_str)
                                .collect::<Vec<_>>()
                                .join(", "),
                            None => given.as_str().unwrap_or_default().to_string(),
                        };
                        let question = q["question"].as_str().unwrap_or_default().to_string();
                        answers.insert(question, json!(text));
                    }
                    self.patch(&req.item_id, json!({ "answers": answers }), fx);
                    self.after_answer(fx);
                }
            }
            "out" if msg["method"] == "session/prompt" => {
                let text = msg["params"]["prompt"][0]["text"]
                    .as_str()
                    .unwrap_or_default();
                let id = new_id();
                self.push_user_from(&id, text, 0, &[], None, fx);
            }
            "in" => {
                let loading = self.vibe.loading.clone();
                if let Some(load) = loading {
                    if msg["method"].is_null() && msg["id"] == load {
                        self.vibe.loading = None;
                    }
                    return;
                }
                if let Some(id) = msg["result"]["sessionId"].as_str() {
                    let opened = json!({ "method": "escouade.session", "params": {
                        "sessionId": id, "start": "recorded",
                    } });
                    self.vibe_frame(&opened, fx);
                } else if msg["result"]["stopReason"].is_string() {
                    let end = json!({ "method": "escouade.prompt_end", "params": msg["result"] });
                    self.vibe_frame(&end, fx);
                } else if msg["error"].is_object() && !msg["id"].is_null() {
                    // A prompt refused (an API key refused, say).
                    let end = json!({ "method": "escouade.prompt_end", "params": {
                        "error": msg["error"]["message"],
                    } });
                    self.vibe_frame(&end, fx);
                } else if msg["method"].is_string() {
                    let mut m = msg.clone();
                    if !msg["id"].is_null() {
                        m["id"] = json!(format!("recorded-{}", msg["id"]));
                    }
                    self.vibe_frame(&m, fx);
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
#[path = "vibe_tests.rs"]
mod tests;
