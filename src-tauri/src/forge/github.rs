//! GitHub: github.com, GHE.com (`<name>.ghe.com`) and GitHub Enterprise Server. Its token is the
//! `gh` CLI's, else one the user makes. The PR's calls come with its client (ESC-55).

use super::*;

pub struct GithubProvider;

const NAME: &str = "GitHub";

/// Where an instance's API is: `ESCOUADE_GITHUB_API` (a fake one) or api.github.com for
/// github.com, `api.<name>.ghe.com` for GHE.com, `/api/v3` of a GitHub Enterprise Server.
pub fn api_base(url: &str) -> String {
    let host = host_of(url);
    if host == "github.com" {
        return crate::integrations::Bases::from_env().github;
    }
    if host.ends_with(".ghe.com") {
        return format!("https://api.{host}");
    }
    format!("{}/api/v3", url.trim_end_matches('/'))
}

impl Provider for GithubProvider {
    fn kind(&self) -> &'static str {
        "github"
    }

    fn name(&self) -> &'static str {
        NAME
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            draft: true,
            auto_merge: true,
            checks: true,
            job_logs: true,
            reviews: true,
            review_threads: true,
            deployments: true,
            merge_strategies: vec![
                MergeStrategy::Merge,
                MergeStrategy::Squash,
                MergeStrategy::Rebase,
            ],
        }
    }

    fn default_host(&self) -> Option<&'static str> {
        Some("github.com")
    }

    fn own_host(&self, host: &str) -> Option<String> {
        match host {
            "github.com" | "www.github.com" | "ssh.github.com" => Some("github.com".into()),
            h if h.ends_with(".ghe.com") => Some(h.strip_prefix("ssh.").unwrap_or(h).into()),
            _ => None,
        }
    }

    /// A classic token's: the PR, its checks, its Actions' logs and the deployments. A
    /// fine-grained one does not say its rights (pull requests and contents in writing; checks,
    /// statuses, Actions and deployments in reading).
    fn scopes(&self) -> &'static [&'static str] {
        &["repo"]
    }

    fn token_page(&self, url: &str) -> String {
        let host = host_of(url);
        if host == "github.com" || host.ends_with(".ghe.com") {
            format!("https://{host}/settings/personal-access-tokens/new")
        } else {
            format!("{}/settings/tokens/new", url.trim_end_matches('/'))
        }
    }

    fn cli(&self, host: &str) -> Option<CliToken> {
        Some(CliToken {
            program: "gh",
            args: ["auth", "token", "--hostname", host]
                .map(str::to_string)
                .to_vec(),
            parse: |out, _| Some(out.trim().to_string()).filter(|t| !t.is_empty()),
        })
    }

    fn client(&self, http: reqwest::Client, account: &Credentials) -> Box<dyn Forge> {
        Box::new(Github {
            http,
            base: account
                .api
                .clone()
                .unwrap_or_else(|| api_base(&account.url)),
            token: account.token.trim().to_string(),
        })
    }
}

pub struct Github {
    http: reqwest::Client,
    base: String,
    token: String,
}

impl Github {
    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        self.http
            .get(format!("{}{path}", self.base))
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "escouade")
    }
}

impl Forge for Github {
    fn me(&self) -> BoxFuture<'_, Result<Identity>> {
        Box::pin(async move {
            let (me, headers) = call(NAME, self.get("/user")).await?;
            let login = me["login"].as_str().unwrap_or("?").to_string();
            // A classic token lists its rights; a fine-grained one, none.
            let scopes = headers
                .get("x-oauth-scopes")
                .and_then(|h| h.to_str().ok())
                .map(|s| {
                    s.split(',')
                        .map(|x| x.trim().to_string())
                        .filter(|x| !x.is_empty())
                        .collect()
                });
            Ok(Identity {
                label: format!("@{login}"),
                user: login,
                scopes,
            })
        })
    }
}
