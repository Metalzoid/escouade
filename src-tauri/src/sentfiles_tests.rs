//! The files an agent sends (ESC-171), from Claude Code's frame to what the window reads: the
//! images copied when the call comes, kept on its item through a restart, the card and the
//! notification.

use crate::agent::{AgentRt, Effects, NotifyKind};
use crate::core_tests::harness;
use crate::model::*;
use crate::paths::test_dir;
use serde_json::{json, Value};
use std::path::Path;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";
const PDF: &[u8] = b"%PDF-1.7\n";

fn write(path: &Path, bytes: &[u8]) -> String {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, bytes).unwrap();
    // As Claude Code writes them under Windows: with `/`.
    path.to_string_lossy().replace('\\', "/")
}

fn call(id: &str, input: Value) -> Value {
    json!({"type":"assistant","message":{"id":format!("m-{id}"),"content":[{"type":"tool_use","id":id,"name":"SendUserFile","input":input}]},"parent_tool_use_id":null})
}

fn delivered(id: &str, files: &[String]) -> Value {
    let lines: Vec<String> = files
        .iter()
        .map(|f| format!("{f} → file_uuid: 0000"))
        .collect();
    let text = format!(
        "{} files delivered to user.\n{}",
        files.len(),
        lines.join("\n")
    );
    json!({"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":id,"content":text}]},"parent_tool_use_id":null})
}

#[tokio::test]
async fn the_images_an_agent_sends_are_copied_and_shown_after_their_folder_and_a_restart() {
    let h = harness("sent-files-core");
    let (p, repo) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.turn(&id, "Bonjour").await;
    let tmp = repo.join(".impeccable").join("tmp");
    let files = vec![
        write(&tmp.join("a.png"), PNG),
        write(&tmp.join("b.png"), PNG),
        write(&tmp.join("contract.pdf"), PDF),
    ];
    let input = json!({ "files": files, "caption": "Deux vues et le contrat", "status": "normal", "display": "render" });
    h.feed(&id, call("toolu_s1", input));
    h.feed(&id, delivered("toolu_s1", &files));
    let item = |h: &crate::core_tests::Harness| {
        h.items(&id)
            .into_iter()
            .find(|i| i["id"] == "toolu_s1")
            .unwrap_or(Value::Null)
    };
    h.wait("the files delivered on the item", |h| {
        item(h).get("sent").is_some()
    })
    .await;
    let sent = item(&h)["sent"].clone();
    assert_eq!(sent[0]["copy"], "sent-toolu_s1/0-a.png");
    assert_eq!(sent[2]["kind"], "file");
    assert!(h
        .core
        .data
        .agent_files(&id)
        .join("sent-toolu_s1")
        .join("1-b.png")
        .is_file());
    // The card says what it did.
    let activity = h.core.agent(&id).unwrap().lock().activity.clone();
    assert_eq!(activity.as_deref(), Some("A envoyé 2 images et 1 fichier"));

    // The temporary folder goes: the images show still, the PDF is said gone.
    std::fs::remove_dir_all(&tmp).unwrap();
    let shown = h.core.sent_files(&id, "toolu_s1").await.unwrap();
    let states: Vec<_> = shown
        .iter()
        .map(|s| (s.kind, s.state, s.url.is_some()))
        .collect();
    assert_eq!(
        states,
        vec![
            ("image", "ok", true),
            ("image", "ok", true),
            ("file", "missing", false)
        ]
    );
    let e = h
        .core
        .open_sent_file(&id, "toolu_s1", 2, true)
        .await
        .unwrap_err();
    assert!(e.to_string().contains("contract.pdf"), "{e}");
    // Another item is no call to read.
    assert!(h.core.sent_files(&id, "nothing").await.is_err());

    // The conversation read again, as after a restart: the item keeps its files.
    let log =
        crate::conv::replay(&crate::conv::log_path(&h.core.data.conversations(), &id)).unwrap();
    let kept = log.items.iter().find(|i| i["id"] == "toolu_s1").unwrap();
    assert_eq!(kept["sent"], sent);
    // Its frames read again (the transcript of the Claude Code view): nothing copied twice.
    h.feed(&id, call("toolu_s1", json!({ "files": files })));
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    assert_eq!(item(&h)["sent"], sent);
}

fn rt(dir: &Path) -> AgentRt {
    AgentRt::new(
        AgentMeta {
            id: new_id(),
            cwd: "C:/p".into(),
            ..Default::default()
        },
        dir,
    )
}

#[test]
fn a_proactive_sending_calls_for_the_user_as_a_question_does() {
    let dir = test_dir("sent-files-notify");
    let mut a = rt(&dir);
    let mut fx = Effects::default();
    let input =
        json!({ "files": ["C:/p/a.png"], "caption": "Le rendu est prêt", "status": "proactive" });
    a.claude_frame(&call("t1", input.clone()), &mut fx);
    let alert = fx.notify.expect("a notification");
    assert_eq!(
        (alert.kind, alert.body.as_str()),
        (NotifyKind::Question, "Le rendu est prêt")
    );
    assert_eq!(fx.sent, vec![("t1".to_string(), input)]);
    assert_eq!(a.activity.as_deref(), Some("A envoyé 1 image"));
    // Sent in answer to the user: no notification.
    let mut fx = Effects::default();
    a.claude_frame(
        &call(
            "t2",
            json!({ "files": ["C:/p/r.pdf", "C:/p/s.zip"], "status": "normal" }),
        ),
        &mut fx,
    );
    assert!(fx.notify.is_none());
    assert_eq!(a.activity.as_deref(), Some("A envoyé 2 fichiers"));
}
