//! GitLab: gitlab.com and the self-hosted instances. Its token is a personal one (`api`), or the
//! `glab` CLI's. Its word is « MR ». The MR's calls come with its client (ESC-56), written from
//! its documentation: to try for real later.

use super::*;

pub struct GitlabProvider;

const NAME: &str = "GitLab";

impl Provider for GitlabProvider {
    fn kind(&self) -> &'static str {
        "gitlab"
    }

    fn name(&self) -> &'static str {
        NAME
    }

    fn request_word(&self) -> &'static str {
        "MR"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            // `Draft:` before the title.
            draft: true,
            // `merge_when_pipeline_succeeds` (`auto_merge` in later versions).
            auto_merge: true,
            checks: true,
            job_logs: true,
            reviews: true,
            review_threads: true,
            deployments: true,
            merge_strategies: vec![MergeStrategy::Merge, MergeStrategy::Squash],
        }
    }

    fn default_host(&self) -> Option<&'static str> {
        Some("gitlab.com")
    }

    fn own_host(&self, host: &str) -> Option<String> {
        matches!(host, "gitlab.com" | "www.gitlab.com" | "altssh.gitlab.com")
            .then(|| "gitlab.com".into())
    }

    /// Groups, subgroups, then the project.
    fn repo_of(&self, segments: &[String]) -> Option<RepoRef> {
        RepoRef::nested(segments)
    }

    /// `/api/v4/version` answers (401 without a token on recent versions).
    fn probe(&self) -> Option<Probe> {
        Some(Probe {
            path: "/api/v4/version",
            matches: |status, v| status == 401 || (status == 200 && v["version"].is_string()),
        })
    }

    fn scopes(&self) -> &'static [&'static str] {
        &["api"]
    }

    fn token_page(&self, url: &str) -> String {
        format!(
            "{}/-/user_settings/personal_access_tokens?name=Escouade&scopes=api",
            url.trim_end_matches('/')
        )
    }

    /// `glab` has no `auth token`: its status prints the token (`✓ Token: glpat-…`) when asked.
    fn cli(&self, host: &str) -> Option<CliToken> {
        Some(CliToken {
            program: "glab",
            args: ["auth", "status", "--show-token", "--hostname", host]
                .map(str::to_string)
                .to_vec(),
            parse: |out, err| glab_token(&format!("{out}\n{err}")),
        })
    }

    fn client(&self, http: reqwest::Client, account: &Credentials) -> Box<dyn Forge> {
        Box::new(Gitlab {
            http,
            base: account
                .api
                .clone()
                .unwrap_or_else(|| format!("{}/api/v4", account.url.trim_end_matches('/'))),
            token: account.token.trim().to_string(),
        })
    }
}

/// The token in what `glab auth status --show-token` printed.
pub fn glab_token(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let (_, t) = line.split_once("Token:")?;
        let t = t.trim();
        (!t.is_empty() && !t.contains('*') && !t.contains(' ')).then(|| t.to_string())
    })
}

pub struct Gitlab {
    http: reqwest::Client,
    base: String,
    token: String,
}

impl Gitlab {
    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        self.http
            .get(format!("{}{path}", self.base))
            .header("PRIVATE-TOKEN", &self.token)
    }
}

impl Forge for Gitlab {
    fn me(&self) -> BoxFuture<'_, Result<Identity>> {
        Box::pin(async move {
            let (me, _) = call(NAME, self.get("/user")).await?;
            let login = me["username"].as_str().unwrap_or("?").to_string();
            // A personal token tells its rights; glab's OAuth token does not.
            let scopes = match call(NAME, self.get("/personal_access_tokens/self")).await {
                Ok((t, _)) => t["scopes"].as_array().map(|a| {
                    a.iter()
                        .filter_map(|s| s.as_str().map(str::to_string))
                        .collect()
                }),
                Err(_) => None,
            };
            Ok(Identity {
                label: format!("@{login}"),
                user: login,
                scopes,
            })
        })
    }
}
