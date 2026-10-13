//! The pull requests linked to an agent: those it opens (`gh pr create` in a command of its
//! conversation, the `create_pull_request` tool of an MCP server), whose address is read in the
//! call's result, and those of its own branch, asked to GitHub with `gh` along with their state
//! (open, draft, merged, closed), their checks and their reviews.

use crate::core::Core;
use crate::git;
use crate::model::{now_ms, PullRequestLink};
use anyhow::{anyhow, bail, Result};
use serde_json::Value;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Runtime;

/// How long `gh` may take to tell of pull requests.
const GH_LIMIT: Duration = Duration::from_secs(30);
/// What `gh` is asked of a pull request.
const FIELDS: &str = "number,url,title,state,isDraft,createdAt,reviewDecision,statusCheckRollup";
/// At most this many pull requests of a branch are asked for: the latest ones.
const BRANCH_LIMIT: &str = "20";
/// The least time between two readings of an agent's pull requests that nothing new calls for
/// (its card clicked again and again).
const EVERY: Duration = Duration::from_secs(20);

/// Where the reading of an agent's pull requests stands (`Core::refresh_pull_requests`): one at a
/// time.
#[derive(Default)]
pub struct Reading {
    running: bool,
    /// Asked meanwhile for something new (a pull request just opened): read once more.
    again: bool,
    last: Option<Instant>,
}

/// A command line that opens a pull request: `gh pr create`, whatever comes before (`cd x &&`, a
/// variable) or between `gh` and `pr` (`-R owner/repo`).
pub fn opens_pull_request(command: &str) -> bool {
    let words: Vec<&str> = command.split_whitespace().collect();
    words.iter().enumerate().any(|(i, w)| {
        let program = w.rsplit(['/', '\\']).next().unwrap_or(w);
        if !matches!(program, "gh" | "gh.exe") {
            return false;
        }
        // Its options and their values, then the command.
        words[i + 1..]
            .iter()
            .take(5)
            .position(|w| *w == "pr")
            .is_some_and(|at| words.get(i + at + 2) == Some(&"create"))
    })
}

/// A tool that opens a pull request: the GitHub MCP server's, whatever the server is named
/// (`mcp__github__create_pull_request`).
pub fn is_create_tool(name: &str) -> bool {
    name.starts_with("mcp__") && name.ends_with("create_pull_request")
}

/// The first pull request named in `text` (what `gh pr create` printed, a tool's JSON answer):
/// its number and its address, `https://<host>/<owner>/<repo>/pull/<n>`, without what follows.
pub fn find(text: &str) -> Option<(u32, String)> {
    let mut rest = text;
    while let Some(at) = rest.find("https://") {
        let from = &rest[at..];
        let end = from
            .find(|c: char| {
                c.is_whitespace()
                    || matches!(c, '"' | '\'' | '<' | '>' | ')' | ']' | '}' | ',' | '\\')
            })
            .unwrap_or(from.len());
        if let Some(found) = address(&from[..end]) {
            return Some(found);
        }
        rest = &from["https://".len()..];
    }
    None
}

/// `url` as a pull request's: its number and its address up to it.
fn address(url: &str) -> Option<(u32, String)> {
    let path = url.strip_prefix("https://")?;
    let mut parts = path.split('/');
    let (host, owner, repo) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next()? != "pull" || [host, owner, repo].iter().any(|p| p.is_empty()) {
        return None;
    }
    let digits: String = parts
        .next()?
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    let number: u32 = digits.parse().ok().filter(|n| *n > 0)?;
    Some((
        number,
        format!("https://{host}/{owner}/{repo}/pull/{number}"),
    ))
}

/// A pull request as `gh … --json` tells it (`FIELDS`), read now; None when it has no address.
/// The second value: when it was opened (ms since epoch), 0 when `gh` did not say.
pub fn parse(v: &Value, now: i64) -> Option<(PullRequestLink, i64)> {
    let (number, url) = address(v["url"].as_str()?)?;
    let state = match v["state"].as_str().unwrap_or("") {
        "MERGED" => "merged",
        "CLOSED" => "closed",
        "OPEN" if v["isDraft"] == true => "draft",
        "OPEN" => "open",
        _ => "",
    };
    // Of a pull request still to merge only: the rest is history.
    let open = matches!(state, "open" | "draft");
    let review = match v["reviewDecision"].as_str().unwrap_or("") {
        "APPROVED" if open => "approved",
        "CHANGES_REQUESTED" if open => "changes",
        "REVIEW_REQUIRED" if open => "required",
        _ => "",
    };
    let opened = v["createdAt"]
        .as_str()
        .and_then(|at| chrono::DateTime::parse_from_rfc3339(at).ok())
        .map_or(0, |at| at.timestamp_millis());
    Some((
        PullRequestLink {
            url,
            number,
            title: v["title"].as_str().unwrap_or("").trim().to_string(),
            state: state.into(),
            checks: if open {
                checks(&v["statusCheckRollup"]).into()
            } else {
                String::new()
            },
            review: review.into(),
            checked_at: now,
        },
        opened,
    ))
}

/// What a pull request's checks say as a whole (`statusCheckRollup`: check runs and commit
/// statuses): "failing" as soon as one failed, else "pending" while one runs or waits, else
/// "passing"; empty without any.
fn checks(rollup: &Value) -> &'static str {
    let Some(all) = rollup.as_array().filter(|a| !a.is_empty()) else {
        return "";
    };
    let word = |c: &Value, key: &str| c[key].as_str().unwrap_or("").to_string();
    let failed = |c: &Value| {
        matches!(
            word(c, "conclusion").as_str(),
            "FAILURE" | "TIMED_OUT" | "CANCELLED" | "ACTION_REQUIRED" | "STARTUP_FAILURE"
        ) || matches!(word(c, "state").as_str(), "FAILURE" | "ERROR")
    };
    // A check run says where it is with `status`, a commit status with `state`.
    let running = |c: &Value| match c["status"].as_str() {
        Some(status) => status != "COMPLETED",
        None => matches!(word(c, "state").as_str(), "PENDING" | "EXPECTED"),
    };
    if all.iter().any(failed) {
        "failing"
    } else if all.iter().any(running) {
        "pending"
    } else {
        "passing"
    }
}

/// `links` with `read` (what GitHub just told of some pull requests) in it: one linked already
/// takes its new state and keeps its place, a new one comes last. True when anything changed
/// beyond the time of the reading.
pub fn merge(links: &mut Vec<PullRequestLink>, read: Vec<PullRequestLink>) -> bool {
    let mut changed = false;
    for new in read {
        match links.iter_mut().find(|l| l.url == new.url) {
            Some(known) => {
                let same = PullRequestLink {
                    checked_at: known.checked_at,
                    ..new.clone()
                } == *known;
                changed |= !same;
                *known = new;
            }
            None => {
                links.push(new);
                changed = true;
            }
        }
    }
    changed
}

/// A pull request whose state GitHub may still change: one never read, or not merged (a closed
/// one can be opened again).
pub fn may_change(link: &PullRequestLink) -> bool {
    link.state != "merged"
}

/// The pull requests of the branch `branch` in the repository of `cwd`, whoever opened them, as
/// GitHub has them now: those still open, and those opened since `since` (ms since epoch; the
/// agent's creation: a branch's name may have served before, or be a long-lived one).
pub async fn of_branch(
    gh: &Path,
    cwd: &str,
    branch: &str,
    since: i64,
    now: i64,
) -> Result<Vec<PullRequestLink>> {
    // A name that is an option would be obeyed.
    if branch.is_empty() || branch.starts_with('-') {
        return Ok(Vec::new());
    }
    let args = [
        "pr",
        "list",
        "--head",
        branch,
        "--state",
        "all",
        "--limit",
        BRANCH_LIMIT,
        "--json",
        FIELDS,
    ];
    let out: Value = serde_json::from_str(&run(gh, cwd, &args).await?)?;
    let mut found: Vec<PullRequestLink> = out
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|v| parse(v, now))
        .filter(|(link, opened)| {
            matches!(link.state.as_str(), "open" | "draft") || *opened >= since
        })
        .map(|(link, _)| link)
        .collect();
    found.sort_by_key(|l| l.number);
    Ok(found)
}

/// The pull request at `url`, as GitHub has it now. `cwd`: any folder that exists (the address
/// names the repository).
pub async fn at(gh: &Path, cwd: &str, url: &str, now: i64) -> Result<PullRequestLink> {
    // Only what `find` or `gh` gave is ever asked for.
    if address(url).is_none() {
        bail!("not a pull request: {url}");
    }
    let out: Value =
        serde_json::from_str(&run(gh, cwd, &["pr", "view", url, "--json", FIELDS]).await?)?;
    parse(&out, now)
        .map(|(link, _)| link)
        .ok_or_else(|| anyhow!("gh pr view: no pull request in its answer"))
}

/// `gh <args>` in `cwd`, never asking anything: what it printed.
async fn run(gh: &Path, cwd: &str, args: &[&str]) -> Result<String> {
    let mut cmd = tokio::process::Command::new(gh);
    cmd.args(args)
        .current_dir(cwd)
        .env("GH_PROMPT_DISABLED", "1")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(crate::claude::CREATE_NO_WINDOW);
    crate::job::isolate(&mut cmd);
    let child = cmd.spawn()?;
    // Dropped when this returns: whatever it left running (a `.cmd`'s node…) ends with it.
    let _job = crate::job::Job::for_child(&child);
    let out = tokio::time::timeout(GH_LIMIT, child.wait_with_output())
        .await
        .map_err(|_| {
            anyhow!(
                "gh {} still not done after {} s",
                args[..2.min(args.len())].join(" "),
                GH_LIMIT.as_secs()
            )
        })??;
    if !out.status.success() {
        bail!("{}", String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Whether a remote has the branch `branch` of the repository of `cwd`, as of the last push or
/// fetch here: until then it has no pull request, and GitHub is not asked.
async fn pushed(cwd: &str, branch: &str) -> bool {
    let tail = format!("/{branch}");
    git::text(
        cwd,
        &["for-each-ref", "--format=%(refname)", "refs/remotes"],
    )
    .await
    .is_ok_and(|refs| refs.lines().any(|r| r.ends_with(&tail)))
}

impl<R: Runtime> Core<R> {
    /// `refresh_pull_requests`, in the background.
    pub(crate) fn ask_pull_requests(self: &Arc<Self>, id: &str, now: bool) {
        let (core, id) = (self.clone(), id.to_string());
        tauri::async_runtime::spawn(async move { core.refresh_pull_requests(&id, now).await });
    }

    /// Asks GitHub what became of the agent's pull requests, and which ones its branch has
    /// (`read_pull_requests`); the agent is sent to the window again when anything changed. One
    /// reading at a time per agent. `now`: something new calls for it (it just opened one); else
    /// it is skipped when they were read less than `EVERY` ago.
    pub async fn refresh_pull_requests(self: &Arc<Self>, id: &str, now: bool) {
        {
            let mut reads = self.pr_reads.lock();
            let r = reads.entry(id.to_string()).or_default();
            if r.running {
                r.again |= now;
                return;
            }
            if !now && r.last.is_some_and(|last| last.elapsed() < EVERY) {
                return;
            }
            r.running = true;
        }
        loop {
            self.read_pull_requests(id).await;
            let mut reads = self.pr_reads.lock();
            let Some(r) = reads.get_mut(id) else {
                return;
            };
            r.last = Some(Instant::now());
            if !std::mem::take(&mut r.again) {
                r.running = false;
                return;
            }
        }
    }

    /// Once, shortly after the app started: what became meanwhile of the pull requests of every
    /// agent that may have some (one linked that may still change, a branch of its own), one
    /// agent at a time. After that, an agent's are read when it is selected.
    pub(crate) async fn refresh_all_pull_requests(self: &Arc<Self>) {
        if self.gh_cli().is_none() {
            return;
        }
        let ids: Vec<String> = self
            .agents
            .read()
            .values()
            .filter_map(|h| {
                let rt = h.lock();
                let some =
                    rt.meta.worktree.is_some() || rt.meta.pull_requests.iter().any(may_change);
                (!rt.meta.archived && some).then(|| rt.meta.id.clone())
            })
            .collect();
        for id in ids {
            self.refresh_pull_requests(&id, false).await;
        }
    }

    /// Links to the agent the pull request the app just opened for its ticket: named in `text`
    /// (what `gh pr create` printed), with the title it was given, open or a draft. GitHub is not
    /// asked: it was told this very moment.
    pub(crate) fn link_opened(
        self: &Arc<Self>,
        agent_id: &str,
        text: &str,
        title: &str,
        draft: bool,
    ) {
        let (Some((number, url)), Ok(h)) = (find(text), self.agent(agent_id)) else {
            return;
        };
        let opened = PullRequestLink {
            url,
            number,
            title: title.trim().to_string(),
            state: if draft { "draft" } else { "open" }.into(),
            checked_at: now_ms(),
            ..Default::default()
        };
        if merge(&mut h.lock().meta.pull_requests, vec![opened]) {
            self.request_save();
            self.emit_agent(&h);
        }
    }

    /// Reads with `gh` the pull requests of the agent's own branch (an agent with a worktree,
    /// once a remote has its branch), then those linked to it that are not among them and may
    /// still change. Nothing without `gh`; what `gh` cannot tell (not signed in, no network)
    /// stays as it was last told.
    async fn read_pull_requests(self: &Arc<Self>, id: &str) {
        let Some(gh) = self.gh_cli() else {
            return;
        };
        let Ok(h) = self.agent(id) else {
            return;
        };
        let (cwd, worktree, known, since, project_id) = {
            let rt = h.lock();
            let m = &rt.meta;
            (
                m.cwd.clone(),
                m.worktree.clone(),
                m.pull_requests.clone(),
                m.created_at,
                m.project_id.clone(),
            )
        };
        let now = now_ms();
        let mut read = Vec::new();
        if let Some(wt) = worktree.filter(|wt| Path::new(&wt.path).is_dir()) {
            if pushed(&wt.path, &wt.branch).await {
                match of_branch(&gh, &wt.path, &wt.branch, since, now).await {
                    Ok(found) => read = found,
                    Err(e) => {
                        log::info!("agent {id}: pull requests of {} not read: {e:#}", wt.branch)
                    }
                }
            }
        }
        // Anywhere that is there: the address names the repository.
        let project = self.project(&project_id).map(|p| p.path).ok();
        let folder = [Some(cwd), project]
            .into_iter()
            .flatten()
            .find(|dir| Path::new(dir).is_dir());
        if let Some(folder) = folder {
            let others: Vec<&PullRequestLink> = known
                .iter()
                .filter(|l| may_change(l) && !read.iter().any(|r| r.url == l.url))
                .collect();
            for link in others {
                match at(&gh, &folder, &link.url, now).await {
                    Ok(pr) => read.push(pr),
                    Err(e) => {
                        log::info!("agent {id}: pull request #{} not read: {e:#}", link.number)
                    }
                }
            }
        }
        if read.is_empty() {
            return;
        }
        if merge(&mut h.lock().meta.pull_requests, read) {
            self.request_save();
            self.emit_agent(&h);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_command_that_runs_gh_pr_create_opens_a_pull_request_and_no_other_does() {
        for command in [
            "gh pr create --title \"Fix\" --body \"…\"",
            "cd web && gh pr create --fill",
            "git push -u origin HEAD\ngh  pr   create --draft",
            "GH_TOKEN=x gh -R acme/demo pr create --fill",
            "/opt/homebrew/bin/gh pr create",
            "C:\\Tools\\gh.exe pr create --fill",
        ] {
            assert!(opens_pull_request(command), "{command}");
        }
        for command in [
            "gh pr list",
            "gh pr view 12",
            "gh issue create --title pr",
            "echo gh pr created",
            "git commit -m 'gh pr create later'",
            "ghx pr create",
            "",
        ] {
            assert!(!opens_pull_request(command), "{command}");
        }
        assert!(is_create_tool("mcp__github__create_pull_request"));
        assert!(is_create_tool(
            "mcp__plugin_github_github__create_pull_request"
        ));
        assert!(!is_create_tool("create_pull_request"));
        assert!(!is_create_tool("mcp__github__list_pull_requests"));
    }

    #[test]
    fn the_first_pull_request_of_a_text_is_found_whatever_surrounds_its_address() {
        let pr = |n: u32| Some((n, format!("https://github.com/acme/demo/pull/{n}")));
        // What `gh pr create` prints, its notes on stderr first.
        assert_eq!(
            find("Creating pull request for feat into main in acme/demo\n\nhttps://github.com/acme/demo/pull/12\n"),
            pr(12)
        );
        // An MCP tool's JSON: the API's own address is not the page's.
        assert_eq!(
            find(
                r#"{"url":"https://api.github.com/repos/acme/demo/pulls/7","html_url":"https://github.com/acme/demo/pull/7","number":7}"#
            ),
            pr(7)
        );
        // In a sentence, with what follows the number left out.
        assert_eq!(
            find("a pull request for branch \"feat\" already exists:\nhttps://github.com/acme/demo/pull/3#issuecomment-1 (open)"),
            pr(3)
        );
        assert_eq!(
            find("see <https://github.com/acme/demo/pull/8/files>."),
            pr(8)
        );
        // Another host: GitHub Enterprise.
        assert_eq!(
            find("https://git.corp.example/team/app/pull/41"),
            Some((41, "https://git.corp.example/team/app/pull/41".into()))
        );
        for none in [
            "",
            "rien",
            "https://github.com/acme/demo/pulls",
            "https://github.com/acme/demo/pull/",
            "https://github.com/acme/demo/pull/abc",
            "https://github.com/acme/demo/pull/0",
            "https://github.com/acme/demo/issues/12",
            "https://github.com/acme/pull/12",
            "http://github.com/acme/demo/pull/12",
        ] {
            assert_eq!(find(none), None, "{none}");
        }
    }

    fn told(state: &str, draft: bool, review: &str, rollup: Value) -> Value {
        json!({
            "number": 12, "url": "https://github.com/acme/demo/pull/12", "title": " Fix the login ",
            "state": state, "isDraft": draft, "createdAt": "2026-10-13T10:00:00Z",
            "reviewDecision": review, "statusCheckRollup": rollup,
        })
    }

    #[test]
    fn what_gh_tells_of_a_pull_request_is_its_state_its_checks_and_its_reviews() {
        let (pr, opened) = parse(&told("OPEN", false, "APPROVED", json!([])), 5).unwrap();
        assert_eq!(
            pr,
            PullRequestLink {
                url: "https://github.com/acme/demo/pull/12".into(),
                number: 12,
                title: "Fix the login".into(),
                state: "open".into(),
                checks: String::new(),
                review: "approved".into(),
                checked_at: 5,
            }
        );
        assert_eq!(opened, 1_791_885_600_000);
        let state = |v: Value| parse(&v, 0).unwrap().0.state;
        assert_eq!(state(told("OPEN", true, "", json!([]))), "draft");
        assert_eq!(state(told("MERGED", false, "", json!([]))), "merged");
        assert_eq!(state(told("CLOSED", false, "", json!([]))), "closed");
        let review = |r: &str| {
            parse(&told("OPEN", false, r, json!([])), 0)
                .unwrap()
                .0
                .review
        };
        assert_eq!(review("CHANGES_REQUESTED"), "changes");
        assert_eq!(review("REVIEW_REQUIRED"), "required");
        assert_eq!(review(""), "");
        // Once merged or closed, its checks and its reviews are history.
        let merged = parse(
            &told(
                "MERGED",
                false,
                "APPROVED",
                json!([{ "status": "COMPLETED", "conclusion": "SUCCESS" }]),
            ),
            0,
        )
        .unwrap()
        .0;
        assert_eq!((merged.checks.as_str(), merged.review.as_str()), ("", ""));
        // Without an address, or with another's, it is none.
        assert_eq!(parse(&json!({ "number": 12 }), 0), None);
        assert_eq!(
            parse(
                &json!({ "url": "https://github.com/acme/demo/issues/1" }),
                0
            ),
            None
        );
    }

    #[test]
    fn checks_fail_as_soon_as_one_failed_and_run_while_one_is_not_done() {
        let of = |rollup: Value| parse(&told("OPEN", false, "", rollup), 0).unwrap().0.checks;
        let run = |status: &str, conclusion: &str| json!({ "__typename": "CheckRun", "status": status, "conclusion": conclusion });
        let status = |state: &str| json!({ "__typename": "StatusContext", "state": state });
        assert_eq!(of(json!([])), "");
        assert_eq!(of(Value::Null), "");
        assert_eq!(
            of(json!([
                run("COMPLETED", "SUCCESS"),
                run("COMPLETED", "SKIPPED"),
                status("SUCCESS")
            ])),
            "passing"
        );
        assert_eq!(of(json!([run("COMPLETED", "NEUTRAL")])), "passing");
        assert_eq!(
            of(json!([run("COMPLETED", "SUCCESS"), run("IN_PROGRESS", "")])),
            "pending"
        );
        assert_eq!(of(json!([run("QUEUED", "")])), "pending");
        assert_eq!(of(json!([status("PENDING")])), "pending");
        assert_eq!(
            of(json!([run("IN_PROGRESS", ""), run("COMPLETED", "FAILURE")])),
            "failing"
        );
        assert_eq!(of(json!([run("COMPLETED", "TIMED_OUT")])), "failing");
        assert_eq!(of(json!([status("ERROR"), status("SUCCESS")])), "failing");
    }

    #[test]
    fn a_reading_updates_the_pull_requests_linked_in_place_and_adds_the_new_ones_last() {
        let pr = |n: u32, state: &str, at: i64| PullRequestLink {
            url: format!("https://github.com/acme/demo/pull/{n}"),
            number: n,
            state: state.into(),
            checked_at: at,
            ..Default::default()
        };
        let mut links = vec![pr(12, "", 0), pr(9, "open", 1)];
        // Told for the first time, and one more of the branch.
        assert!(merge(
            &mut links,
            vec![pr(14, "draft", 2), pr(12, "open", 2)]
        ));
        assert_eq!(
            links,
            [pr(12, "open", 2), pr(9, "open", 1), pr(14, "draft", 2)]
        );
        // The same again: only the time of the reading moves.
        assert!(!merge(&mut links, vec![pr(12, "open", 3)]));
        assert_eq!(links[0].checked_at, 3);
        assert!(merge(&mut links, vec![pr(12, "merged", 4)]));
        assert_eq!(links[0], pr(12, "merged", 4));
        assert!(!merge(&mut links, Vec::new()));
        // Merged: never asked again. Closed, or never read: asked.
        assert!(!may_change(&links[0]));
        assert!(may_change(&pr(1, "closed", 1)) && may_change(&pr(1, "", 0)));
    }
}
