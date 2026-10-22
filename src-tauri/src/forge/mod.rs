//! Code hosts (GitHub, GitLab, Bitbucket Cloud, Gitea and Forgejo): one interface for all of them,
//! as for the harnesses. A host is a `Provider` (what it is called, the addresses it knows, the
//! rights its tokens need, what it can do) that gives a `Forge` client per account; the rest of
//! Escouade only talks to these two traits, so that adding a host comes down to its client.

// The pull requests' calls and their types serve the hosts' clients (ESC-55 to ESC-58) and the
// PR's cycle (ESC-64): declared here, used there.
#![allow(dead_code)]

pub mod accounts;
pub mod bitbucket;
pub mod connect;
pub mod gitea;
pub mod github;
pub mod gitlab;
pub mod remote;
#[cfg(test)]
mod tests;

use anyhow::{anyhow, Result};
use reqwest::header::HeaderMap;
use serde::Serialize;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub use remote::RepoRef;

/// What a client's calls give back.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// How a pull request merges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MergeStrategy {
    Merge,
    Squash,
    Rebase,
}

/// What a host can do, declared by its provider: the window and the PR's cycle offer only these.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    /// A pull request may open as a draft.
    pub draft: bool,
    /// The host merges by itself once the checks pass.
    pub auto_merge: bool,
    /// The checks and statuses of a pull request.
    pub checks: bool,
    /// The log of a check's job.
    pub job_logs: bool,
    /// Approvals and changes requested.
    pub reviews: bool,
    /// Comments on lines, in threads that resolve.
    pub review_threads: bool,
    /// Deployments and their environments.
    pub deployments: bool,
    pub merge_strategies: Vec<MergeStrategy>,
}

/// A pull request (a merge request on GitLab) to open.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PullRequestDraft {
    pub title: String,
    pub body: String,
    /// The branch that brings the changes.
    pub head: String,
    /// The branch it merges into.
    pub base: String,
    pub draft: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PrState {
    Open,
    Closed,
    Merged,
}

/// A pull request as its host tells it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub number: u64,
    pub url: String,
    pub title: String,
    pub state: PrState,
    pub draft: bool,
    pub head: String,
    pub base: String,
    /// Conflicts with its base: `Some(false)`; not known yet: none.
    pub mergeable: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CheckState {
    Pending,
    Success,
    Failure,
    Skipped,
}

/// A check or a status of a pull request's last commit (a CI job).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub name: String,
    pub state: CheckState,
    pub url: Option<String>,
    /// What `Forge::job_log` asks for, when the host keeps its log.
    pub job: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewState {
    Approved,
    ChangesRequested,
    Commented,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub author: String,
    pub state: ReviewState,
    pub body: String,
}

/// A comment of a pull request, on one of its lines or not.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComment {
    pub id: String,
    pub author: String,
    pub body: String,
    pub path: Option<String>,
    pub line: Option<u32>,
    pub resolved: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Deployment {
    pub environment: String,
    pub state: String,
    pub url: Option<String>,
}

/// Who an account is on its host, as its token says.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Identity {
    /// The login.
    pub user: String,
    /// As the window shows it: "@ada".
    pub label: String,
    /// The rights the token has, when the host tells them (GitHub's classic tokens, GitLab);
    /// none when it does not (fine-grained tokens, Bitbucket, Gitea).
    pub scopes: Option<Vec<String>>,
}

/// What a host was asked and cannot do (`Capabilities`), or its client does not do yet.
#[derive(Debug)]
pub struct Unsupported(pub &'static str);

impl std::fmt::Display for Unsupported {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let what = self.0;
        f.write_str(&tr!(
            "Cet hébergeur ne sait pas faire : {what}",
            "This code host can’t do it: {what}"
        ))
    }
}

impl std::error::Error for Unsupported {}

fn unsupported<'a, T: Send + 'a>(what: &'static str) -> BoxFuture<'a, Result<T>> {
    Box::pin(async move { Err(Unsupported(what).into()) })
}

/// A client of one host for one account. Its provider's `Capabilities` say which calls it
/// answers; the others say `Unsupported`.
pub trait Forge: Send + Sync {
    /// Who the token is, and its rights when the host tells them.
    fn me(&self) -> BoxFuture<'_, Result<Identity>>;

    fn create_pr<'a>(
        &'a self,
        _repo: &'a RepoRef,
        _pr: &'a PullRequestDraft,
    ) -> BoxFuture<'a, Result<PullRequest>> {
        unsupported("create_pr")
    }

    fn pull_request<'a>(
        &'a self,
        _repo: &'a RepoRef,
        _number: u64,
    ) -> BoxFuture<'a, Result<PullRequest>> {
        unsupported("pull_request")
    }

    fn merge<'a>(
        &'a self,
        _repo: &'a RepoRef,
        _number: u64,
        _strategy: MergeStrategy,
    ) -> BoxFuture<'a, Result<()>> {
        unsupported("merge")
    }

    /// Merge once the checks pass.
    fn auto_merge<'a>(
        &'a self,
        _repo: &'a RepoRef,
        _number: u64,
        _strategy: MergeStrategy,
    ) -> BoxFuture<'a, Result<()>> {
        unsupported("auto_merge")
    }

    fn checks<'a>(&'a self, _repo: &'a RepoRef, _number: u64) -> BoxFuture<'a, Result<Vec<Check>>> {
        unsupported("checks")
    }

    fn job_log<'a>(&'a self, _repo: &'a RepoRef, _job: &'a str) -> BoxFuture<'a, Result<String>> {
        unsupported("job_log")
    }

    fn reviews<'a>(
        &'a self,
        _repo: &'a RepoRef,
        _number: u64,
    ) -> BoxFuture<'a, Result<Vec<Review>>> {
        unsupported("reviews")
    }

    fn comments<'a>(
        &'a self,
        _repo: &'a RepoRef,
        _number: u64,
    ) -> BoxFuture<'a, Result<Vec<ReviewComment>>> {
        unsupported("comments")
    }

    fn comment<'a>(
        &'a self,
        _repo: &'a RepoRef,
        _number: u64,
        _body: &'a str,
    ) -> BoxFuture<'a, Result<()>> {
        unsupported("comment")
    }

    fn deployments<'a>(
        &'a self,
        _repo: &'a RepoRef,
        _git_ref: &'a str,
    ) -> BoxFuture<'a, Result<Vec<Deployment>>> {
        unsupported("deployments")
    }
}

/// What an account gives its client: where its instance is, and its credentials.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Credentials {
    /// The instance's address (`https://gitlab.com`, `https://git.acme.dev`), without a trailing
    /// slash.
    pub url: String,
    /// Bitbucket: the Atlassian account's e-mail its API token belongs to.
    pub email: String,
    pub token: String,
    /// Where its API is, in place of where the instance's address says (a fake one; github.com's
    /// as GitHub Issues reaches it).
    pub api: Option<String>,
}

/// A command that prints the token of a host's CLI (`gh auth token --hostname <host>`).
#[derive(Debug, Clone)]
pub struct CliToken {
    pub program: &'static str,
    pub args: Vec<String>,
    /// The token in what the command printed (stdout, then stderr).
    pub parse: fn(&str, &str) -> Option<String>,
}

/// A path to ask an instance whose host is unknown, and what in its answer says it is this host's.
pub struct Probe {
    pub path: &'static str,
    pub matches: fn(u16, &Value) -> bool,
}

/// A code host: what Escouade knows of it, and the client of an account.
pub trait Provider: Send + Sync {
    /// What the accounts and the window know it by: `github`, `gitlab`, `bitbucket`, `gitea`.
    fn kind(&self) -> &'static str;
    /// As the window says it.
    fn name(&self) -> &'static str;
    /// Its word for a pull request: « MR » on GitLab, « PR » elsewhere.
    fn request_word(&self) -> &'static str {
        "PR"
    }
    fn capabilities(&self) -> Capabilities;
    /// Its public instance (`github.com`), if it has one.
    fn default_host(&self) -> Option<&'static str>;
    /// The host of its public instance or of one it hosts (`acme.ghe.com`), and the other names of
    /// its ssh (`ssh.github.com`): its own name, else none.
    fn own_host(&self, host: &str) -> Option<String>;
    /// The repository a remote's path names, as this host lays its paths out.
    fn repo_of(&self, segments: &[String]) -> Option<RepoRef> {
        RepoRef::two(segments)
    }
    /// What tells a self-hosted instance of it.
    fn probe(&self) -> Option<Probe> {
        None
    }
    /// Its tokens belong to an e-mail (Bitbucket's Atlassian API tokens).
    fn needs_email(&self) -> bool {
        false
    }
    /// The rights its tokens need, as the host names them.
    fn scopes(&self) -> &'static [&'static str];
    /// The page that makes a token on `url`'s instance.
    fn token_page(&self, url: &str) -> String;
    /// The command of its CLI that gives the token of `host`, when it has one.
    fn cli(&self, _host: &str) -> Option<CliToken> {
        None
    }
    fn client(&self, http: reqwest::Client, account: &Credentials) -> Box<dyn Forge>;
}

/// The code hosts Escouade knows.
#[derive(Clone)]
pub struct Registry {
    providers: Vec<Arc<dyn Provider>>,
}

impl Registry {
    /// GitHub, GitLab, Bitbucket Cloud, Gitea and Forgejo.
    pub fn standard() -> Self {
        Self {
            providers: vec![
                Arc::new(github::GithubProvider),
                Arc::new(gitlab::GitlabProvider),
                Arc::new(bitbucket::BitbucketProvider),
                Arc::new(gitea::GiteaProvider),
            ],
        }
    }

    /// One more host (a later one, a fake one in tests).
    pub fn with(mut self, provider: Arc<dyn Provider>) -> Self {
        self.providers.push(provider);
        self
    }

    pub fn all(&self) -> &[Arc<dyn Provider>] {
        &self.providers
    }

    pub fn get(&self, kind: &str) -> Option<Arc<dyn Provider>> {
        self.providers.iter().find(|p| p.kind() == kind).cloned()
    }

    /// The host whose public instance (or hosted one) `host` is, and its own name for it.
    pub fn of_host(&self, host: &str) -> Option<(Arc<dyn Provider>, String)> {
        let host = host.to_ascii_lowercase();
        self.providers
            .iter()
            .find_map(|p| p.own_host(&host).map(|h| (p.clone(), h)))
    }

    /// What a remote's address names: its host, the code host it is on (by its name, else the
    /// account connected for it, `known`), and the repository as that code host reads its path.
    pub fn analyze(&self, url: &str, known: impl Fn(&str) -> Option<String>) -> Option<Remote> {
        let addr = remote::parse(url)?;
        let (provider, host) = match self.of_host(&addr.host) {
            Some((p, h)) => (Some(p), h),
            None => (
                known(&addr.host).and_then(|kind| self.get(&kind)),
                addr.host.clone(),
            ),
        };
        let repo = match &provider {
            Some(p) => p.repo_of(&addr.segments)?,
            // Unknown: its path as most hosts lay it out.
            None => RepoRef::nested(&addr.segments)?,
        };
        // Its instance's address: an https remote's own (its port with it); https on its host for
        // the others (their port is their ssh's).
        let url = match (addr.scheme.as_str(), addr.port) {
            ("https" | "http", Some(port)) => format!("{}://{host}:{port}", addr.scheme),
            ("https" | "http", None) => format!("{}://{host}", addr.scheme),
            _ => format!("https://{host}"),
        };
        Some(Remote {
            kind: provider.map(|p| p.kind().to_string()),
            host,
            url,
            repo,
        })
    }
}

/// A project's remote, as `Registry::analyze` reads it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    /// The code host, when its name or an account says it.
    pub kind: Option<String>,
    /// Its instance's host (`github.com`, `git.acme.dev`), without the port of its ssh.
    pub host: String,
    /// Its instance's address, as far as the remote tells it (`https://git.acme.dev:8443`).
    pub url: String,
    pub repo: RepoRef,
}

/// The instance's address of what was typed (`gitlab.acme.dev`, `https://gitlab.acme.dev/`).
pub fn instance_url(typed: &str) -> String {
    let s = typed.trim().trim_end_matches('/');
    if s.is_empty() || s.contains("://") {
        s.to_string()
    } else {
        format!("https://{s}")
    }
}

/// The host of an instance's address (`https://git.acme.dev:8443` → `git.acme.dev:8443`), in
/// lower case: what an account is known by, one per instance.
pub fn host_of(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    rest.split('/').next().unwrap_or("").to_ascii_lowercase()
}

/// The host without its port (what a remote's address gives).
pub fn bare_host(host: &str) -> &str {
    match host.rsplit_once(':') {
        Some((h, p)) if p.chars().all(|c| c.is_ascii_digit()) => h,
        _ => host,
    }
}

/// Sends a request to a code host and reads its JSON answer (null when empty) and its headers;
/// an error says what went wrong and what the host said.
pub(crate) async fn call(name: &str, rb: reqwest::RequestBuilder) -> Result<(Value, HeaderMap)> {
    crate::integrations::send_named(name, rb).await
}

/// The token was refused (401): expired or revoked.
pub fn refused(e: &anyhow::Error) -> bool {
    e.downcast_ref::<crate::integrations::HttpError>()
        .is_some_and(|h| h.status == 401)
}

/// The rights of `wanted` that `scopes` lacks.
pub fn missing_scopes(wanted: &[&str], scopes: &[String]) -> Vec<String> {
    wanted
        .iter()
        .filter(|w| !scopes.iter().any(|s| s == *w))
        .map(|w| w.to_string())
        .collect()
}

/// A provider's kind no registry knows.
pub(crate) fn unknown_kind(kind: &str) -> anyhow::Error {
    anyhow!(tr!(
        "Hébergeur inconnu : {kind}",
        "Unknown code host: {kind}"
    ))
}
