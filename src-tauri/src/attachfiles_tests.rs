//! Integration tests of the files joined to a message (`attachfiles`): the copies, the files of
//! the user's own, what is sent to the agent, and where it all goes with its owner.

use crate::attachfiles::{self, AttachedFile};
use crate::core::Core;
use crate::core_tests::{harness, naming_asked, Harness};
use crate::model::*;
use crate::paths::test_dir;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// The file `bytes` copied for `owner` under `name`, as the window does: opened, sent in two
/// chunks, finished.
pub(crate) fn copy(h: &Harness, owner: &str, name: &str, bytes: &[u8]) -> AttachedFile {
    let handle = h.core.attach_open(owner, name, bytes.len() as u64).unwrap();
    let (first, second) = bytes.split_at(bytes.len() / 2);
    h.core.attach_chunk(&handle, first).unwrap();
    h.core.attach_chunk(&handle, second).unwrap();
    h.core.attach_finish(&handle).unwrap()
}

/// The file of the user's own at `path` joined for `owner` the way the window does it: the host
/// read its path (a drop), the page asked `file_origin` for it and holds an id, which is all
/// `attach_origin` takes.
pub(crate) fn join_own(h: &Harness, owner: &str, path: &str) -> anyhow::Result<AttachedFile> {
    let id = format!("drop-{}", uuid::Uuid::new_v4());
    h.core.file_origins.deposit(id.clone(), path.to_string());
    h.core.file_origins.hand(&id).expect("the path was read");
    h.core.attach_origin(owner, &id)
}

/// Whether `e` says it in French or in English (the language of the texts is global to a run).
fn says(e: &anyhow::Error, fr: &str, en: &str) -> bool {
    let e = e.to_string();
    e.contains(fr) || e.contains(en)
}

/// A project with an agent: its id and its folder.
async fn agent(h: &Harness) -> (String, PathBuf) {
    let (p, _) = h.project(false).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap().meta;
    (a.id, PathBuf::from(a.cwd))
}

/// Two agents of one project.
async fn two_agents(h: &Harness) -> (String, String) {
    let (p, _) = h.project(false).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    let b = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    (a, b)
}

/// The names in the folder `dir`, none when it is not there.
fn entries(dir: &Path) -> Vec<String> {
    std::fs::read_dir(dir)
        .map(|d| {
            d.flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

fn write(path: &Path, bytes: &[u8]) -> String {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, bytes).unwrap();
    path.to_string_lossy().into_owned()
}

/// `file` as old as `days` days (and `hours` hours).
fn aged(file: &Path, days: u64, hours: u64) {
    std::fs::File::options()
        .write(true)
        .open(file)
        .unwrap()
        .set_modified(SystemTime::now() - Duration::from_secs(days * 24 * 3600 + hours * 3600))
        .unwrap();
}

/// Sends `text` and `files` to the agent and waits for the turn to end.
async fn say(h: &Harness, id: &str, text: &str, files: Vec<AttachedFile>) {
    let turns = |h: &Harness| h.items(id).iter().filter(|i| i["kind"] == "turn").count();
    let before = turns(h);
    h.core
        .send_message_files(id, text.to_string(), vec![], files)
        .await
        .unwrap();
    h.wait("the turn's end", |h| {
        turns(h) > before && !h.agent(id).status.is_active()
    })
    .await;
}

/// Sends `files` to the agent `id` and gives what came of it, without waiting for a turn.
async fn try_send(h: &Harness, id: &str, files: Vec<AttachedFile>) -> anyhow::Result<()> {
    h.core
        .send_message_files(id, "lis".into(), vec![], files)
        .await
}

/// What the agent's process was last sent on its input.
fn delivered(h: &Harness, cwd: &Path) -> String {
    let last = h.stdin_messages(cwd).pop().expect("a message sent");
    last["message"]["content"].as_str().unwrap().to_string()
}

#[test]
fn a_joined_file_is_told_to_the_window_in_camel_case() {
    let file = AttachedFile {
        name: "a.zip".into(),
        path: r"C:\x\a.zip".into(),
        claude_path: "/mnt/c/x/a.zip".into(),
        size: 12,
        origin: true,
    };
    let v = serde_json::to_value(&file).unwrap();
    assert_eq!(
        v,
        json!({ "name": "a.zip", "path": r"C:\x\a.zip", "claudePath": "/mnt/c/x/a.zip",
                "size": 12, "origin": true })
    );
    assert_eq!(serde_json::from_value::<AttachedFile>(v).unwrap(), file);
    // The window may leave out what it does not know.
    let part: AttachedFile =
        serde_json::from_value(json!({ "name": "b", "path": "/b", "size": 1 })).unwrap();
    assert_eq!((part.claude_path.as_str(), part.origin), ("", false));
}

#[tokio::test]
async fn a_file_is_copied_in_chunks_under_the_folder_of_its_agent() {
    let h = harness("af-copy");
    let (id, _) = agent(&h).await;
    let bytes: Vec<u8> = (0..10_000u32).map(|n| (n % 251) as u8).collect();
    let handle = h
        .core
        .attach_open(&id, "rapport.xlsx", bytes.len() as u64)
        .unwrap();
    for chunk in bytes.chunks(4096) {
        h.core.attach_chunk(&handle, chunk).unwrap();
    }
    let file = h.core.attach_finish(&handle).unwrap();
    assert_eq!(
        (file.name.as_str(), file.size, file.origin),
        ("rapport.xlsx", 10_000, false)
    );
    let path = Path::new(&file.path);
    assert_eq!(std::fs::read(path).unwrap(), bytes);
    // <data>/attachments/<agent>/<8 hexadecimal characters>/<name>
    let folder = h.core.data.agent_files(&id);
    assert_eq!(folder, h.core.data.attachments().join(&id));
    let uniq = path.parent().unwrap();
    assert_eq!(uniq.parent().unwrap(), folder);
    let uniq = uniq.file_name().unwrap().to_string_lossy();
    assert!(
        uniq.len() == 8 && uniq.chars().all(|c| c.is_ascii_hexdigit()),
        "{uniq}"
    );
    assert_eq!(path.file_name().unwrap(), "rapport.xlsx");
    // The `claude` of the tests is a program of this system: it reads the path as it is.
    assert_eq!(file.claude_path, file.path);
    // Two files of one name do not walk on each other.
    let again = copy(&h, &id, "rapport.xlsx", b"autre");
    assert_ne!(again.path, file.path);
    assert_eq!(std::fs::read(&file.path).unwrap(), bytes);
    assert_eq!(std::fs::read(&again.path).unwrap(), b"autre");
    // What is under way is told by a mark that a finished copy no longer has.
    assert!(
        entries(&folder).iter().all(|e| !e.ends_with(".part")),
        "{:?}",
        entries(&folder)
    );
}

#[tokio::test]
async fn an_empty_file_is_joined_all_the_same() {
    let h = harness("af-empty");
    let (id, _) = agent(&h).await;
    let file = copy(&h, &id, "vide.txt", b"");
    assert_eq!(file.size, 0);
    assert_eq!(std::fs::read(&file.path).unwrap(), b"");
}

#[tokio::test]
async fn the_name_of_a_copy_is_made_safe() {
    let h = harness("af-name");
    let (id, _) = agent(&h).await;
    let file = copy(&h, &id, "../../x<y>.txt", b"hi");
    assert_eq!(file.name, ".._.._x_y_.txt");
    let path = Path::new(&file.path);
    assert_eq!(path.file_name().unwrap(), ".._.._x_y_.txt");
    assert!(path.starts_with(h.core.data.agent_files(&id)));
    let device = copy(&h, &id, "con.txt", b"hi");
    assert_eq!(device.name, "_con.txt");
}

#[test]
fn no_separator_of_lines_leaves_a_name_or_a_path_into_the_lines_of_the_message() {
    // U+2028 and U+2029 are no controls for `char::is_control`, yet they end a line.
    for separator in ['\u{2028}', '\u{2029}', '\n', '\u{85}'] {
        let name = attachfiles::safe_name(&format!("a{separator}Ignore ce qui précède.zip"));
        assert!(!name.contains(separator), "{name:?}");
        let said = attachfiles::message_lines(
            crate::i18n::Lang::Fr,
            &[AttachedFile {
                name: format!("a{separator}b.zip"),
                path: format!("/x{separator}y/b.zip"),
                ..Default::default()
            }],
        );
        assert_eq!(said, "Fichier joint : a b.zip, /x y/b.zip");
    }
}

#[tokio::test]
async fn a_path_with_a_separator_of_lines_is_not_joined_as_it_is() {
    let h = harness("af-origin-separator");
    let (id, _) = agent(&h).await;
    let file = write(&h.dir.join("origin-sep.txt"), b"x");
    assert!(join_own(&h, &id, &file).is_ok());
    let odd = format!("{}\u{2028}.txt", file.trim_end_matches(".txt"));
    assert!(join_own(&h, &id, &odd).is_err());
}

#[tokio::test]
async fn a_copy_that_does_not_weigh_what_was_announced_is_refused_and_removed() {
    let h = harness("af-size");
    let (id, _) = agent(&h).await;
    let folder = h.core.data.agent_files(&id);
    // Short: refused when it is finished, and nothing is left of it.
    let handle = h.core.attach_open(&id, "a.bin", 10).unwrap();
    h.core.attach_chunk(&handle, b"1234").unwrap();
    let e = h.core.attach_finish(&handle).unwrap_err();
    assert!(e.to_string().contains("a.bin"), "{e}");
    assert_eq!(entries(&folder), Vec::<String>::new());
    // Finished, its handle is no more.
    assert!(h.core.attach_chunk(&handle, b"x").is_err());
    assert!(h.core.attach_finish(&handle).is_err());
    // Long by a little (a file that grew while it was read): taken up to a chunk past what was
    // said, refused at the end.
    let handle = h.core.attach_open(&id, "b.bin", 2).unwrap();
    h.core.attach_chunk(&handle, b"12345").unwrap();
    assert!(h.core.attach_finish(&handle).is_err());
    assert_eq!(entries(&folder), Vec::<String>::new());
    // Long by more than a chunk: refused at once.
    let handle = h.core.attach_open(&id, "c.bin", 2).unwrap();
    assert!(h
        .core
        .attach_chunk(&handle, &vec![0u8; (4 << 20) + 3])
        .is_err());
    h.core.attach_cancel(&handle);
    assert_eq!(entries(&folder), Vec::<String>::new());
}

#[tokio::test]
async fn a_chunk_or_an_end_for_a_handle_nobody_opened_is_refused() {
    let h = harness("af-handle");
    assert!(h.core.attach_chunk("nope", b"x").is_err());
    assert!(h.core.attach_finish("nope").is_err());
    // A cancel that comes late (the copy was finished, the window reloaded) is no error.
    h.core.attach_cancel("nope");
}

#[tokio::test]
async fn cancelling_a_copy_removes_what_was_written() {
    let h = harness("af-cancel");
    let (id, _) = agent(&h).await;
    let folder = h.core.data.agent_files(&id);
    let handle = h.core.attach_open(&id, "a.bin", 10).unwrap();
    h.core.attach_chunk(&handle, b"1234").unwrap();
    assert!(!entries(&folder).is_empty());
    h.core.attach_cancel(&handle);
    assert_eq!(entries(&folder), Vec::<String>::new());
    assert!(h.core.attach_chunk(&handle, b"5").is_err());
    h.core.attach_cancel(&handle);
}

#[tokio::test]
async fn a_file_over_the_cap_of_the_settings_is_refused_and_zero_is_no_cap() {
    let h = harness("af-cap");
    let (id, _) = agent(&h).await;
    let folder = h.core.data.agent_files(&id);
    h.core.settings.write().attach_max_mb = 1;
    let e = h
        .core
        .attach_open(&id, "gros.iso", (1 << 20) + 1)
        .unwrap_err()
        .to_string();
    assert!(
        e.contains("gros.iso") && e.contains("dépasse") && e.contains("1 Mo"),
        "{e}"
    );
    assert!(!folder.join("gros.iso").exists());
    assert!(entries(&folder).is_empty(), "{:?}", entries(&folder));
    // At the cap: taken.
    let ok = copy(&h, &id, "juste.bin", &vec![1u8; 1 << 20]);
    assert_eq!(ok.size, 1 << 20);
    // A window that announces less than it sends: the cap is read on what is written.
    let handle = h.core.attach_open(&id, "menteur.bin", 1 << 20).unwrap();
    h.core.attach_chunk(&handle, &vec![0u8; 1 << 20]).unwrap();
    assert!(h.core.attach_chunk(&handle, b"x").is_err());
    h.core.attach_cancel(&handle);
    // No cap: anything is taken (nothing is written here).
    h.core.settings.write().attach_max_mb = 0;
    let huge = h.core.attach_open(&id, "enorme.iso", 50 << 30).unwrap();
    h.core.attach_cancel(&huge);
    // A size no file has is no overflow either.
    let endless = h.core.attach_open(&id, "infini.bin", u64::MAX).unwrap();
    h.core.attach_chunk(&endless, b"abc").unwrap();
    assert!(h.core.attach_finish(&endless).is_err());
    // Only the copy that was made at the cap is left.
    assert_eq!(entries(&folder).len(), 1, "{:?}", entries(&folder));
}

#[tokio::test]
async fn a_copy_belongs_to_an_agent_that_is_there_or_to_the_drafts() {
    let h = harness("af-owner");
    agent(&h).await;
    for owner in ["inconnu", "", "../x", "_drafts", "a/b", ".."] {
        assert!(
            h.core.attach_open(owner, "a.txt", 1).is_err(),
            "owner {owner:?}"
        );
    }
    let file = copy(&h, "draft", "notes.txt", b"hello");
    let path = Path::new(&file.path);
    assert!(path.starts_with(h.core.data.drafts_files()), "{path:?}");
    assert!(path.starts_with(h.core.data.attachments().join("_drafts")));
    // No agent reads it yet: no path of Claude Code's.
    assert_eq!(file.claude_path, "");
    assert_eq!(std::fs::read(path).unwrap(), b"hello");
}

#[tokio::test]
async fn a_copy_is_discarded_with_its_folder() {
    let h = harness("af-discard");
    let (id, _) = agent(&h).await;
    let file = copy(&h, &id, "x.zip", b"zip");
    let uniq = Path::new(&file.path).parent().unwrap().to_path_buf();
    h.core.attach_discard(&id, &file.path).unwrap();
    assert!(!Path::new(&file.path).exists());
    assert!(!uniq.exists());
    // Already gone (the purge, a second click): nothing to do.
    h.core.attach_discard(&id, &file.path).unwrap();
    // A draft's too.
    let draft = copy(&h, "draft", "n.txt", b"n");
    h.core.attach_discard("draft", &draft.path).unwrap();
    assert!(!Path::new(&draft.path).exists());
}

#[tokio::test]
async fn a_file_out_of_the_folder_of_its_owner_is_refused_and_stays() {
    let h = harness("af-discard-out");
    let (a, b) = two_agents(&h).await;
    let mine = copy(&h, &a, "mine.zip", b"1");
    let theirs = copy(&h, &b, "theirs.zip", b"2");
    let outside = write(&h.dir.join("keep.txt"), b"keep");
    let folder = h.core.data.agent_files(&a);
    let mine_dir = Path::new(&mine.path).parent().unwrap().to_path_buf();
    let theirs_dir = Path::new(&theirs.path).parent().unwrap().to_path_buf();
    // A way round with `..` that ends in another agent's file.
    let round = format!(
        "{}{sep}..{sep}..{sep}{}{sep}{}{sep}theirs.zip",
        mine_dir.display(),
        b,
        theirs_dir.file_name().unwrap().to_string_lossy(),
        sep = std::path::MAIN_SEPARATOR
    );
    let refused: Vec<(&str, String)> = vec![
        // Another agent's, a file of the project, the data folder, the folder itself, its copy's
        // folder, a path with nothing there, a draft's owner asked for an agent's file.
        (&a, theirs.path.clone()),
        (&a, outside.clone()),
        (&a, h.core.data.root().to_string_lossy().into_owned()),
        (&a, folder.to_string_lossy().into_owned()),
        (&a, mine_dir.to_string_lossy().into_owned()),
        (&a, round),
        (&a, h.dir.join("absent.txt").to_string_lossy().into_owned()),
        ("draft", mine.path.clone()),
        (&b, mine.path.clone()),
    ];
    for (owner, path) in &refused {
        assert!(
            h.core.attach_discard(owner, path).is_err(),
            "{owner} {path}"
        );
    }
    for kept in [&mine.path, &theirs.path, &outside] {
        assert!(Path::new(kept).exists(), "{kept}");
    }
    // The file of the user's own that was joined by its path is never one of the copies.
    let origin = join_own(&h, &a, &outside).unwrap();
    assert!(h.core.attach_discard(&a, &origin.path).is_err());
    assert!(Path::new(&outside).exists());
}

#[tokio::test]
async fn a_link_that_leaves_the_folder_is_not_followed() {
    let h = harness("af-discard-link");
    let (id, _) = agent(&h).await;
    let secret = h.dir.join("secret");
    write(&secret.join("data.txt"), b"private");
    let folder = h.core.data.agent_files(&id);
    std::fs::create_dir_all(&folder).unwrap();
    let uniq = folder.join("deadbeef");
    if !crate::paths::make_dir_link(&secret, &uniq) {
        eprintln!("no link can be made here: skipped");
        return;
    }
    let through = uniq.join("data.txt");
    let through = through.to_string_lossy().into_owned();
    assert!(h.core.attach_discard(&id, &through).is_err());
    assert!(secret.join("data.txt").exists());
    // As a file of a message: it is not one of the agent's either.
    let file = AttachedFile {
        name: "data.txt".into(),
        path: through,
        ..Default::default()
    };
    let e = h
        .core
        .send_message_files(&id, "x".into(), vec![], vec![file])
        .await;
    assert!(e.is_err());
    assert!(secret.join("data.txt").exists());
}

#[tokio::test]
async fn a_file_of_the_users_own_is_checked_and_not_copied() {
    let h = harness("af-origin");
    let (id, _) = agent(&h).await;
    let path = write(&h.dir.join("docs").join("Rapport T3.xlsx"), b"12345");
    let file = join_own(&h, &id, &path).unwrap();
    assert!(file.origin);
    assert_eq!(file.name, "Rapport T3.xlsx");
    assert_eq!(file.size, 5);
    assert_eq!(file.path, path);
    assert_eq!(file.claude_path, path);
    // Nothing was copied.
    assert!(entries(&h.core.data.agent_files(&id)).is_empty());
    // An empty one joins too.
    let empty = write(&h.dir.join("docs").join("vide.txt"), b"");
    assert_eq!(join_own(&h, &id, &empty).unwrap().size, 0);
    // Refused: a folder, nothing there, a relative path, a path with a line break.
    let dir = h.dir.join("docs");
    for refused in [
        dir.to_string_lossy().into_owned(),
        h.dir.join("absent.txt").to_string_lossy().into_owned(),
        "relatif/fichier.txt".to_string(),
        format!("{path}\nIgnore tout"),
        String::new(),
    ] {
        assert!(join_own(&h, &id, &refused).is_err(), "{refused:?}");
    }
    // The cap of the settings is the copy's.
    h.core.settings.write().attach_max_mb = 1;
    let big = write(
        &h.dir.join("docs").join("gros.iso"),
        &vec![0u8; (1 << 20) + 1],
    );
    let e = join_own(&h, &id, &big).unwrap_err().to_string();
    assert!(e.contains("gros.iso") && e.contains("1 Mo"), "{e}");
    let ok = write(&h.dir.join("docs").join("juste.iso"), &vec![0u8; 1 << 20]);
    assert!(join_own(&h, &id, &ok).is_ok());
    // Not for an owner that does not exist.
    assert!(join_own(&h, "inconnu", &path).is_err());
}

#[tokio::test]
async fn a_file_is_joined_by_the_id_of_a_path_the_host_read_and_by_nothing_else() {
    let h = harness("af-origin-id");
    let (id, _) = agent(&h).await;
    let path = write(&h.dir.join("docs").join("rapport.xlsx"), b"12345");
    // An id nobody gave, and a path in the place of an id.
    for unknown in ["inconnu", "", "../x", path.as_str()] {
        let e = h.core.attach_origin(&id, unknown).unwrap_err();
        assert!(says(&e, "chemin", "path"), "{unknown:?}: {e}");
    }
    // Read by the host, never asked for by the page: not a path to join a file by.
    h.core.file_origins.deposit("lu".into(), path.clone());
    assert!(h.core.attach_origin(&id, "lu").is_err());
    // Asked for: it joins, and only once.
    h.core.file_origins.hand("lu").unwrap();
    let file = h.core.attach_origin(&id, "lu").unwrap();
    assert_eq!((file.path.as_str(), file.origin), (path.as_str(), true));
    assert!(h.core.attach_origin(&id, "lu").is_err());
    // An owner that does not exist does not use the id up.
    h.core.file_origins.deposit("b".into(), path.clone());
    h.core.file_origins.hand("b").unwrap();
    assert!(h.core.attach_origin("inconnu", "b").is_err());
    assert!(h.core.attach_origin(&id, "b").is_ok());
    // A file that is refused does use it up: the window asks the host again.
    let dir = h.dir.join("docs").to_string_lossy().into_owned();
    h.core.file_origins.deposit("d".into(), dir);
    h.core.file_origins.hand("d").unwrap();
    assert!(h.core.attach_origin(&id, "d").is_err());
    assert!(h.core.attach_origin(&id, "d").is_err());
}

#[tokio::test]
async fn the_core_takes_its_paths_from_the_table_the_app_manages_and_the_command_fills_it() {
    use crate::fileorigin::{file_origin, FileOrigins};
    use tauri::Manager as _;
    let app = tauri::test::mock_app();
    let origins = FileOrigins::default();
    app.manage(origins.clone());
    let dir = test_dir("af-origin-command");
    let path = write(&dir.join("docs").join("rapport.xlsx"), b"12345");
    let (core, _rx) = Core::load(
        app.handle().clone(),
        crate::paths::DataDir::new(dir.join("data")),
    );
    // What the host's listener read: not yet asked for, so not a path to join a file by.
    origins.deposit("drop-1".into(), path.clone());
    assert!(core.attach_origin("draft", "drop-1").is_err());
    // The window asks `file_origin`, then joins by the id it holds.
    let answered = file_origin(app.handle().clone(), "drop-1".into()).await;
    if cfg!(windows) {
        assert_eq!(answered.as_deref(), Some(path.as_str()));
        let file = core.attach_origin("draft", "drop-1").unwrap();
        assert_eq!((file.path.as_str(), file.origin), (path.as_str(), true));
        assert!(core.attach_origin("draft", "drop-1").is_err());
    } else {
        // No bridge: nothing is answered, so nothing is joined by a path.
        assert_eq!(answered, None);
        assert!(core.attach_origin("draft", "drop-1").is_err());
    }
    core.stop_for_good();
}

#[tokio::test]
async fn a_file_of_the_users_own_that_the_host_never_handed_out_is_refused_at_the_sending() {
    let h = harness("af-origin-forged");
    let (a, b) = two_agents(&h).await;
    let cwd = PathBuf::from(h.agent(&a).cwd);
    let secret = write(&h.dir.join("secret").join("id_rsa"), b"key");
    // What a window that was taken over would send: a file of the user's own, a path of its choice.
    let forged = AttachedFile {
        name: "id_rsa".into(),
        path: secret.clone(),
        claude_path: secret.clone(),
        size: 3,
        origin: true,
    };
    let e = try_send(&h, &a, vec![forged.clone()]).await.unwrap_err();
    assert!(says(&e, "n’a pas été joint", "wasn’t joined"), "{e}");
    assert!(e.to_string().contains("id_rsa"), "{e}");
    assert!(h.stdin_messages(&cwd).is_empty());
    assert!(!h.items(&a).iter().any(|i| i["kind"] == "user"));
    assert!(h.agent(&a).granted_files.is_empty());

    // Next to a good one: none goes, and nothing is granted.
    let own = write(&h.dir.join("docs").join("ok.txt"), b"ok");
    let ok = join_own(&h, &a, &own).unwrap();
    assert!(try_send(&h, &a, vec![ok.clone(), forged]).await.is_err());
    assert!(h.agent(&a).granted_files.is_empty());
    // Joined for one agent, it is not for another.
    assert!(try_send(&h, &b, vec![ok.clone()]).await.is_err());
    assert!(h.agent(&b).granted_files.is_empty());
    assert!(h.stdin_messages(&cwd).is_empty());
    // The attempts did not use the file up: it goes for its own agent.
    say(&h, &a, "Look", vec![ok]).await;
    assert_eq!(h.agent(&a).granted_files, vec![own]);
}

#[tokio::test]
async fn a_message_that_fails_and_is_sent_again_still_finds_its_files_of_the_users_own() {
    let h = harness("af-origin-retry");
    let (id, _) = agent(&h).await;
    let own = write(&h.dir.join("docs").join("budget.xlsx"), b"xlsx");
    let file = join_own(&h, &id, &own).unwrap();
    // A message that fails (a second file that is none of the agent's).
    let stranger = AttachedFile {
        name: "x.zip".into(),
        path: write(&h.dir.join("x.zip"), b"x"),
        ..Default::default()
    };
    assert!(h
        .core
        .send_message_files(&id, "Look".into(), vec![], vec![file.clone(), stranger])
        .await
        .is_err());
    assert!(h.agent(&id).granted_files.is_empty());
    // The window gives the same chips back: it goes, and goes again with the next message.
    say(&h, &id, "Look", vec![file.clone()]).await;
    assert_eq!(h.agent(&id).granted_files, vec![own.clone()]);
    say(&h, &id, "Again", vec![file]).await;
    assert_eq!(h.agent(&id).granted_files, vec![own]);
}

#[tokio::test]
async fn nothing_in_the_data_folder_of_escouade_is_joined_by_its_path() {
    let h = harness("af-origin-data");
    let (id, _) = agent(&h).await;
    h.core.save_state().unwrap();
    let root = h.core.data.root().to_path_buf();
    let settings = h.core.data.settings_file();
    let state = h.core.data.state_file();
    let copied = copy(&h, &id, "a.zip", b"zip");
    assert!(settings.is_file() && state.is_file());
    let sep = std::path::MAIN_SEPARATOR;
    let inside = [
        settings.to_string_lossy().into_owned(),
        state.to_string_lossy().into_owned(),
        copied.path.clone(),
        root.to_string_lossy().into_owned(),
        h.core.data.attachments().to_string_lossy().into_owned(),
        h.core.data.agent_files(&id).to_string_lossy().into_owned(),
        // A way round that ends in it.
        format!(
            "{}{sep}attachments{sep}..{sep}settings.json",
            root.display()
        ),
    ];
    for path in &inside {
        let e = join_own(&h, &id, path).unwrap_err();
        assert!(says(&e, "dossier de données", "data folder"), "{path}: {e}");
    }
    // Its name is a prefix of a folder beside it, not a place in it.
    let beside = write(&h.dir.join("data-notes").join("notes.txt"), b"n");
    assert!(join_own(&h, &id, &beside).is_ok());
    let beside = write(&h.dir.join("database.txt"), b"n");
    assert!(join_own(&h, &id, &beside).is_ok());

    // At the sending the path may be one that was joined (here, put in the list as it would have
    // been before): the folder is looked at again all the same.
    for path in [&inside[0], &inside[1], &inside[2]] {
        h.core.origin_files.add(&id, path);
        let file = AttachedFile {
            name: "x".into(),
            path: path.clone(),
            origin: true,
            ..Default::default()
        };
        let e = h
            .core
            .send_message_files(&id, "Look".into(), vec![], vec![file])
            .await
            .unwrap_err();
        assert!(says(&e, "dossier de données", "data folder"), "{path}: {e}");
    }
    assert!(h.agent(&id).granted_files.is_empty());
}

#[tokio::test]
async fn a_link_that_leads_into_the_data_folder_does_not_join_what_it_leads_to() {
    let h = harness("af-origin-data-link");
    let (id, _) = agent(&h).await;
    let link = h.dir.join("shortcut");
    if !crate::paths::make_dir_link(h.core.data.root(), &link) {
        eprintln!("no link can be made here: skipped");
        return;
    }
    let through = link.join("settings.json").to_string_lossy().into_owned();
    let e = join_own(&h, &id, &through).unwrap_err();
    assert!(says(&e, "dossier de données", "data folder"), "{e}");
}

#[test]
fn the_files_of_the_users_own_that_were_joined_are_remembered_by_agent_and_the_oldest_leave_first()
{
    let joined = attachfiles::OriginFiles::default();
    assert!(!joined.has("a1", "/x/0"));
    for n in 0..1024 {
        joined.add("a1", &format!("/x/{n}"));
    }
    assert!(joined.has("a1", "/x/0") && joined.has("a1", "/x/1023"));
    // For one agent only, and exactly that path.
    assert!(!joined.has("a2", "/x/0"));
    assert!(!joined.has("a1", "/x/0/"));
    assert!(!joined.has("a1", "/X/0"));
    // Joined again, a file is the newest and the list does not grow: the next one pushes out the
    // oldest that is left.
    joined.add("a1", "/x/0");
    joined.add("a1", "/x/new");
    assert!(joined.has("a1", "/x/0") && joined.has("a1", "/x/new"));
    assert!(!joined.has("a1", "/x/1"));
    assert!(joined.has("a1", "/x/2"));
    // The same path joined for two agents is two entries.
    let two = attachfiles::OriginFiles::default();
    two.add("a1", "/x/y");
    two.add("a2", "/x/y");
    assert!(two.has("a1", "/x/y") && two.has("a2", "/x/y"));
}

#[test]
fn the_path_claude_reads_a_file_by_is_its_linux_one_in_wsl() {
    let ubuntu = crate::engine::Program::Wsl(crate::wsl::Program {
        exe: PathBuf::from(r"C:\Windows\System32\wsl.exe"),
        distro: "Ubuntu-24.04".into(),
        path: "/home/me/.local/bin/claude".into(),
        home: "/home/me".into(),
        mount_root: "/mnt/".into(),
    });
    let file = Path::new(r"C:\Users\Jean Dupont\.escouade\attachments\a1\4f2a9c01\rapport.xlsx");
    assert_eq!(
        attachfiles::claude_path_of(Some(&ubuntu), file),
        "/mnt/c/Users/Jean Dupont/.escouade/attachments/a1/4f2a9c01/rapport.xlsx"
    );
    // A share that WSL does not reach: the path is told as it is.
    let share = Path::new(r"\\server\share\rapport.xlsx");
    assert_eq!(
        attachfiles::claude_path_of(Some(&ubuntu), share),
        r"\\server\share\rapport.xlsx"
    );
    // A claude of the system, or none found: as it is.
    let native = crate::engine::Program::Native(PathBuf::from(r"C:\bin\claude.exe"));
    for program in [Some(&native), None] {
        assert_eq!(
            attachfiles::claude_path_of(program, file),
            file.to_string_lossy()
        );
    }
}

#[tokio::test]
async fn claude_starts_with_the_folder_of_the_files_joined_to_its_agent_readable() {
    let h = harness("af-add-dir");
    let (id, cwd) = agent(&h).await;
    h.turn(&id, "bonjour").await;
    let folder = h.core.data.agent_files(&id);
    let stream = h
        .launches(&cwd)
        .into_iter()
        .rfind(|argv| argv.iter().any(|a| a == "stream-json"))
        .expect("the agent's process");
    let wanted = format!("--add-dir={}", folder.display());
    assert!(stream.contains(&wanted), "{stream:?}");
    assert_eq!(
        stream.iter().filter(|a| a.starts_with("--add-dir")).count(),
        1
    );
    // Made before it starts: a folder that is not there is one Claude Code would never read.
    assert!(folder.is_dir());
}

#[tokio::test]
async fn a_message_tells_claude_where_its_files_are_in_the_language_of_its_texts() {
    let h = harness("af-message");
    let (id, cwd) = agent(&h).await;
    let zip = copy(&h, &id, "a.zip", b"zip");
    let sheet = copy(&h, &id, "budget 2026.xlsx", b"xlsx");
    h.core.settings.write().claude_language = "en".into();
    say(&h, &id, "Look at these", vec![zip.clone(), sheet.clone()]).await;
    let text = format!(
        "Look at these\n\nAttached file: a.zip, {}\nAttached file: budget 2026.xlsx, {}",
        zip.path, sheet.path
    );
    assert_eq!(delivered(&h, &cwd), text);
    // The conversation shows the whole message, the lines too.
    let shown: Vec<Value> = h
        .items(&id)
        .into_iter()
        .filter(|i| i["kind"] == "user")
        .collect();
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0]["text"], json!(text));
    // In French when the texts for Claude are.
    h.core.settings.write().claude_language = "fr".into();
    say(&h, &id, "Regarde ça", vec![zip.clone()]).await;
    assert_eq!(
        delivered(&h, &cwd),
        format!("Regarde ça\n\nFichier joint : a.zip, {}", zip.path)
    );
}

#[tokio::test]
async fn files_alone_make_a_message_that_never_names_the_agent() {
    let h = harness("af-no-text");
    let (id, cwd) = agent(&h).await;
    h.core.settings.write().claude_language = "en".into();
    let zip = copy(&h, &id, "a.zip", b"zip");
    say(&h, &id, "", vec![zip.clone()]).await;
    assert_eq!(
        delivered(&h, &cwd),
        format!("Attached file: a.zip, {}", zip.path)
    );
    // The lines are no task: the agent is named from what the user writes.
    assert!(!naming_asked(&h, &id));
    assert!(!h.agent(&id).named);
    say(&h, &id, "Create the hello file", vec![]).await;
    h.wait("named", |h| h.agent(&id).named).await;
    assert_eq!(h.agent(&id).name, "create-the-fake-en");
}

#[tokio::test]
async fn a_file_that_is_not_one_of_the_agents_is_refused_and_nothing_is_sent() {
    let h = harness("af-send-refused");
    let (a, b) = two_agents(&h).await;
    let cwd = PathBuf::from(h.agent(&a).cwd);
    let theirs = copy(&h, &b, "t.zip", b"x");
    let outside = write(&h.dir.join("passwd"), b"root");
    let made_up = AttachedFile {
        name: "passwd".into(),
        path: outside.clone(),
        size: 4,
        ..Default::default()
    };
    let draft = copy(&h, "draft", "d.zip", b"d");
    let gone = AttachedFile {
        name: "x.zip".into(),
        path: h
            .core
            .data
            .agent_files(&a)
            .join("deadbeef")
            .join("x.zip")
            .to_string_lossy()
            .into_owned(),
        ..Default::default()
    };
    for file in [theirs, made_up, draft, gone] {
        let e = h
            .core
            .send_message_files(&a, "regarde".into(), vec![], vec![file.clone()])
            .await;
        assert!(e.is_err(), "{file:?}");
    }
    // A good one next to a bad one: none goes.
    let mine = copy(&h, &a, "ok.zip", b"ok");
    let bad = AttachedFile {
        path: outside,
        ..mine.clone()
    };
    assert!(h
        .core
        .send_message_files(&a, "regarde".into(), vec![], vec![mine, bad])
        .await
        .is_err());
    assert!(h.stdin_messages(&cwd).is_empty());
    assert!(!h.items(&a).iter().any(|i| i["kind"] == "user"));
    assert!(h.agent(&a).granted_files.is_empty());
}

#[tokio::test]
async fn a_file_of_the_users_own_is_checked_again_and_granted_when_the_message_is_sent() {
    let h = harness("af-grant");
    let (id, cwd) = agent(&h).await;
    h.core.settings.write().claude_language = "en".into();
    let path = write(&h.dir.join("docs").join("budget.xlsx"), b"xlsx");
    let file = join_own(&h, &id, &path).unwrap();
    assert!(h.agent(&id).granted_files.is_empty());
    // What the window says of the path Claude reads it by, of the name and of the size is not
    // believed: they are worked out here.
    let told = AttachedFile {
        name: "innocent.txt".into(),
        claude_path: "/etc/passwd".into(),
        size: 1,
        ..file.clone()
    };
    say(&h, &id, "Look", vec![told]).await;
    assert_eq!(
        delivered(&h, &cwd),
        format!("Look\n\nAttached file: budget.xlsx, {path}")
    );
    assert_eq!(h.agent(&id).granted_files, vec![path.clone()]);
    // Kept with the agent in the state saved.
    h.core.save_state().unwrap();
    let saved: Value =
        serde_json::from_slice(&std::fs::read(h.core.data.state_file()).unwrap()).unwrap();
    assert_eq!(saved["agents"][0]["grantedFiles"], json!([path]));
    // Gone before the message: refused, and not granted.
    let gone = write(&h.dir.join("docs").join("gone.txt"), b"x");
    let doomed = join_own(&h, &id, &gone).unwrap();
    std::fs::remove_file(&gone).unwrap();
    assert!(h
        .core
        .send_message_files(&id, "Look".into(), vec![], vec![doomed])
        .await
        .is_err());
    assert_eq!(h.agent(&id).granted_files, vec![path]);
    // A copy of the user's own that grew too big for the cap since it was joined: refused.
    h.core.settings.write().attach_max_mb = 1;
    let big = write(&h.dir.join("docs").join("big.bin"), &[0u8; 8]);
    let grown = join_own(&h, &id, &big).unwrap();
    write(
        &h.dir.join("docs").join("big.bin"),
        &vec![0u8; (1 << 20) + 1],
    );
    assert!(h
        .core
        .send_message_files(&id, "Look".into(), vec![], vec![grown])
        .await
        .is_err());
}

#[tokio::test]
async fn the_reading_of_a_file_joined_by_its_path_is_allowed_by_itself_and_nothing_else_is() {
    let h = harness("af-read");
    let (id, _) = agent(&h).await;
    let path = write(&h.dir.join("docs").join("budget.xlsx"), b"xlsx");
    let other = write(&h.dir.join("docs").join("secret.txt"), b"secret");
    let file = join_own(&h, &id, &path).unwrap();
    let permissions = |h: &Harness| -> Vec<Value> {
        h.items(&id)
            .into_iter()
            .filter(|i| i["kind"] == "permission")
            .collect()
    };
    let said = |h: &Harness, text: &str| h.items(&id).iter().any(|i| i["text"] == text);

    // Joined, it is read (the fake `claude` reads what it is told of, and its path is outside the
    // folders it reads without asking): the question comes, and goes through with no card, nobody
    // is waited for.
    say(&h, &id, "Look", vec![file.clone()]).await;
    assert!(said(&h, "Lu : budget.xlsx=4"), "{:#?}", h.items(&id));
    assert!(permissions(&h).is_empty(), "{:?}", permissions(&h));
    assert_eq!(h.agent(&id).status, AgentStatus::Done);
    assert!(h
        .items(&id)
        .iter()
        .any(|i| i["kind"] == "tool" && i["name"] == "Read" && i["status"] == "ok"));

    // The same path spelt as Windows says it (the case, the separators).
    let spelt = path.replace('\\', "/").to_uppercase();
    if cfg!(windows) {
        h.core
            .send_message_files(&id, format!("lire-fichier {spelt}"), vec![], vec![])
            .await
            .unwrap();
        h.wait("its reading", |h| {
            said(h, "Read : allow") && !h.agent(&id).status.is_active()
        })
        .await;
        assert!(permissions(&h).is_empty());
    }

    // Another file asks, as before.
    h.core
        .send_message_files(&id, format!("lire-fichier {other}"), vec![], vec![])
        .await
        .unwrap();
    h.wait("the question", |h| {
        h.agent(&id).status == AgentStatus::Waiting
    })
    .await;
    let asked = permissions(&h);
    assert_eq!(asked.len(), 1);
    assert_eq!(asked[0]["toolName"], "Read");
    let request = asked[0]["id"].as_str().unwrap().to_string();
    h.core
        .answer_permission(&id, &request, "deny", None)
        .unwrap();
    h.wait("the turn's end", |h| !h.agent(&id).status.is_active())
        .await;

    // Changing the same file asks too: only reading is granted.
    h.core
        .send_message_files(&id, format!("modifier-fichier {path}"), vec![], vec![])
        .await
        .unwrap();
    h.wait("the second question", |h| {
        h.agent(&id).status == AgentStatus::Waiting
    })
    .await;
    let edits: Vec<Value> = permissions(&h)
        .into_iter()
        .filter(|p| p["toolName"] == "Edit")
        .collect();
    assert_eq!(edits.len(), 1);
    assert_eq!(
        h.agent(&id).granted_files,
        vec![path.clone()],
        "nothing else is granted"
    );
}

#[tokio::test]
async fn a_copy_is_read_without_a_question_since_its_folder_was_given_to_claude() {
    let h = harness("af-read-copy");
    let (id, _) = agent(&h).await;
    let zip = copy(&h, &id, "a.zip", b"zip");
    say(&h, &id, "Look", vec![zip]).await;
    // The fake `claude` reads it as Claude Code does: a folder of `--add-dir` asks nothing.
    assert!(h.items(&id).iter().any(|i| i["text"] == "Lu : a.zip=3"));
    assert!(h.items(&id).iter().all(|i| i["kind"] != "permission"));
    assert!(h.agent(&id).granted_files.is_empty());
}

#[tokio::test]
async fn in_the_claude_code_view_files_stay_refused_as_attachments_do() {
    let h = harness("af-terminal");
    let (id, cwd) = agent(&h).await;
    let file = copy(&h, &id, "a.zip", b"zip");
    h.core.set_agent_view(&id, true).await.unwrap();
    let e = h
        .core
        .send_message_files(&id, "x".into(), vec![], vec![file])
        .await
        .unwrap_err();
    assert!(e.to_string().contains("terminal"), "{e}");
    assert!(h.stdin_messages(&cwd).is_empty());
    // The copy itself is made for it all the same: the window types its path there.
    let again = copy(&h, &id, "b.zip", b"zip");
    assert!(Path::new(&again.path).starts_with(h.core.data.agent_files(&id)));
    assert_eq!(again.claude_path, again.path);
}

#[tokio::test]
async fn the_files_of_an_agent_go_with_it_and_those_of_the_user_stay() {
    let h = harness("af-agent-gone");
    let (a, b) = two_agents(&h).await;
    let mine = copy(&h, &a, "mine.zip", b"1");
    let theirs = copy(&h, &b, "theirs.zip", b"2");
    let draft = copy(&h, "draft", "draft.zip", b"3");
    let own = write(&h.dir.join("docs").join("own.xlsx"), b"4");
    let origin = join_own(&h, &a, &own).unwrap();
    say(&h, &a, "Look", vec![origin]).await;
    h.core.delete_agent(&a, false).await.unwrap();
    assert!(!h.core.data.agent_files(&a).exists());
    assert!(!Path::new(&mine.path).exists());
    assert!(Path::new(&theirs.path).exists());
    assert!(Path::new(&draft.path).exists());
    assert!(Path::new(&own).exists());
}

#[tokio::test]
async fn closing_a_project_keeps_the_files_of_its_agents_and_erasing_its_history_removes_them() {
    let h = harness("af-project-closed");
    let (p, _) = h.project(false).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    let file = copy(&h, &a, "a.zip", b"zip");
    // Closed, its history kept: the agent comes back with its files.
    h.core.remove_project(&p.id, false).await.unwrap();
    assert!(Path::new(&file.path).exists());
    // The history gone for good.
    h.core.erase_closed_project(&p.id).unwrap();
    assert!(!h.core.data.agent_files(&a).exists());
}

#[tokio::test]
async fn removing_a_project_for_good_removes_the_files_of_its_agents() {
    let h = harness("af-project-erased");
    let (p, _) = h.project(false).await;
    let (a, b) = {
        let a = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
        let b = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
        (a, b)
    };
    let (fa, fb) = (copy(&h, &a, "a.zip", b"1"), copy(&h, &b, "b.zip", b"2"));
    let draft = copy(&h, "draft", "d.zip", b"3");
    h.core.remove_project(&p.id, true).await.unwrap();
    assert!(!Path::new(&fa.path).exists());
    assert!(!Path::new(&fb.path).exists());
    assert!(!h.core.data.agent_files(&a).exists());
    assert!(!h.core.data.agent_files(&b).exists());
    // What belongs to no agent is not theirs to remove.
    assert!(Path::new(&draft.path).exists());
}

/// `<root>/<owner>/<uniq>/<name>`, written `days` days and `hours` hours ago.
fn old_copy(root: &Path, owner: &str, uniq: &str, name: &str, days: u64, hours: u64) -> PathBuf {
    let path = root.join(owner).join(uniq).join(name);
    write(&path, b"copy");
    aged(&path, days, hours);
    path
}

#[test]
fn copies_older_than_the_days_of_the_settings_go_with_their_empty_folders() {
    let dir = test_dir("af-purge");
    let root = dir.join("attachments");
    let old = old_copy(&root, "a1", "11111111", "old.bin", 3, 0);
    let older = old_copy(&root, "a1", "22222222", "older.bin", 9, 0);
    let recent = old_copy(&root, "a1", "33333333", "recent.bin", 1, 0);
    // A folder with an old file and a recent one keeps the recent one and its folder.
    let mixed_old = old_copy(&root, "a2", "44444444", "old.bin", 5, 0);
    let mixed_new = old_copy(&root, "a2", "44444444", "new.bin", 0, 1);
    attachfiles::maintain(&root, 2, &HashSet::new());
    for gone in [&old, &older, &mixed_old] {
        assert!(!gone.exists(), "{gone:?}");
    }
    assert!(!old.parent().unwrap().exists());
    assert!(!older.parent().unwrap().exists());
    for kept in [&recent, &mixed_new] {
        assert!(kept.exists(), "{kept:?}");
    }
    // The folder of an agent stays: its Claude Code was given it.
    assert!(root.join("a1").is_dir());

    // 0: they stay as long as their owner does.
    let still = old_copy(&root, "a1", "55555555", "ancient.bin", 400, 0);
    attachfiles::maintain(&root, 0, &HashSet::new());
    assert!(still.exists());
    // Nothing of the user's own is in there to remove: a file out of the folder is left alone.
    let outside = dir.join("own.xlsx");
    write(&outside, b"mine");
    aged(&outside, 400, 0);
    attachfiles::maintain(&root, 1, &HashSet::new());
    assert!(outside.exists());
    assert!(!still.exists());
}

#[test]
fn the_files_of_the_drafts_go_after_a_day_whatever_the_settings_say() {
    let dir = test_dir("af-purge-drafts");
    let root = dir.join("attachments");
    let old = old_copy(&root, "_drafts", "aaaaaaaa", "old.bin", 1, 1);
    let recent = old_copy(&root, "_drafts", "bbbbbbbb", "recent.bin", 0, 23);
    attachfiles::maintain(&root, 0, &HashSet::new());
    assert!(!old.exists());
    assert!(!old.parent().unwrap().exists());
    assert!(recent.exists());
}

#[test]
fn a_copy_left_half_written_goes_unless_a_window_is_still_writing_it() {
    let dir = test_dir("af-purge-half");
    let root = dir.join("attachments");
    let half = |uniq: &str| {
        let file = root.join("a1").join(uniq).join("half.bin");
        write(&file, b"hal");
        write(&root.join("a1").join(format!("{uniq}.part")), b"");
        file
    };
    let (lost, writing) = (half("66666666"), half("77777777"));
    let done = old_copy(&root, "a1", "88888888", "done.bin", 0, 0);
    let open: HashSet<PathBuf> = [root.join("a1").join("77777777")].into();
    attachfiles::maintain(&root, 0, &open);
    assert!(!lost.exists());
    assert!(!lost.parent().unwrap().exists());
    assert!(!root.join("a1").join("66666666.part").exists());
    assert!(writing.exists());
    assert!(root.join("a1").join("77777777.part").exists());
    assert!(done.exists());
}

#[tokio::test]
async fn the_purge_runs_at_the_start_and_leaves_what_a_window_is_still_copying() {
    let h = harness("af-purge-start");
    let (id, _) = agent(&h).await;
    let root = h.core.data.attachments();
    let old = old_copy(&root, &id, "99999999", "old.bin", 3, 0);
    let load = |h: &Harness| {
        let app = tauri::test::mock_app();
        let (core, _rx) = Core::load(app.handle().clone(), h.core.data.clone());
        core.stop_for_good();
    };
    // The settings say they stay: they do.
    load(&h);
    assert!(old.exists());
    // Two days: the next start (and the next hour) removes it.
    let mut s = h.core.settings.read().clone();
    s.attach_keep_days = 2;
    h.core.save_settings(s).unwrap();
    // A copy this window is making is not touched by its own purge.
    let handle = h.core.attach_open(&id, "under-way.bin", 10).unwrap();
    h.core.attach_chunk(&handle, b"123").unwrap();
    h.core.maintain_attachments();
    assert!(!old.exists());
    let way = entries(&h.core.data.agent_files(&id));
    assert_eq!(way.len(), 2, "{way:?}");
    h.core.attach_chunk(&handle, b"4567890").unwrap();
    let file = h.core.attach_finish(&handle).unwrap();
    assert_eq!(std::fs::read(&file.path).unwrap(), b"1234567890");
    // A window that reloaded lost its handle: the next start removes what it left.
    let lost = h.core.attach_open(&id, "lost.bin", 10).unwrap();
    h.core.attach_chunk(&lost, b"123").unwrap();
    load(&h);
    let left = entries(&h.core.data.agent_files(&id));
    assert_eq!(left.len(), 1, "{left:?}");
    assert!(Path::new(&file.path).exists());
}
