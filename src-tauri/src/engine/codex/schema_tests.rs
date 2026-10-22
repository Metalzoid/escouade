//! The schema of the newest version of Codex tested (`codex app-server generate-json-schema
//! --experimental` of 0.163.0, tests/fixtures/engines/codex-0.163.0.schema.json) holds what Escouade
//! sends and reads, and what its recorded streams say.

use super::TESTED;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::PathBuf;

fn schema() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/engines")
        .join(format!("codex-{}.schema.json", TESTED.newest));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// The definition `name`, of the bundle or of its `v2`.
fn def<'a>(s: &'a Value, name: &str) -> &'a Value {
    let d = &s["definitions"];
    if d[name].is_object() {
        &d[name]
    } else {
        &d["v2"][name]
    }
}

/// What a `$ref` names.
fn resolve<'a>(s: &'a Value, v: &'a Value) -> &'a Value {
    match v["$ref"].as_str() {
        Some(r) => def(s, r.rsplit('/').next().unwrap_or_default()),
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

/// The parameters of each method of `of` (`ServerNotification`, `ServerRequest`, `ClientRequest`).
fn methods<'a>(s: &'a Value, of: &str) -> Vec<(String, &'a Value)> {
    def(s, of)["oneOf"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| {
            let name = m["properties"]["method"]["enum"][0].as_str()?;
            Some((name.to_string(), &m["properties"]["params"]))
        })
        .collect()
}

fn params_of(s: &Value, of: &str, method: &str) -> Option<BTreeSet<String>> {
    methods(s, of)
        .into_iter()
        .find(|(m, _)| m == method)
        .map(|(_, p)| fields(s, p))
}

/// The variant `kind` of a thread's item.
fn item_fields(s: &Value, kind: &str) -> Option<BTreeSet<String>> {
    def(s, "ThreadItem")["oneOf"]
        .as_array()?
        .iter()
        .find(|v| v["properties"]["type"]["enum"][0] == kind)
        .map(|v| fields(s, v))
}

/// What Escouade sends Codex: each request, with the parameters it gives.
const SENT: &[(&str, &[&str])] = &[
    ("initialize", &["clientInfo", "capabilities"]),
    (
        "thread/start",
        &[
            "cwd",
            "model",
            "approvalPolicy",
            "approvalsReviewer",
            "sandbox",
            "developerInstructions",
            // « Projet privé »: its profile and its declaration, in place of `sandbox`.
            "permissions",
            "config",
        ],
    ),
    (
        "thread/resume",
        &[
            "threadId",
            "cwd",
            "model",
            "approvalPolicy",
            "sandbox",
            "permissions",
            "config",
        ],
    ),
    (
        "thread/fork",
        &[
            "threadId",
            "lastTurnId",
            "cwd",
            "model",
            "sandbox",
            "permissions",
            "config",
        ],
    ),
    (
        "turn/start",
        &[
            "threadId",
            "input",
            "model",
            "effort",
            "summary",
            "approvalPolicy",
            "approvalsReviewer",
            "sandboxPolicy",
            "permissions",
            "collaborationMode",
        ],
    ),
    ("turn/steer", &["threadId", "input", "expectedTurnId"]),
    ("turn/interrupt", &["threadId", "turnId"]),
    ("model/list", &[]),
    ("account/rateLimits/read", &[]),
    ("thread/name/set", &["threadId", "name"]),
];

/// What Escouade reads of Codex's notifications and requests.
const READ: &[(&str, &str, &[&str])] = &[
    ("ServerNotification", "thread/started", &["thread"]),
    (
        "ServerNotification",
        "thread/settings/updated",
        &["threadId", "threadSettings"],
    ),
    ("ServerNotification", "turn/started", &["threadId", "turn"]),
    (
        "ServerNotification",
        "turn/completed",
        &["threadId", "turn"],
    ),
    ("ServerNotification", "item/started", &["threadId", "item"]),
    (
        "ServerNotification",
        "item/completed",
        &["threadId", "item"],
    ),
    (
        "ServerNotification",
        "item/agentMessage/delta",
        &["threadId", "itemId", "delta"],
    ),
    (
        "ServerNotification",
        "item/reasoning/summaryTextDelta",
        &["threadId", "itemId", "delta"],
    ),
    (
        "ServerNotification",
        "item/reasoning/textDelta",
        &["threadId", "itemId", "delta"],
    ),
    (
        "ServerNotification",
        "turn/plan/updated",
        &["threadId", "plan"],
    ),
    (
        "ServerNotification",
        "thread/tokenUsage/updated",
        &["threadId", "tokenUsage"],
    ),
    (
        "ServerNotification",
        "account/rateLimits/updated",
        &["rateLimits"],
    ),
    (
        "ServerNotification",
        "serverRequest/resolved",
        &["requestId"],
    ),
    (
        "ServerNotification",
        "error",
        &["error", "willRetry", "threadId"],
    ),
    (
        "ServerRequest",
        "item/commandExecution/requestApproval",
        &[
            "threadId",
            "itemId",
            "reason",
            "cwd",
            "command",
            "commandActions",
        ],
    ),
    (
        "ServerRequest",
        "item/fileChange/requestApproval",
        &["threadId", "itemId", "reason"],
    ),
    (
        "ServerRequest",
        "item/permissions/requestApproval",
        &["threadId", "itemId", "cwd", "permissions", "reason"],
    ),
    (
        "ServerRequest",
        "item/tool/requestUserInput",
        &["threadId", "itemId", "questions"],
    ),
];

/// The fields of each item Escouade reads.
const ITEMS: &[(&str, &[&str])] = &[
    ("agentMessage", &["id", "text"]),
    ("reasoning", &["id", "summary", "content"]),
    (
        "commandExecution",
        &[
            "id",
            "command",
            "commandActions",
            "status",
            "exitCode",
            "aggregatedOutput",
        ],
    ),
    ("fileChange", &["id", "changes", "status"]),
    (
        "mcpToolCall",
        &[
            "id",
            "server",
            "tool",
            "arguments",
            "result",
            "error",
            "status",
        ],
    ),
    (
        "dynamicToolCall",
        &[
            "id",
            "tool",
            "arguments",
            "contentItems",
            "success",
            "status",
        ],
    ),
    ("webSearch", &["id", "query", "action"]),
    ("imageView", &["id", "path"]),
    (
        "subAgentActivity",
        &["id", "kind", "agentThreadId", "agentPath", "model"],
    ),
    ("contextCompaction", &["id"]),
    ("plan", &["id", "text"]),
];

/// Fields of the objects within, as `def` names them.
const WITHIN: &[(&str, &[&str])] = &[
    ("Turn", &["id", "status", "error", "durationMs"]),
    ("TurnError", &["message", "codexErrorInfo"]),
    ("FileUpdateChange", &["path", "kind", "diff"]),
    ("TurnPlanStep", &["step", "status"]),
    ("ThreadTokenUsage", &["total", "last", "modelContextWindow"]),
    (
        "TokenUsageBreakdown",
        &["inputTokens", "cachedInputTokens", "outputTokens"],
    ),
    (
        "RateLimitSnapshot",
        &["primary", "secondary", "rateLimitReachedType"],
    ),
    (
        "RateLimitWindow",
        &["usedPercent", "windowDurationMins", "resetsAt"],
    ),
    (
        "ToolRequestUserInputQuestion",
        &["id", "header", "question", "options"],
    ),
    (
        "Model",
        &[
            "id",
            "model",
            "displayName",
            "hidden",
            "supportedReasoningEfforts",
            "defaultReasoningEffort",
            "inputModalities",
            "isDefault",
        ],
    ),
];

#[test]
fn what_escouade_sends_and_reads_of_codex_is_in_the_schema_of_the_version_tested() {
    let s = schema();
    let mut missing = Vec::new();
    for (method, params) in SENT {
        match params_of(&s, "ClientRequest", method) {
            None => missing.push(format!("request {method}")),
            Some(known) => missing.extend(
                params
                    .iter()
                    .filter(|p| !known.contains(**p))
                    .map(|p| format!("{method}.{p}")),
            ),
        }
    }
    for (of, method, params) in READ {
        match params_of(&s, of, method) {
            None => missing.push(format!("{of} {method}")),
            Some(known) => missing.extend(
                params
                    .iter()
                    .filter(|p| !known.contains(**p))
                    .map(|p| format!("{method}.{p}")),
            ),
        }
    }
    for (kind, read) in ITEMS {
        match item_fields(&s, kind) {
            None => missing.push(format!("item {kind}")),
            Some(known) => missing.extend(
                read.iter()
                    .filter(|p| !known.contains(**p))
                    .map(|p| format!("{kind}.{p}")),
            ),
        }
    }
    for (name, read) in WITHIN {
        let known = fields(&s, def(&s, name));
        missing.extend(
            read.iter()
                .filter(|p| !known.contains(**p))
                .map(|p| format!("{name}.{p}")),
        );
    }
    assert!(
        missing.is_empty(),
        "not in the schema of Codex {}: {missing:?}",
        TESTED.newest
    );
}

/// The schema says what the real runs recorded show: every field of the parameters of each
/// notification and request of Codex, and of each item.
#[test]
fn the_schema_of_codex_holds_every_field_of_its_recorded_streams() {
    let s = schema();
    let notifications = methods(&s, "ServerNotification");
    let requests = methods(&s, "ServerRequest");
    let mut missing = BTreeSet::new();
    let mut read = 0;
    for file in ["full-turn", "plan-mode", "resume", "failed-turn", "account"] {
        for msg in super::bench::recorded(&format!("{file}.jsonl")) {
            let Some(method) = msg["method"].as_str() else {
                continue;
            };
            let of = if msg["id"].is_null() {
                &notifications
            } else {
                &requests
            };
            let Some((_, params)) = of.iter().find(|(m, _)| m == method) else {
                missing.insert(format!("{file}: {method}"));
                continue;
            };
            read += 1;
            let known = fields(&s, params);
            for k in msg["params"]
                .as_object()
                .into_iter()
                .flatten()
                .map(|(k, _)| k)
            {
                if !known.contains(k) {
                    missing.insert(format!("{file}: {method}.{k}"));
                }
            }
            let item = &msg["params"]["item"];
            if let Some(kind) = item["type"].as_str() {
                let known = item_fields(&s, kind).unwrap_or_default();
                for k in item.as_object().into_iter().flatten().map(|(k, _)| k) {
                    if !known.contains(k) {
                        missing.insert(format!("{file}: item {kind}.{k}"));
                    }
                }
            }
        }
    }
    assert!(
        read > 300,
        "the recorded streams are in tests/fixtures/codex"
    );
    assert!(missing.is_empty(), "not in the schema: {missing:?}");
}
