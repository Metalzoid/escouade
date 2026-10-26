//! The branch of the agent open (`agentbranch`): what the conversation and the agent are told,
//! its worktree switched from the status bar's picker, a branch it switched to by itself followed
//! by the git pass, and the sync of its folder.

use crate::agentbranch::*;
use crate::core::{BranchRefusal, SyncOp};
use crate::core_tests::{git, harness, Harness};
use crate::forge::{PrState, PullRequest};
use crate::i18n::Lang::{En, Fr};
use crate::model::{AgentStatus, BranchMove};
use std::path::{Path, PathBuf};

fn mv(from: &str, to: &str) -> BranchMove {
    BranchMove {
        from: from.into(),
        to: to.into(),
    }
}

#[test]
fn the_conversation_says_the_move_and_the_branch_left_when_it_went() {
    assert_eq!(
        moved_line(Fr, "escouade/a", "feat/x", None),
        "Branche : escouade/a → feat/x."
    );
    assert_eq!(
        moved_line(Fr, "escouade/a", "feat/x", Some("escouade/a")),
        "Branche : escouade/a → feat/x. « escouade/a » n’avait aucun commit à elle : supprimée."
    );
    // The branch made for it, not the one it was on: it had switched by itself, not followed yet.
    assert_eq!(
        moved_line(Fr, "feat/y", "feat/x", Some("escouade/a")),
        "Branche : feat/y → feat/x. « escouade/a » n’avait aucun commit à elle : supprimée."
    );
    assert_eq!(
        moved_line(En, "a", "b", Some("a")),
        "Branch: a → b. “a” had no commit of its own: deleted."
    );
}

#[test]
fn the_agent_is_told_the_branch_taken_with_its_pull_request() {
    let m = mv("escouade/a", "feat/x");
    let fr = moved_note(Fr, &m, "PR", None);
    assert_eq!(
        fr,
        "Note d'Escouade : l'utilisateur a fait passer ton dossier de travail de la branche « escouade/a » à la branche « feat/x ». Tiens compte de son état (git status, git log) avant de continuer."
    );
    let mut pr = PullRequest {
        number: 12,
        title: "Login".into(),
        base: "main".into(),
        url: "https://github.com/acme/demo/pull/12".into(),
        ..Default::default()
    };
    let en = moved_note(En, &m, "MR", Some(&pr));
    assert!(
        en.ends_with(
            "before going on. It has MR #12 “Login”, open into main: https://github.com/acme/demo/pull/12."
        ),
        "{en}"
    );
    assert_eq!(crate::i18n::check::french_in(&en), None, "{en}");
    pr.state = PrState::Merged;
    assert!(moved_note(Fr, &m, "PR", Some(&pr)).ends_with(
        "Sa PR #12 « Login » est déjà mergée dans main : https://github.com/acme/demo/pull/12."
    ));
    pr.state = PrState::Closed;
    assert!(moved_note(En, &m, "PR", Some(&pr))
        .ends_with("Its PR #12 “Login” is closed: https://github.com/acme/demo/pull/12."));
}

#[test]
fn two_moves_before_the_agent_is_told_make_one() {
    assert_eq!(chained(None, "a", "b"), Some(mv("a", "b")));
    assert_eq!(chained(Some(&mv("a", "b")), "b", "c"), Some(mv("a", "c")));
    assert_eq!(
        chained(Some(&mv("a", "b")), "b", "a"),
        None,
        "back where it was told last: nothing to tell"
    );
}

// ---------- On the real core ----------

/// A project whose agents get a worktree, an agent in one, and the folder of that worktree.
async fn agent_in_worktree(h: &Harness) -> (crate::model::Project, PathBuf, String, PathBuf) {
    let (p, r) = h.project(true).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    let wt = PathBuf::from(h.agent(&id).worktree.expect("a worktree").path);
    (p, r, id, wt)
}

/// A branch `name` of the repository at `r` with one commit of its own, the folder left on main.
fn branch_with_commit(r: &Path, name: &str) {
    git(r, &["checkout", "-q", "-b", name]);
    std::fs::write(r.join(format!("{}.txt", name.replace('/', "-"))), "x\n").unwrap();
    git(r, &["add", "-A"]);
    git(r, &["commit", "-qm", &format!("feat: {name}")]);
    git(r, &["checkout", "-q", "main"]);
}

fn notices(h: &Harness, id: &str) -> Vec<String> {
    h.items(id)
        .iter()
        .filter(|i| i["kind"] == "notice")
        .filter_map(|i| i["text"].as_str().map(str::to_string))
        .collect()
}

/// Sends `text` and waits for the turn to end; what the agent's process read on its input.
async fn say(h: &Harness, id: &str, cwd: &Path, text: &str) -> String {
    let turns = |h: &Harness| h.items(id).iter().filter(|i| i["kind"] == "turn").count();
    let before = turns(h);
    h.core
        .send_message(id, text.to_string(), Vec::new())
        .await
        .unwrap();
    h.wait("the turn's end", |h| {
        turns(h) > before && !h.agent(id).status.is_active()
    })
    .await;
    let last = h.stdin_messages(cwd).pop().expect("a message sent");
    last["message"]["content"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn an_agents_worktree_goes_to_an_existing_branch_and_the_agent_is_told_with_its_next_message()
{
    let h = harness("agent-branch-switch");
    let (_, r, id, wt) = agent_in_worktree(&h).await;
    let made = h.agent(&id).worktree.unwrap().branch;
    branch_with_commit(&r, "feat/login");

    let on = h.core.agent_branch_switch(&id, "feat/login").await.unwrap();
    assert_eq!(on, "feat/login");
    assert_eq!(git(&wt, &["symbolic-ref", "--short", "HEAD"]), "feat/login");
    let w = h.agent(&id).worktree.unwrap();
    assert_eq!(w.branch, "feat/login");
    assert!(w.existing, "the branch taken is the user's");
    // The branch made for the agent had nothing of its own: gone.
    assert_eq!(git(&r, &["branch", "--list", &made]), "");
    assert_eq!(
        notices(&h, &id).last().unwrap(),
        &format!(
            "Branche : {made} → feat/login. « {made} » n’avait aucun commit à elle : supprimée."
        )
    );
    assert_eq!(h.agent(&id).branch_moved, Some(mv(&made, "feat/login")));
    // Already on it: nothing more.
    assert_eq!(
        h.core.agent_branch_switch(&id, "feat/login").await.unwrap(),
        "feat/login"
    );

    // Its next message starts with the note; the conversation shows the message alone.
    let got = say(&h, &id, &wt, "continue").await;
    assert!(
        got.starts_with(&format!(
            "Note d'Escouade : l'utilisateur a fait passer ton dossier de travail de la branche « {made} » à la branche « feat/login »."
        )),
        "{got}"
    );
    assert!(got.ends_with("\n\ncontinue"), "{got}");
    assert!(h
        .items(&id)
        .iter()
        .any(|i| i["kind"] == "user" && i["text"] == "continue"));
    assert_eq!(h.agent(&id).branch_moved, None);
    // Told once.
    assert_eq!(say(&h, &id, &wt, "encore").await, "encore");
}

#[tokio::test]
async fn a_remote_branch_is_taken_through_its_local_one_and_a_branch_with_work_is_kept() {
    let h = harness("agent-branch-remote");
    let (_, r, id, wt) = agent_in_worktree(&h).await;
    let made = h.agent(&id).worktree.unwrap().branch;
    // The agent's branch has a commit of its own.
    git(
        &wt,
        &["commit", "-q", "--allow-empty", "-m", "feat: travail"],
    );
    // A branch only the remote has.
    let bare = h.dir.join("origin.git");
    git(&h.dir, &["init", "-q", "--bare", &bare.to_string_lossy()]);
    git(&r, &["remote", "add", "origin", &bare.to_string_lossy()]);
    branch_with_commit(&r, "feat/remote");
    git(&r, &["push", "-q", "origin", "main", "feat/remote"]);
    git(&r, &["branch", "-q", "-D", "feat/remote"]);
    git(&r, &["fetch", "-q", "origin"]);

    let on = h
        .core
        .agent_branch_switch(&id, "origin/feat/remote")
        .await
        .unwrap();
    assert_eq!(on, "feat/remote");
    assert_eq!(
        git(&wt, &["rev-parse", "--abbrev-ref", "@{upstream}"]),
        "origin/feat/remote"
    );
    assert_eq!(git(&r, &["branch", "--list", &made]), made);
    assert_eq!(
        notices(&h, &id).last().unwrap(),
        &format!("Branche : {made} → feat/remote.")
    );

    // Its folder syncs with the remote: a commit pushed from it.
    git(&wt, &["commit", "-q", "--allow-empty", "-m", "fix: remote"]);
    h.core.agent_git_sync(&id, SyncOp::Push).await.unwrap();
    assert_eq!(
        git(&bare, &["log", "-1", "--format=%s", "feat/remote"]),
        "fix: remote"
    );
}

#[tokio::test]
async fn a_switch_is_refused_while_it_would_lose_or_scramble_something() {
    let h = harness("agent-branch-refused");
    let (p, r, id, wt) = agent_in_worktree(&h).await;
    branch_with_commit(&r, "feat/x");
    let refused = |e: anyhow::Error| e.to_string();

    // The project's folder's own branch.
    let e = h.core.agent_branch_switch(&id, "main").await.unwrap_err();
    assert_eq!(
        refused(e),
        "La branche « main » est celle du dossier du projet : change d’abord la sienne."
    );
    // Another agent's.
    let other = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    let theirs = h.agent(&other).worktree.unwrap().branch;
    let e = h.core.agent_branch_switch(&id, &theirs).await.unwrap_err();
    assert!(e.downcast_ref::<BranchRefusal>().is_some(), "{e}");
    // The board's target: it merges into it.
    let target = |t: &str| {
        let mut projects = h.core.projects.write();
        projects
            .iter_mut()
            .find(|x| x.id == p.id)
            .unwrap()
            .board
            .target = t.into();
    };
    target("feat/x");
    let e = h.core.agent_branch_switch(&id, "feat/x").await.unwrap_err();
    assert_eq!(
        refused(e),
        "C’est la branche cible du Kanban : un agent n’y travaille pas directement."
    );
    target("");
    // Uncommitted changes.
    std::fs::write(wt.join("src").join("app.ts"), "const a = 2;\n").unwrap();
    let e = h.core.agent_branch_switch(&id, "feat/x").await.unwrap_err();
    assert!(
        refused(e).starts_with("Il reste des changements non commités dans le worktree de l’agent"),
    );
    git(&wt, &["checkout", "-q", "--", "."]);
    // In the middle of a turn.
    h.core.agent(&id).unwrap().lock().meta.status = AgentStatus::Running;
    let e = h.core.agent_branch_switch(&id, "feat/x").await.unwrap_err();
    assert!(refused(e).ends_with("travaille : attends la fin de son tour."));
    h.core.agent(&id).unwrap().lock().meta.status = AgentStatus::Done;
    // A ticket's agent: its board holds its branch.
    h.core.agent(&id).unwrap().lock().meta.ticket_id = Some("t1".into());
    let e = h.core.agent_branch_switch(&id, "feat/x").await.unwrap_err();
    assert_eq!(
        refused(e),
        "La branche d’un agent de ticket suit son ticket : elle ne change pas."
    );
    h.core.agent(&id).unwrap().lock().meta.ticket_id = None;
    // Nothing moved meanwhile.
    assert_eq!(h.agent(&id).branch_moved, None);
    assert_ne!(git(&wt, &["symbolic-ref", "--short", "HEAD"]), "feat/x");

    // An agent in the project's folder has no worktree to switch.
    let h = harness("agent-branch-plain");
    let (q, _) = h.project(false).await;
    let plain = h.core.create_agent(&q.id, None).await.unwrap().meta.id;
    let e = h
        .core
        .agent_branch_switch(&plain, "main")
        .await
        .unwrap_err();
    assert!(refused(e).starts_with("Cet agent n’a pas de worktree d’Escouade"));
}

#[tokio::test]
async fn a_branch_the_agent_switched_to_by_itself_is_followed_by_the_git_pass() {
    let h = harness("agent-branch-follow");
    let (p, _, id, wt) = agent_in_worktree(&h).await;
    let made = h.agent(&id).worktree.unwrap().branch;
    let agent_git = |h: &Harness| {
        h.core.git_cache.read()[&p.id]
            .agent_git
            .get(&id)
            .cloned()
            .expect("the agent's checkout")
    };
    h.core.compute_git(&p.id).await;
    assert_eq!(agent_git(&h).branch, made);

    // As `gh pr checkout` does: another branch in its worktree.
    git(&wt, &["switch", "-q", "-c", "feat/review"]);
    // Named before the git pass follows it: the branch it went to keeps its name.
    h.core.rename_agent(&id, "relecture").await.unwrap();
    assert_eq!(
        git(&wt, &["symbolic-ref", "--short", "HEAD"]),
        "feat/review"
    );
    assert_eq!(git(&wt, &["branch", "--list", "escouade/relecture"]), "");
    h.core.compute_git(&p.id).await;
    let w = h.agent(&id).worktree.unwrap();
    assert_eq!(w.branch, "feat/review");
    assert!(
        w.existing,
        "whoever's it is, it is never deleted with the agent"
    );
    assert_eq!(agent_git(&h).branch, "feat/review");
    assert_eq!(
        notices(&h, &id).last().unwrap(),
        &format!("Branche : {made} → feat/review.")
    );
    // It did it itself: nothing to tell it.
    assert_eq!(h.agent(&id).branch_moved, None);
    // Nothing deleted for it.
    assert_eq!(git(&wt, &["branch", "--list", &made]), made);

    // A detached HEAD changes nothing.
    git(&wt, &["checkout", "-q", "--detach"]);
    h.core.compute_git(&p.id).await;
    assert_eq!(h.agent(&id).worktree.unwrap().branch, "feat/review");
    assert_eq!(agent_git(&h).branch, "(detached)");
}
