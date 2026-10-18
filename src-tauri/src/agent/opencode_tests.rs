use super::*;

/// An agent of OpenCode in `cwd`, its frames translated one by one.
fn agent(cwd: &str) -> AgentRt {
    let meta = AgentMeta {
        id: new_id(),
        cwd: cwd.into(),
        engine: EngineId::Opencode,
        model: "ollama/qwen3-coder:30b-32k".into(),
        mode: "default".into(),
        ..Default::default()
    };
    AgentRt::new(
        meta,
        &crate::paths::test_dir("esc44-oc-conv").join(new_id()),
    )
}

fn feed(rt: &mut AgentRt, frames: &[Value]) -> Vec<Effects> {
    frames
        .iter()
        .map(|f| {
            let mut fx = Effects::default();
            rt.opencode_frame(f, &mut fx);
            fx
        })
        .collect()
}

fn ev(kind: &str, props: Value) -> Value {
    json!({ "type": kind, "properties": props })
}

const S: &str = "ses_own";

fn start(rt: &mut AgentRt) {
    feed(
        rt,
        &[ev(
            "escouade.session",
            json!({ "sessionID": S, "info": { "id": S }, "start": "new" }),
        )],
    );
}

#[test]
fn an_idle_left_from_the_turn_before_does_not_end_the_next_one() {
    let mut rt = agent("C:/p");
    start(&mut rt);
    let mut fx = Effects::default();
    rt.push_user("u1", "bonjour", 0, &[], &mut fx);
    let fxs = feed(
        &mut rt,
        &[
            ev(
                "session.status",
                json!({ "sessionID": S, "status": { "type": "idle" } }),
            ),
            ev("session.idle", json!({ "sessionID": S })),
        ],
    );
    assert!(fxs.iter().all(|f| f.turn_end.is_none()));
    assert_eq!(rt.meta.status, AgentStatus::Running);
    let fxs = feed(
        &mut rt,
        &[
            ev(
                "session.status",
                json!({ "sessionID": S, "status": { "type": "busy" } }),
            ),
            ev(
                "message.updated",
                json!({ "sessionID": S, "info": { "id": "msg_a", "role": "assistant", "sessionID": S } }),
            ),
            ev(
                "message.part.updated",
                json!({ "sessionID": S, "part": {
                "id": "prt_t", "messageID": "msg_a", "sessionID": S, "type": "text", "text": "Salut", "time": { "start": 1, "end": 2 },
            } }),
            ),
            ev(
                "message.part.updated",
                json!({ "sessionID": S, "part": {
                "id": "prt_f", "messageID": "msg_a", "sessionID": S, "type": "step-finish",
                "tokens": { "input": 100, "output": 5, "reasoning": 0, "cache": { "read": 10, "write": 0 } }, "cost": 0.25,
            } }),
            ),
            ev("session.idle", json!({ "sessionID": S })),
        ],
    );
    let end = fxs.last().unwrap().turn_end.clone();
    assert_eq!(end, Some(TurnEnd::Finished("Salut".into())));
    assert_eq!(rt.meta.status, AgentStatus::Done);
    assert_eq!(rt.meta.last_entry.as_deref(), Some("msg_a"));
    assert_eq!(rt.meta.tokens, 115);
    assert!((rt.meta.cost - 0.25).abs() < 1e-9);
    let turn = rt
        .conv
        .items()
        .into_iter()
        .rev()
        .find(|i| i["kind"] == "turn")
        .unwrap();
    assert_eq!(turn["engine"], "opencode");
    assert_eq!(turn["tokens"], 115);
}

#[test]
fn the_words_of_the_user_are_not_shown_again_and_a_subagent_goes_under_its_task() {
    let mut rt = agent("C:/p");
    start(&mut rt);
    feed(
        &mut rt,
        &[
            ev(
                "message.updated",
                json!({ "sessionID": S, "info": { "id": "msg_u", "role": "user", "sessionID": S } }),
            ),
            ev(
                "message.part.updated",
                json!({ "sessionID": S, "part": {
                "id": "prt_u", "messageID": "msg_u", "sessionID": S, "type": "text", "text": "Mon message",
            } }),
            ),
            ev(
                "message.updated",
                json!({ "sessionID": S, "info": { "id": "msg_a", "role": "assistant", "sessionID": S } }),
            ),
            ev(
                "message.part.updated",
                json!({ "sessionID": S, "part": {
                "id": "prt_task", "messageID": "msg_a", "sessionID": S, "type": "tool", "tool": "task", "callID": "call_t",
                "state": { "status": "running", "input": { "description": "Explorer", "prompt": "Liste", "subagent_type": "explore" },
                           "metadata": { "sessionId": "ses_child" } },
            } }),
            ),
            ev(
                "session.created",
                json!({ "sessionID": "ses_child", "info": { "id": "ses_child", "parentID": S } }),
            ),
            ev(
                "message.updated",
                json!({ "sessionID": "ses_child", "info": { "id": "msg_c", "role": "assistant", "sessionID": "ses_child" } }),
            ),
            ev(
                "message.part.updated",
                json!({ "sessionID": "ses_child", "part": {
                "id": "prt_r", "messageID": "msg_c", "sessionID": "ses_child", "type": "tool", "tool": "read", "callID": "call_r",
                "state": { "status": "completed", "input": { "filePath": "calc.py" }, "output": "1: x", "metadata": {} },
            } }),
            ),
            ev(
                "message.part.updated",
                json!({ "sessionID": "ses_child", "part": {
                "id": "prt_cf", "messageID": "msg_c", "sessionID": "ses_child", "type": "step-finish",
                "tokens": { "input": 40, "output": 2, "reasoning": 0, "cache": { "read": 0, "write": 0 } }, "cost": 0,
            } }),
            ),
            ev(
                "message.part.updated",
                json!({ "sessionID": S, "part": {
                "id": "prt_task", "messageID": "msg_a", "sessionID": S, "type": "tool", "tool": "task", "callID": "call_t",
                "state": { "status": "completed", "input": { "description": "Explorer", "prompt": "Liste", "subagent_type": "explore" },
                           "output": "<task id=\"ses_child\" state=\"completed\">\n<task_result>\nDeux fichiers.\n</task_result>\n</task>",
                           "metadata": { "sessionId": "ses_child" } },
            } }),
            ),
        ],
    );
    let items = rt.conv.items();
    assert!(
        !items.iter().any(|i| i["text"] == "Mon message"),
        "{items:#?}"
    );
    let read = items.iter().find(|i| i["id"] == "call_r").unwrap();
    assert_eq!(read["name"], "Read");
    assert_eq!(read["parent"], "call_t");
    assert!(read["input"]["file_path"]
        .as_str()
        .unwrap()
        .ends_with("calc.py"));
    let task = items.iter().find(|i| i["id"] == "call_t").unwrap();
    assert_eq!(task["name"], "Task");
    assert_eq!(task["result"]["text"], "Deux fichiers.");
    let plan = rt.meta.plan.clone().unwrap();
    let row = &plan.agents[0];
    assert_eq!(row.status, crate::plan::RunStatus::Done);
    assert_eq!(row.tokens, Some(42));
    assert_eq!(row.tools, 1);
}

#[test]
fn a_permission_shows_what_always_keeps_and_a_question_its_options() {
    let mut rt = agent("C:/p");
    start(&mut rt);
    feed(
        &mut rt,
        &[ev(
            "permission.asked",
            json!({
                "id": "per_1", "sessionID": S, "permission": "bash", "patterns": ["git add calc.py"],
                "metadata": { "command": "git add calc.py" }, "always": ["git add *"],
                "tool": { "messageID": "msg_a", "callID": "call_b" },
            }),
        )],
    );
    let card = rt.conv.get("per_1").cloned().unwrap();
    assert_eq!(card["toolName"], "Bash");
    assert_eq!(card["input"]["command"], "git add calc.py");
    assert_eq!(card["canAlways"], true);
    assert!(card["description"].as_str().unwrap().contains("git add *"));
    assert_eq!(rt.meta.status, AgentStatus::Waiting);
    // Answered in `opencode attach`: the card says so.
    feed(
        &mut rt,
        &[ev(
            "permission.replied",
            json!({ "sessionID": S, "requestID": "per_1", "reply": "always" }),
        )],
    );
    assert_eq!(rt.conv.get("per_1").unwrap()["decision"], "always");
    assert_eq!(rt.meta.status, AgentStatus::Running);
    feed(
        &mut rt,
        &[ev(
            "question.asked",
            json!({
                "id": "que_1", "sessionID": S, "tool": { "callID": "call_q" },
                "questions": [{ "question": "Quel nom ?", "header": "Nom", "multiple": false,
                                "options": [{ "label": "a.py", "description": "le premier" }, { "label": "b.py", "description": "" }] }],
            }),
        )],
    );
    let q = rt.conv.get("que_1").cloned().unwrap();
    assert_eq!(q["kind"], "question");
    assert_eq!(q["questions"][0]["options"][0]["label"], "a.py");
    assert_eq!(q["questions"][0]["multiSelect"], false);
}

#[test]
fn todo_updated_makes_the_task_list_of_the_plan() {
    let mut rt = agent("C:/p");
    start(&mut rt);
    feed(
        &mut rt,
        &[ev(
            "todo.updated",
            json!({ "sessionID": S, "todos": [
                { "content": "Lire", "status": "completed", "priority": "high" },
                { "content": "Corriger", "status": "in_progress", "priority": "high" },
                { "content": "Tester", "status": "open", "priority": "low" },
                { "content": "Publier", "status": "cancelled", "priority": "low" },
            ] }),
        )],
    );
    let plan = rt.meta.plan.clone().unwrap();
    let st: Vec<_> = plan
        .tasks
        .iter()
        .map(|t| (t.title.as_str(), t.status))
        .collect();
    use crate::plan::TaskStatus::*;
    assert_eq!(
        st,
        [
            ("Lire", Done),
            ("Corriger", InProgress),
            ("Tester", Pending),
            ("Publier", Done)
        ]
    );
}

#[test]
fn an_aborted_turn_is_interrupted_and_an_error_ends_it_in_error() {
    let mut rt = agent("C:/p");
    start(&mut rt);
    let mut fx = Effects::default();
    rt.push_user("u1", "lent", 0, &[], &mut fx);
    let fxs = feed(
        &mut rt,
        &[
            ev(
                "session.status",
                json!({ "sessionID": S, "status": { "type": "busy" } }),
            ),
            ev(
                "session.error",
                json!({ "sessionID": S, "error": { "name": "MessageAbortedError", "data": { "message": "Aborted" } } }),
            ),
            ev("session.idle", json!({ "sessionID": S })),
        ],
    );
    assert_eq!(fxs.last().unwrap().turn_end, Some(TurnEnd::Interrupted));
    rt.push_user("u2", "x", 0, &[], &mut fx);
    let fxs = feed(
        &mut rt,
        &[
            ev(
                "session.status",
                json!({ "sessionID": S, "status": { "type": "busy" } }),
            ),
            ev(
                "session.error",
                json!({ "sessionID": S, "error": { "name": "UnknownError", "data": { "message": "Model not found: ollama/x." } } }),
            ),
            ev(
                "session.error",
                json!({ "sessionID": S, "error": { "name": "UnknownError", "data": { "message": "Model not found: ollama/x.\n    at stack" } } }),
            ),
            ev("session.idle", json!({ "sessionID": S })),
        ],
    );
    assert_eq!(
        fxs.last().unwrap().turn_end,
        Some(TurnEnd::Error("Model not found: ollama/x.".into()))
    );
    assert_eq!(rt.meta.status, AgentStatus::Error);
}

#[test]
fn the_tools_take_claude_codes_names() {
    let cwd = if cfg!(windows) { "C:\\p" } else { "/p" };
    let (n, i) = tool_of(
        "edit",
        &json!({ "filePath": "a.py", "oldString": "x", "newString": "y" }),
        cwd,
    );
    assert_eq!(n, "Edit");
    assert_eq!(
        i["file_path"],
        std::path::Path::new(cwd)
            .join("a.py")
            .to_string_lossy()
            .as_ref()
    );
    assert_eq!(tool_of("list", &json!({ "path": "src" }), cwd).0, "LS");
    assert_eq!(
        tool_of("grep", &json!({ "pattern": "x", "include": "*.rs" }), cwd).1["glob"],
        "*.rs"
    );
    assert_eq!(
        tool_of("escouade_get_board", &json!({}), cwd).0,
        "mcp__escouade__get_board"
    );
    let (n, i) = tool_of(
        "apply_patch",
        &json!({ "patchText": "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-a\n+b\n*** End Patch" }),
        cwd,
    );
    assert_eq!(n, "Edit");
    assert!(i["file_path"].as_str().unwrap().ends_with("a.ts"));
    assert_eq!(
        tool_of("webfetch", &json!({ "url": "https://x" }), cwd).0,
        "WebFetch"
    );
    assert_eq!(
        tool_of("bash", &json!({ "command": "ls" }), cwd).1,
        json!({ "command": "ls" })
    );
}

#[test]
fn the_mode_plan_ends_on_a_plan_to_approve() {
    let mut rt = agent("C:/p");
    rt.meta.mode = "plan".into();
    start(&mut rt);
    let mut fx = Effects::default();
    rt.push_user("u1", "propose un plan", 0, &[], &mut fx);
    let fxs = feed(
        &mut rt,
        &[
            ev(
                "session.status",
                json!({ "sessionID": S, "status": { "type": "busy" } }),
            ),
            ev(
                "message.updated",
                json!({ "sessionID": S, "info": { "id": "msg_p", "role": "assistant", "agent": "plan", "sessionID": S } }),
            ),
            ev(
                "message.part.updated",
                json!({ "sessionID": S, "part": {
                "id": "prt_p", "messageID": "msg_p", "sessionID": S, "type": "text", "text": "1. Lire\n2. Écrire", "time": { "end": 1 },
            } }),
            ),
            ev("session.idle", json!({ "sessionID": S })),
        ],
    );
    assert!(fxs.iter().all(|f| f.turn_end.is_none()));
    let card = rt.conv.get("plan:msg_p").cloned().unwrap();
    assert_eq!(card["toolName"], "ExitPlanMode");
    assert_eq!(card["input"]["plan"], "1. Lire\n2. Écrire");
    assert_eq!(rt.meta.status, AgentStatus::Waiting);
    // Approved: OpenCode says the mode it goes on in.
    feed(
        &mut rt,
        &[ev(
            "escouade.mode",
            json!({ "sessionID": S, "mode": "default" }),
        )],
    );
    assert_eq!(rt.meta.mode, "default");
}

#[test]
fn a_path_of_windows_or_of_posix_is_absolute_on_every_system() {
    let cwd = "/work/wt";
    for path in [
        r"C:\Users\user\wt\calc.py",
        "C:/Users/user/wt/calc.py",
        r"\server\share\calc.py",
        "/home/user/wt/calc.py",
    ] {
        assert_eq!(absolute(path, cwd), path);
    }
    assert_eq!(
        absolute("calc.py", cwd),
        std::path::Path::new(cwd).join("calc.py").to_string_lossy()
    );
    assert_eq!(absolute("", cwd), "");
}
