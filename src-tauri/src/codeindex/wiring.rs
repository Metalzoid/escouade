//! The index in the app: the project's setting, the folder an agent asks about, the fence, the git
//! events that bring the index up to date.

use super::{Reader, Status, Target};
use crate::core::Core;
use crate::fence::Fence;
use anyhow::{bail, Result};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Runtime;

/// « Index du code » of a project, as the settings read it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodeIndexInfo {
    pub enabled: bool,
    pub status: Status,
    /// The folders of the project's own that its fence leaves out of the index (ESC-254): those of
    /// another project inside it, of the other side of a private project. Relative to the project,
    /// with `/`.
    pub excluded: Vec<String>,
}

impl<R: Runtime> Core<R> {
    /// What the agent working in `dir` (the project's folder when None) is asked about: refused when
    /// the folder is none of the project's.
    pub(crate) fn index_target(&self, project_id: &str, dir: Option<&str>) -> Result<Target> {
        let project = self.project(project_id)?;
        let root = PathBuf::from(&project.path);
        let worktrees = project.worktrees_root();
        let mut agents: Vec<PathBuf> = self
            .project_agents(project_id)
            .iter()
            .map(|h| PathBuf::from(&h.lock().meta.cwd))
            .filter(|c| !c.as_os_str().is_empty())
            .collect();
        agents.retain(|c| !crate::paths::same_folder(&c.to_string_lossy(), &project.path));
        let dir = match dir.map(str::trim).filter(|d| !d.is_empty()) {
            None => root.clone(),
            Some(d) => {
                let known = crate::paths::same_folder(d, &project.path)
                    || Fence::new(vec![worktrees.clone()]).covers(d)
                    || agents
                        .iter()
                        .any(|a| crate::paths::same_folder(d, &a.to_string_lossy()));
                if !known {
                    bail!(tr!(
                        "Ce dossier n’est pas celui du projet ni d’un de ses worktrees.",
                        "This folder is neither the project's nor one of its worktrees'."
                    ));
                }
                PathBuf::from(d)
            }
        };
        let mut exclude = vec![worktrees];
        exclude.extend(agents);
        Ok(Target {
            project_id: project_id.to_string(),
            root,
            dir,
            fence: self.project_fence(project_id),
            exclude,
        })
    }

    /// A reader of the project's index for the folder `dir`, the files checked first (at most once
    /// every few seconds). An error when the project has not turned the index on.
    pub async fn code_index(
        self: &Arc<Self>,
        project_id: &str,
        dir: Option<&str>,
    ) -> Result<Reader> {
        if !self.project(project_id)?.code_index {
            bail!(tr!(
                "L’index du code est coupé pour ce projet.",
                "The code index is off for this project."
            ));
        }
        let target = self.index_target(project_id, dir)?;
        let me = self.clone();
        tokio::task::spawn_blocking(move || me.codeindex.reader(&target)).await?
    }

    /// A commit, a change of branch, the end of an agent's turn: the index reads what changed, in
    /// the background. Nothing when the project has not turned it on.
    pub(crate) fn code_index_event(self: &Arc<Self>, project_id: &str) {
        if !self.project(project_id).is_ok_and(|p| p.code_index) {
            return;
        }
        let Ok(target) = self.index_target(project_id, None) else {
            return;
        };
        let me = self.clone();
        let id = project_id.to_string();
        tokio::task::spawn_blocking(move || {
            if let Err(e) = me.codeindex.ensure_fresh(&target, true) {
                log::warn!("code index of {id} not refreshed: {e:#}");
            }
        });
    }

    /// What the hook of an agent's view answers a search for a symbol (`hint`): None when the
    /// project has not turned the index on, the harness cannot read it, or the search is for a text.
    pub(crate) fn index_hint(
        &self,
        agent_id: &str,
        hook: &serde_json::Value,
    ) -> Option<serde_json::Value> {
        let (project_id, engine) = {
            let h = self.agent(agent_id).ok()?;
            let m = h.lock().meta.clone();
            (m.project_id, m.engine)
        };
        if !self.project(&project_id).ok()?.code_index {
            return None;
        }
        super::hint::reply(engine, self.lang().claude, hook)
    }

    pub fn code_index_info(&self, project_id: &str) -> Result<CodeIndexInfo> {
        let project = self.project(project_id)?;
        let root = PathBuf::from(&project.path);
        let mut excluded: Vec<String> = self
            .project_fence(project_id)
            .paths()
            .iter()
            .filter_map(|p| p.strip_prefix(&root).ok())
            .map(|rel| rel.to_string_lossy().replace('\\', "/"))
            .filter(|rel| !rel.is_empty())
            .collect();
        excluded.sort();
        excluded.dedup();
        Ok(CodeIndexInfo {
            enabled: project.code_index,
            status: self.codeindex.status(project_id),
            excluded,
        })
    }

    /// The setting « Index du code »: on, the project is read at once in the background; off, its
    /// database is erased.
    pub async fn set_code_index(
        self: &Arc<Self>,
        project_id: &str,
        enabled: bool,
    ) -> Result<CodeIndexInfo> {
        let updated = {
            let mut projects = self.projects.write();
            let cur = projects
                .iter_mut()
                .find(|p| p.id == project_id)
                .ok_or_else(crate::core::project_not_found)?;
            cur.code_index = enabled;
            cur.clone()
        };
        self.hub
            .emit(crate::model::UiEvent::Project { project: updated });
        self.request_save();
        if enabled {
            let target = self.index_target(project_id, None)?;
            let me = self.clone();
            tokio::task::spawn_blocking(move || me.codeindex.ensure_fresh(&target, true)).await??;
        } else {
            let me = self.clone();
            let id = project_id.to_string();
            tokio::task::spawn_blocking(move || me.codeindex.delete(&id)).await?;
        }
        self.code_index_info(project_id)
    }
}
