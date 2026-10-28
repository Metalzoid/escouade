//! Where the docs of a project live (ESC-256): the branch of the docs, set per project
//! (`Project::docs_branch`).
//!
//! - **The current branch** (empty): the branch checked out where the caller works. An agent
//!   writes in its own folder, so a ticket's spec changes go in its branch and merge with its
//!   code; the window, and a client outside Escouade, work on the project's folder.
//! - **A fixed branch**: its own worktree, made and held by Escouade under the project's folder in
//!   Escouade's data (`DataDir::project_files`), or the folder where git already has that branch
//!   checked out. Escouade writes the files there and does nothing else with the branch: it never
//!   merges it anywhere (the team does, or the branch is `main`), and never commits nor pushes.
//!
//! The text extracted from the documents is kept in the data folder too (`Space::text_dir`).

use std::path::{Path, PathBuf};

use anyhow::{bail, Result};
use tauri::Runtime;

use crate::core::Core;
use crate::docs::{DocInfo, Space, LARGE_FILE};
use crate::model::Project;

/// One worktree is made at a time: two tools asking at once must not both make it.
static MAKING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// The folder that holds a project's `.escouade/` for the files shared with the team: its
/// folder, or its first repository's when it has several (as the shared tickets, ESC-169).
pub fn base_of(project: &Project) -> PathBuf {
    let root = Path::new(&project.path);
    match project.repos.first() {
        Some(first) if !first.is_empty() => root.join(first),
        _ => root.to_path_buf(),
    }
}

/// Why `name` cannot be the docs branch of a project, if it cannot (git's own rules, checked once
/// more when the worktree is made).
pub fn branch_problem(name: &str) -> Option<String> {
    let bad = name.starts_with('-')
        || name.starts_with('/')
        || name.ends_with('/')
        || name.ends_with('.')
        || name.ends_with(".lock")
        || name.contains("..")
        || name.contains("//")
        || name.contains("@{")
        || name == "@"
        || name
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "~^:?*[\\".contains(c));
    bad.then(|| {
        tr!(
            "« {name} » n’est pas un nom de branche valide.",
            "“{name}” is not a valid branch name."
        )
    })
}

impl<R: Runtime> Core<R> {
    /// Where the extracted text of a project's documents is kept.
    pub(crate) fn docs_text_dir(&self, project_id: &str) -> PathBuf {
        self.data.project_files(project_id).join("docs-text")
    }

    /// Where the fixed branch's worktree is made.
    fn docs_worktrees(&self, project_id: &str) -> PathBuf {
        self.data.project_files(project_id).join("docs")
    }

    /// The docs of `project` as `agent` (the id of an agent of Escouade, or None for the window and
    /// Claude outside Escouade) sees them. See the module's comment.
    pub async fn docs_space(&self, project_id: &str, agent: Option<&str>) -> Result<Space> {
        let project = self.project(project_id)?;
        let text = Some(self.docs_text_dir(&project.id));
        let branch = project.docs_branch.trim().to_string();
        if branch.is_empty() {
            return Ok(Space::new(self.docs_current(&project, agent), text));
        }
        Ok(Space::new(
            self.docs_worktree(&project, &branch).await?,
            text,
        ))
    }

    /// The folder the branch checked out where the caller works holds: the agent's own (a worktree
    /// of its ticket) when it works in this project, else the project's.
    fn docs_current(&self, project: &Project, agent: Option<&str>) -> PathBuf {
        let own = agent
            .and_then(|id| self.agent(id).ok())
            .map(|h| {
                let m = h.lock().meta.clone();
                (m.project_id, m.cwd)
            })
            .filter(|(pid, cwd)| *pid == project.id && !cwd.is_empty() && Path::new(cwd).is_dir())
            .map(|(_, cwd)| PathBuf::from(cwd));
        let Some(cwd) = own else {
            return base_of(project);
        };
        // A project of several repositories: the first one's, as its folder.
        match project.repos.first() {
            Some(first) if !first.is_empty() && cwd.join(first).is_dir() => cwd.join(first),
            _ => cwd,
        }
    }

    /// The worktree of the fixed branch `branch`: where git already has it checked out, else one of
    /// Escouade's own, the branch made first (from the remote's when it has one, else from HEAD)
    /// when there is none.
    async fn docs_worktree(&self, project: &Project, branch: &str) -> Result<PathBuf> {
        let _one = MAKING.lock().await;
        let repo = base_of(project).to_string_lossy().to_string();
        crate::git::check_ref_format(branch).await?;
        if let Some(at) = crate::git::checkout_of(&repo, branch).await? {
            if Path::new(&at).is_dir() {
                return Ok(PathBuf::from(at));
            }
            // Its folder is gone: git forgets it, then it is made again.
            let _ = crate::git::run(&repo, &["worktree", "prune"]).await;
        }
        if !crate::git::has_commit(&repo).await {
            bail!(tr!(
                "Le dépôt n’a pas encore de commit : la branche des docs « {branch} » ne peut pas être créée.",
                "The repository has no commit yet: the docs branch “{branch}” can’t be made."
            ));
        }
        if !crate::git::branch_exists(&repo, branch).await {
            let remote = format!("origin/{branch}");
            if crate::git::ref_exists(&repo, &format!("refs/remotes/{remote}")).await {
                crate::git::branch_track(&repo, &remote).await?;
            } else {
                crate::git::branch_create(&repo, branch, "HEAD").await?;
            }
        }
        let root = self.docs_worktrees(&project.id);
        std::fs::create_dir_all(&root)?;
        let (path, _) = crate::git::worktree_add_existing(&repo, &root, &[], branch).await?;
        Ok(PathBuf::from(path))
    }

    /// « Accepter » a proposed decision: the window's alone (no tool does it). The name carried
    /// is this machine's user's in the project.
    pub async fn docs_accept_decision(
        &self,
        project_id: &str,
        number: u32,
    ) -> Result<crate::docs::Decision> {
        let project = self.project(project_id)?;
        let by = self.me_in(&project).name;
        self.docs_space(project_id, None)
            .await?
            .decision_accept(number, &by)
    }

    /// A file the user chose put in the drive of the docs. A file over 50 MB asks to be
    /// confirmed (`confirmed`) first: it goes in the repository, and git keeps every version.
    pub async fn docs_add_file(
        &self,
        project_id: &str,
        folder: &str,
        source: &str,
        confirmed: bool,
    ) -> Result<DocInfo> {
        let src = Path::new(source);
        let meta = std::fs::metadata(src)?;
        if !meta.is_file() {
            bail!(tr!(
                "{source} n’est pas un fichier.",
                "{source} is not a file."
            ));
        }
        if meta.len() > LARGE_FILE && !confirmed {
            bail!(tr!(
                "Ce fichier pèse {mb} Mo : il entre dans le dépôt, que git garde en entier à chaque version. Confirme pour l’ajouter.",
                "This file weighs {mb} MB: it goes into the repository, and git keeps every version of it in full. Confirm to add it.",
                mb = meta.len() / (1024 * 1024)
            ));
        }
        let name = src
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let bytes = std::fs::read(src)?;
        self.docs_space(project_id, None)
            .await?
            .document_add(folder, &name, &bytes)
    }
}
