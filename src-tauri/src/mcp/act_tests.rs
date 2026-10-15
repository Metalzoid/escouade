//! The tools that act, called by a real MCP client (rmcp's) on a test core: real git
//! repositories and the fake `claude`. Each does what the window does, under the guardrails of the
//! window and the autopilot; every call, refused ones included, is in the activity log.

use super::act::{board_change, board_changes};
use super::tests::{ACTING, AGENTS_ONLY, EXPOSED};
use super::tools::{SetBoardArgs, ToolError};
use super::tools_tests::{
    as_agent, external, keys, last_entry, other_project, project, put, put_agent, read, refused,
    ticket, Client,
};
use crate::accounts::PRINCIPAL;
use crate::board::clock;
use crate::core::RESUME_MARGIN_MS;
use crate::core_tests::{agent_on, git, harness, Harness};
use crate::model::*;
use crate::tickets::TicketDraft;
use crate::usage::Reading;
use serde_json::{json, Value};

/// A ticket made as the window makes one (at the end of « À faire »).
async fn made(h: &Harness, p: &Project, title: &str) -> Ticket {
    h.core
        .ticket_create(
            &p.id,
            TicketDraft {
                title: title.into(),
                ..Default::default()
            },
        )
        .await
        .unwrap()
}

/// `made`, coming after `after`.
async fn made_after(h: &Harness, p: &Project, title: &str, after: &[&Ticket]) -> Ticket {
    h.core
        .ticket_create(
            &p.id,
            TicketDraft {
                title: title.into(),
                after: after.iter().map(|t| t.id.clone()).collect(),
                ..Default::default()
            },
        )
        .await
        .unwrap()
}

fn stored(h: &Harness, id: &str) -> Ticket {
    h.core.ticket(id).unwrap()
}

/// The keys of the tickets « À faire » of `p`, in the order the board shows them.
async fn todo(c: &Client, p: &Project) -> Vec<String> {
    keys(
        &read(
            c,
            "list_tickets",
            json!({ "project": p.id, "column": "todo" }),
        )
        .await,
    )
}

/// The activity log's last entry, whole.
fn entry(h: &Harness) -> crate::mcp::activity::ActivityEntry {
    h.core.mcp.activity.entries().pop().unwrap()
}

/// How many `ticket` events the window was sent for ticket `id`.
fn ticket_events(h: &Harness, id: &str) -> usize {
    h.events
        .lock()
        .iter()
        .filter(|e| e["type"] == "ticket" && e["ticket"]["id"] == id)
        .count()
}

/// An agent of `p` with a running turn (no process): it counts as working.
fn working_agent(h: &Harness, p: &Project, name: &str, at: i64) -> AgentMeta {
    let meta = put_agent(h, p, name, at);
    h.core.agent(&meta.id).unwrap().lock().meta.status = AgentStatus::Running;
    meta
}

/// Waits until the agent's turn is over.
async fn turn_over(h: &Harness, id: &str) {
    h.wait("the agent's turn to end", |h| {
        let m = h.agent(id);
        !m.status.is_active() && m.prompts > 0
    })
    .await;
}

#[tokio::test]
async fn the_acting_tools_say_what_they_take_and_that_they_change_things() {
    let h = harness("mcp-act-schemas");
    let c = external(&h).await;
    let tools = c.list_all_tools().await.unwrap();
    let schema = |name: &str| {
        let t = tools.iter().find(|t| t.name == name).unwrap();
        serde_json::to_value(&t.input_schema).unwrap()
    };
    for name in ACTING.iter().chain(AGENTS_ONLY) {
        let t = tools.iter().find(|t| t.name == *name).unwrap();
        let v = serde_json::to_value(t).unwrap();
        assert!(v["description"].as_str().unwrap().len() > 60, "{name}: {v}");
        // They change something: the client must not take them for reads.
        assert_eq!(v["annotations"]["readOnlyHint"], false, "{name}: {v}");
        assert_eq!(v["annotations"]["openWorldHint"], false, "{name}: {v}");
        for (arg, spec) in schema(name)["properties"].as_object().unwrap() {
            assert!(
                spec["description"]
                    .as_str()
                    .is_some_and(|d| d.len() > 10 && !d.contains('\n')),
                "{name}.{arg}: {spec}"
            );
        }
    }
    let required = |name: &str| {
        let mut r: Vec<String> = serde_json::from_value(schema(name)["required"].clone()).unwrap();
        r.sort();
        r
    };
    assert_eq!(required("create_ticket"), ["project", "title"]);
    assert_eq!(required("update_ticket"), ["ticket"]);
    assert_eq!(required("move_ticket"), ["position", "ticket"]);
    assert_eq!(required("start_ticket"), ["ticket"]);
    assert_eq!(required("set_board"), ["project"]);
    assert_eq!(required("create_agent"), ["message", "project"]);
    assert_eq!(required("send_message"), ["agent", "text"]);
    assert_eq!(required("stop_agent"), ["agent"]);
    assert_eq!(required("report_progress"), ["line"]);
    assert_eq!(required("split_ticket"), ["tickets"]);
    let position = schema("move_ticket")["properties"]["position"].to_string();
    for p in ["top", "bottom", "before"] {
        assert!(position.contains(p), "{position}");
    }
    // The Kanban's settings, named as `get_board` answers them (it can be given back as it is),
    // the choices of the three that have a few written in the schema.
    let board = schema("set_board");
    let mut names: Vec<&str> = board["properties"]
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    names.sort();
    assert_eq!(
        names,
        [
            "action",
            "autopilot",
            "cleanup",
            "conflict",
            "conventional",
            "draft",
            "effort",
            "maxParallel",
            "mode",
            "model",
            "project",
            "strategy",
            "target",
            "testsFirst"
        ]
    );
    for (arg, choices) in [
        ("action", &["merge", "pr", "push", "keep"][..]),
        ("strategy", &["merge", "squash", "rebase"]),
        ("conflict", &["ask", "agent", "abort"]),
    ] {
        let spec = board["properties"][arg].to_string();
        for choice in choices {
            assert!(spec.contains(choice), "{arg}: {spec}");
        }
    }
    // What a refusal comes of is said before the call: the mode that is the user's to give, the
    // test command it does not set.
    let (mode, tests) = (
        board["properties"]["mode"]["description"].as_str().unwrap(),
        board["properties"]["testsFirst"]["description"]
            .as_str()
            .unwrap(),
    );
    assert!(mode.contains("bypassPermissions"), "{mode}");
    assert!(tests.contains("test command"), "{tests}");
    // And the tool says it is for the next tickets' agents, not the ones already at work.
    let described = tools.iter().find(|t| t.name == "set_board").unwrap();
    let said = serde_json::to_value(described).unwrap()["description"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(
        said.contains("bypassPermissions") && said.contains("already"),
        "{said}"
    );
    assert!(
        schema("report_progress")["properties"]["line"]["description"]
            .as_str()
            .unwrap()
            .contains("120")
    );
    // Exactly the set the server is meant to offer.
    let mut listed: Vec<String> = tools.iter().map(|t| t.name.to_string()).collect();
    listed.retain(|n| n != "whoami");
    listed.sort();
    assert_eq!(listed, EXPOSED);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_ticket_is_created_in_to_do_with_its_criteria_and_what_it_comes_after() {
    let h = harness("mcp-act-create-ticket");
    let p = project(&h).await;
    let c = external(&h).await;
    let first = read(
        &c,
        "create_ticket",
        json!({
            "project": "DEMO",
            "title": "  Ajouter la page d’accueil  ",
            "description": "Une page.\nAvec un titre.",
            "criteria": ["Le titre s’affiche", "  ", "Le lien marche\nLe test passe"],
        }),
    )
    .await;
    // The answer is the ticket as `get_ticket` gives it.
    let id = first["id"].as_str().unwrap().to_string();
    assert_eq!(
        first,
        json!({
            "id": id,
            "key": "DEM-1",
            "title": "Ajouter la page d’accueil",
            "description": "Une page.\nAvec un titre.\n\nCréé par Claude (hors Escouade) via Escouade",
            "criteria": [
                { "text": "Le titre s’affiche", "ok": false, "note": "" },
                { "text": "Le lien marche", "ok": false, "note": "" },
                { "text": "Le test passe", "ok": false, "note": "" },
            ],
            "loops": { "iteration": 0, "max": 5 },
            "column": "todo",
            "after": [],
            "progress": [],
            "external": null,
        })
    );
    // Made on the board, the window told as it is for a ticket made there.
    let t = stored(&h, &id);
    assert_eq!(
        (t.column, t.project_id.as_str()),
        (Column::Todo, p.id.as_str())
    );
    assert!(ticket_events(&h, &id) >= 1);
    assert!(h.events.lock().iter().any(|e| e["type"] == "project"));
    let (caller, tool, summary, outcome) = last_entry(&h);
    assert_eq!(
        (caller.as_str(), tool.as_str(), outcome),
        ("Claude (hors Escouade)", "create_ticket", "ok")
    );
    assert!(summary.contains("project: DEMO") && summary.contains("Ajouter la page"));
    assert_eq!(
        read(&c, "get_ticket", json!({ "ticket": "dem-1" })).await,
        first
    );

    // Without criteria the default two; after another ticket, named by its key in any case.
    let second = read(
        &c,
        "create_ticket",
        json!({ "project": p.id, "title": "La suite", "after": ["dem-1"] }),
    )
    .await;
    assert_eq!(second["key"], "DEM-2");
    // No description of its own: the origin line is all it has.
    assert_eq!(
        second["description"],
        "Créé par Claude (hors Escouade) via Escouade"
    );
    assert_eq!(second["after"], json!(["DEM-1"]));
    assert_eq!(
        second["criteria"][0]["text"],
        "Implémentation conforme au ticket"
    );
    assert_eq!(
        stored(&h, second["id"].as_str().unwrap()).after,
        vec![id.clone()]
    );

    // Refused or failed, and told why; nothing is made.
    let before = h.core.tickets.read().len();
    let no_project = refused(
        &c,
        "create_ticket",
        json!({ "project": "nope", "title": "x" }),
    )
    .await;
    assert!(no_project.contains("Aucun projet « nope »"), "{no_project}");
    assert_eq!(entry(&h).outcome, "error");
    let blank = refused(
        &c,
        "create_ticket",
        json!({ "project": "demo", "title": "   " }),
    )
    .await;
    assert!(blank.contains("titre"), "{blank}");
    let no_after = refused(
        &c,
        "create_ticket",
        json!({ "project": "demo", "title": "x", "after": ["ZZZ-9"] }),
    )
    .await;
    assert!(
        no_after.contains("Aucun ticket « ZZZ-9 » dans le projet demo")
            && no_after.contains("DEM-1"),
        "{no_after}"
    );
    // A ticket of another project is no ticket to come after.
    let other = other_project(&h, "autre").await;
    let theirs = put(&h, ticket(&other, "AUT-1", "Ailleurs", Column::Todo, 1));
    let elsewhere = refused(
        &c,
        "create_ticket",
        json!({ "project": "demo", "title": "x", "after": [theirs.key] }),
    )
    .await;
    assert!(elsewhere.contains("dans le projet demo"), "{elsewhere}");
    let too_long = refused(
        &c,
        "create_ticket",
        json!({ "project": "demo", "title": "t".repeat(201) }),
    )
    .await;
    assert!(too_long.contains("200"), "{too_long}");
    assert_eq!(h.core.tickets.read().len(), before + 1);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_ticket_to_do_is_edited_a_field_at_a_time_and_never_into_a_loop() {
    let h = harness("mcp-act-update-ticket");
    let p = project(&h).await;
    let a = made(&h, &p, "Premier").await;
    let b = made_after(&h, &p, "Deuxième", &[&a]).await;
    let c = external(&h).await;

    // Only what is given changes.
    let v = read(
        &c,
        "update_ticket",
        json!({ "ticket": "dem-2", "title": "  Deuxième, revu " }),
    )
    .await;
    assert_eq!(v["title"], "Deuxième, revu");
    assert_eq!(v["after"], json!(["DEM-1"]));
    assert_eq!(v["criteria"][1]["text"], "Tests verts");
    let v = read(
        &c,
        "update_ticket",
        json!({ "ticket": b.id, "description": "Plus de détails", "criteria": ["Un seul critère"] }),
    )
    .await;
    assert_eq!(
        v["description"],
        "Plus de détails\n\nModifié par Claude (hors Escouade) via Escouade"
    );
    assert_eq!(v["title"], "Deuxième, revu");
    assert_eq!(
        v["criteria"],
        json!([{ "text": "Un seul critère", "ok": false, "note": "" }])
    );
    let seen = ticket_events(&h, &b.id);
    // An empty list takes its dependencies away, a list sets them.
    let v = read(
        &c,
        "update_ticket",
        json!({ "ticket": "DEM-2", "after": [] }),
    )
    .await;
    assert_eq!(v["after"], json!([]));
    assert!(stored(&h, &b.id).after.is_empty());
    let v = read(
        &c,
        "update_ticket",
        json!({ "ticket": "DEM-2", "after": ["DEM-1"] }),
    )
    .await;
    assert_eq!(v["after"], json!(["DEM-1"]));
    assert!(ticket_events(&h, &b.id) >= seen + 2);
    assert_eq!(entry(&h).tool, "update_ticket");

    // The branch the window gave the ticket (« Reprendre une branche existante… ») is not the
    // tools' to change: editing another field keeps it.
    h.core
        .edit_ticket(&b.id, |t| {
            t.branch = "feat/login".into();
            Ok(())
        })
        .unwrap();
    read(
        &c,
        "update_ticket",
        json!({ "ticket": "DEM-2", "title": "Deuxième, encore revu" }),
    )
    .await;
    assert_eq!(stored(&h, &b.id).branch, "feat/login");

    // DEM-1 after DEM-2, which waits for DEM-1: refused with the board's own words.
    let loop_ = refused(
        &c,
        "update_ticket",
        json!({ "ticket": "DEM-1", "after": ["DEM-2"] }),
    )
    .await;
    assert_eq!(loop_, "DEM-2 attend déjà DEM-1 (directement ou non).");
    assert!(stored(&h, &a.id).after.is_empty());
    let logged = entry(&h);
    assert_eq!(
        (logged.outcome, logged.message.as_deref()),
        ("refused", Some(loop_.as_str()))
    );

    // Only a ticket « À faire » is edited.
    let doing = put(&h, ticket(&p, "DEM-9", "En route", Column::Doing, 5));
    let late = refused(
        &c,
        "update_ticket",
        json!({ "ticket": doing.key, "title": "Autre" }),
    )
    .await;
    assert_eq!(late, "Seul un ticket « À faire » se modifie.");
    assert_eq!(entry(&h).outcome, "refused");
    assert_eq!(stored(&h, &doing.id).title, "En route");

    // Nothing to change, a blank title, a ticket that is not there.
    let none = refused(&c, "update_ticket", json!({ "ticket": "DEM-1" })).await;
    assert!(none.contains("Rien à modifier"), "{none}");
    let blank = refused(
        &c,
        "update_ticket",
        json!({ "ticket": "DEM-1", "title": " " }),
    )
    .await;
    assert!(blank.contains("titre"), "{blank}");
    assert_eq!(stored(&h, &a.id).title, "Premier");
    let unknown = refused(
        &c,
        "update_ticket",
        json!({ "ticket": "ZZZ-1", "title": "x" }),
    )
    .await;
    assert!(unknown.contains("Aucun ticket « ZZZ-1 »"), "{unknown}");
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_ticket_to_do_goes_to_the_top_the_bottom_or_before_another_and_nothing_else_moves() {
    let h = harness("mcp-act-move-ticket");
    let p = project(&h).await;
    for title in ["Un", "Deux", "Trois", "Quatre"] {
        made(&h, &p, title).await;
    }
    let c = external(&h).await;
    let order = || todo(&c, &p);
    assert_eq!(order().await, ["DEM-1", "DEM-2", "DEM-3", "DEM-4"]);

    let v = read(
        &c,
        "move_ticket",
        json!({ "ticket": "dem-4", "position": "top" }),
    )
    .await;
    assert_eq!(v["todo"], json!(["DEM-4", "DEM-1", "DEM-2", "DEM-3"]));
    assert_eq!(entry(&h).tool, "move_ticket");
    assert_eq!(order().await, ["DEM-4", "DEM-1", "DEM-2", "DEM-3"]);
    let t4 = h
        .core
        .tickets
        .read()
        .iter()
        .find(|t| t.key == "DEM-4")
        .cloned()
        .unwrap();
    assert!(ticket_events(&h, &t4.id) >= 2);

    read(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-4", "position": "bottom" }),
    )
    .await;
    assert_eq!(order().await, ["DEM-1", "DEM-2", "DEM-3", "DEM-4"]);
    read(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-3", "position": "before", "before": "dem-1" }),
    )
    .await;
    assert_eq!(order().await, ["DEM-3", "DEM-1", "DEM-2", "DEM-4"]);
    // Between two tickets whose ranks leave no room: the others keep their order.
    read(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-4", "position": "before", "before": "DEM-2" }),
    )
    .await;
    assert_eq!(order().await, ["DEM-3", "DEM-1", "DEM-4", "DEM-2"]);
    // Where it is already: nothing changes.
    let seen: usize = h
        .core
        .tickets
        .read()
        .iter()
        .map(|t| ticket_events(&h, &t.id))
        .sum();
    read(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-1", "position": "before", "before": "DEM-4" }),
    )
    .await;
    assert_eq!(order().await, ["DEM-3", "DEM-1", "DEM-4", "DEM-2"]);
    let now: usize = h
        .core
        .tickets
        .read()
        .iter()
        .map(|t| ticket_events(&h, &t.id))
        .sum();
    assert_eq!(seen, now);

    // A ticket that left « À faire » does not move, and nothing is put before one.
    let doing = put(&h, ticket(&p, "DEM-9", "En route", Column::Doing, 5));
    let rank = doing.rank;
    let not_todo = refused(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-9", "position": "top" }),
    )
    .await;
    assert_eq!(not_todo, "Seul un ticket « À faire » se déplace.");
    assert_eq!(entry(&h).outcome, "refused");
    assert_eq!(stored(&h, &doing.id).rank, rank);
    let before_it = refused(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-1", "position": "before", "before": "DEM-9" }),
    )
    .await;
    assert!(
        before_it.contains("DEM-9") && before_it.contains("« À faire »"),
        "{before_it}"
    );
    let itself = refused(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-1", "position": "before", "before": "DEM-1" }),
    )
    .await;
    assert!(itself.contains("avant lui-même"), "{itself}");
    let missing = refused(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-1", "position": "before" }),
    )
    .await;
    assert!(missing.contains("before"), "{missing}");
    let extra = refused(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-1", "position": "top", "before": "DEM-2" }),
    )
    .await;
    assert!(extra.contains("before"), "{extra}");
    let other = other_project(&h, "autre").await;
    put(&h, ticket(&other, "AUT-1", "Ailleurs", Column::Todo, 1));
    let foreign = refused(
        &c,
        "move_ticket",
        json!({ "ticket": "DEM-1", "position": "before", "before": "AUT-1" }),
    )
    .await;
    assert!(foreign.contains("dans le projet demo"), "{foreign}");
    assert_eq!(order().await, ["DEM-3", "DEM-1", "DEM-4", "DEM-2"]);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_ticket_is_started_by_hand_and_the_scheduler_takes_it() {
    let h = harness("mcp-act-start-ticket");
    let p = project(&h).await;
    let a = made(&h, &p, "Un ticket [ok]").await;
    let c = external(&h).await;
    assert!(!stored(&h, &a.id).forced);
    let v = read(&c, "start_ticket", json!({ "ticket": "dem-1" })).await;
    assert_eq!(v["key"], "DEM-1");
    let logged = entry(&h);
    assert_eq!(
        (
            logged.tool.as_str(),
            logged.outcome,
            logged.summary.as_str()
        ),
        ("start_ticket", "ok", "ticket: dem-1")
    );
    // The scheduler gives it an agent, as it does for the window's « Lancer ».
    h.wait("the ticket to start", |h| {
        stored(h, &a.id).column != Column::Todo
    })
    .await;
    assert!(h.events.lock().iter().any(|e| e["type"] == "ticket"
        && e["ticket"]["id"] == a.id.as_str()
        && e["ticket"]["forced"] == true));
    h.wait("its agent to be made", |h| {
        stored(h, &a.id).agent_id.is_some()
    })
    .await;
    // Started already: refused.
    let again = refused(&c, "start_ticket", json!({ "ticket": a.key })).await;
    assert_eq!(again, "Ce ticket est déjà parti.");
    assert_eq!(entry(&h).outcome, "refused");
    h.wait("its turn to end", |h| {
        stored(h, &a.id).column == Column::Review
    })
    .await;
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_ticket_is_not_started_while_the_autopilot_is_paused_the_board_is_full_or_it_waits() {
    let h = harness("mcp-act-start-guards");
    let p = project(&h).await;
    let a = made(&h, &p, "Premier").await;
    let b = made_after(&h, &p, "Deuxième", &[&a]).await;
    let c = external(&h).await;

    // Paused after a usage limit: the message says until when, and the ticket is not marked.
    h.core.pause_after_limit(PRINCIPAL);
    let until = h.core.autopilot_pause().unwrap().until;
    let paused = refused(&c, "start_ticket", json!({ "ticket": a.key })).await;
    assert!(
        paused.contains("pause")
            && paused.contains("limite d’usage")
            && paused.contains(&clock(until)),
        "{paused}"
    );
    assert!(!stored(&h, &a.id).forced);
    let logged = entry(&h);
    assert_eq!(
        (
            logged.tool.as_str(),
            logged.outcome,
            logged.message.as_deref()
        ),
        ("start_ticket", "refused", Some(paused.as_str()))
    );
    h.core.autopilot_resume();
    assert!(h.core.autopilot_pause().is_none());

    // A window of the quota over the threshold: the percentage and the end.
    let end = h.core.pause_now() + 3_600_000;
    h.core.record_usage(
        PRINCIPAL,
        Reading::Windows((
            Some(RateWindow {
                pct: 100.0,
                resets_at: Some(end),
            }),
            None,
        )),
    );
    // It holds until the window's end and the margin a resume waits after it.
    let until = h.core.autopilot_pause().unwrap().until;
    assert!(until > end);
    let over = refused(&c, "start_ticket", json!({ "ticket": a.key })).await;
    assert!(
        over.contains("5 h") && over.contains("100 %") && over.contains(&clock(until)),
        "{over}"
    );
    *h.core.usage.lock() = UsageSnapshot::default();
    assert!(h.core.autopilot_pause().is_none());

    // An agent waits for its quota: nothing starts until it resumes.
    let waiting = put_agent(&h, &p, "attend", 1);
    let resume = h.core.pause_now() + 7_200_000;
    h.core.agent(&waiting.id).unwrap().lock().meta.resume_at = Some(resume);
    let quota = refused(&c, "start_ticket", json!({ "ticket": a.key })).await;
    assert!(
        quota.contains("quota") && quota.contains(&clock(resume)),
        "{quota}"
    );
    h.core.agent(&waiting.id).unwrap().lock().meta.resume_at = None;

    // The board already runs its most tickets in parallel (2 by default): blocked ones do not count.
    let d1 = put(&h, ticket(&p, "DEM-7", "En route", Column::Doing, 10));
    put(&h, ticket(&p, "DEM-8", "Aussi", Column::Doing, 11));
    let full = refused(&c, "start_ticket", json!({ "ticket": a.key })).await;
    assert!(
        full.contains("demo") && full.contains("(2,") && full.contains("« En parallèle »"),
        "{full}"
    );
    assert!(!stored(&h, &a.id).forced);
    h.core
        .edit_ticket(&d1.id, |t| {
            t.blocked = Some("bloqué".into());
            Ok(())
        })
        .unwrap();
    // One place is free again: the ticket that waits for DEM-1 is still refused, and which.
    let waits = refused(&c, "start_ticket", json!({ "ticket": b.key })).await;
    assert!(
        waits.contains("DEM-2") && waits.contains("DEM-1") && waits.contains("update_ticket"),
        "{waits}"
    );
    assert!(!stored(&h, &b.id).forced);
    assert_eq!(entry(&h).outcome, "refused");

    // A board that starts nothing says why.
    h.core
        .board_issues
        .lock()
        .insert(p.id.clone(), "Branche cible main introuvable".into());
    let issue = refused(&c, "start_ticket", json!({ "ticket": a.key })).await;
    assert!(issue.contains("Branche cible main introuvable"), "{issue}");
    assert!(!stored(&h, &a.id).forced);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn an_agent_is_created_in_a_project_with_its_first_message_and_the_user_s_selection_stays() {
    let h = harness("mcp-act-create-agent");
    let (p, _) = h.project(false).await;
    // Saving a project's settings looks again at whether the server is wanted.
    h.core.settings.write().mcp_enabled = true;
    let c = external(&h).await;
    let v = read(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "Bonjour l’équipe" }),
    )
    .await;
    let id = v["id"].as_str().unwrap().to_string();
    assert_eq!(v["name"], "agent-1");
    assert_eq!(v.as_object().unwrap().len(), 2);
    // Made as the window makes one, but the sidebar's selection is the user's.
    let meta = h.agent(&id);
    assert_eq!(
        (meta.project_id.as_str(), meta.name.as_str()),
        (p.id.as_str(), "agent-1")
    );
    assert!(meta.worktree.is_none());
    assert!(!h.core.ui.read().selected_agent.contains_key(&p.id));
    assert!(h
        .events
        .lock()
        .iter()
        .any(|e| e["type"] == "agent" && e["agent"]["id"] == id.as_str()));
    // Its first message is sent: Claude answers it.
    turn_over(&h, &id).await;
    assert!(h.items(&id).iter().any(|i| i["text"]
        == "Bonjour, tu as dit : Message de Claude (hors Escouade) : Bonjour l’équipe"));
    // The conversation shows who wrote it: it is not the user's own message.
    assert!(h.items(&id).iter().any(|i| i["kind"] == "user"
        && i["text"] == "Message de Claude (hors Escouade) : Bonjour l’équipe"));
    let logged = entry(&h);
    assert_eq!(
        (logged.tool.as_str(), logged.outcome),
        ("create_agent", "ok")
    );
    assert!(
        logged.summary.contains("project: demo") && logged.summary.contains("Bonjour l’équipe")
    );

    // A worktree of its own, or the project's folder, whatever the project does by default.
    let v = read(
        &c,
        "create_agent",
        json!({ "project": p.id, "message": "Dans un worktree", "worktree": true }),
    )
    .await;
    let wt = h.agent(v["id"].as_str().unwrap()).worktree;
    assert!(wt.is_some_and(|w| std::path::Path::new(&w.path).is_dir()));
    turn_over(&h, v["id"].as_str().unwrap()).await;
    h.core
        .update_project(Project {
            worktree_per_agent: true,
            ..h.core.project(&p.id).unwrap()
        })
        .unwrap();
    let v = read(
        &c,
        "create_agent",
        json!({ "project": p.id, "message": "Par défaut" }),
    )
    .await;
    assert!(h.agent(v["id"].as_str().unwrap()).worktree.is_some());
    turn_over(&h, v["id"].as_str().unwrap()).await;
    let v = read(
        &c,
        "create_agent",
        json!({ "project": p.id, "message": "Sans", "worktree": false }),
    )
    .await;
    assert!(h.agent(v["id"].as_str().unwrap()).worktree.is_none());
    turn_over(&h, v["id"].as_str().unwrap()).await;

    // A model, as the window offers them; a name that is none is refused before anything is made.
    *h.core.models.write() = vec![ModelInfo {
        value: "sonnet".into(),
        resolved_model: "claude-sonnet-9".into(),
    }];
    let count = h.core.agents.read().len();
    let v = read(
        &c,
        "create_agent",
        json!({ "project": p.id, "message": "Un modèle", "model": "sonnet" }),
    )
    .await;
    assert_eq!(h.agent(v["id"].as_str().unwrap()).model, "sonnet");
    turn_over(&h, v["id"].as_str().unwrap()).await;
    let unknown = refused(
        &c,
        "create_agent",
        json!({ "project": p.id, "message": "x", "model": "opus" }),
    )
    .await;
    assert!(
        unknown.contains("opus") && unknown.contains("sonnet"),
        "{unknown}"
    );
    let odd = refused(
        &c,
        "create_agent",
        json!({ "project": p.id, "message": "x", "model": "--permission-mode" }),
    )
    .await;
    assert!(odd.contains("--permission-mode"), "{odd}");
    let blank = refused(
        &c,
        "create_agent",
        json!({ "project": p.id, "message": "  " }),
    )
    .await;
    assert!(blank.contains("message"), "{blank}");
    let none = refused(
        &c,
        "create_agent",
        json!({ "project": "nope", "message": "x" }),
    )
    .await;
    assert!(none.contains("Aucun projet « nope »"), "{none}");
    assert_eq!(h.core.agents.read().len(), count + 1);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn no_agent_is_created_while_the_autopilot_is_paused_or_the_project_s_agents_are_all_at_work()
{
    let h = harness("mcp-act-create-agent-guards");
    let (p, _) = h.project(false).await;
    let c = external(&h).await;

    h.core.pause_after_limit(PRINCIPAL);
    let until = h.core.autopilot_pause().unwrap().until;
    let paused = refused(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "x" }),
    )
    .await;
    assert!(
        paused.contains("pause") && paused.contains(&clock(until)),
        "{paused}"
    );
    assert!(h.core.agents.read().is_empty());
    let logged = entry(&h);
    assert_eq!(
        (
            logged.tool.as_str(),
            logged.outcome,
            logged.message.as_deref()
        ),
        ("create_agent", "refused", Some(paused.as_str()))
    );
    h.core.autopilot_resume();

    // Two agents work (the project's maximum is 2); one that is done, idle or archived does not count.
    working_agent(&h, &p, "un", 1);
    let other = working_agent(&h, &p, "deux", 2);
    put_agent(&h, &p, "oisif", 3);
    let gone = working_agent(&h, &p, "archivé", 4);
    h.core.agent(&gone.id).unwrap().lock().meta.archived = true;
    let full = refused(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "x" }),
    )
    .await;
    assert!(
        full.contains("demo") && full.contains("(2,") && full.contains("« En parallèle »"),
        "{full}"
    );
    assert_eq!(h.core.agents.read().len(), 4);
    assert_eq!(entry(&h).outcome, "refused");
    // One finishes: a place is free.
    h.core.agent(&other.id).unwrap().lock().meta.status = AgentStatus::Done;
    let v = read(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "Place libre" }),
    )
    .await;
    turn_over(&h, v["id"].as_str().unwrap()).await;
    // Another project has its own count.
    let elsewhere = other_project(&h, "autre").await;
    let v = read(
        &c,
        "create_agent",
        json!({ "project": elsewhere.id, "message": "Ailleurs" }),
    )
    .await;
    turn_over(&h, v["id"].as_str().unwrap()).await;
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_message_reaches_an_agent_unless_the_autopilot_is_paused_it_is_oneself_or_archived() {
    let h = harness("mcp-act-send-message");
    let (p, _) = h.project(false).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap().meta;
    let b = h.core.create_agent(&p.id, None).await.unwrap().meta;
    let c = external(&h).await;

    let v = read(
        &c,
        "send_message",
        json!({ "agent": a.name, "text": "Salut" }),
    )
    .await;
    assert_eq!(
        (v["id"].as_str(), v["name"].as_str()),
        (Some(a.id.as_str()), Some("agent-1"))
    );
    turn_over(&h, &a.id).await;
    // Its first message has it named (by the fake claude, in the background): the name it keeps, before it is listed.
    h.wait("its name", |h| h.agent(&a.id).named).await;
    // The agent is told who writes, and the conversation shows it.
    assert!(h
        .items(&a.id)
        .iter()
        .any(|i| i["text"] == "Bonjour, tu as dit : Message de Claude (hors Escouade) : Salut"));
    assert!(h
        .items(&a.id)
        .iter()
        .any(|i| i["kind"] == "user" && i["text"] == "Message de Claude (hors Escouade) : Salut"));
    let logged = entry(&h);
    assert_eq!(
        (logged.tool.as_str(), logged.outcome),
        ("send_message", "ok")
    );
    assert!(logged.summary.contains("agent: agent-1") && logged.summary.contains("text: Salut"));

    // Another agent may write to it; to itself it may not.
    let from_b = as_agent(&h, &b.id).await;
    read(
        &from_b,
        "send_message",
        json!({ "agent": a.id, "text": "De la part de B" }),
    )
    .await;
    turn_over(&h, &a.id).await;
    assert!(h
        .items(&a.id)
        .iter()
        .any(|i| i["text"] == "Bonjour, tu as dit : Message de agent-2 : De la part de B"));
    assert!(h
        .items(&a.id)
        .iter()
        .any(|i| i["kind"] == "user" && i["text"] == "Message de agent-2 : De la part de B"));
    let prompts = h.agent(&b.id).prompts;
    let itself = refused(
        &from_b,
        "send_message",
        json!({ "agent": "AGENT-2", "text": "Moi" }),
    )
    .await;
    assert!(
        itself.contains("lui-même") || itself.contains("toi-même"),
        "{itself}"
    );
    assert_eq!(h.agent(&b.id).prompts, prompts);
    let logged = entry(&h);
    assert_eq!(
        (logged.caller.as_str(), logged.tool.as_str(), logged.outcome),
        ("agent-2", "send_message", "refused")
    );
    from_b.cancel().await.unwrap();

    // Paused: no message goes out (it would spend quota), and the answer says until when.
    h.core.pause_after_limit(PRINCIPAL);
    let until = h.core.autopilot_pause().unwrap().until;
    let prompts = h.agent(&a.id).prompts;
    let paused = refused(
        &c,
        "send_message",
        json!({ "agent": a.id, "text": "Pause" }),
    )
    .await;
    assert!(
        paused.contains("pause") && paused.contains(&clock(until)),
        "{paused}"
    );
    assert_eq!(h.agent(&a.id).prompts, prompts);
    h.core.autopilot_resume();

    // An archived agent takes no message; a blank text, an unknown agent: told, nothing sent.
    let b_prompts = h.agent(&b.id).prompts;
    h.core.agent(&b.id).unwrap().lock().meta.archived = true;
    let archived = refused(
        &c,
        "send_message",
        json!({ "agent": b.id, "text": "Encore" }),
    )
    .await;
    assert!(archived.contains("archivé"), "{archived}");
    assert_eq!(h.agent(&b.id).prompts, b_prompts);
    let blank = refused(&c, "send_message", json!({ "agent": a.id, "text": " " })).await;
    assert!(blank.contains("message"), "{blank}");
    let unknown = refused(&c, "send_message", json!({ "agent": "zzz", "text": "x" })).await;
    assert!(
        unknown.contains("Aucun agent « zzz »") && unknown.contains(&h.agent(&a.id).name),
        "{unknown}"
    );
    assert_eq!(h.agent(&a.id).prompts, prompts);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_running_turn_is_interrupted_by_another_and_never_by_the_agent_itself() {
    let h = harness("mcp-act-stop-agent");
    let (p, _) = h.project(false).await;
    let a = h
        .core
        .create_agent_with(
            &p.id,
            crate::core::AgentOptions {
                // Named: never renamed after its first message, as the test names it.
                name: Some("agent-1".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap()
        .meta;
    let b = h.core.create_agent(&p.id, None).await.unwrap().meta;
    let c = external(&h).await;
    // Not at work: nothing to stop, and it says so.
    let v = read(&c, "stop_agent", json!({ "agent": "agent-1" })).await;
    assert_eq!(
        (v["id"].as_str(), v["interrupted"].as_bool()),
        (Some(a.id.as_str()), Some(false))
    );

    h.core
        .send_message(&a.id, "slow".into(), vec![])
        .await
        .unwrap();
    h.wait("its turn to run", |h| h.agent(&a.id).status.is_active())
        .await;
    // Not itself.
    let from_a = as_agent(&h, &a.id).await;
    let itself = refused(&from_a, "stop_agent", json!({ "agent": a.name })).await;
    assert!(itself.contains("propre tour"), "{itself}");
    assert!(h.agent(&a.id).status.is_active());
    let logged = entry(&h);
    assert_eq!(
        (logged.caller.as_str(), logged.tool.as_str(), logged.outcome),
        ("agent-1", "stop_agent", "refused")
    );
    from_a.cancel().await.unwrap();
    // Another agent may.
    let from_b = as_agent(&h, &b.id).await;
    let v = read(&from_b, "stop_agent", json!({ "agent": a.id })).await;
    assert_eq!(
        (v["name"].as_str(), v["interrupted"].as_bool()),
        (Some("agent-1"), Some(true))
    );
    h.wait("the turn to stop", |h| !h.agent(&a.id).status.is_active())
        .await;
    assert_eq!(entry(&h).outcome, "ok");
    let unknown = refused(&from_b, "stop_agent", json!({ "agent": "zzz" })).await;
    assert!(unknown.contains("Aucun agent « zzz »"), "{unknown}");
    from_b.cancel().await.unwrap();
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn an_agent_reports_what_it_does_on_one_line_and_a_new_report_replaces_it() {
    let h = harness("mcp-act-report-progress");
    let (p, _) = h.project(false).await;
    let a = put_agent(&h, &p, "rapporteur", 1);
    let c = as_agent(&h, &a.id).await;
    let line = || h.agent(&a.id).progress_line;
    assert_eq!(line(), None);
    let v = read(
        &c,
        "report_progress",
        json!({ "line": "  Écrit les tests du parseur  " }),
    )
    .await;
    assert_eq!(v, json!({ "line": "Écrit les tests du parseur" }));
    assert_eq!(line().as_deref(), Some("Écrit les tests du parseur"));
    // The window is told (a card shows it).
    assert!(h.events.lock().iter().any(|e| e["type"] == "agent"
        && e["agent"]["id"] == a.id.as_str()
        && e["agent"]["progressLine"] == "Écrit les tests du parseur"));
    let logged = entry(&h);
    assert_eq!(
        (
            logged.caller.as_str(),
            logged.tool.as_str(),
            logged.outcome,
            logged.summary.as_str()
        ),
        (
            "rapporteur",
            "report_progress",
            "ok",
            "line: Écrit les tests du parseur"
        )
    );
    // One line: breaks and runs of spaces become single spaces.
    read(
        &c,
        "report_progress",
        json!({ "line": "Lit\nle code\r\n  du   parseur" }),
    )
    .await;
    assert_eq!(line().as_deref(), Some("Lit le code du parseur"));
    // 120 characters (not bytes) are the most.
    let longest = "é".repeat(120);
    read(&c, "report_progress", json!({ "line": longest })).await;
    assert_eq!(line().as_deref(), Some(longest.as_str()));
    let too_long = refused(&c, "report_progress", json!({ "line": "é".repeat(121) })).await;
    assert!(
        too_long.contains("121") && too_long.contains("120"),
        "{too_long}"
    );
    assert_eq!(line().as_deref(), Some(longest.as_str()));
    assert_eq!(entry(&h).outcome, "error");
    // Nothing hidden is kept: a direction override would reverse how the line reads on the cards,
    // a zero-width mark hide part of it.
    let sneaky = "Lit le code\u{202E}reverse\u{200B}d\u{FEFF} \u{2066}x\u{2069}\u{0007} é日本😀";
    let v = read(&c, "report_progress", json!({ "line": sneaky })).await;
    assert_eq!(v, json!({ "line": "Lit le codereversed x é日本😀" }));
    assert_eq!(line().as_deref(), Some("Lit le codereversed x é日本😀"));
    // Only a line that is nothing but such marks is empty.
    let v = read(&c, "report_progress", json!({ "line": "\u{202E}\u{200B}" })).await;
    assert_eq!(v, json!({ "line": null }));
    assert_eq!(line(), None);
    // Nothing on the line takes the old one off the cards.
    let v = read(&c, "report_progress", json!({ "line": "  " })).await;
    assert_eq!(v, json!({ "line": null }));
    assert_eq!(line(), None);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_status_line_is_kept_with_the_agent_and_an_agent_saved_before_it_has_none() {
    let h = harness("mcp-act-progress-saved");
    let (p, _) = h.project(false).await;
    let a = put_agent(&h, &p, "gardé", 1);
    let c = as_agent(&h, &a.id).await;
    read(&c, "report_progress", json!({ "line": "Relit le diff" })).await;
    c.cancel().await.unwrap();
    h.core.mcp.stop();
    h.core.save_now();
    let data = crate::paths::DataDir::new(h.dir.join("data"));
    let app = tauri::test::mock_app();
    let (reloaded, _rx) = crate::core::Core::load(app.handle().clone(), data);
    assert_eq!(
        reloaded
            .agent(&a.id)
            .unwrap()
            .lock()
            .meta
            .progress_line
            .as_deref(),
        Some("Relit le diff")
    );
    // A state.json of 1.6 has no such field.
    let old =
        r#"{ "projects": [], "agents": [{ "id": "a1", "name": "vieux", "projectId": "p1" }] }"#;
    let state: PersistedState = serde_json::from_str(old).unwrap();
    assert_eq!(state.agents[0].progress_line, None);
    let back = serde_json::to_value(&state.agents[0]).unwrap();
    assert_eq!(back["progressLine"], Value::Null);
}

#[tokio::test]
async fn the_tools_for_agents_are_refused_to_claude_outside_escouade_and_logged() {
    let h = harness("mcp-act-reserved");
    let (p, _) = h.project(false).await;
    let a = put_agent(&h, &p, "agent", 1);
    let t = put(&h, ticket(&p, "DEM-1", "Le sien", Column::Doing, 1));
    let c = external(&h).await;
    for (tool, args) in [
        ("report_progress", json!({ "line": "Je travaille" })),
        ("split_ticket", json!({ "tickets": [{ "title": "Un" }] })),
    ] {
        let why = refused(&c, tool, args).await;
        assert!(
            why.contains("réservé aux agents d’Escouade") && why.contains("Claude hors Escouade"),
            "{tool}: {why}"
        );
        let logged = entry(&h);
        assert_eq!(
            (logged.caller.as_str(), logged.tool.as_str(), logged.outcome),
            ("Claude (hors Escouade)", tool, "refused")
        );
        assert_eq!(logged.message.as_deref(), Some(why.as_str()));
    }
    assert_eq!(h.agent(&a.id).progress_line, None);
    assert_eq!(h.core.tickets.read().len(), 1);
    assert_eq!(stored(&h, &t.id).title, "Le sien");
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_ticket_is_split_into_tickets_after_it_in_a_chain_or_all_after_it_alone() {
    let h = harness("mcp-act-split-ticket");
    let p = project(&h).await;
    let own = made(&h, &p, "Gros ticket").await;
    h.core
        .edit_ticket(&own.id, |t| {
            t.column = Column::Doing;
            Ok(())
        })
        .unwrap();
    let a = put_agent(&h, &p, "gros", 1);
    h.core.agent(&a.id).unwrap().lock().meta.ticket_id = Some(own.id.clone());
    let c = as_agent(&h, &a.id).await;

    // Chained (by default): the first after the agent's ticket, each after the one before.
    let keys_made = read(
        &c,
        "split_ticket",
        json!({ "tickets": [
            { "title": "Étape 1", "description": "D’abord", "criteria": ["Un critère"] },
            { "title": "Étape 2" },
            { "title": "Étape 3" },
        ] }),
    )
    .await;
    assert_eq!(keys_made, json!(["DEM-2", "DEM-3", "DEM-4"]));
    let after = |key: &str| -> Vec<String> {
        let t = h
            .core
            .tickets
            .read()
            .iter()
            .find(|t| t.key == key)
            .cloned()
            .unwrap();
        t.after.iter().map(|id| stored(&h, id).key).collect()
    };
    assert_eq!(after("DEM-2"), ["DEM-1"]);
    assert_eq!(after("DEM-3"), ["DEM-2"]);
    assert_eq!(after("DEM-4"), ["DEM-3"]);
    let first = h
        .core
        .tickets
        .read()
        .iter()
        .find(|t| t.key == "DEM-2")
        .cloned()
        .unwrap();
    assert_eq!(
        (
            first.column,
            first.title.as_str(),
            first.description.as_str()
        ),
        (
            Column::Todo,
            "Étape 1",
            "D’abord\n\nCréé par gros via Escouade"
        )
    );
    // Each one says who split the ticket, with a description or without.
    let second_step = h
        .core
        .tickets
        .read()
        .iter()
        .find(|t| t.key == "DEM-3")
        .cloned()
        .unwrap();
    assert_eq!(second_step.description, "Créé par gros via Escouade");
    assert_eq!(first.criteria.len(), 1);
    assert!(ticket_events(&h, &first.id) >= 1);
    // The agent's own ticket is left as it was.
    assert_eq!(stored(&h, &own.id).column, Column::Doing);
    let logged = entry(&h);
    assert_eq!(
        (logged.caller.as_str(), logged.tool.as_str(), logged.outcome),
        ("gros", "split_ticket", "ok")
    );
    assert!(logged.summary.contains("Étape 1"));

    // In parallel: all after the agent's ticket alone.
    let parallel = read(
        &c,
        "split_ticket",
        json!({ "tickets": [{ "title": "Voie A" }, { "title": "Voie B" }], "chain": false }),
    )
    .await;
    assert_eq!(parallel, json!(["DEM-5", "DEM-6"]));
    assert_eq!(after("DEM-5"), ["DEM-1"]);
    assert_eq!(after("DEM-6"), ["DEM-1"]);

    // Nothing is made when one of them is no ticket, or none is given, or too many.
    let count = h.core.tickets.read().len();
    let blank = refused(
        &c,
        "split_ticket",
        json!({ "tickets": [{ "title": "Bon" }, { "title": " " }] }),
    )
    .await;
    assert!(blank.contains("2") && blank.contains("titre"), "{blank}");
    let none = refused(&c, "split_ticket", json!({ "tickets": [] })).await;
    assert!(none.contains("au moins"), "{none}");
    let many: Vec<Value> = (0..11)
        .map(|i| json!({ "title": format!("T{i}") }))
        .collect();
    let flood = refused(&c, "split_ticket", json!({ "tickets": many })).await;
    assert!(flood.contains("10"), "{flood}");
    assert_eq!(h.core.tickets.read().len(), count);
    c.cancel().await.unwrap();

    // An agent without a ticket has nothing to split.
    let free = put_agent(&h, &p, "libre", 2);
    let c = as_agent(&h, &free.id).await;
    let nothing = refused(
        &c,
        "split_ticket",
        json!({ "tickets": [{ "title": "Un" }] }),
    )
    .await;
    assert!(
        nothing.contains("libre") && nothing.contains("pas de ticket"),
        "{nothing}"
    );
    assert_eq!(entry(&h).outcome, "refused");
    assert_eq!(h.core.tickets.read().len(), count);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn the_first_message_of_an_agent_created_by_an_agent_says_who_wrote_it_and_the_name_ignores_that(
) {
    let h = harness("mcp-act-origin");
    let (p, _) = h.project(false).await;
    let boss = put_agent(&h, &p, "chef", 1);
    let c = as_agent(&h, &boss.id).await;
    let v = read(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "Write the docs" }),
    )
    .await;
    let id = v["id"].as_str().unwrap().to_string();
    turn_over(&h, &id).await;
    assert!(h
        .items(&id)
        .iter()
        .any(|i| i["kind"] == "user" && i["text"] == "Message de chef : Write the docs"));
    assert!(h
        .items(&id)
        .iter()
        .any(|i| i["text"] == "Bonjour, tu as dit : Message de chef : Write the docs"));
    // Named after the task: the fake Claude names it after the first two words it is given, and
    // « Message de » is no part of the task.
    h.wait("its name", |h| h.agent(&id).named).await;
    assert_eq!(h.agent(&id).name, "write-the-fake");
    // A message to an existing agent from outside: the same, and a slash command is no command.
    let v = read(
        &c,
        "send_message",
        json!({ "agent": "write-the-fake", "text": "/compact" }),
    )
    .await;
    assert_eq!(v["id"], id.as_str());
    h.wait("the message", |h| {
        h.items(&id)
            .iter()
            .any(|i| i["kind"] == "user" && i["text"] == "Message de chef : /compact")
    })
    .await;
    turn_over(&h, &id).await;
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[test]
fn a_message_from_the_server_is_headed_by_its_author_in_the_language_of_the_interface() {
    use crate::core::from_origin;
    use crate::i18n::Lang::{En, Fr};
    assert_eq!(
        from_origin(Fr, "Claude (hors Escouade)", "Salut"),
        "Message de Claude (hors Escouade) : Salut"
    );
    assert_eq!(
        from_origin(En, "Claude (outside Escouade)", "Hi"),
        "Message from Claude (outside Escouade): Hi"
    );
    // The author is one line, whatever its name holds; the text is kept as it is.
    assert_eq!(
        from_origin(En, "agent\n1  b", "a\n\nb"),
        "Message from agent 1 b: a\n\nb"
    );
}

#[test]
fn a_ticket_made_through_the_server_ends_with_who_made_it_in_the_language_of_the_interface() {
    use super::act::{made_by, with_origin};
    use crate::i18n::Lang::{En, Fr};
    assert_eq!(made_by(Fr, "chef"), "Créé par chef via Escouade");
    assert_eq!(
        made_by(En, "Claude (outside Escouade)"),
        "Created by Claude (outside Escouade) through Escouade"
    );
    // The origin is one line, whatever its name holds.
    assert_eq!(
        made_by(En, "agent\n1  b"),
        "Created by agent 1 b through Escouade"
    );
    // After the description, a blank line between; alone when there is no description.
    assert_eq!(with_origin("", "L"), "L");
    assert_eq!(with_origin("D\nE", "L"), "D\nE\n\nL");
}

#[tokio::test]
async fn a_ticket_made_by_an_agent_names_it_and_the_line_is_no_part_of_the_descriptions_limit() {
    let h = harness("mcp-act-origin-line");
    let p = project(&h).await;
    let a = put_agent(&h, &p, "chef", 1);
    let c = as_agent(&h, &a.id).await;
    // The limit is on what the caller wrote: 10,000 characters still make a ticket.
    let long = "a".repeat(10_000);
    let made = read(
        &c,
        "create_ticket",
        json!({ "project": "demo", "title": "Long", "description": long }),
    )
    .await;
    // (Compared as a boolean: a failure would print 10,000 characters.)
    assert!(
        made["description"] == format!("{long}\n\nCréé par chef via Escouade"),
        "the description does not end with the origin line"
    );
    let too_long = refused(
        &c,
        "create_ticket",
        json!({ "project": "demo", "title": "Trop", "description": "a".repeat(10_001) }),
    )
    .await;
    assert!(
        too_long.contains("10000") || too_long.contains("10 000"),
        "{too_long}"
    );
    // Editing the description: the caller's new words, then who edited it (the limit is on the
    // words alone).
    let edited = read(
        &c,
        "update_ticket",
        json!({ "ticket": made["key"], "description": "Autre" }),
    )
    .await;
    assert_eq!(
        edited["description"],
        "Autre\n\nModifié par chef via Escouade"
    );
    let at_limit = read(
        &c,
        "update_ticket",
        json!({ "ticket": made["key"], "description": "b".repeat(10_000) }),
    )
    .await;
    assert!(
        at_limit["description"]
            == format!("{}\n\nModifié par chef via Escouade", "b".repeat(10_000)),
        "the edited description does not end with the origin line"
    );
    let too_long = refused(
        &c,
        "update_ticket",
        json!({ "ticket": made["key"], "description": "b".repeat(10_001) }),
    )
    .await;
    assert!(
        too_long.contains("10000") || too_long.contains("10 000"),
        "{too_long}"
    );
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[test]
fn an_edit_line_replaces_the_origin_line_of_the_description_in_either_language() {
    use super::act::{changed_by, without_origin};
    use crate::i18n::Lang::{En, Fr};
    assert_eq!(changed_by(Fr, "chef"), "Modifié par chef via Escouade");
    assert_eq!(
        changed_by(En, "Claude (outside Escouade)"),
        "Modified by Claude (outside Escouade) through Escouade"
    );
    assert_eq!(
        changed_by(En, "agent\n1  b"),
        "Modified by agent 1 b through Escouade"
    );
    // The line, and the blank line before it, go: whoever made or edited it, in either language.
    assert_eq!(without_origin("D\nE\n\nCréé par chef via Escouade"), "D\nE");
    assert_eq!(without_origin("D\n\nModifié par chef via Escouade"), "D");
    assert_eq!(without_origin("D\n\nCreated by a b through Escouade"), "D");
    assert_eq!(without_origin("D\n\nModified by a through Escouade\n"), "D");
    assert_eq!(without_origin("Créé par chef via Escouade"), "");
    // Only the line the server adds: a sentence of the user's that looks like it, or a line not
    // set apart by a blank line, stays.
    assert_eq!(
        without_origin("D\nCréé par chef via Escouade"),
        "D\nCréé par chef via Escouade"
    );
    assert_eq!(
        without_origin("D\n\nCréé par chef via Escouade, puis revu"),
        "D\n\nCréé par chef via Escouade, puis revu"
    );
    assert_eq!(without_origin("Du texte"), "Du texte");
    assert_eq!(without_origin(""), "");
}

#[tokio::test]
async fn a_ticket_edited_through_the_server_says_who_edited_it_without_stacking_the_lines() {
    let h = harness("mcp-act-edit-origin");
    let p = project(&h).await;
    let a = put_agent(&h, &p, "chef", 1);
    let c = as_agent(&h, &a.id).await;
    let first = read(
        &c,
        "create_ticket",
        json!({ "project": "demo", "title": "Page", "description": "Une page." }),
    )
    .await;
    assert_eq!(
        first["description"],
        "Une page.\n\nCréé par chef via Escouade"
    );
    // A new title alone: the description is kept, the « Créé par » line becomes the edit's.
    let titled = read(
        &c,
        "update_ticket",
        json!({ "ticket": first["key"], "title": "Page d’accueil" }),
    )
    .await;
    assert_eq!(
        titled["description"],
        "Une page.\n\nModifié par chef via Escouade"
    );
    // New criteria alone, then another title: the same line, never two.
    let criteria = read(
        &c,
        "update_ticket",
        json!({ "ticket": first["key"], "criteria": ["Un seul"] }),
    )
    .await;
    assert_eq!(
        criteria["description"],
        "Une page.\n\nModifié par chef via Escouade"
    );
    // The edit by someone else is theirs: Claude outside Escouade takes the line over.
    let outside = external(&h).await;
    let again = read(
        &outside,
        "update_ticket",
        json!({ "ticket": first["key"], "title": "Encore" }),
    )
    .await;
    assert_eq!(
        again["description"],
        "Une page.\n\nModifié par Claude (hors Escouade) via Escouade"
    );
    // A description given back as `get_ticket` answered it, its line included: the line is
    // replaced, not kept under the new one.
    let echoed = read(
        &c,
        "update_ticket",
        json!({
            "ticket": first["key"],
            "description": "Une page revue.\n\nModifié par Claude (hors Escouade) via Escouade"
        }),
    )
    .await;
    assert_eq!(
        echoed["description"],
        "Une page revue.\n\nModifié par chef via Escouade"
    );
    // Only the dependencies: no edit of the words, so the line stays as it was.
    let other = read(
        &outside,
        "create_ticket",
        json!({ "project": "demo", "title": "Autre" }),
    )
    .await;
    let after = read(
        &outside,
        "update_ticket",
        json!({ "ticket": other["key"], "after": [first["key"]] }),
    )
    .await;
    assert_eq!(
        after["description"],
        "Créé par Claude (hors Escouade) via Escouade"
    );
    // A ticket the window made has no line yet: an edit through the server adds one.
    let mine = made(&h, &p, "De la fenêtre").await;
    let edited = read(
        &outside,
        "update_ticket",
        json!({ "ticket": mine.key, "title": "Revu" }),
    )
    .await;
    assert_eq!(
        edited["description"],
        "Modifié par Claude (hors Escouade) via Escouade"
    );
    // What is stored is what was answered.
    assert_eq!(
        stored(&h, &mine.id).description,
        "Modifié par Claude (hors Escouade) via Escouade"
    );
    outside.cancel().await.unwrap();
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn an_agent_acts_on_its_own_project_alone_and_reads_the_others() {
    let h = harness("mcp-act-own-project");
    let p = project(&h).await;
    let other = other_project(&h, "autre").await;
    let mine = put_agent(&h, &p, "mon-agent", 1);
    let theirs = put_agent(&h, &other, "leur-agent", 2);
    let t_mine = made(&h, &p, "Chez moi").await;
    let t_other = made(&h, &other, "Chez l’autre").await;
    let c = as_agent(&h, &mine.id).await;
    let (tickets, agents) = (h.core.tickets.read().len(), h.core.agents.read().len());

    for (tool, args) in [
        ("create_ticket", json!({ "project": "autre", "title": "x" })),
        (
            "update_ticket",
            json!({ "ticket": t_other.key, "title": "x" }),
        ),
        (
            "move_ticket",
            json!({ "ticket": t_other.key, "position": "top" }),
        ),
        ("start_ticket", json!({ "ticket": t_other.key })),
        ("set_board", json!({ "project": "autre", "draft": true })),
        (
            "create_agent",
            json!({ "project": other.id, "message": "x" }),
        ),
        ("send_message", json!({ "agent": theirs.id, "text": "x" })),
        ("stop_agent", json!({ "agent": theirs.id })),
    ] {
        let why = refused(&c, tool, args).await;
        assert!(
            why.contains("mon-agent")
                && why.contains("propre projet (demo)")
                && why.contains("le projet autre"),
            "{tool}: {why}"
        );
        let logged = entry(&h);
        assert_eq!(
            (logged.caller.as_str(), logged.tool.as_str(), logged.outcome),
            ("mon-agent", tool, "refused")
        );
    }
    // A ticket of another project is no ticket of its own to split: its agent's ticket is
    // another project's by mistake.
    let stray = put_agent(&h, &p, "egare", 3);
    h.core.agent(&stray.id).unwrap().lock().meta.ticket_id = Some(t_other.id.clone());
    let from_stray = as_agent(&h, &stray.id).await;
    let why = refused(
        &from_stray,
        "split_ticket",
        json!({ "tickets": [{ "title": "Un" }] }),
    )
    .await;
    assert!(why.contains("propre projet"), "{why}");
    from_stray.cancel().await.unwrap();
    // Nothing happened over there.
    assert_eq!(
        (h.core.tickets.read().len(), h.core.agents.read().len()),
        (tickets, agents + 1)
    );
    assert_eq!(stored(&h, &t_other.id).title, "Chez l’autre");
    assert!(!stored(&h, &t_other.id).forced);
    assert_eq!(h.agent(&theirs.id).prompts, 0);

    // It reads them all the same.
    let listed = read(&c, "list_tickets", json!({ "project": "autre" })).await;
    assert_eq!(keys(&listed), [t_other.key.as_str()]);
    let summary = read(&c, "get_agent_summary", json!({ "agent": theirs.id })).await;
    assert_eq!(summary["name"], "leur-agent");
    assert_eq!(
        read(&c, "get_ticket", json!({ "ticket": t_other.key })).await["title"],
        "Chez l’autre"
    );

    // And acts on its own.
    let made_here = read(
        &c,
        "create_ticket",
        json!({ "project": "demo", "title": "Pour moi" }),
    )
    .await;
    assert_eq!(made_here["column"], "todo");
    read(
        &c,
        "update_ticket",
        json!({ "ticket": t_mine.key, "title": "Chez moi, revu" }),
    )
    .await;
    assert_eq!(stored(&h, &t_mine.id).title, "Chez moi, revu");
    c.cancel().await.unwrap();

    // Claude outside Escouade is the user's: it acts on any project.
    let outside = external(&h).await;
    read(
        &outside,
        "update_ticket",
        json!({ "ticket": t_other.key, "title": "Revu de l’extérieur" }),
    )
    .await;
    assert_eq!(stored(&h, &t_other.id).title, "Revu de l’extérieur");
    read(
        &outside,
        "create_ticket",
        json!({ "project": "autre", "title": "Aussi" }),
    )
    .await;
    outside.cancel().await.unwrap();
    h.core.mcp.stop();
}

// ---------- the accounts: held per account, not for all ----------

/// A second account, Pro, with a folder of its own (the fake `claude` is launched with it). Not
/// through `save_settings`: it looks again at whether the server is wanted, as saving a project's
/// settings (`prefer`) does: so the server is wanted.
fn with_pro(h: &Harness) {
    let dir = h.dir.join("claude-pro");
    std::fs::create_dir_all(&dir).unwrap();
    let mut s = h.core.settings.write();
    s.mcp_enabled = true;
    s.accounts.push(Account {
        id: "pro".into(),
        name: "Pro".into(),
        config_dir: dir.to_string_lossy().to_string(),
        ..Default::default()
    });
}

/// The account's 5-hour window used `pct` percent, until `end`.
fn window_used(h: &Harness, account: &str, pct: f64, end: i64) {
    h.core.record_usage(
        account,
        Reading::Windows((
            Some(RateWindow {
                pct,
                resets_at: Some(end),
            }),
            None,
        )),
    );
}

/// The account's 5-hour window used up, until `end`: it holds back what spends its quota.
fn used_up(h: &Harness, account: &str, end: i64) {
    window_used(h, account, 100.0, end);
}

/// The project asks for `account` (empty: any).
fn prefer(h: &Harness, p: &Project, account: &str) {
    let mut project = h.core.project(&p.id).unwrap();
    project.account = account.into();
    h.core.update_project(project).unwrap();
}

#[tokio::test]
async fn a_ticket_is_started_while_an_account_is_free_for_its_project_and_refused_when_none_is() {
    let h = harness("mcp-act-start-accounts");
    let p = project(&h).await;
    with_pro(&h);
    let a = made(&h, &p, "Un [ok]").await;
    let b = made(&h, &p, "Deux [ok]").await;
    let c = external(&h).await;
    let end = h.core.pause_now() + 3_600_000;

    // Principal is past the threshold, Pro is not: the ticket starts, and goes to Pro.
    used_up(&h, "principal", end);
    assert!(h.core.autopilot_pause().is_none());
    let v = read(&c, "start_ticket", json!({ "ticket": a.key })).await;
    assert_eq!(v["key"], "DEM-1");
    h.wait("its agent to be made", |h| {
        stored(h, &a.id).agent_id.is_some()
    })
    .await;
    let agent = stored(&h, &a.id).agent_id.unwrap();
    assert_eq!(h.agent(&agent).account, "pro");
    h.wait("its turn to end", |h| {
        stored(h, &a.id).column == Column::Review
    })
    .await;

    // A project that prefers Principal has no other account to go to: refused, until Principal's
    // window ends.
    prefer(&h, &p, "principal");
    let waits = refused(&c, "start_ticket", json!({ "ticket": b.key })).await;
    assert!(
        waits.contains("pause")
            && waits.contains("5 h")
            && waits.contains("100 %")
            && waits.contains(&clock(end + RESUME_MARGIN_MS)),
        "{waits}"
    );
    assert!(!stored(&h, &b.id).forced);
    assert_eq!(entry(&h).outcome, "refused");
    // The one that prefers Pro does not wait.
    prefer(&h, &p, "pro");
    assert!(h.core.project_hold(&p.id).is_none());
    prefer(&h, &p, "");

    // Pro past the threshold too, sooner: no account left, and the answer says when the first is
    // free again.
    used_up(&h, "pro", end - 600_000);
    let none = refused(&c, "start_ticket", json!({ "ticket": b.key })).await;
    assert!(
        none.contains("pause")
            && none.contains(&clock(end - 600_000 + RESUME_MARGIN_MS))
            && !none.contains(&clock(end + RESUME_MARGIN_MS)),
        "{none}"
    );
    assert!(!stored(&h, &b.id).forced);
    let logged = entry(&h);
    assert_eq!(
        (
            logged.tool.as_str(),
            logged.outcome,
            logged.message.as_deref()
        ),
        ("start_ticket", "refused", Some(none.as_str()))
    );
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn an_agent_is_created_while_an_account_is_free_for_its_project_and_refused_when_none_is() {
    let h = harness("mcp-act-create-agent-accounts");
    let (p, _) = h.project(false).await;
    with_pro(&h);
    let c = external(&h).await;
    let end = h.core.pause_now() + 3_600_000;

    // Principal is past the threshold, Pro is not: the agent is made, on Pro.
    used_up(&h, "principal", end);
    let v = read(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "Sur Pro" }),
    )
    .await;
    let id = v["id"].as_str().unwrap().to_string();
    assert_eq!(h.agent(&id).account, "pro");
    turn_over(&h, &id).await;

    // A project that prefers Principal has no other account to go to.
    prefer(&h, &p, "principal");
    let count = h.core.agents.read().len();
    let waits = refused(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "Sur Principal" }),
    )
    .await;
    assert!(
        waits.contains("pause")
            && waits.contains("5 h")
            && waits.contains(&clock(end + RESUME_MARGIN_MS)),
        "{waits}"
    );
    assert_eq!(h.core.agents.read().len(), count);
    assert_eq!(entry(&h).outcome, "refused");
    prefer(&h, &p, "");

    // Pro past the threshold too, sooner: no account left.
    used_up(&h, "pro", end - 600_000);
    let none = refused(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "Nulle part" }),
    )
    .await;
    assert!(
        none.contains("pause") && none.contains(&clock(end - 600_000 + RESUME_MARGIN_MS)),
        "{none}"
    );
    assert_eq!(h.core.agents.read().len(), count);

    // An agent that waits for Pro's quota holds Pro back only: once Principal is free again, a new
    // agent goes to it.
    window_used(&h, "principal", 10.0, end);
    h.core.agent(&id).unwrap().lock().meta.resume_at = Some(h.core.pause_now() + 7_200_000);
    let v = read(
        &c,
        "create_agent",
        json!({ "project": "demo", "message": "Sur Principal, libre" }),
    )
    .await;
    let next = v["id"].as_str().unwrap().to_string();
    assert_eq!(h.agent(&next).account, "principal");
    turn_over(&h, &next).await;
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_message_is_refused_when_the_account_of_the_agent_it_goes_to_is_held_and_only_then() {
    let h = harness("mcp-act-send-message-accounts");
    let (p, _) = h.project(false).await;
    with_pro(&h);
    let main = agent_on(&h, &p, "principal").await;
    let pro = agent_on(&h, &p, "pro").await;
    let c = external(&h).await;
    let end = h.core.pause_now() + 3_600_000;

    // Principal is past the threshold: its agent takes no message, Pro's does.
    used_up(&h, "principal", end);
    let prompts = h.agent(&main.id).prompts;
    let held = refused(
        &c,
        "send_message",
        json!({ "agent": main.id, "text": "Sur Principal" }),
    )
    .await;
    assert!(
        held.contains("pause")
            && held.contains("5 h")
            && held.contains(&clock(end + RESUME_MARGIN_MS))
            && held.contains("« Principal »")
            && held.contains(&main.name),
        "{held}"
    );
    assert_eq!(h.agent(&main.id).prompts, prompts);
    assert_eq!(entry(&h).outcome, "refused");
    let v = read(
        &c,
        "send_message",
        json!({ "agent": pro.id, "text": "Sur Pro" }),
    )
    .await;
    assert_eq!(v["id"], pro.id.as_str());
    turn_over(&h, &pro.id).await;

    // A usage limit met on Pro: its agent waits, Principal's goes on once it is free again.
    window_used(&h, "principal", 10.0, end);
    h.core.pause_after_limit("pro");
    let limited = refused(
        &c,
        "send_message",
        json!({ "agent": pro.id, "text": "Encore" }),
    )
    .await;
    assert!(
        limited.contains("limite d’usage") && limited.contains("« Pro »"),
        "{limited}"
    );
    read(
        &c,
        "send_message",
        json!({ "agent": main.id, "text": "Sur Principal, libre" }),
    )
    .await;
    turn_over(&h, &main.id).await;
    h.core.autopilot_resume();

    // An agent that waits for its quota holds its own account back, not the other.
    let resume = h.core.pause_now() + 7_200_000;
    h.core.agent(&pro.id).unwrap().lock().meta.resume_at = Some(resume);
    let waiting = refused(
        &c,
        "send_message",
        json!({ "agent": pro.id, "text": "Attends" }),
    )
    .await;
    assert!(
        waiting.contains("quota") && waiting.contains(&clock(resume)),
        "{waiting}"
    );
    read(
        &c,
        "send_message",
        json!({ "agent": main.id, "text": "Toujours libre" }),
    )
    .await;
    turn_over(&h, &main.id).await;
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

// ---------- the Kanban's settings, and the model of a ticket ----------

/// The board of `p`, as the core keeps it.
fn board_of(h: &Harness, p: &Project) -> BoardSettings {
    h.core.project(&p.id).unwrap().board
}

/// What the tools do not set, written as the core has it (the key's prefix and number, the test
/// command, the user's own choice of mode).
fn edit_board(h: &Harness, p: &Project, f: impl FnOnce(&mut BoardSettings)) {
    let mut projects = h.core.projects.write();
    f(&mut projects.iter_mut().find(|q| q.id == p.id).unwrap().board);
}

/// How many `project` events the window was sent for `p`.
fn project_events(h: &Harness, p: &Project) -> usize {
    h.events
        .lock()
        .iter()
        .filter(|e| e["type"] == "project" && e["project"]["id"] == p.id.as_str())
        .count()
}

/// The models the window offers: a model is checked against them.
fn known_models(h: &Harness) {
    *h.core.models.write() = ["sonnet", "opus", "haiku"]
        .iter()
        .map(|m| ModelInfo {
            value: m.to_string(),
            resolved_model: format!("claude-{m}-9"),
        })
        .collect();
}

#[tokio::test]
async fn a_boards_settings_change_only_the_ones_given_and_the_core_and_the_window_follow() {
    let h = harness("mcp-act-set-board");
    let p = project(&h).await;
    git(&h.dir.join("repo"), &["branch", "develop"]);
    known_models(&h);
    edit_board(&h, &p, |b| {
        b.prefix = "DEM".into();
        b.next_number = 7;
        b.target = "main".into();
        b.test_command = "npm test".into();
    });
    let c = external(&h).await;
    let before = board_of(&h, &p);
    let seen = project_events(&h, &p);

    let v = read(
        &c,
        "set_board",
        json!({
            "project": "demo", "action": "pr", "strategy": "squash", "draft": true,
            "model": "opus", "effort": "max",
        }),
    )
    .await;
    // The others are what they were: the prefix and the number, the target, the test command.
    let after = BoardSettings {
        action: "pr".into(),
        draft: true,
        model: "opus".into(),
        effort: "max".into(),
        ..before.clone()
    };
    assert_eq!(board_of(&h, &p), after);
    // The answer is `get_board`'s, after the change.
    assert_eq!(
        v,
        json!({
            "project": "demo",
            "projectId": p.id,
            "action": "pr",
            "target": "main",
            "strategy": "squash",
            "draft": true,
            "cleanup": true,
            "conventional": true,
            "conflict": "ask",
            "maxParallel": 2,
            "autopilot": false,
            "model": "opus",
            "effort": "max",
            "mode": "",
            "defaults": { "model": "sonnet", "effort": "medium", "mode": "auto" },
            "testsFirst": false,
            "testCommand": "npm test",
            "prefix": "DEM",
        })
    );
    let logged = entry(&h);
    assert_eq!(read(&c, "get_board", json!({ "project": "demo" })).await, v);
    // The window is told as it is for the settings it changes itself.
    assert_eq!(project_events(&h, &p), seen + 1);
    let told = h
        .events
        .lock()
        .iter()
        .rev()
        .find(|e| e["type"] == "project" && e["project"]["id"] == p.id.as_str())
        .cloned()
        .unwrap();
    assert_eq!(told["project"]["board"]["action"], "pr");
    assert_eq!(told["project"]["board"]["draft"], true);
    // The call is in the activity log with what it was given, and what it changed, each setting
    // from its value to its new one: not the strategy, given as it was.
    assert_eq!(
        (
            logged.caller.as_str(),
            logged.tool.as_str(),
            logged.outcome,
            logged.summary.as_str(),
            logged.message.as_deref()
        ),
        (
            "Claude (hors Escouade)",
            "set_board",
            "ok",
            "project: demo · action: pr · strategy: squash · draft: true · model: opus · effort: max",
            Some("action: merge → pr · draft: false → true · model: (défaut) → opus · effort: (défaut) → max")
        )
    );

    // Every setting at once, the target and the choices as the window has them; an empty model
    // and effort are the app's.
    let v = read(
        &c,
        "set_board",
        json!({
            "project": p.id, "action": "keep", "target": " develop ", "strategy": "rebase",
            "draft": false, "cleanup": false, "conventional": false, "conflict": "agent",
            "maxParallel": 6, "autopilot": true, "model": "", "effort": "", "mode": "plan",
            "testsFirst": true,
        }),
    )
    .await;
    let everything = BoardSettings {
        action: "keep".into(),
        target: "develop".into(),
        strategy: "rebase".into(),
        draft: false,
        cleanup: false,
        conventional: false,
        conflict: "agent".into(),
        max_parallel: 6,
        autopilot: true,
        model: String::new(),
        effort: String::new(),
        mode: "plan".into(),
        tests_first: true,
        ..after
    };
    assert_eq!(board_of(&h, &p), everything);
    assert_eq!(
        (
            &v["target"],
            &v["maxParallel"],
            &v["mode"],
            &v["testsFirst"]
        ),
        (&json!("develop"), &json!(6), &json!("plan"), &json!(true))
    );
    let logged = entry(&h);
    // Thirteen settings, each said from its value to its new one: more than a line's 300 characters.
    let said = "action: pr → keep · target: main → develop · strategy: squash → rebase · draft: true → false · cleanup: true → false · conventional: true → false · conflict: ask → agent · maxParallel: 2 → 6 · autopilot: false → true · model: opus → (défaut) · effort: max → (défaut) · mode: (défaut) → plan · testsFirst: false → true";
    assert!(said.chars().count() > 300);
    assert_eq!(logged.message.as_deref(), Some(said));
    let summary = logged.summary;
    for given in [
        "action: keep",
        "target:  develop ",
        "strategy: rebase",
        "draft: false",
        "cleanup: false",
        "conventional: false",
        "conflict: agent",
        "maxParallel: 6",
        "autopilot: true",
        "model: ",
        "effort: ",
        "mode: plan",
        "testsFirst: true",
    ] {
        assert!(summary.contains(given), "{given} not in {summary}");
    }

    // What `get_board` answers can be given back as it is: nothing changes, and the log says so.
    let got = read(&c, "get_board", json!({ "project": "demo" })).await;
    assert_eq!(read(&c, "set_board", got.clone()).await, got);
    assert_eq!(board_of(&h, &p), everything);
    let logged = entry(&h);
    assert_eq!(
        (logged.outcome, logged.message.as_deref()),
        (
            "ok",
            Some("Aucun changement : le Kanban était déjà réglé ainsi.")
        )
    );
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_setting_that_does_not_fit_or_is_the_users_to_give_is_refused_with_the_reason_and_nothing_changes(
) {
    let h = harness("mcp-act-set-board-refused");
    let p = project(&h).await;
    git(&h.dir.join("repo"), &["branch", "develop"]);
    known_models(&h);
    edit_board(&h, &p, |b| {
        b.prefix = "DEM".into();
        b.next_number = 4;
        b.target = "main".into();
    });
    let c = external(&h).await;
    let before = board_of(&h, &p);
    let seen = project_events(&h, &p);

    // (What is asked, how the log says it ended, what the answer says.)
    let cases: Vec<(Value, &str, Vec<&str>)> = vec![
        // Nothing to change.
        (
            json!({ "project": "demo" }),
            "error",
            vec!["au moins un réglage"],
        ),
        // A model the app does not offer, or no model's name: the other settings given with it
        // wait too.
        (
            json!({ "project": "demo", "draft": true, "model": "gpt" }),
            "error",
            vec!["gpt", "sonnet", "opus"],
        ),
        (
            json!({ "project": "demo", "model": "--permission-mode" }),
            "error",
            vec!["--permission-mode"],
        ),
        (
            json!({ "project": "demo", "draft": true, "effort": "ultra" }),
            "error",
            vec!["ultra", "low, medium, high, xhigh, max"],
        ),
        (
            json!({ "project": "demo", "mode": "yolo" }),
            "error",
            vec!["yolo", "auto, default, plan, acceptEdits"],
        ),
        // No permission request at all is the user's decision, taken in the window.
        (
            json!({ "project": "demo", "mode": "bypassPermissions" }),
            "refused",
            vec!["bypassPermissions", "Réglages › Kanban"],
        ),
        (
            json!({ "project": "demo", "target": "nope" }),
            "error",
            vec!["nope", "main", "develop"],
        ),
        (
            json!({ "project": "demo", "target": "origin/main" }),
            "error",
            vec!["origin/main"],
        ),
        (
            json!({ "project": "demo", "target": "  " }),
            "error",
            vec!["vide"],
        ),
        (
            json!({ "project": "demo", "maxParallel": 0 }),
            "error",
            vec!["1", "6"],
        ),
        (
            json!({ "project": "demo", "maxParallel": 7 }),
            "error",
            vec!["1", "6"],
        ),
        // The server runs no command: the test command is the user's, set in the window.
        (
            json!({ "project": "demo", "testsFirst": true }),
            "refused",
            vec!["commande de test", "Réglages › Kanban"],
        ),
    ];
    for (args, outcome, says) in cases {
        let said = refused(&c, "set_board", args.clone()).await;
        for part in says {
            assert!(said.contains(part), "{args}: {said}");
        }
        let logged = entry(&h);
        assert_eq!(
            (logged.tool.as_str(), logged.outcome),
            ("set_board", outcome),
            "{args}"
        );
        assert_eq!(logged.message.as_deref(), Some(said.as_str()), "{args}");
        assert_eq!(board_of(&h, &p), before, "{args}");
    }
    assert_eq!(project_events(&h, &p), seen);
    // A project that is none.
    let none = refused(&c, "set_board", json!({ "project": "nope", "draft": true })).await;
    assert!(none.contains("Aucun projet « nope »"), "{none}");

    // The boundaries are in: one agent in parallel, six; the app's mode by an empty one; no tests
    // first, with no command, is no change to refuse.
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "maxParallel": 1, "testsFirst": false, "mode": "" }),
    )
    .await;
    assert_eq!((&v["maxParallel"], &v["mode"]), (&json!(1), &json!("")));
    read(
        &c,
        "set_board",
        json!({ "project": "demo", "maxParallel": 6 }),
    )
    .await;
    assert_eq!(board_of(&h, &p).max_parallel, 6);
    for effort in ["low", "medium", "high", "xhigh", "max"] {
        let v = read(
            &c,
            "set_board",
            json!({ "project": "demo", "effort": effort }),
        )
        .await;
        assert_eq!(v["effort"], effort);
    }
    for mode in ["auto", "default", "plan", "acceptEdits"] {
        let v = read(&c, "set_board", json!({ "project": "demo", "mode": mode })).await;
        assert_eq!(v["mode"], mode);
    }
    // A model by the name the window offers, in any case, or by the name it stands for.
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "model": " OPUS " }),
    )
    .await;
    assert_eq!(v["model"], "opus");
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "model": "claude-sonnet-9" }),
    )
    .await;
    assert_eq!(v["model"], "claude-sonnet-9");
    let v = read(&c, "set_board", json!({ "project": "demo", "model": "" })).await;
    assert_eq!(v["model"], "");

    // Bypassing the permissions is not given here, but a Kanban the user set to it keeps it, and
    // can be taken off it.
    edit_board(&h, &p, |b| b.mode = "bypassPermissions".into());
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "mode": "bypassPermissions", "draft": true }),
    )
    .await;
    assert_eq!(
        (&v["mode"], &v["draft"]),
        (&json!("bypassPermissions"), &json!(true))
    );
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "mode": "plan" }),
    )
    .await;
    assert_eq!(v["mode"], "plan");
    // Once off it, it is the user's again.
    let again = refused(
        &c,
        "set_board",
        json!({ "project": "demo", "mode": "bypassPermissions" }),
    )
    .await;
    assert!(again.contains("Réglages › Kanban"), "{again}");
    assert_eq!(board_of(&h, &p).mode, "plan");

    // The command is the user's; with one, tests first is a setting like the others, and the
    // command stays what it is.
    edit_board(&h, &p, |b| b.test_command = "npm test".into());
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "testsFirst": true }),
    )
    .await;
    assert_eq!(
        (&v["testsFirst"], &v["testCommand"]),
        (&json!(true), &json!("npm test"))
    );
    let kept = board_of(&h, &p);
    assert_eq!(
        (kept.prefix.as_str(), kept.next_number, kept.target.as_str()),
        ("DEM", 4, "main")
    );
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

/// What `get_board` answers for `project`, given back to `set_board` as it is: accepted, answered
/// the same, the Kanban as it was. Returns what `get_board` said.
async fn board_taken_back(h: &Harness, c: &Client, p: &Project, project: &str) -> Value {
    let before = board_of(h, p);
    let got = read(c, "get_board", json!({ "project": project })).await;
    let said = read(c, "set_board", got.clone()).await;
    assert_eq!(said, got);
    assert_eq!(board_of(h, p), before, "{got}");
    got
}

#[tokio::test]
async fn a_kanban_with_no_target_takes_back_the_branch_get_board_shows_and_leaves_none_on_a_detached_head(
) {
    let h = harness("mcp-act-back-target");
    let p = project(&h).await;
    let repo = h.dir.join("repo");
    let c = external(&h).await;

    // No target yet: the branch the project is on is shown, and kept off the Kanban.
    let got = board_taken_back(&h, &c, &p, "demo").await;
    assert_eq!(got["target"], "main");
    assert_eq!(board_of(&h, &p).target, "");
    // The same asked by hand, around with spaces.
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "target": " main " }),
    )
    .await;
    assert_eq!(v["target"], "main");
    assert_eq!(board_of(&h, &p).target, "");

    // A detached HEAD: no branch to show, the target is empty, and giving it back is no refusal.
    git(&repo, &["checkout", "-q", "--detach"]);
    let got = board_taken_back(&h, &c, &p, "demo").await;
    assert_eq!(got["target"], "");
    let v = read(&c, "set_board", json!({ "project": "demo", "target": "" })).await;
    assert_eq!(v["target"], "");
    assert_eq!(board_of(&h, &p).target, "");
    // Any other branch is checked all the same, and a real one is set.
    let said = refused(
        &c,
        "set_board",
        json!({ "project": "demo", "target": "nope" }),
    )
    .await;
    assert!(said.contains("nope") && said.contains("main"), "{said}");
    assert_eq!(board_of(&h, &p).target, "");
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "target": "main" }),
    )
    .await;
    assert_eq!(v["target"], "main");
    assert_eq!(board_of(&h, &p).target, "main");
    assert_eq!(
        entry(&h).message.as_deref(),
        Some("target: (aucune) → main")
    );
    // Once the Kanban has one, an empty target is a refusal again.
    let said = refused(&c, "set_board", json!({ "project": "demo", "target": "" })).await;
    assert!(said.contains("vide"), "{said}");

    // A repository without a commit: its branch is shown, though git lists none.
    let fresh = other_project(&h, "vide").await;
    let got = board_taken_back(&h, &c, &fresh, "vide").await;
    assert!(!got["target"].as_str().unwrap().is_empty(), "{got}");
    assert_eq!(board_of(&h, &fresh).target, "");
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_kanban_stored_with_tests_first_and_no_test_command_is_read_off_and_taken_back_as_it_is()
{
    let h = harness("mcp-act-back-tests-first");
    let p = project(&h).await;
    edit_board(&h, &p, |b| {
        b.target = "main".into();
        b.tests_first = true;
        b.test_command = "  ".into();
    });
    let c = external(&h).await;

    // The window shows it off, the validation ignores it: so does get_board, and the Kanban is
    // left as it is when that is given back.
    let got = board_taken_back(&h, &c, &p, "demo").await;
    assert_eq!(got["testsFirst"], false);
    assert!(board_of(&h, &p).tests_first);
    // Asked on: it is on already, nothing changes (the window shows it off all the same).
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "testsFirst": true }),
    )
    .await;
    assert_eq!(v["testsFirst"], false);
    assert!(board_of(&h, &p).tests_first);
    // Asked off, as get_board shows it: it stays as it is too.
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "testsFirst": false, "draft": true }),
    )
    .await;
    assert_eq!(
        (&v["testsFirst"], &v["draft"]),
        (&json!(false), &json!(true))
    );
    assert!(board_of(&h, &p).tests_first);

    // Off for good it cannot be turned on with no command: the user's to give, in the window.
    edit_board(&h, &p, |b| b.tests_first = false);
    let before = board_of(&h, &p);
    let said = refused(
        &c,
        "set_board",
        json!({ "project": "demo", "testsFirst": true }),
    )
    .await;
    assert!(said.contains("commande de test"), "{said}");
    assert_eq!(board_of(&h, &p), before);

    // With a command it is what get_board says, and what is given back changes nothing.
    edit_board(&h, &p, |b| {
        b.tests_first = true;
        b.test_command = "npm test".into();
    });
    let got = board_taken_back(&h, &c, &p, "demo").await;
    assert_eq!(got["testsFirst"], true);
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "testsFirst": false }),
    )
    .await;
    assert_eq!(v["testsFirst"], false);
    assert!(!board_of(&h, &p).tests_first);
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_target_branch_deleted_since_is_taken_back_as_get_board_shows_it_and_no_other_missing_one_is_taken(
) {
    let h = harness("mcp-act-back-deleted-target");
    let p = project(&h).await;
    git(&h.dir.join("repo"), &["branch", "develop"]);
    edit_board(&h, &p, |b| b.target = "gone".into());
    let c = external(&h).await;

    // It is not a local branch any more, but it is the Kanban's: shown, and given back as it is.
    let got = board_taken_back(&h, &c, &p, "demo").await;
    assert_eq!(got["target"], "gone");
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "target": "gone", "draft": true }),
    )
    .await;
    assert_eq!((&v["target"], &v["draft"]), (&json!("gone"), &json!(true)));
    assert_eq!(board_of(&h, &p).target, "gone");
    // Another one that is missing stays a refusal, the Kanban's own is not touched.
    let before = board_of(&h, &p);
    let said = refused(
        &c,
        "set_board",
        json!({ "project": "demo", "target": "nope" }),
    )
    .await;
    assert!(
        said.contains("nope") && said.contains("main") && said.contains("develop"),
        "{said}"
    );
    assert_eq!(board_of(&h, &p), before);
    // A branch that exists replaces it.
    let v = read(
        &c,
        "set_board",
        json!({ "project": "demo", "target": "develop" }),
    )
    .await;
    assert_eq!(v["target"], "develop");
    assert_eq!(board_of(&h, &p).target, "develop");
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn an_agent_sets_the_board_of_its_own_project_alone_and_claude_outside_escouade_any() {
    let h = harness("mcp-act-set-board-own");
    let p = project(&h).await;
    let other = other_project(&h, "autre").await;
    let mine = put_agent(&h, &p, "mon-agent", 1);
    let c = as_agent(&h, &mine.id).await;
    let theirs_before = board_of(&h, &other);

    let why = refused(
        &c,
        "set_board",
        json!({ "project": "autre", "draft": true }),
    )
    .await;
    assert!(
        why.contains("mon-agent")
            && why.contains("propre projet (demo)")
            && why.contains("le projet autre"),
        "{why}"
    );
    let logged = entry(&h);
    assert_eq!(
        (logged.caller.as_str(), logged.tool.as_str(), logged.outcome),
        ("mon-agent", "set_board", "refused")
    );
    assert_eq!(board_of(&h, &other), theirs_before);
    // It reads theirs all the same, and sets its own.
    assert_eq!(
        read(&c, "get_board", json!({ "project": "autre" })).await["draft"],
        false
    );
    let v = read(&c, "set_board", json!({ "project": "demo", "draft": true })).await;
    assert_eq!(v["draft"], true);
    assert!(board_of(&h, &p).draft);
    assert_eq!(entry(&h).caller, "mon-agent");
    c.cancel().await.unwrap();

    // Claude outside Escouade is the user's: it sets any project's.
    let outside = external(&h).await;
    let v = read(
        &outside,
        "set_board",
        json!({ "project": "autre", "maxParallel": 3, "action": "push" }),
    )
    .await;
    assert_eq!(
        (&v["project"], &v["projectId"], &v["maxParallel"]),
        (&json!("autre"), &json!(other.id), &json!(3))
    );
    let theirs = board_of(&h, &other);
    assert_eq!((theirs.action.as_str(), theirs.max_parallel), ("push", 3));
    // Not the other's.
    assert_eq!(board_of(&h, &p).max_parallel, 2);
    outside.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn a_call_that_changes_nothing_says_so_even_when_it_gives_the_values_the_kanban_has() {
    let h = harness("mcp-act-set-board-same");
    let p = project(&h).await;
    edit_board(&h, &p, |b| b.target = "main".into());
    let c = external(&h).await;
    let before = board_of(&h, &p);
    let v = read(
        &c,
        "set_board",
        json!({
            "project": "demo", "action": "merge", "target": "main", "draft": false,
            "maxParallel": 2, "model": "", "mode": "",
        }),
    )
    .await;
    assert_eq!(v["action"], "merge");
    assert_eq!(board_of(&h, &p), before);
    let logged = entry(&h);
    assert_eq!(
        (logged.outcome, logged.message.as_deref()),
        (
            "ok",
            Some("Aucun changement : le Kanban était déjà réglé ainsi.")
        )
    );
    assert!(
        logged.summary.contains("draft: false"),
        "{}",
        logged.summary
    );
    // One that changes something says that alone, whatever else it gave.
    read(
        &c,
        "set_board",
        json!({ "project": "demo", "action": "merge", "draft": true, "maxParallel": 2 }),
    )
    .await;
    assert_eq!(entry(&h).message.as_deref(), Some("draft: false → true"));
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[test]
fn what_a_set_board_changed_is_said_in_the_language_of_the_interface_each_setting_from_its_value_to_its_new_one(
) {
    use crate::i18n::check::french_in;
    use crate::i18n::Lang::{En, Fr};
    let before = BoardSettings {
        model: "opus".into(),
        test_command: "npm test".into(),
        ..Default::default()
    };
    let after = BoardSettings {
        target: "main".into(),
        model: String::new(),
        effort: "high".into(),
        mode: "plan".into(),
        tests_first: true,
        ..before.clone()
    };
    let fr = board_changes(Fr, &before, &after);
    let en = board_changes(En, &before, &after);
    assert_eq!(
        fr,
        "target: (aucune) → main · model: opus → (défaut) · effort: (défaut) → high · mode: (défaut) → plan · testsFirst: false → true"
    );
    assert_eq!(
        en,
        "target: (none) → main · model: opus → (default) · effort: (default) → high · mode: (default) → plan · testsFirst: false → true"
    );
    assert_eq!(french_in(&en), None);
    // Tests first with no command is off, as the window and get_board show it: nothing to say.
    let stored = BoardSettings {
        tests_first: true,
        ..Default::default()
    };
    for lang in [Fr, En] {
        let none = board_changes(lang, &stored, &BoardSettings::default());
        assert_eq!(none, board_changes(lang, &stored, &stored));
    }
    assert_eq!(
        board_changes(Fr, &stored, &stored),
        "Aucun changement : le Kanban était déjà réglé ainsi."
    );
    assert_eq!(
        board_changes(En, &stored, &stored),
        "No change: the Kanban was already set so."
    );
    // The key's prefix and number are not settings of the tool: never said.
    let numbered = BoardSettings {
        prefix: "DEM".into(),
        next_number: 9,
        ..Default::default()
    };
    assert_eq!(
        board_changes(En, &BoardSettings::default(), &numbered),
        "No change: the Kanban was already set so."
    );
}

#[test]
fn the_refusals_of_set_board_are_written_in_the_language_of_the_interface() {
    use crate::i18n::check::french_in;
    use crate::i18n::Lang::{En, Fr};
    // A Kanban with a target: an empty one is then a refusal.
    let board = BoardSettings {
        target: "main".into(),
        ..Default::default()
    };
    let branches = ["main".to_string(), "develop".to_string()];
    let said = |lang, args: Value| {
        let a: SetBoardArgs = serde_json::from_value(args).unwrap();
        match board_change(lang, &board, &branches, "main", &a, None) {
            Err(ToolError::Refused(m)) => ("refused", m),
            Err(ToolError::Failed(m)) => ("error", m),
            Ok(_) => panic!("accepted"),
        }
    };
    let cases = [
        (json!({ "project": "p" }), "error"),
        (json!({ "project": "p", "effort": "ultra" }), "error"),
        (json!({ "project": "p", "mode": "yolo" }), "error"),
        (
            json!({ "project": "p", "mode": "bypassPermissions" }),
            "refused",
        ),
        (json!({ "project": "p", "target": "nope" }), "error"),
        (json!({ "project": "p", "target": " " }), "error"),
        (json!({ "project": "p", "maxParallel": 9 }), "error"),
        (json!({ "project": "p", "testsFirst": true }), "refused"),
    ];
    for (args, kind) in cases {
        let (fr_kind, fr) = said(Fr, args.clone());
        let (en_kind, en) = said(En, args.clone());
        assert_eq!((fr_kind, en_kind), (kind, kind), "{args}");
        assert_ne!(fr, en, "{args}");
        assert_eq!(french_in(&en), None, "{args}: {en}");
    }
    assert_eq!(
        said(En, json!({ "project": "p", "mode": "bypassPermissions" })).1,
        "Running agents with no permission request at all is the user’s decision: set the mode bypassPermissions in the window (Settings › Kanban)."
    );
    assert_eq!(
        said(En, json!({ "project": "p", "effort": "ultra" })).1,
        "Unknown effort “ultra”. Efforts: low, medium, high, xhigh, max."
    );
    assert_eq!(
        said(En, json!({ "project": "p", "target": "nope" })).1,
        "“nope” is not a local branch of the project. Branches: main, develop."
    );
    assert_eq!(
        said(En, json!({ "project": "p", "testsFirst": true })).1,
        "The Kanban has no test command, and the server runs none: set it in the window (Settings › Kanban), then turn on “Re-run the tests first”."
    );
    // The most branches listed, for a repository that has hundreds.
    let many: Vec<String> = (0..60).map(|i| format!("b{i}")).collect();
    let a: SetBoardArgs =
        serde_json::from_value(json!({ "project": "p", "target": "nope" })).unwrap();
    let Err(ToolError::Failed(listed)) = board_change(En, &board, &many, "b0", &a, None) else {
        panic!("accepted")
    };
    assert!(
        listed.contains("b19") && !listed.contains("b20"),
        "{listed}"
    );
    assert!(listed.contains("60"), "{listed}");
}

#[tokio::test]
async fn a_ticket_is_launched_with_a_model_and_an_effort_of_its_own_and_the_answer_says_what_its_agent_goes_with(
) {
    let h = harness("mcp-act-start-model");
    let p = project(&h).await;
    known_models(&h);
    let a = made(&h, &p, "Architecture [ok]").await;
    let b = made(&h, &p, "Petit [ok]").await;
    let third = made(&h, &p, "Moyen [ok]").await;
    let c = external(&h).await;

    // Refused before anything is written, or started: the ticket is as it was.
    for (args, says) in [
        (
            json!({ "ticket": a.key, "model": "gpt" }),
            vec!["gpt", "sonnet", "opus"],
        ),
        (
            json!({ "ticket": a.key, "model": "opus", "effort": "ultra" }),
            vec!["ultra", "low, medium, high, xhigh, max"],
        ),
        (json!({ "ticket": a.key, "effort": "huge" }), vec!["huge"]),
    ] {
        let said = refused(&c, "start_ticket", args.clone()).await;
        for part in says {
            assert!(said.contains(part), "{args}: {said}");
        }
        assert_eq!(entry(&h).outcome, "error", "{args}");
        let t = stored(&h, &a.id);
        assert_eq!(
            (t.column, t.forced, t.model.as_str(), t.effort.as_str()),
            (Column::Todo, false, "", ""),
            "{args}"
        );
    }

    // Its own, for this ticket alone: written on it, and answered.
    let v = read(
        &c,
        "start_ticket",
        json!({ "ticket": "dem-1", "model": " opus ", "effort": "max" }),
    )
    .await;
    assert_eq!(
        v,
        json!({ "key": "DEM-1", "starting": true, "model": "opus", "effort": "max" })
    );
    let t = stored(&h, &a.id);
    assert_eq!((t.model.as_str(), t.effort.as_str()), ("opus", "max"));
    let logged = entry(&h);
    assert_eq!(
        (logged.tool.as_str(), logged.outcome),
        ("start_ticket", "ok")
    );
    assert_eq!(
        logged.summary,
        "ticket: dem-1 · model:  opus  · effort: max"
    );

    // Without them nothing is written, and the answer says what its agent takes: the app's.
    let v = read(&c, "start_ticket", json!({ "ticket": b.key })).await;
    assert_eq!(
        v,
        json!({ "key": "DEM-2", "starting": true, "model": "sonnet", "effort": "medium" })
    );
    let t = stored(&h, &b.id);
    assert_eq!((t.model.as_str(), t.effort.as_str()), ("", ""));
    assert_eq!(entry(&h).summary, "ticket: DEM-2");

    // Each goes with what it was told (the agent of a ticket is made when its turn comes).
    for id in [&a.id, &b.id] {
        h.wait("its agent to be made", |h| stored(h, id).agent_id.is_some())
            .await;
    }
    let agent = |id: &str| h.agent(&stored(&h, id).agent_id.unwrap());
    let (first, second) = (agent(&a.id), agent(&b.id));
    assert_eq!(
        (first.model.as_str(), first.effort.as_str()),
        ("opus", "max")
    );
    assert_eq!(
        (second.model.as_str(), second.effort.as_str()),
        ("sonnet", "medium")
    );

    // The Kanban's comes before the app's, and a ticket's own before the Kanban's, each of the
    // two apart.
    h.core
        .board_set(
            &p.id,
            BoardSettings {
                model: "opus".into(),
                effort: "high".into(),
                max_parallel: 6,
                ..board_of(&h, &p)
            },
        )
        .unwrap();
    let v = read(
        &c,
        "start_ticket",
        json!({ "ticket": third.key, "model": "sonnet" }),
    )
    .await;
    assert_eq!(
        v,
        json!({ "key": "DEM-3", "starting": true, "model": "sonnet", "effort": "high" })
    );
    let t = stored(&h, &third.id);
    assert_eq!((t.model.as_str(), t.effort.as_str()), ("sonnet", ""));

    h.wait("its agent to be made", |h| {
        stored(h, &third.id).agent_id.is_some()
    })
    .await;
    let last = agent(&third.id);
    assert_eq!(
        (last.model.as_str(), last.effort.as_str()),
        ("sonnet", "high")
    );
    for id in [&a.id, &b.id, &third.id] {
        h.wait("its turn to end", |h| {
            stored(h, id).column == Column::Review
        })
        .await;
    }
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}

#[tokio::test]
async fn the_answer_of_start_ticket_has_no_effort_when_the_model_of_its_agent_takes_none() {
    let h = harness("mcp-act-start-haiku");
    let p = project(&h).await;
    known_models(&h);
    let a = made(&h, &p, "Petit [ok]").await;
    let b = made(&h, &p, "Autre [ok]").await;
    let c = external(&h).await;

    // Haiku takes no effort: given or not, it is not the agent's, and the answer leaves it out.
    let v = read(
        &c,
        "start_ticket",
        json!({ "ticket": a.key, "model": "haiku", "effort": "high" }),
    )
    .await;
    assert_eq!(
        v,
        json!({ "key": "DEM-1", "starting": true, "model": "haiku" })
    );
    // The same for a Kanban on haiku, with a ticket that says nothing of its own.
    h.core
        .board_set(
            &p.id,
            BoardSettings {
                model: "haiku".into(),
                effort: "low".into(),
                ..board_of(&h, &p)
            },
        )
        .unwrap();
    let v = read(&c, "start_ticket", json!({ "ticket": b.key })).await;
    assert_eq!(
        v,
        json!({ "key": "DEM-2", "starting": true, "model": "haiku" })
    );
    for id in [&a.id, &b.id] {
        h.wait("its turn to end", |h| {
            stored(h, id).column == Column::Review
        })
        .await;
    }
    c.cancel().await.unwrap();
    h.core.mcp.stop();
}
