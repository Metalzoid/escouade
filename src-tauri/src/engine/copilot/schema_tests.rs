//! The schemas of the newest version of Copilot CLI tested (the SDK's protocol of 1.0.98,
//! tests/fixtures/engines/copilot-1.0.98.api.schema.json and copilot-1.0.98.session-events.schema.json)
//! hold what Escouade sends and reads; what they leave out (the session's own requests of the SDK)
//! is in its recorded streams, answered.

use super::TESTED;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::PathBuf;

fn schema(kind: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/engines")
        .join(format!("copilot-{}.{kind}.schema.json", TESTED.newest));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// What a `$ref` names.
fn resolve<'a>(s: &'a Value, v: &'a Value) -> &'a Value {
    match v["$ref"].as_str() {
        Some(r) => &s["definitions"][r.rsplit('/').next().unwrap_or_default()],
        None => v,
    }
}

/// The fields of an object's definition (its variants' too).
fn fields(s: &Value, v: &Value) -> BTreeSet<String> {
    let v = resolve(s, v);
    let mut out: BTreeSet<String> = v["properties"]
        .as_object()
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();
    for k in ["oneOf", "anyOf", "allOf"] {
        for variant in v[k].as_array().into_iter().flatten() {
            out.extend(fields(s, variant));
        }
    }
    out
}

/// Every method of the API's schema, by its name: its parameters.
fn methods(s: &Value) -> Vec<(String, Value)> {
    fn walk(v: &Value, out: &mut Vec<(String, Value)>) {
        let Some(o) = v.as_object() else {
            return;
        };
        if let Some(m) = o.get("rpcMethod").and_then(Value::as_str) {
            out.push((
                m.to_string(),
                o.get("params").cloned().unwrap_or(Value::Null),
            ));
            return;
        }
        for (_, child) in o {
            walk(child, out);
        }
    }
    let mut out = Vec::new();
    for part in ["server", "session"] {
        walk(&s[part], &mut out);
    }
    out
}

/// What Escouade sends Copilot: each request, with the parameters it gives.
const SENT: &[(&str, &[&str])] = &[
    ("connect", &["supportedTaskKinds"]),
    ("sessions.fork", &["sessionId", "toEventId", "name"]),
    ("sessions.readPersistedEvents", &["sessionId"]),
    ("session.permissions.setMode", &["sessionId", "mode"]),
    ("session.mode.set", &["sessionId", "mode"]),
    (
        "session.model.switchTo",
        &["sessionId", "modelId", "reasoningEffort"],
    ),
    ("models.list", &[]),
    ("session.model.list", &["sessionId"]),
    (
        "session.send",
        &["sessionId", "prompt", "attachments", "mode"],
    ),
    ("session.abort", &["sessionId"]),
    (
        "session.permissions.handlePendingPermissionRequest",
        &["sessionId", "requestId", "result"],
    ),
    (
        "session.ui.handlePendingUserInput",
        &["sessionId", "requestId", "response"],
    ),
    (
        "session.ui.handlePendingElicitation",
        &["sessionId", "requestId", "result"],
    ),
    (
        "session.ui.handlePendingExitPlanMode",
        &["sessionId", "requestId", "response"],
    ),
    ("session.plan.readSqlTodosWithDependencies", &["sessionId"]),
    ("session.mcp.disable", &["sessionId", "serverName"]),
    ("session.name.set", &["sessionId", "name"]),
    ("runtime.shutdown", &[]),
];

/// What the SDK sends that the schema leaves out, answered in the recorded streams.
const OF_THE_SDK: &[&str] = &["auth.getStatus", "session.create", "session.resume"];

/// The events Escouade reads, with the fields of their `data` it reads.
const READ: &[(&str, &[&str])] = &[
    ("user.message", &["content"]),
    ("assistant.turn_start", &["turnId"]),
    ("assistant.message_delta", &["messageId", "deltaContent"]),
    (
        "assistant.reasoning_delta",
        &["reasoningId", "deltaContent"],
    ),
    ("assistant.message", &["messageId", "content"]),
    ("assistant.reasoning", &["reasoningId", "content"]),
    (
        "tool.execution_start",
        &["toolCallId", "toolName", "arguments", "mcpServerName"],
    ),
    (
        "tool.execution_complete",
        &[
            "toolCallId",
            "success",
            "result",
            "error",
            "fileEdits",
            "shellExecution",
        ],
    ),
    ("subagent.started", &["toolCallId"]),
    (
        "subagent.completed",
        &["toolCallId", "totalTokens", "totalToolCalls"],
    ),
    ("permission.requested", &["requestId", "permissionRequest"]),
    ("permission.completed", &["requestId", "result"]),
    (
        "user_input.requested",
        &["requestId", "question", "choices", "toolCallId"],
    ),
    ("user_input.completed", &["requestId", "answer"]),
    (
        "elicitation.requested",
        &[
            "requestId",
            "message",
            "requestedSchema",
            "elicitationSource",
        ],
    ),
    ("elicitation.completed", &["requestId"]),
    (
        "exit_plan_mode.requested",
        &["requestId", "summary", "planContent"],
    ),
    ("exit_plan_mode.completed", &["requestId", "approved"]),
    (
        "assistant.usage",
        &[
            "inputTokens",
            "outputTokens",
            "cacheReadTokens",
            "cacheWriteTokens",
            "copilotUsage",
        ],
    ),
    ("session.usage_info", &["tokenLimit", "currentTokens"]),
    ("session.model_change", &["newModel"]),
    ("session.mode_changed", &["newMode"]),
    ("session.compaction_complete", &["success"]),
    ("session.todos_changed", &[]),
    ("abort", &[]),
    ("session.error", &["message"]),
    ("session.idle", &["aborted"]),
];

/// The fields of each kind of permission Escouade reads (`permissionRequest`).
const PERMISSIONS: &[&str] = &[
    "kind",
    "toolCallId",
    "intention",
    "fullCommandText",
    "commands",
    "possiblePaths",
    "possibleUrls",
    "hasWriteFileRedirection",
    "canOfferSessionApproval",
    "fileName",
    "diff",
    "path",
    "url",
    "serverName",
    "toolName",
    "args",
    "readOnly",
];

#[test]
fn the_schema_holds_the_requests_escouade_sends() {
    let s = schema("api");
    let all = methods(&s);
    for (method, params) in SENT {
        let (_, p) = all
            .iter()
            .find(|(m, _)| m == method)
            .unwrap_or_else(|| panic!("{method} is not in the schema"));
        let have = fields(&s, p);
        for k in *params {
            assert!(have.contains(*k), "{method}: no {k} in {have:?}");
        }
    }
}

#[test]
fn what_the_schema_leaves_out_was_answered_on_the_real_runs() {
    let mut seen = BTreeSet::new();
    for file in [
        "first-turn.jsonl",
        "resume-fork.jsonl",
        "quota-models-tools.jsonl",
    ] {
        let lines = super::bench::stream(file);
        for (i, l) in lines.iter().enumerate() {
            let m = &l["msg"];
            if l["dir"] != "c2s" {
                continue;
            }
            let Some(method) = m["method"].as_str() else {
                continue;
            };
            let answered = lines[i..].iter().any(|r| {
                r["dir"] == "s2c" && r["msg"]["id"] == m["id"] && r["msg"]["error"].is_null()
            });
            if answered {
                seen.insert(method.to_string());
            }
        }
    }
    for method in OF_THE_SDK {
        assert!(
            seen.contains(*method),
            "{method} not answered on a real run"
        );
    }
}

#[test]
fn the_schema_holds_the_events_and_the_fields_escouade_reads() {
    let s = schema("session-events");
    let defs = s["definitions"].as_object().unwrap();
    let event_of = |kind: &str| {
        defs.values()
            .find(|d| d["properties"]["type"]["const"] == kind)
            .unwrap_or_else(|| panic!("no event {kind} in the schema"))
    };
    for (kind, read) in READ {
        let data = fields(&s, &event_of(kind)["properties"]["data"]);
        for k in *read {
            assert!(data.contains(*k), "{kind}: no {k} in {data:?}");
        }
    }
    let event = fields(&s, event_of("abort"));
    for k in ["id", "ephemeral", "agentId", "parentId"] {
        assert!(event.contains(k), "an event has no {k}");
    }
    let asked = fields(
        &s,
        &resolve(&s, &event_of("permission.requested")["properties"]["data"])["properties"]
            ["permissionRequest"],
    );
    for k in PERMISSIONS {
        assert!(asked.contains(*k), "permissionRequest: no {k}");
    }
}
