//! The tools that read the Remote Control (reachable from claude.ai) of the agents and of the
//! projects, and the one thing none of them does: change it (ESC-103).

use super::tools_tests::{external, other_project, project, put_agent, read};
use crate::agent::TuiRun;
use crate::core_tests::{harness, Harness};
use crate::model::*;
use serde_json::{json, Value};

/// What the agent `id` says of its Remote Control in `list_agents`: the keys the tools add.
fn remote_keys(row: &Value) -> Value {
    json!({
        "remoteControl": row["remoteControl"],
        "remoteSource": row["remoteSource"],
        "remoteState": row["remoteState"],
        "interfaceRemote": row["interfaceRemote"],
    })
}

/// An agent of the project as the app keeps one, with its Remote Control as `set` leaves it.
fn agent_with(
    h: &Harness,
    p: &Project,
    name: &str,
    at: i64,
    set: impl FnOnce(&mut crate::agent::AgentRt),
) -> AgentMeta {
    let meta = put_agent(h, p, name, at);
    set(&mut h.core.agent(&meta.id).unwrap().lock());
    meta
}

#[tokio::test]
async fn an_agent_says_whether_it_has_remote_control_and_where_it_comes_from() {
    let h = harness("mcp-remote-agents");
    let p = project(&h).await;
    let hand = agent_with(&h, &p, "a-la-main", 1, |rt| {
        rt.meta.remote_control = true;
        rt.meta.remote_source = Some(RemoteSource::Hand);
    });
    let from_project = agent_with(&h, &p, "du-projet", 2, |rt| {
        rt.meta.remote_control = true;
        rt.meta.remote_source = Some(RemoteSource::Project);
    });
    let global = agent_with(&h, &p, "du-global", 3, |rt| {
        rt.meta.remote_control = true;
        rt.meta.remote_source = Some(RemoteSource::Global);
    });
    // « Désactiver le remote control »: set apart, whatever the settings say.
    let apart = agent_with(&h, &p, "a-part", 4, |rt| rt.meta.remote_off = true);
    let none = put_agent(&h, &p, "rien", 5);
    let c = external(&h).await;
    let all = read(&c, "list_agents", json!({})).await;
    let by_name = |name: &str| {
        all.as_array()
            .unwrap()
            .iter()
            .find(|a| a["name"] == name)
            .unwrap_or_else(|| panic!("{name}: {all}"))
            .clone()
    };
    let say = |remote: bool, source: Value| {
        json!({
            "remoteControl": remote,
            "remoteSource": source,
            "remoteState": null,
            "interfaceRemote": null,
        })
    };
    for (name, expected) in [
        ("a-la-main", say(true, json!("hand"))),
        ("du-projet", say(true, json!("project"))),
        ("du-global", say(true, json!("global"))),
        ("a-part", say(false, json!("off"))),
        ("rien", say(false, json!(null))),
    ] {
        assert_eq!(remote_keys(&by_name(name)), expected, "{name}");
    }
    // The summary of an agent says the same, whichever tool is asked.
    for (meta, expected) in [
        (&hand, say(true, json!("hand"))),
        (&from_project, say(true, json!("project"))),
        (&global, say(true, json!("global"))),
        (&apart, say(false, json!("off"))),
        (&none, say(false, json!(null))),
    ] {
        let summary = read(&c, "get_agent_summary", json!({ "agent": meta.id })).await;
        assert_eq!(remote_keys(&summary), expected, "{}", meta.name);
    }
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn the_link_of_the_agent_and_of_its_interface_to_claude_ai_is_read_too() {
    let h = harness("mcp-remote-link");
    let p = project(&h).await;
    // Linked: Claude Code reports the link.
    let linked = agent_with(&h, &p, "lie", 1, |rt| {
        rt.meta.remote_control = true;
        rt.meta.remote_source = Some(RemoteSource::Global);
        rt.remote_state = Some("connected".into());
    });
    // In the Claude Code view, started with Remote Control; turned off since (the right-click):
    // the interface that runs stays linked to claude.ai until its next launch.
    let still = agent_with(&h, &p, "toujours-liee", 2, |rt| {
        rt.meta.terminal = true;
        rt.meta.remote_off = true;
        rt.remote_state = Some("connected".into());
        rt.tui = Some(TuiRun::quiet(true));
    });
    // Its interface runs, started without it: it has it from its next launch.
    let without = agent_with(&h, &p, "sans", 3, |rt| {
        rt.meta.terminal = true;
        rt.meta.remote_control = true;
        rt.meta.remote_source = Some(RemoteSource::Hand);
        rt.tui = Some(TuiRun::quiet(false));
    });
    // The interface runs, and Claude Code did not open the Remote Control.
    let refused = agent_with(&h, &p, "refusee", 4, |rt| {
        rt.meta.terminal = true;
        rt.meta.remote_control = true;
        rt.meta.remote_source = Some(RemoteSource::Project);
        rt.remote_state = Some("unavailable".into());
        rt.tui = Some(TuiRun::quiet(true));
    });
    let c = external(&h).await;
    let all = read(&c, "list_agents", json!({})).await;
    let row = |id: &str| {
        all.as_array()
            .unwrap()
            .iter()
            .find(|a| a["id"] == id)
            .unwrap()
            .clone()
    };
    let expected = |remote: bool, source: Value, state: Value, interface: Value| {
        json!({
            "remoteControl": remote,
            "remoteSource": source,
            "remoteState": state,
            "interfaceRemote": interface,
        })
    };
    let cases = [
        (
            &linked,
            expected(true, json!("global"), json!("connected"), json!(null)),
        ),
        (
            &still,
            expected(false, json!("off"), json!("connected"), json!(true)),
        ),
        (
            &without,
            expected(true, json!("hand"), json!(null), json!(false)),
        ),
        (
            &refused,
            expected(true, json!("project"), json!("unavailable"), json!(true)),
        ),
    ];
    for (meta, expected) in &cases {
        assert_eq!(remote_keys(&row(&meta.id)), *expected, "{}", meta.name);
        let summary = read(&c, "get_agent_summary", json!({ "agent": meta.id })).await;
        assert_eq!(remote_keys(&summary), *expected, "{}", meta.name);
    }
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_project_says_its_remote_control_setting_and_the_global_one() {
    let h = harness("mcp-remote-projects");
    let p = project(&h).await;
    let other = other_project(&h, "autre").await;
    h.core
        .projects
        .write()
        .iter_mut()
        .filter(|x| x.id == p.id)
        .for_each(|x| x.remote_control = true);
    let c = external(&h).await;
    let settings = |rows: &Value| {
        rows.as_array()
            .unwrap()
            .iter()
            .map(|r| {
                (
                    r["id"].clone(),
                    r["remoteControl"].clone(),
                    r["remoteControlAll"].clone(),
                )
            })
            .collect::<Vec<_>>()
    };
    let rows = read(&c, "list_projects", json!({})).await;
    assert_eq!(
        settings(&rows),
        [
            (json!(p.id), json!(true), json!(false)),
            (json!(other.id), json!(false), json!(false)),
        ]
    );
    // The global setting is the same on every row.
    h.core.settings.write().remote_control_all = true;
    let rows = read(&c, "list_projects", json!({})).await;
    assert_eq!(
        settings(&rows),
        [
            (json!(p.id), json!(true), json!(true)),
            (json!(other.id), json!(false), json!(true)),
        ]
    );
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn no_tool_changes_the_remote_control_and_the_descriptions_that_read_it_say_so() {
    let h = harness("mcp-remote-read-only");
    let c = external(&h).await;
    let tools = c.list_all_tools().await.unwrap();
    for t in &tools {
        // Neither a tool nor an argument of one is about it: turning it on exposes a session on the
        // internet, and stays the user's choice in the window.
        let v = serde_json::to_value(t).unwrap();
        assert!(!t.name.contains("remote"), "{}", t.name);
        let properties = v["inputSchema"]["properties"].as_object();
        for key in properties.into_iter().flat_map(|p| p.keys()) {
            assert!(
                !key.to_lowercase().contains("remote"),
                "{}.{key}: {v}",
                t.name
            );
        }
    }
    // The three that tell it say they only read it.
    for name in ["list_projects", "list_agents", "get_agent_summary"] {
        let t = tools.iter().find(|t| t.name == name).unwrap();
        let description = t.description.as_deref().unwrap();
        assert!(
            description.contains("no tool turns Remote Control on or off"),
            "{name}: {description}"
        );
    }
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}
