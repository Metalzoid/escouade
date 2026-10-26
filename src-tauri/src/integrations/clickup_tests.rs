//! ClickUp against the fake server, its answers as the API v2's documentation gives them.

use super::*;
use crate::integrations::fake::FakeServer;
use crate::integrations::lasting;

async fn clickup() -> (FakeServer, Clickup) {
    let server = FakeServer::start().await;
    let account = Account {
        token: " pk_42_k1 ".into(),
        user: "183".into(),
        ..Default::default()
    };
    let c = Clickup::new(reqwest::Client::new(), &account, &server.url);
    (server, c)
}

/// The list l1 « Sprint 12 » and its statuses, out of order as ClickUp may give them.
fn list(server: &FakeServer) {
    server.on(
        "GET",
        "/list/l1",
        200,
        json!({ "id": "l1", "name": "Sprint 12", "statuses": [
            { "id": "p1_c", "status": "complete", "orderindex": 4, "type": "closed" },
            { "id": "p1_r", "status": "in review", "orderindex": 2, "type": "custom" },
            { "id": "p1_o", "status": "to do", "orderindex": 0, "type": "open" },
            { "id": "p1_p", "status": "in progress", "orderindex": 1, "type": "custom" },
            { "id": "p1_d", "status": "shipped", "orderindex": 3, "type": "done" }
        ] }),
    );
}

fn task(id: &str, custom: Option<&str>, name: &str, list: &str) -> Value {
    json!({
        "id": id, "custom_id": custom, "name": name,
        "markdown_description": "Exporter le journal.\n\n![capture](https://t.clickup.com/a.png)",
        "description": "Exporter le journal.",
        "status": { "status": "to do", "type": "open" },
        "priority": { "priority": "high" },
        "assignees": [{ "id": 183, "username": "Ada Lovelace" }],
        "tags": [{ "name": "claude-ready" }],
        "checklists": [
            { "name": "Checklist", "items": [{ "name": "Relire", "orderindex": 0 }] },
            { "name": "Critères d'acceptation", "items": [
                { "name": "Le fichier s'ouvre dans Excel", "orderindex": 1, "resolved": false },
                { "name": "Un bouton Exporter", "orderindex": 0, "resolved": false }
            ] }
        ],
        "url": format!("https://app.clickup.com/t/{id}"),
        "list": { "id": list }
    })
}

#[tokio::test]
async fn the_account_is_the_user_the_key_belongs_to_and_the_key_goes_as_it_is() {
    let (server, c) = clickup().await;
    server.on(
        "GET",
        "/user",
        200,
        json!({ "user": { "id": 183, "username": "Ada Lovelace", "email": "ada@atlas.dev" } }),
    );
    assert_eq!(
        c.me().await.unwrap(),
        ("Ada Lovelace".to_string(), "183".to_string())
    );
    assert_eq!(server.requests()[0].headers["authorization"], "pk_42_k1");
}

#[tokio::test]
async fn a_key_refused_reads_as_credentials_refused_and_can_be_put_right() {
    let (server, c) = clickup().await;
    server.on(
        "GET",
        "/user",
        401,
        json!({ "err": "Token invalid", "ECODE": "OAUTH_025" }),
    );
    let e = c.me().await.unwrap_err();
    assert_eq!(e.downcast_ref::<HttpError>().unwrap().status, 401);
    assert!(!lasting(&e));
    assert_eq!(
        e.to_string(),
        "ClickUp refuse ces identifiants (401) — Token invalid"
    );
}

#[tokio::test]
async fn a_limit_is_waited_for_until_its_reset_then_asked_again() {
    let (server, c) = clickup().await;
    server.on(
        "GET",
        "/user",
        200,
        json!({ "user": { "id": 183, "username": "Ada" } }),
    );
    let now = (now_ms() / 1000).to_string();
    server.on_once(
        "GET",
        "/user",
        429,
        json!({ "err": "Rate limit reached", "ECODE": "APP_002" }),
        &[("X-RateLimit-Reset", &now)],
    );
    assert_eq!(c.me().await.unwrap().0, "Ada");
    assert_eq!(server.requests().len(), 2);

    // Limited again after the wait: the limit is said, and may pass later.
    for _ in 0..2 {
        server.on_once(
            "GET",
            "/user",
            429,
            Value::Null,
            &[("X-RateLimit-Reset", &now)],
        );
    }
    let e = c.me().await.unwrap_err();
    assert_eq!(e.downcast_ref::<HttpError>().unwrap().status, 429);
    assert!(!lasting(&e));
    assert!(e.to_string().contains("limite les requêtes (429)"), "{e}");
    assert_eq!(server.requests().len(), 4);

    // A reset too far ahead is not waited for.
    let later = (now_ms() / 1000 + 3600).to_string();
    server.on_once(
        "GET",
        "/user",
        429,
        Value::Null,
        &[("X-RateLimit-Reset", &later)],
    );
    assert!(c.me().await.is_err());
    assert_eq!(server.requests().len(), 5);
}

#[test]
fn the_wait_lasts_until_the_reset() {
    assert_eq!(wait_until(Some(1_000), 999_500), Duration::from_millis(500));
    assert_eq!(wait_until(Some(1_000), 1_200_000), Duration::ZERO);
    assert_eq!(wait_until(None, 0), WAIT_DEFAULT);
}

#[tokio::test]
async fn the_lists_come_in_their_place_in_the_hierarchy() {
    let (server, c) = clickup().await;
    server.on(
        "GET",
        "/team",
        200,
        json!({ "teams": [{ "id": "9001", "name": "Atlas" }] }),
    );
    server.on(
        "GET",
        "/team/9001/space",
        200,
        json!({ "spaces": [{ "id": 790, "name": "Produit" }] }),
    );
    server.on(
        "GET",
        "/space/790/folder",
        200,
        json!({ "folders": [{ "id": "457", "name": "Sprints", "lists": [
            { "id": "l1", "name": "Sprint 12" }, { "id": "l2", "name": "Sprint 13" }
        ] }] }),
    );
    server.on(
        "GET",
        "/space/790/list",
        200,
        json!({ "lists": [{ "id": "l0", "name": "Backlog" }] }),
    );
    let lists = c.containers().await.unwrap();
    let seen: Vec<(&str, &str, &str)> = lists
        .iter()
        .map(|l| {
            (
                l.id.as_str(),
                l.name.as_str(),
                l.group.as_deref().unwrap_or(""),
            )
        })
        .collect();
    assert_eq!(
        seen,
        [
            ("l0", "Backlog", "Produit"),
            ("l1", "Sprint 12", "Produit › Sprints"),
            ("l2", "Sprint 13", "Produit › Sprints"),
        ]
    );
    // Archived ones are left out.
    assert!(server
        .requests()
        .iter()
        .filter(|r| r.path() != "/team")
        .all(|r| r.query("archived").as_deref() == Some("false")));

    // Several workspaces: each list says its own.
    server.on(
        "GET",
        "/team",
        200,
        json!({ "teams": [{ "id": "9001", "name": "Atlas" }, { "id": "9002", "name": "Perso" }] }),
    );
    server.on("GET", "/team/9002/space", 200, json!({ "spaces": [] }));
    let lists = c.containers().await.unwrap();
    assert_eq!(lists[1].group.as_deref(), Some("Atlas › Produit › Sprints"));
}

#[tokio::test]
async fn the_statuses_are_the_lists_own_in_its_order_and_the_defaults_follow_their_names() {
    let (server, c) = clickup().await;
    list(&server);
    let v = c.states_view("l1").await.unwrap();
    let names: Vec<&str> = v.states.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(
        names,
        ["to do", "in progress", "in review", "shipped", "complete"]
    );
    assert_eq!(v.defaults[&Column::Doing].name, "in progress");
    assert_eq!(v.defaults[&Column::Review].name, "in progress");
    assert_eq!(v.defaults[&Column::Done].name, "in review");
    assert!(!v.defaults.contains_key(&Column::Todo));
}

#[test]
fn statuses_whose_names_say_nothing_get_their_defaults_by_type() {
    let s = |name: &str, kind: &str| {
        (
            ExternalState {
                id: name.into(),
                name: name.into(),
            },
            kind.to_string(),
        )
    };
    let d = defaults_by_type(&[
        s("ouvert", "open"),
        s("chez Ada", "custom"),
        s("chez Bob", "custom"),
        s("fini", "closed"),
    ]);
    assert_eq!(d[&Column::Doing].name, "chez Ada");
    assert_eq!(d[&Column::Review].name, "chez Ada");
    assert_eq!(d[&Column::Done].name, "chez Bob");
    // One custom status: « Terminé » takes the `done` one.
    let d = defaults_by_type(&[
        s("ouvert", "open"),
        s("chez Ada", "custom"),
        s("livré", "done"),
        s("fini", "closed"),
    ]);
    assert_eq!(d[&Column::Done].name, "livré");
    // Open and closed only: no column moves the task.
    assert!(defaults_by_type(&[s("ouvert", "open"), s("fini", "closed")]).is_empty());
}

#[tokio::test]
async fn the_tasks_come_with_their_checklist_as_criteria_and_the_filters_go_to_clickup() {
    let (server, c) = clickup().await;
    list(&server);
    server.on(
        "GET",
        "/list/l1/task",
        200,
        json!({ "tasks": [
            task("86abx3", Some("ABC-12"), "Exporter le journal", "l1"),
            { "id": "86zz", "name": "Fini", "status": { "status": "shipped", "type": "done" }, "list": { "id": "l1" } }
        ], "last_page": false }),
    );
    let q = Query {
        filters: vec!["mine".into(), "status:in progress".into()],
        label: Some("Claude-Ready".into()),
        page: Some("1".into()),
        ..Default::default()
    };
    let page = c.issues("l1", &q).await.unwrap();
    assert_eq!(page.issues.len(), 1);
    let i = &page.issues[0];
    assert_eq!(
        (i.id.as_str(), i.key.as_str(), i.kind_code.as_str()),
        ("86abx3", "ABC-12", "task")
    );
    assert_eq!(i.meta, ["to do", "high", "Ada Lovelace", "claude-ready"]);
    assert_eq!(
        i.criteria,
        ["Un bouton Exporter", "Le fichier s'ouvre dans Excel"]
    );
    assert!(i
        .description
        .contains("![capture](https://t.clickup.com/a.png)"));
    assert_eq!(i.container, "l1");
    assert_eq!(i.url, "https://app.clickup.com/t/86abx3");
    assert_eq!(page.next.as_deref(), Some("2"));
    let chips: Vec<&str> = page.filters.iter().map(|f| f.id.as_str()).collect();
    assert_eq!(
        chips,
        [
            "mine",
            "status:to do",
            "status:in progress",
            "status:in review"
        ]
    );
    assert_eq!(page.filters[0].label, "Mes tâches");
    let sent = server
        .requests()
        .into_iter()
        .find(|r| r.path() == "/list/l1/task")
        .unwrap();
    assert_eq!(sent.query("page").as_deref(), Some("1"));
    assert_eq!(sent.query("assignees[]").as_deref(), Some("183"));
    assert_eq!(sent.query("statuses[]").as_deref(), Some("in progress"));
    assert_eq!(sent.query("tags[]").as_deref(), Some("claude-ready"));
    assert_eq!(sent.query("include_closed").as_deref(), Some("false"));
    assert_eq!(
        sent.query("include_markdown_description").as_deref(),
        Some("true")
    );
}

#[test]
fn without_a_checklist_the_criteria_come_from_the_description() {
    let mut t = task("86abx3", None, "Mode sombre", "l1");
    t["checklists"] = json!([]);
    t["markdown_description"] = json!("## Critères\n- Bascule persistée\n- Contrastes AA");
    let i = issue_of(&t, "l1", Lang::Fr);
    assert_eq!(i.criteria, ["Bascule persistée", "Contrastes AA"]);
    // Without a custom id, its key is its id.
    assert_eq!(i.key, "#86abx3");
}

#[tokio::test]
async fn a_search_by_title_reads_the_pages_until_it_finds() {
    let (server, c) = clickup().await;
    list(&server);
    // The last route set answers first.
    server.on_once(
        "GET",
        "/list/l1/task",
        200,
        json!({ "tasks": [task("86b", None, "Mode sombre du site", "l1")], "last_page": false }),
        &[],
    );
    server.on_once(
        "GET",
        "/list/l1/task",
        200,
        json!({ "tasks": [task("86a", None, "Exporter le journal", "l1")], "last_page": false }),
        &[],
    );
    let q = Query {
        text: "SOMBRE".into(),
        ..Default::default()
    };
    let page = c.issues("l1", &q).await.unwrap();
    let keys: Vec<&str> = page.issues.iter().map(|i| i.key.as_str()).collect();
    assert_eq!(keys, ["#86b"]);
    assert_eq!(page.next.as_deref(), Some("2"));
    let pages: Vec<String> = server
        .requests()
        .iter()
        .filter(|r| r.path() == "/list/l1/task")
        .filter_map(|r| r.query("page"))
        .collect();
    assert_eq!(pages, ["0", "1"]);
}

#[test]
fn a_text_names_a_task_by_its_id_or_its_custom_id() {
    assert_eq!(id_kind("#86abx3"), Some(Named::Task("86abx3")));
    assert_eq!(id_kind("#9hz"), Some(Named::Task("9hz")));
    assert_eq!(id_kind("86abx3"), Some(Named::Task("86abx3")));
    assert_eq!(id_kind(" ABC-12 "), Some(Named::Custom("ABC-12")));
    assert_eq!(id_kind("export"), None);
    assert_eq!(id_kind("utf8"), None);
    assert_eq!(id_kind("mode sombre"), None);
    assert_eq!(id_kind("v2-beta"), None);
    assert_eq!(id_kind(""), None);
}

#[tokio::test]
async fn a_task_is_found_by_its_id_or_custom_id_in_the_list_only() {
    let (server, c) = clickup().await;
    list(&server);
    server.on(
        "GET",
        "/task/86abx3",
        200,
        task("86abx3", Some("ABC-12"), "Exporter le journal", "l1"),
    );
    let by_id = |text: &str| Query {
        text: text.into(),
        ..Default::default()
    };
    let page = c.issues("l1", &by_id("#86abx3")).await.unwrap();
    assert_eq!(page.issues[0].key, "ABC-12");
    assert_eq!(page.next, None);

    server.on(
        "GET",
        "/team",
        200,
        json!({ "teams": [{ "id": 9001, "name": "Atlas" }] }),
    );
    server.on(
        "GET",
        "/task/ABC-12",
        200,
        task("86abx3", Some("ABC-12"), "Exporter le journal", "l1"),
    );
    let page = c.issues("l1", &by_id("ABC-12")).await.unwrap();
    assert_eq!(page.issues[0].id, "86abx3");
    let asked = server
        .requests()
        .into_iter()
        .find(|r| r.path() == "/task/ABC-12")
        .unwrap();
    assert_eq!(asked.query("custom_task_ids").as_deref(), Some("true"));
    assert_eq!(asked.query("team_id").as_deref(), Some("9001"));

    // In another list: not this project's.
    server.on(
        "GET",
        "/task/ABC-13",
        200,
        task("86other", Some("ABC-13"), "Ailleurs", "l9"),
    );
    server.on(
        "GET",
        "/list/l1/task",
        200,
        json!({ "tasks": [], "last_page": true }),
    );
    assert!(c
        .issues("l1", &by_id("ABC-13"))
        .await
        .unwrap()
        .issues
        .is_empty());
    // Unknown to ClickUp: searched in the names.
    server.on(
        "GET",
        "/task/zz9999",
        404,
        json!({ "err": "Task not found", "ECODE": "ITEM_013" }),
    );
    assert!(c
        .issues("l1", &by_id("zz9999"))
        .await
        .unwrap()
        .issues
        .is_empty());
    assert!(server
        .requests()
        .iter()
        .any(|r| r.path() == "/list/l1/task"));
}

#[tokio::test]
async fn a_list_gone_or_out_of_reach_says_so_and_lasts() {
    let (server, c) = clickup().await;
    server.on(
        "GET",
        "/list/l1",
        404,
        json!({ "err": "List not found", "ECODE": "ITEM_013" }),
    );
    let e = c.issues("l1", &Query::default()).await.unwrap_err();
    assert!(e.to_string().contains("n'existe plus"), "{e}");
    assert!(lasting(&e));

    // Refused while the key is good: the list left the key's reach.
    server.on(
        "GET",
        "/list/l1",
        401,
        json!({ "err": "Team not authorized", "ECODE": "OAUTH_027" }),
    );
    server.on("GET", "/user", 200, json!({ "user": { "id": 183 } }));
    let e = c.states("l1").await.unwrap_err();
    assert!(e.to_string().contains("n'est plus accessible"), "{e}");
    assert!(lasting(&e));

    // Refused with the key: the key's refusal.
    server.on(
        "GET",
        "/user",
        401,
        json!({ "err": "Token invalid", "ECODE": "OAUTH_025" }),
    );
    let e = c.states("l1").await.unwrap_err();
    assert_eq!(e.downcast_ref::<HttpError>().unwrap().status, 401);
    assert!(!lasting(&e));
}

fn task_ref() -> ExternalRef {
    ExternalRef {
        service: S,
        id: "86abx3".into(),
        key: "ABC-12".into(),
        container: "l1".into(),
        ..Default::default()
    }
}

#[tokio::test]
async fn a_status_and_a_comment_are_written_on_the_task() {
    let (server, c) = clickup().await;
    list(&server);
    server.on("PUT", "/task/86abx3", 200, json!({ "id": "86abx3" }));
    server.on(
        "POST",
        "/task/86abx3/comment",
        200,
        json!({ "id": 458, "hist_id": "26508", "date": 1568036964079_i64 }),
    );
    let state = ExternalState {
        id: "In Progress".into(),
        name: "In Progress".into(),
    };
    c.set_state(&task_ref(), &state).await.unwrap();
    c.comment(&task_ref(), "Escouade : ABC-12 est prêt à tester.")
        .await
        .unwrap();
    let writes: Vec<Value> = server.writes().iter().map(|w| w.json()).collect();
    // The list's own spelling.
    assert_eq!(writes[0], json!({ "status": "in progress" }));
    assert_eq!(
        writes[1],
        json!({ "comment_text": "Escouade : ABC-12 est prêt à tester.", "notify_all": false })
    );
}

#[tokio::test]
async fn a_status_the_list_lacks_is_said_and_not_sent() {
    let (server, c) = clickup().await;
    list(&server);
    let gone = ExternalState {
        id: "qa".into(),
        name: "qa".into(),
    };
    let e = c.set_state(&task_ref(), &gone).await.unwrap_err();
    assert!(lasting(&e));
    assert_eq!(
        e.to_string(),
        "La liste « Sprint 12 » de ClickUp n'a pas le statut « qa » : ABC-12 reste où il est ; choisis un autre statut dans Réglages › Intégrations"
    );
    assert!(server.writes().is_empty());
}

#[test]
fn the_filter_of_clickup_reads_in_english() {
    assert_eq!(mine_filter(Lang::En).label, "My tasks");
    assert_eq!(super::task(Lang::En), "Task");
}
