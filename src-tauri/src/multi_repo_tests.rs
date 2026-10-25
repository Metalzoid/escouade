//! Integration tests of a project of several git repositories (ESC-169): a folder that is not a
//! repository and holds `api`, `front` and `docs`, each its own.

use crate::core_tests::{git, harness, Harness};
use crate::model::*;
use std::path::{Path, PathBuf};

/// A repository at `dir` with one commit on main.
pub(crate) fn sub_repo(dir: &Path) {
    std::fs::create_dir_all(dir.join("src")).unwrap();
    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "user.email", "t@t"]);
    git(dir, &["config", "user.name", "t"]);
    git(dir, &["config", "core.autocrlf", "false"]);
    std::fs::write(dir.join("src").join("app.ts"), "const a = 1;\n").unwrap();
    git(dir, &["add", "-A"]);
    git(dir, &["commit", "-qm", "init"]);
}

/// The folder of a project of three repositories, and a file of its own at its root.
pub(crate) fn folder(h: &Harness) -> PathBuf {
    let root = h.dir.join("acme");
    for r in ["api", "front", "docs"] {
        sub_repo(&root.join(r));
    }
    std::fs::write(root.join("docker-compose.yml"), "services: {}\n").unwrap();
    root
}

impl Harness {
    /// A project of three repositories (`folder`), worktrees made with the agent (as `project`).
    pub(crate) async fn multi_project(&self, worktrees: bool) -> (Project, PathBuf) {
        let root = folder(self);
        let p = self
            .core
            .create_project(
                &root.to_string_lossy(),
                "acme",
                "oklch(0.72 0.12 48)",
                worktrees,
                None,
                true,
            )
            .await
            .unwrap();
        let p = {
            let mut projects = self.core.projects.write();
            let p = projects.iter_mut().find(|x| x.id == p.id).unwrap();
            p.worktree_at_first_message = false;
            p.clone()
        };
        (p, root)
    }
}

fn edit(dir: &Path, content: &str) {
    std::fs::write(dir.join("src").join("app.ts"), content).unwrap();
}

#[tokio::test]
async fn a_folder_of_repositories_is_a_project_of_them_not_made_a_repository() {
    let h = harness("multi-add");
    let (p, root) = h.multi_project(false).await;
    assert_eq!(p.repos, ["api", "docs", "front"]);
    assert!(
        !root.join(".git").exists(),
        "the folder was made a repository"
    );
    // A repository added later is found, and told; one removed is kept as gone.
    sub_repo(&root.join("infra"));
    std::fs::remove_dir_all(root.join("docs")).unwrap();
    let found = h.core.refresh_repos(&p.id, false).await.unwrap();
    assert_eq!(found.added, ["infra"]);
    assert_eq!(found.gone, ["docs"]);
    let p = h.core.project(&p.id).unwrap();
    assert_eq!(p.repos, ["api", "front", "infra"]);
    assert_eq!(p.repos_gone, ["docs"]);
    let p = h.core.forget_repo(&p.id, "docs").unwrap();
    assert!(p.repos_gone.is_empty());
}

#[tokio::test]
async fn the_git_state_and_the_files_panel_go_by_repository() {
    let h = harness("multi-git");
    let (p, root) = h.multi_project(false).await;
    edit(&root.join("api"), "const a = 2;\n");
    std::fs::write(root.join("front").join("new.ts"), "x\n").unwrap();
    git(&root.join("docs"), &["switch", "-qc", "draft"]);
    h.core.compute_git(&p.id).await;
    let info = h.core.git_cache.read().get(&p.id).cloned().unwrap();
    assert!(info.is_repo);
    assert_eq!(info.repos.len(), 3);
    assert_eq!((info.modified, info.added, info.total), (1, 1, 2));
    // They are not on one branch: none is said for all of them.
    assert_eq!(info.branch, "");
    let docs = info.repos.iter().find(|r| r.repo == "docs").unwrap();
    assert_eq!(docs.branch, "draft");
    assert!(docs.has_commit);

    let files = h.core.git_files(&p.id, None).await.unwrap();
    let mut paths: Vec<(String, String)> = files
        .iter()
        .map(|f| (f.repo.clone(), f.path.clone()))
        .collect();
    paths.sort();
    assert_eq!(
        paths,
        [
            ("api".into(), "api/src/app.ts".into()),
            ("front".into(), "front/new.ts".into())
        ]
    );
    let diff = h
        .core
        .git_diff(&p.id, None, vec!["api/src/app.ts".into()])
        .await
        .unwrap();
    assert!(
        diff.contains("diff --git a/api/src/app.ts b/api/src/app.ts"),
        "{diff}"
    );
    assert!(diff.contains("+const a = 2;"));

    // A commit in each repository of the files, with the message.
    let hashes = h
        .core
        .commit_direct(
            &p.id,
            None,
            vec!["api/src/app.ts".into(), "front/new.ts".into()],
            "feat: both".into(),
        )
        .await
        .unwrap();
    assert_eq!(hashes.split(", ").count(), 2);
    for r in ["api", "front"] {
        assert_eq!(
            git(&root.join(r), &["log", "-1", "--format=%s"]),
            "feat: both"
        );
    }
    assert_eq!(
        git(&root.join("docs"), &["log", "-1", "--format=%s"]),
        "init"
    );
    // A proposal is for one repository at a time.
    edit(&root.join("api"), "const a = 3;\n");
    edit(&root.join("front"), "const a = 3;\n");
    let refused = h
        .core
        .commit_propose(
            &p.id,
            None,
            vec!["api/src/app.ts".into(), "front/src/app.ts".into()],
        )
        .await
        .unwrap_err();
    assert!(
        refused.to_string().contains("un dépôt à la fois")
            || refused.to_string().contains("one repository at a time")
    );

    // The history of one repository, the first by default.
    let log = h
        .core
        .git_log(&p.id, None, Some("front".into()))
        .await
        .unwrap();
    assert_eq!(log.commits[0].subject, "feat: both");
    let log = h
        .core
        .git_log(&p.id, None, Some("docs".into()))
        .await
        .unwrap();
    assert_eq!(log.head.as_deref(), Some("draft"));
    assert!(h
        .core
        .git_log(&p.id, None, Some("nope".into()))
        .await
        .is_err());
    // Its branches, by repository.
    let branches = h.core.branches_in(&p.id, Some("docs")).await.unwrap();
    assert!(branches.iter().any(|b| b.name == "draft"));
    // Discarding goes to the file's repository.
    h.core
        .git_discard(&p.id, None, "api/src/app.ts")
        .await
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(root.join("api").join("src").join("app.ts")).unwrap(),
        "const a = 2;\n"
    );
}

fn branch_of(dir: &Path) -> String {
    git(dir, &["branch", "--show-current"])
}

#[tokio::test]
async fn an_agent_gets_a_folder_with_a_worktree_of_each_repository_on_one_branch() {
    let h = harness("multi-wt");
    let (p, root) = h.multi_project(true).await;
    // One repository on another branch: its worktree starts from its own (« Branche actuelle »).
    git(&root.join("docs"), &["switch", "-qc", "draft"]);
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let wt = a.meta.worktree.clone().unwrap();
    let folder = Path::new(&wt.path);
    assert_eq!(a.meta.cwd, wt.path);
    assert_eq!(
        wt.repos.iter().map(|r| r.repo.as_str()).collect::<Vec<_>>(),
        ["api", "docs", "front"]
    );
    for r in ["api", "docs", "front"] {
        assert_eq!(branch_of(&folder.join(r)), wt.branch, "{r}");
        assert!(folder.join(r).join("src").join("app.ts").is_file());
    }
    let docs = wt.repos.iter().find(|r| r.repo == "docs").unwrap();
    assert_eq!(docs.base_branch, "draft");
    // The root's own files come along.
    assert!(folder.join("docker-compose.yml").is_file());
    // The panel reads its worktrees, its paths from its folder.
    edit(&folder.join("api"), "const a = 9;\n");
    let files = h
        .core
        .git_files(&p.id, Some(a.meta.id.clone()))
        .await
        .unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, "api/src/app.ts");
    assert!(files[0].in_worktree);

    // Deleted with its worktrees: each repository's goes, its branch with it.
    let warning = h.core.delete_agent(&a.meta.id, true).await.unwrap();
    // Api holds a change: its worktree stays, said; the others went.
    assert!(warning.unwrap_or_default().contains("api"));
    assert!(folder.join("api").is_dir());
    assert!(!folder.join("front").exists());
    assert!(git(&root.join("front"), &["branch", "--list", &wt.branch]).is_empty());
}

#[tokio::test]
async fn a_repository_without_a_commit_gets_no_worktree_and_it_is_said() {
    let h = harness("multi-wt-empty");
    let root = folder(&h);
    let infra = root.join("infra");
    std::fs::create_dir_all(&infra).unwrap();
    git(&infra, &["init", "-q", "-b", "main"]);
    let p = h
        .core
        .create_project(
            &root.to_string_lossy(),
            "acme",
            "oklch(0.72 0.12 48)",
            true,
            None,
            true,
        )
        .await
        .unwrap();
    {
        let mut projects = h.core.projects.write();
        projects
            .iter_mut()
            .find(|x| x.id == p.id)
            .unwrap()
            .worktree_at_first_message = false;
    }
    assert_eq!(p.repos, ["api", "docs", "front", "infra"]);
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let wt = a.meta.worktree.unwrap();
    assert_eq!(wt.repos.len(), 3);
    let said = serde_json::to_string(&h.items(&a.meta.id)).unwrap();
    assert!(said.contains("infra"), "{said}");
}

#[tokio::test]
async fn an_archived_agents_worktrees_are_cleaned_one_repository_at_a_time() {
    let h = harness("multi-clean");
    let (p, root) = h.multi_project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let wt = a.meta.worktree.clone().unwrap();
    let folder = PathBuf::from(&wt.path);
    // Front has a commit nothing else has: kept. The others go.
    edit(&folder.join("front"), "const a = 5;\n");
    git(&folder.join("front"), &["commit", "-qam", "front work"]);
    h.core.archive_agent(&a.meta.id, true).await.unwrap();
    let report = h.core.clean_leftover_worktrees(&p.id).await.unwrap();
    assert_eq!(report.kept.len(), 1);
    assert!(
        report.kept[0].reason.starts_with("front"),
        "{}",
        report.kept[0].reason
    );
    assert!(folder.join("front").is_dir());
    assert!(!folder.join("api").exists());
    let left = h.agent(&a.meta.id).worktree.unwrap();
    assert_eq!(left.repos.len(), 1);
    // The repositories without work lost their branch (nothing of theirs left).
    assert!(git(&root.join("api"), &["branch", "--list", &wt.branch]).is_empty());
}

/// Commits `content` into src/app.ts of `dir`.
fn commit_in(dir: &Path, content: &str, msg: &str) {
    edit(dir, content);
    git(
        dir,
        &[
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-qam",
            msg,
        ],
    );
}

fn app_ts(dir: &Path) -> String {
    std::fs::read_to_string(dir.join("src").join("app.ts")).unwrap()
}

#[tokio::test]
async fn nothing_is_merged_while_one_repository_conflicts_unless_asked_for_one_alone() {
    let h = harness("multi-merge");
    let (p, root) = h.multi_project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let wt = a.meta.worktree.clone().unwrap();
    let folder = PathBuf::from(&wt.path);
    commit_in(&folder.join("api"), "const a = 2;\n", "api work");
    commit_in(&folder.join("front"), "const a = 2;\n", "front work");
    // Front's main moved the same line meanwhile.
    commit_in(&root.join("front"), "const a = 3;\n", "front main");
    let check = h.core.agent_merge_check(&a.meta.id).await.unwrap();
    let of = |r: &str| check.iter().find(|m| m.repo == r).unwrap().clone();
    assert_eq!(of("api").commits, 1);
    assert!(of("api").problem.is_none());
    assert_eq!(of("docs").commits, 0);
    assert_eq!(of("front").conflicts, ["front/src/app.ts"]);
    let refused = h
        .core
        .merge_agent(&a.meta.id, true, false)
        .await
        .unwrap_err();
    assert!(refused.to_string().contains("front"), "{refused}");
    assert_eq!(
        app_ts(&root.join("api")),
        "const a = 1;\n",
        "api merged all the same"
    );
    // « Merger api seul ».
    h.core
        .merge_agent_repos(&a.meta.id, true, false, vec!["api".into()])
        .await
        .unwrap();
    assert_eq!(app_ts(&root.join("api")), "const a = 2;\n");
    assert_eq!(app_ts(&root.join("front")), "const a = 3;\n");
}

#[tokio::test]
async fn a_merge_goes_into_each_repository_the_branch_changed() {
    let h = harness("multi-merge-ok");
    let (p, root) = h.multi_project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let folder = PathBuf::from(&a.meta.worktree.clone().unwrap().path);
    commit_in(&folder.join("api"), "const a = 2;\n", "api work");
    commit_in(&folder.join("front"), "const a = 4;\n", "front work");
    let out = h.core.merge_agent(&a.meta.id, false, false).await.unwrap();
    assert!(out.contains("api") && out.contains("front"), "{out}");
    assert_eq!(app_ts(&root.join("api")), "const a = 2;\n");
    assert_eq!(app_ts(&root.join("front")), "const a = 4;\n");
    assert_eq!(
        git(&root.join("docs"), &["log", "-1", "--format=%s"]),
        "init"
    );
}

#[tokio::test]
async fn a_tickets_validation_merges_each_repository_it_changed() {
    let h = harness("multi-ticket");
    let (p, root) = h.multi_project(false).await;
    h.set_board(&p.id, |s| {
        s.action = "merge".into();
        s.strategy = "squash".into();
        s.conventional = false;
        s.cleanup = true;
    });
    let t = h
        .core
        .ticket_create(
            &p.id,
            crate::tickets_tests::draft("Pagination [ok]", &[], 5),
        )
        .await
        .unwrap();
    h.wait_ticket(&t.id, "to test", |t| t.column == Column::Review)
        .await;
    let agent = h.ticket(&t.id).agent_id.unwrap();
    let wt = h.agent(&agent).worktree.unwrap();
    assert_eq!(wt.repos.len(), 3);
    let folder = PathBuf::from(&wt.path);
    commit_in(&folder.join("api"), "const a = 2;\n", "api work");
    // Left uncommitted: the validation commits it.
    edit(&folder.join("front"), "const a = 5;\n");
    h.core.ticket_approve(&t.id).await.unwrap();
    h.wait_ticket(&t.id, "done", |t| t.column == Column::Done)
        .await;
    let done = h.ticket(&t.id);
    let outcome = done.outcome.unwrap();
    assert!(
        outcome.contains("api") && outcome.contains("front"),
        "{outcome}"
    );
    assert!(!outcome.contains("docs"), "{outcome}");
    assert_eq!(app_ts(&root.join("api")), "const a = 2;\n");
    assert_eq!(app_ts(&root.join("front")), "const a = 5;\n");
    assert_eq!(
        git(&root.join("docs"), &["log", "-1", "--format=%s"]),
        "init"
    );
    // Its worktrees went, with its folder.
    assert!(!folder.exists());
}

#[tokio::test]
async fn a_tickets_validation_merges_nothing_while_one_repository_conflicts() {
    let h = harness("multi-ticket-conflict");
    let (p, root) = h.multi_project(false).await;
    h.set_board(&p.id, |s| {
        s.action = "merge".into();
        s.strategy = "squash".into();
        s.conventional = false;
        s.conflict = "ask".into();
    });
    let t = h
        .core
        .ticket_create(&p.id, crate::tickets_tests::draft("Conflit [ok]", &[], 5))
        .await
        .unwrap();
    h.wait_ticket(&t.id, "to test", |t| t.column == Column::Review)
        .await;
    let agent = h.ticket(&t.id).agent_id.unwrap();
    let folder = PathBuf::from(h.agent(&agent).worktree.unwrap().path);
    commit_in(&folder.join("api"), "const a = 2;\n", "api work");
    commit_in(&folder.join("front"), "const a = 2;\n", "front work");
    commit_in(&root.join("front"), "const a = 3;\n", "front main");
    h.core.ticket_approve(&t.id).await.unwrap();
    h.wait_ticket(&t.id, "blocked on its conflict", |t| t.conflict)
        .await;
    let blocked = h.ticket(&t.id);
    assert_eq!(blocked.column, Column::Review);
    let reason = blocked.blocked.unwrap();
    assert!(
        reason.contains("front") && !reason.contains("api"),
        "{reason}"
    );
    assert_eq!(
        app_ts(&root.join("api")),
        "const a = 1;\n",
        "api merged all the same"
    );
}
