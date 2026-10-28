//! The docs of a project through the tools (ESC-256, `docs/FACTORY.md` § 3): the specification
//! (its tree, a page, writing a page, a search), the register of decisions (list, read, propose,
//! replace) and the documents (list, text, add).
//!
//! Every agent's writes in the spec and the decisions go through these tools, which write where the
//! docs live (`Core::docs_space`: the caller's own branch, or the project's fixed docs branch).
//! **No tool accepts a decision**: a proposal is accepted by a human, in the window (`accept_decision`
//! of the IPC), and an accepted decision is never rewritten (`docs::rewrites`). Escouade writes the
//! files and does nothing else with them: nothing is committed nor pushed.
//!
//! The project is named through `resolve::project`, so a private project says nothing of its docs to
//! the agents of the others (`Sight`).

use super::read::json;
use super::resolve;
use super::tools::ToolError;
use super::Caller;
use crate::core::Core;
use crate::docs::{self, Change, Decision, Space, State};
use crate::model::{Column, Project};
use serde::Deserialize;
use serde_json::json;
use tauri::Runtime;

use rmcp::schemars;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DocsProjectArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SpecPageArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(
        description = "The page's path in the specification, subject/page (a name is made a path: accents off, lower case, dashes), as get_spec_tree lists it."
    )]
    pub path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct WriteSpecArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(
        description = "The page's path, subject/page (up to 4 levels). A path with no folder goes under subject, else under general."
    )]
    pub path: String,
    #[schemars(
        description = "The page's title; kept when left out (a new page takes its first # heading)."
    )]
    pub title: Option<String>,
    #[schemars(description = "The subject of a new page when the path has no folder.")]
    pub subject: Option<String>,
    #[schemars(
        description = "The page's Markdown, without its header. A new page needs it; on an existing page it replaces the text, or is added at its end with append."
    )]
    pub body: Option<String>,
    #[schemars(description = "Add body at the end of the page instead of replacing the text.")]
    pub append: Option<bool>,
    #[schemars(
        description = "Where the page comes from (documents, files, links); replaces the list."
    )]
    pub sources: Option<Vec<String>>,
    #[schemars(
        description = "The keys of the tickets that implement or changed it; replaces the list."
    )]
    pub tickets: Option<Vec<String>>,
    #[schemars(description = "The numbers of the decisions it follows; replaces the list.")]
    pub decisions: Option<Vec<u32>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SearchSpecArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(description = "The words to find: a page must hold all of them (any case).")]
    pub query: String,
    #[schemars(description = "The most pages to give (10 by default, 50 at most).")]
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListDecisionsArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(
        description = "Only the decisions in this state: proposed, accepted or superseded."
    )]
    pub state: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ReadDecisionArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(description = "The decision's number, as list_decisions gives it.")]
    pub number: u32,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DecisionFields {
    #[schemars(description = "The decision's title.")]
    pub title: String,
    #[schemars(description = "Why a decision is needed: the situation, the question.")]
    pub context: Option<String>,
    #[schemars(description = "What is decided.")]
    pub decision: Option<String>,
    #[schemars(description = "What follows from it: what changes, what it costs.")]
    pub consequences: Option<String>,
    #[schemars(description = "Where it comes from: brainstorm, discussion, ticket or document.")]
    pub origin: Option<String>,
    #[schemars(
        description = "The ticket's key, the discussion's or the document's name it comes from."
    )]
    pub origin_ref: Option<String>,
    #[schemars(description = "The spec pages it touches (their paths).")]
    pub pages: Option<Vec<String>>,
    #[schemars(description = "The keys of the tickets it is linked to.")]
    pub tickets: Option<Vec<String>>,
    #[schemars(description = "The documents it is linked to (their paths under documents).")]
    pub documents: Option<Vec<String>>,
    #[schemars(
        description = "What it changed in the spec: for each page, the lines added and removed (write_spec_page gives both)."
    )]
    pub changes: Option<Vec<ChangeArg>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ChangeArg {
    #[schemars(description = "The page's path.")]
    pub page: String,
    #[schemars(description = "The lines added.")]
    pub added: u32,
    #[schemars(description = "The lines removed.")]
    pub removed: u32,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ProposeDecisionArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(
        description = "The number of a proposal still open to revise it; a new proposal when left out. A decision that was accepted is not revised: replace_decision replaces it."
    )]
    pub number: Option<u32>,
    #[serde(flatten)]
    pub fields: DecisionFields,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ReplaceDecisionArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(description = "The number of the accepted decision this one replaces.")]
    pub number: u32,
    #[serde(flatten)]
    pub fields: DecisionFields,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListDocumentsArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(
        description = "Only the files of this folder (and under it); all of them when left out."
    )]
    pub folder: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReadDocumentArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(description = "The document's path under documents, as list_documents gives it.")]
    pub path: String,
    #[schemars(
        description = "The character to start at (0 by default), to read the rest of a long text."
    )]
    pub from: Option<u32>,
    #[schemars(description = "The most characters to give (100000 by default and at most).")]
    pub max_chars: Option<u32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AddDocumentArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(
        description = "The folder under documents it goes in (made if needed); the root when left out."
    )]
    pub folder: Option<String>,
    #[schemars(
        description = "The file's name, with its extension (notes.md). A name already taken gets a number."
    )]
    pub name: String,
    #[schemars(
        description = "The file's text (2 MB at most). Nothing already there is overwritten."
    )]
    pub text: String,
}

fn failed(e: anyhow::Error) -> ToolError {
    ToolError::Failed(e.to_string())
}

/// The project asked for and its docs as the caller sees them.
async fn open<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    project: &str,
) -> Result<(Project, Space), ToolError> {
    let p = resolve::project(core, caller, project)?;
    let agent = match caller {
        Caller::Agent(id) => Some(id.as_str()),
        Caller::External => None,
    };
    let space = core.docs_space(&p.id, agent).await.map_err(failed)?;
    Ok((p, space))
}

fn branch_of(p: &Project) -> String {
    let b = p.docs_branch.trim();
    if b.is_empty() {
        "current".into()
    } else {
        b.to_string()
    }
}

pub(super) async fn tree<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    project: &str,
) -> Result<String, ToolError> {
    let (p, space) = open(core, caller, project).await?;
    let subjects = space.spec_tree();
    let pages: usize = subjects.iter().map(|s| s.pages.len()).sum();
    // An empty spec: the one the project already has, to import.
    let existing = if pages == 0 {
        space.detect()
    } else {
        Vec::new()
    };
    json(&json!({
        "project": p.name,
        "projectId": p.id,
        "branch": branch_of(&p),
        "pages": pages,
        "subjects": subjects,
        "existingSpec": existing,
    }))
}

pub(super) async fn page<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: SpecPageArgs,
) -> Result<String, ToolError> {
    let (_, space) = open(core, caller, &args.project).await?;
    json(&space.spec_read(&args.path).map_err(failed)?)
}

pub(super) async fn write<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: WriteSpecArgs,
) -> Result<String, ToolError> {
    let (project, space) = open(core, caller, &args.project).await?;
    // A path with no folder goes under its subject.
    let mut path = docs::page_path(&args.path).ok_or_else(|| {
        failed(anyhow::anyhow!(tr!(
            "« {} » n’est pas un chemin de page (sujet/page).",
            "“{}” is not a page path (subject/page).",
            args.path
        )))
    })?;
    if !path.contains('/') {
        let subject = args
            .subject
            .as_deref()
            .and_then(|s| docs::page_path(s).filter(|s| !s.contains('/')))
            .unwrap_or_else(|| "general".into());
        path = format!("{subject}/{path}");
    }
    let exists = space.spec_read(&path).is_ok();
    if !exists && args.body.as_deref().is_none_or(|b| b.trim().is_empty()) {
        return Err(failed(anyhow::anyhow!(tr!(
            "Une page nouvelle a besoin de son texte (body).",
            "A new page needs its text (body)."
        ))));
    }
    let (page, added, removed) = space
        .spec_write(&path, |p| {
            if let Some(t) = args.title.as_deref().filter(|t| !t.trim().is_empty()) {
                p.title = t.trim().to_string();
            }
            if let Some(s) = args.subject.as_deref().filter(|s| !s.trim().is_empty()) {
                if !exists {
                    p.subject = s.trim().to_string();
                }
            }
            if let Some(b) = &args.body {
                if args.append == Some(true) && !p.body.is_empty() {
                    p.body = format!("{}\n\n{}", p.body.trim_end(), b.trim());
                } else {
                    p.body = b.clone();
                }
            }
            if let Some(v) = &args.sources {
                p.sources = v.clone();
            }
            if let Some(v) = &args.tickets {
                p.tickets = v.clone();
            }
            if let Some(v) = &args.decisions {
                p.decisions = v.clone();
            }
        })
        .map_err(failed)?;
    core.docs_changed(&project.id).await;
    json(&json!({
        "path": page.path,
        "title": page.title,
        "subject": page.subject,
        "created": !exists,
        "added": added,
        "removed": removed,
    }))
}

pub(super) async fn search<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: SearchSpecArgs,
) -> Result<String, ToolError> {
    let (_, space) = open(core, caller, &args.project).await?;
    let limit = args.limit.unwrap_or(10).clamp(1, 50) as usize;
    json(&json!({ "hits": space.spec_search(&args.query, limit) }))
}

pub(super) async fn decisions<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: ListDecisionsArgs,
) -> Result<String, ToolError> {
    let (_, space) = open(core, caller, &args.project).await?;
    let want = match args
        .state
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        None => None,
        Some("proposed") => Some(State::Proposed),
        Some("accepted") => Some(State::Accepted),
        Some("superseded") => Some(State::Superseded),
        Some(other) => {
            return Err(failed(anyhow::anyhow!(tr!(
                "state est proposed, accepted ou superseded (pas « {other} »).",
                "state is proposed, accepted or superseded (not “{other}”)."
            ))))
        }
    };
    let all = space.decisions();
    let rows: Vec<_> = all
        .iter()
        .filter(|d| want.is_none_or(|s| d.state == s))
        .map(|d| {
            // An accepted decision that a proposal in the register would replace.
            let replaced_by_proposal = all
                .iter()
                .find(|o| o.state == State::Proposed && o.supersedes.contains(&d.number))
                .map(|o| o.number);
            json!({
                "number": d.number,
                "title": d.title,
                "date": d.date,
                "state": d.state,
                "origin": d.origin,
                "originRef": d.origin_ref,
                "supersedes": d.supersedes,
                "supersededBy": d.superseded_by,
                "replacementProposed": replaced_by_proposal,
                "changes": d.changes,
            })
        })
        .collect();
    json(&json!({ "decisions": rows }))
}

pub(super) async fn decision<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: ReadDecisionArgs,
) -> Result<String, ToolError> {
    let (_, space) = open(core, caller, &args.project).await?;
    json(&space.decision(args.number).map_err(failed)?)
}

fn decision_of(f: DecisionFields) -> Decision {
    Decision {
        title: f.title.trim().to_string(),
        context: f.context.unwrap_or_default(),
        decision: f.decision.unwrap_or_default(),
        consequences: f.consequences.unwrap_or_default(),
        origin: f.origin.unwrap_or_default(),
        origin_ref: f.origin_ref.unwrap_or_default(),
        pages: f.pages.unwrap_or_default(),
        tickets: f.tickets.unwrap_or_default(),
        documents: f.documents.unwrap_or_default(),
        changes: f
            .changes
            .unwrap_or_default()
            .into_iter()
            .map(|c| Change {
                page: docs::page_path(&c.page).unwrap_or(c.page),
                added: c.added,
                removed: c.removed,
            })
            .collect(),
        ..Default::default()
    }
}

/// The decision a ticket's agent leaves comes from its ticket, in this project: its validation
/// accepts it (`docs_accept_ticket_decisions`).
fn from_ticket<R: Runtime>(core: &Core<R>, caller: &Caller, project: &Project, d: &mut Decision) {
    let Caller::Agent(id) = caller else { return };
    let key = core
        .tickets
        .read()
        .iter()
        .find(|t| {
            t.agent_id.as_deref() == Some(id.as_str())
                && t.project_id == project.id
                && matches!(t.column, Column::Doing | Column::Review)
        })
        .map(|t| t.key.clone());
    if let Some(key) = key {
        d.origin = "ticket".into();
        d.origin_ref = key;
    }
}

pub(super) async fn propose<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: ProposeDecisionArgs,
) -> Result<String, ToolError> {
    let (project, space) = open(core, caller, &args.project).await?;
    let mut d = decision_of(args.fields);
    from_ticket(core, caller, &project, &mut d);
    let d = space.decision_propose(args.number, d).map_err(failed)?;
    core.docs_changed(&project.id).await;
    json(&json!({ "number": d.number, "title": d.title, "state": d.state, "date": d.date }))
}

pub(super) async fn replace<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: ReplaceDecisionArgs,
) -> Result<String, ToolError> {
    let (project, space) = open(core, caller, &args.project).await?;
    let mut d = decision_of(args.fields);
    from_ticket(core, caller, &project, &mut d);
    let d = space.decision_replace(args.number, d).map_err(failed)?;
    core.docs_changed(&project.id).await;
    json(&json!({
        "number": d.number,
        "title": d.title,
        "state": d.state,
        "date": d.date,
        "supersedes": d.supersedes,
    }))
}

pub(super) async fn documents<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: ListDocumentsArgs,
) -> Result<String, ToolError> {
    let (_, space) = open(core, caller, &args.project).await?;
    let files = space
        .documents(args.folder.as_deref().unwrap_or_default())
        .map_err(failed)?;
    json(&json!({ "documents": files }))
}

pub(super) async fn read_document<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: ReadDocumentArgs,
) -> Result<String, ToolError> {
    let (_, space) = open(core, caller, &args.project).await?;
    let text = space
        .document_text(
            &args.path,
            args.from.unwrap_or(0) as usize,
            args.max_chars.map_or(docs::TEXT_CHUNK, |n| n as usize),
        )
        .map_err(failed)?;
    json(&text)
}

pub(super) async fn add_document<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: AddDocumentArgs,
) -> Result<String, ToolError> {
    if args.text.len() > 2 * 1024 * 1024 {
        return Err(failed(anyhow::anyhow!(tr!(
            "Le texte dépasse 2 Mo : dépose le fichier par la fenêtre.",
            "The text is over 2 MB: drop the file in the window."
        ))));
    }
    let (project, space) = open(core, caller, &args.project).await?;
    let info = space
        .document_add(
            args.folder.as_deref().unwrap_or_default(),
            &args.name,
            args.text.as_bytes(),
        )
        .map_err(failed)?;
    core.docs_changed(&project.id).await;
    json(&info)
}

/// `get_docs_to_share`: the changes of the docs not shared yet (the files and their number), and
/// the conflict a sharing stopped on.
pub(super) async fn to_share<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    project: &str,
) -> Result<String, ToolError> {
    let p = resolve::project(core, caller, project)?;
    let pending = core.docs_pending(&p.id).await.map_err(failed)?;
    json(&json!({ "project": p.name, "projectId": p.id, "pending": pending }))
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ShareDocsArgs {
    #[schemars(description = "The project: its id, or its name in any case.")]
    pub project: String,
    #[schemars(
        description = "The commit's message; one that says what the changes are is made when left out."
    )]
    pub message: Option<String>,
    #[schemars(
        description = "For an agent of Escouade only: true when the user told you, in this conversation, to share the docs. Without it an agent is refused: sharing is the user's gesture."
    )]
    pub user_asked_for_it: Option<bool>,
    #[schemars(
        description = "True to also publish the commits of code not pushed yet on the branch; without it, sharing refuses when there are some. Only when the user said so."
    )]
    pub with_code: Option<bool>,
}

/// `share_docs`: the window's « Partager ». It is the user's gesture: an agent of Escouade is
/// refused unless it says the user told it to.
pub(super) async fn share<R: Runtime>(
    core: &Core<R>,
    caller: &Caller,
    args: ShareDocsArgs,
) -> Result<String, ToolError> {
    let p = resolve::project(core, caller, &args.project)?;
    if matches!(caller, Caller::Agent(_)) && args.user_asked_for_it != Some(true) {
        return Err(ToolError::Refused(tr!(
            "Partager les docs est un geste de l’utilisateur (le bouton « Partager ») : ne le fais que s’il te l’a demandé, en passant userAskedForIt.",
            "Sharing the docs is the user’s gesture (the “Share” button): only do it if they told you to, passing userAskedForIt."
        )));
    }
    let shared = core
        .docs_share(&p.id, args.message.as_deref(), args.with_code == Some(true))
        .await
        .map_err(failed)?;
    json(&shared)
}
