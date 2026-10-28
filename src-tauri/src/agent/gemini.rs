//! Gemini CLI's updates (`gemini --acp`, ACP v1, docs/TODO-1.8.md, point 0, « Gemini CLI »)
//! translated into the agent's conversation: the engine `Gemini` hands them here
//! (`Engine::translate`).
//!
//! Both speak ACP: what Gemini says is put in the form Cursor's translation reads
//! (`agent/cursor.rs`), which does the rest. What differs:
//! - its calls tell no input (`rawInput`): their tool is the start of their id
//!   (`run_shell_command__…`), a command is their title, a file their `locations` or diff, a tool
//!   of an MCP server their title (« get_board (escouade MCP Server) »), a subagent their title
//!   (« Delegating to agent 'generalist' », a `think` Cursor's translation would leave out);
//! - its files are named from the agent's folder in a replay: made absolute;
//! - the permission of its `exit_plan_mode` is the card « Plan à approuver » (its process gave it
//!   the plan, read from its file), as Cursor's `cursor/create_plan`;
//! - its change of mode is a text (« [MODE_UPDATE] plan »), the process's `escouade.mode` live;
//! - its tokens come with the end of its prompt (`usage`): it tells no cost; a 429 ends the turn
//!   « limité », its resume planned a minute later.
//!
//! A recorded stream (`tests/fixtures/gemini/`, one message a line with its `dir`, `c2s` or `s2c`)
//! is read as it came: the history `session/load` replays (until the next prompt) left out, as the
//! process leaves it out.

use super::*;

/// What the translation keeps of Gemini's conversation between its updates (not saved).
#[derive(Default)]
pub(crate) struct GeminiState {
    /// The tokens of the turn told so far (a turn that asked a question goes on after its answers).
    input: u64,
    cached: u64,
    output: u64,
    /// A recorded stream: a `session/load` was asked, its replay left out until the next prompt.
    loading: bool,
}

/// The tools of Gemini shown otherwise than as calls (or not at all): its topic of the turn, the
/// end of its mode Plan (its card).
const UNSHOWN: [&str; 2] = ["update_topic", "exit_plan_mode"];

/// How long after a rate limit (429) the agent goes on: Gemini tells no reset, and its limits are
/// by the minute (and by the day).
pub(crate) const RATE_RESUME_MS: i64 = 60_000;

/// The tool of a call of Gemini, the start of its id (`run_shell_command__run_shell_command_…`).
fn tool_name(id: &str) -> &str {
    id.split_once("__").map_or("", |(name, _)| name)
}

/// The tool and server of an MCP call's title (« get_board (escouade MCP Server) »).
fn mcp_title(title: &str) -> Option<(&str, &str)> {
    let (tool, rest) = title.split_once(" (")?;
    let server = rest.strip_suffix(" MCP Server)")?;
    Some((tool.trim(), server.trim()))
}

/// The subagent of a call's title (« Delegating to agent 'generalist' »).
fn subagent_title(title: &str) -> Option<&str> {
    title
        .strip_prefix("Delegating to agent ")
        .map(|a| a.trim().trim_matches(['\'', '"']))
}

/// Gemini's call `u` (a `tool_call` or `tool_call_update`) in the form Cursor's translation reads,
/// in the agent's folder `cwd`; None for a tool shown otherwise.
pub(super) fn normalized(u: &Value, cwd: &str) -> Option<Value> {
    let id = u["toolCallId"].as_str().unwrap_or_default();
    let tool = tool_name(id);
    if UNSHOWN.contains(&tool) {
        return None;
    }
    let mut n = u.clone();
    let title = u["title"].as_str().unwrap_or_default();
    if n["rawInput"].is_null() {
        if tool.starts_with("mcp_") {
            if let Some((name, server)) = mcp_title(title) {
                n["rawInput"] =
                    json!({ "providerIdentifier": server, "toolName": name, "args": {} });
            }
        } else if tool == "invoke_agent" || u["kind"] == "think" {
            // A subagent: Cursor's `think` is left out of the thread, its `task` is not.
            n["kind"] = json!("other");
            if !title.is_empty() {
                let agent = subagent_title(title).unwrap_or(title);
                n["rawInput"] = json!({
                    "_toolName": "task", "description": agent, "prompt": title, "subagentType": agent,
                });
            }
        } else if !tool.is_empty()
            && !matches!(
                u["kind"].as_str(),
                Some("execute" | "edit" | "read" | "search" | "fetch" | "delete")
            )
        {
            // Its own tool (`enter_plan_mode`, `activate_skill`…), shown by its name.
            if u.get("kind").is_some() || u["sessionUpdate"] == "tool_call" {
                n["rawInput"] = json!({ "_toolName": tool, "reason": title });
            }
        }
    } else if n["kind"] == "think" && tool == "invoke_agent" {
        n["kind"] = json!("other");
    }
    // Its files named from the agent's folder.
    if let Some(content) = n["content"].as_array_mut() {
        for c in content.iter_mut().filter(|c| c["type"] == "diff") {
            if let Some(p) = c["path"].as_str() {
                c["path"] = json!(opencode::absolute(p, cwd));
            }
        }
    }
    if let Some(list) = n["locations"].as_array_mut() {
        for l in list.iter_mut() {
            if let Some(p) = l["path"].as_str() {
                l["path"] = json!(opencode::absolute(p, cwd));
            }
        }
    }
    Some(n)
}

impl AgentRt {
    /// One message of its `gemini --acp`, or of the process itself (`escouade.*`).
    pub(crate) fn gemini_frame(&mut self, f: &Value, fx: &mut Effects) {
        if let Some(dir) = f.get("dir").and_then(Value::as_str) {
            self.gemini_recorded(dir, f, fx);
            return;
        }
        let p = &f["params"];
        match f["method"].as_str().unwrap_or_default() {
            "session/update" => self.gm_update(p, fx),
            "session/request_permission" => {
                let tc = &p["toolCall"];
                let call = tc["toolCallId"].as_str().unwrap_or_default();
                if crate::engine::gemini::is_plan_exit(call) {
                    // The plan written is whole: what comes once it is approved is another text.
                    self.cu_close("", fx);
                    let plan = p["plan"].as_str().map(str::to_string).unwrap_or_else(|| {
                        tc["title"]
                            .as_str()
                            .and_then(crate::engine::gemini::plan_file)
                            .unwrap_or_default()
                            .to_string()
                    });
                    let frame = json!({ "method": "cursor/create_plan", "id": f["id"], "params": { "plan": plan } });
                    self.cursor_frame(&frame, fx);
                    return;
                }
                let mut params = p.clone();
                if let Some(n) = normalized(tc, &self.meta.cwd) {
                    params["toolCall"] = n;
                }
                let frame = json!({ "method": "session/request_permission", "id": f["id"], "params": params });
                self.cursor_frame(&frame, fx);
            }
            // Its question ends its text: what comes once it is answered is another one.
            "cursor/ask_question" => {
                self.cu_close("", fx);
                self.cursor_frame(f, fx);
            }
            "escouade.spent" => self.gm_spent(&p["usage"]),
            "escouade.prompt_end" => {
                self.gm_spent(&p["usage"]);
                self.gm_turn_spent();
                let mut f = f.clone();
                if p["code"].as_i64() == Some(429) {
                    self.cursor.limited_until = Some(now_ms() + RATE_RESUME_MS);
                    f["params"]["error"] = json!(rate_limited(i18n::ui(), p["error"].as_str()));
                }
                self.cursor_frame(&f, fx);
            }
            _ => self.cursor_frame(f, fx),
        }
    }

    /// Tokens of the turn (`usage` of a prompt's answer).
    fn gm_spent(&mut self, u: &Value) {
        let n = |k: &str| u[k].as_u64().unwrap_or(0);
        self.gemini.input += n("inputTokens");
        self.gemini.cached += n("cachedReadTokens");
        self.gemini.output += n("outputTokens") + n("thoughtTokens");
    }

    /// The turn over: its tokens, for its card and the stats (no cost: Gemini tells none).
    fn gm_turn_spent(&mut self) {
        let input = std::mem::take(&mut self.gemini.input);
        let cached = std::mem::take(&mut self.gemini.cached);
        let output = std::mem::take(&mut self.gemini.output);
        let model = if self.meta.model.is_empty() {
            crate::engine::gemini::DEFAULT.to_string()
        } else {
            self.meta.model.clone()
        };
        self.cursor.spent = Some(TurnRow {
            engine: self.meta.engine,
            model,
            input: input.saturating_sub(cached),
            cache: cached,
            output,
            cost: 0.0,
        });
    }

    /// One update of its session.
    fn gm_update(&mut self, p: &Value, fx: &mut Effects) {
        let u = &p["update"];
        let forward = |u: Value| json!({ "method": "session/update", "params": { "sessionId": p["sessionId"], "update": u } });
        match u["sessionUpdate"].as_str().unwrap_or_default() {
            "tool_call" => {
                let Some(n) = normalized(u, &self.meta.cwd) else {
                    return;
                };
                self.cursor_frame(&forward(n.clone()), fx);
                // A call told once it is over (a rule's refusal, a replay).
                if matches!(n["status"].as_str(), Some("completed" | "failed")) {
                    let mut end = n;
                    end["sessionUpdate"] = json!("tool_call_update");
                    self.cursor_frame(&forward(end), fx);
                }
            }
            "tool_call_update" => {
                let Some(n) = normalized(u, &self.meta.cwd) else {
                    return;
                };
                let id = n["toolCallId"].as_str().map(str::to_string);
                // A call refused by its rules is told by its end alone.
                if id.as_deref().is_some_and(|id| !self.conv.contains(id)) {
                    let mut start = n.clone();
                    start["sessionUpdate"] = json!("tool_call");
                    self.cursor_frame(&forward(start), fx);
                }
                self.cursor_frame(&forward(n), fx);
            }
            "agent_message_chunk" => {
                let text = u["content"]["text"].as_str().unwrap_or_default();
                // Its change of mode, a text of its own (a recorded stream's: live, the process
                // tells it).
                if let Some(mode) = crate::engine::gemini::mode_update(text) {
                    let frame = json!({ "method": "escouade.mode", "params": { "mode": mode } });
                    self.cursor_frame(&frame, fx);
                    return;
                }
                self.cursor_frame(&forward(u.clone()), fx);
            }
            // The invite is the conversation's already; its context window, the commands of its
            // interface: not shown.
            "user_message_chunk" | "usage_update" | "available_commands_update" => {}
            _ => self.cursor_frame(&forward(u.clone()), fx),
        }
    }

    /// A line of a recorded stream (`{dir, …the message}`), read as the process would pass it on.
    fn gemini_recorded(&mut self, dir: &str, line: &Value, fx: &mut Effects) {
        let mut msg = line.clone();
        if let Some(o) = msg.as_object_mut() {
            o.remove("dir");
        }
        match dir {
            "c2s" if msg["method"] == "session/load" => {
                self.gemini.loading = true;
                let opened = json!({ "method": "escouade.session", "params": {
                    "sessionId": msg["params"]["sessionId"], "start": "recorded",
                } });
                self.cursor_frame(&opened, fx);
            }
            "c2s" if msg["method"] == "session/prompt" => {
                self.gemini.loading = false;
                let text = msg["params"]["prompt"][0]["text"]
                    .as_str()
                    .unwrap_or_default();
                let id = new_id();
                self.push_user_from(&id, text, 0, &[], None, fx);
            }
            // The trial's answer to a permission: its card says it.
            "c2s" if msg["method"].is_null() && msg["result"]["outcome"].is_object() => {
                let rid = format!("recorded-{}", msg["id"]);
                if let Some(req) = self.take_pending(&rid) {
                    let decision = match msg["result"]["outcome"]["optionId"].as_str() {
                        Some(o) if o.starts_with("proceed_always") => "always",
                        Some(o) if o.starts_with("proceed") => "allow",
                        _ => "deny",
                    };
                    self.patch(&req.item_id, json!({ "decision": decision }), fx);
                    self.after_answer(fx);
                }
            }
            "s2c" => {
                if self.gemini.loading {
                    return;
                }
                if let Some(id) = msg["result"]["sessionId"].as_str() {
                    let opened = json!({ "method": "escouade.session", "params": {
                        "sessionId": id, "start": "recorded",
                    } });
                    self.cursor_frame(&opened, fx);
                } else if msg["result"]["stopReason"].is_string() {
                    let end = json!({ "method": "escouade.prompt_end", "params": msg["result"] });
                    self.gemini_frame(&end, fx);
                } else if msg["error"].is_object() && !msg["id"].is_null() {
                    // A prompt refused (no sign-in, a rate limit, say).
                    let end = json!({ "method": "escouade.prompt_end", "params": {
                        "error": msg["error"]["message"], "code": msg["error"]["code"],
                    } });
                    self.gemini_frame(&end, fx);
                } else if msg["method"].is_string() {
                    if !msg["id"].is_null() {
                        msg["id"] = json!(format!("recorded-{}", msg["id"]));
                    }
                    self.gemini_frame(&msg, fx);
                }
            }
            _ => {}
        }
    }
}

/// What the card of a turn stopped by Gemini's rate limit says (`said`: Gemini's own words).
fn rate_limited(lang: crate::i18n::Lang, said: Option<&str>) -> String {
    let said = said.unwrap_or("Rate limit exceeded");
    tr_in!(
        lang,
        "Limite d’usage de Gemini atteinte (429) : {said}",
        "Gemini’s usage limit reached (429): {said}"
    )
}

#[cfg(test)]
#[path = "gemini_tests.rs"]
mod tests;
