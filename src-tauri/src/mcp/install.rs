//! Escouade's server declared in Claude Code, account by account (« Claude et les agents peuvent
//! piloter Escouade »): `claude mcp add --scope user --transport http escouade <url> --header
//! "Authorization: Bearer <token>"`, run as the account runs Claude Code (its `claude`, its
//! `CLAUDE_CONFIG_DIR`), so that the entry lands in that account's `.claude.json`.
//!
//! The CLI only writes. What is declared is read from `.claude.json` itself: `claude mcp get`
//! connects to the server, which is slow, and a failed connection says nothing of the entry.

use super::activity::clip;
use crate::accounts;
use crate::core::Core;
use crate::engine::{self, Engine};
use crate::model::{Account, Settings};
use anyhow::{anyhow, bail, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::Runtime;

/// How long one `claude mcp` command may take.
pub const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

/// What stands in the place of a token that must not be shown or kept in a log.
pub const MASK: &str = "••••••••";

/// What the server is declared as in Claude Code's `.claude.json`.
#[derive(Clone, PartialEq, Eq)]
pub struct Entry {
    pub url: String,
    pub token: String,
}

// By hand: the token is not printed by a `{:?}`, a failed assertion or a log line.
impl std::fmt::Debug for Entry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Entry")
            .field("url", &self.url)
            .field("token", &MASK)
            .finish()
    }
}

/// `text` with the bearer tokens it holds hidden (`Bearer <token>`, up to a blank or a quote):
/// what the window shows of a command.
pub fn mask_bearer(text: &str) -> String {
    const BEARER: &str = "Bearer ";
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find(BEARER) {
        let (head, tail) = rest.split_at(at + BEARER.len());
        out.push_str(head);
        out.push_str(MASK);
        let end = tail
            .find(|c: char| c.is_whitespace() || c == '"' || c == '\'')
            .unwrap_or(tail.len());
        rest = &tail[end..];
    }
    out.push_str(rest);
    out
}

/// `text` with every one of `secrets` (a token, whole) hidden, and then any bearer token.
fn mask_secrets(text: &str, secrets: &[&str]) -> String {
    let hidden = secrets
        .iter()
        .filter(|s| !s.is_empty())
        .fold(text.to_string(), |t, s| t.replace(*s, MASK));
    mask_bearer(&hidden)
}

/// How an account's Claude Code is run, and where it keeps its state.
#[derive(Debug, Clone)]
pub struct Target {
    /// Its `claude`.
    pub program: crate::engine::Program,
    /// What its processes get besides the environment of the app: the network settings, and the
    /// account's `CLAUDE_CONFIG_DIR` (never Principal's).
    pub env: Vec<(String, String)>,
    /// Where the command runs.
    pub cwd: PathBuf,
    /// Its user config, which holds the servers it reaches in every folder (Claude Code's
    /// `.claude.json`).
    pub config: PathBuf,
    pub timeout: Duration,
}

/// What `declare` did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Declared {
    /// There was no entry: added.
    Added,
    /// There was another one: replaced.
    Replaced,
    /// It was there as wanted: left as it was.
    Unchanged,
}

/// The entry that reaches the server on `port` with `token`.
pub fn wanted(port: u16, token: &str) -> Entry {
    Entry {
        url: format!("http://127.0.0.1:{port}{}", super::PATH),
        token: token.to_string(),
    }
}

/// What a harness's user config says of the server (`Engine::declared`).
pub enum Standing {
    /// There is no such file.
    NoFile,
    /// There is a file that cannot be read or is no JSON: nothing can be told of the server.
    Unreadable,
    /// The file has no entry of that name.
    Absent,
    /// It has one. One that is not an HTTP server with a bearer token has an empty url or token: it
    /// is there, and it is not the one wanted.
    Declared(Entry),
}

/// The entry the user config `config` of `engine` holds under the server's name, if it holds one.
/// A file that is not there or cannot be read holds none.
pub fn current(engine: &dyn Engine, config: &Path) -> Option<Entry> {
    match engine.declared(config) {
        Standing::Declared(entry) => Some(entry),
        _ => None,
    }
}

/// Runs the account's program with `args` as the account does, within its time. Err with what Claude Code
/// said when it fails, any of `secrets` (the tokens in play) hidden: the error goes to the window
/// and the logs.
pub(crate) async fn run(target: &Target, args: &[String], secrets: &[&str]) -> Result<()> {
    let launch = target
        .program
        .launch(&target.cwd.to_string_lossy(), args, &target.env)?;
    let mut cmd = tokio::process::Command::new(&launch.program);
    cmd.args(&launch.args)
        .current_dir(&target.cwd)
        .envs(launch.env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(crate::proc::CREATE_NO_WINDOW);
    crate::job::isolate(&mut cmd);
    let child = cmd.spawn().map_err(|e| {
        anyhow!(tr!(
            "claude n’a pas pu être lancé : {e}",
            "claude could not be started: {e}"
        ))
    })?;
    // Dropped when this returns: whatever the command left running ends with it.
    let _job = crate::job::Job::for_child(&child);
    let out = tokio::time::timeout(target.timeout, child.wait_with_output())
        .await
        .map_err(|_| {
            anyhow!(tr!(
                "pas de réponse de claude en {s} s",
                "no answer from claude in {s} s",
                s = target.timeout.as_secs()
            ))
        })??;
    if out.status.success() {
        return Ok(());
    }
    let text = |bytes: &[u8]| String::from_utf8_lossy(bytes).trim().to_string();
    let said = [text(&out.stderr), text(&out.stdout)]
        .into_iter()
        .find(|t| !t.is_empty());
    match said {
        Some(said) => bail!("{}", clip(&mask_secrets(&said, secrets))),
        None => bail!(tr!(
            "claude s’est terminé avec le code {code}",
            "claude exited with code {code}",
            code = out.status.code().unwrap_or(-1)
        )),
    }
}

/// The server declared in the account of `target` as `entry` says, in the user config of `engine`:
/// added; replaced (removed, then added) when the entry there is another; left alone, with nothing
/// run, when it is the same.
pub async fn declare(engine: &dyn Engine, target: &Target, entry: &Entry) -> Result<Declared> {
    let had = current(engine, &target.config);
    if had.as_ref() == Some(entry) {
        return Ok(Declared::Unchanged);
    }
    let secrets = [entry.token.as_str(), had.as_ref().map_or("", |h| &h.token)];
    if had.is_some() {
        // `add` of a name already there fails.
        engine.remove_declaration(target, &secrets).await?;
    }
    engine.add_declaration(target, entry, &secrets).await?;
    Ok(if had.is_some() {
        Declared::Replaced
    } else {
        Declared::Added
    })
}

/// The server's entry removed from the account of `target`, in the user config of `engine`;
/// whether there was one. No file or no entry in it, nothing run; a file that cannot be read may
/// hold one, so the removal is run, and its failure is a failure. A removal that fails with the
/// entry gone all the same is not one.
pub async fn withdraw(engine: &dyn Engine, target: &Target) -> Result<bool> {
    let had = engine.declared(&target.config);
    let token = match &had {
        Standing::NoFile | Standing::Absent => return Ok(false),
        Standing::Declared(entry) => entry.token.as_str(),
        Standing::Unreadable => "",
    };
    if let Err(e) = engine.remove_declaration(target, &[token]).await {
        // Removed meanwhile: Claude Code answers an absent entry with an error too.
        if matches!(
            engine.declared(&target.config),
            Standing::NoFile | Standing::Absent
        ) {
            return Ok(true);
        }
        return Err(e);
    }
    Ok(true)
}

/// The harness the accounts are of: Claude Code's alone until each harness has its own (docs/TODO-1.8.md,
/// « Comptes et quotas »), and its user config is where the server is declared.
fn harness() -> &'static dyn Engine {
    engine::default()
}

/// Where the server stands in one account's Claude Code, as the window shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Declaration {
    /// The id of the Claude account.
    pub account: String,
    /// The server is declared in it (as wanted).
    pub ok: bool,
    /// Why it is not.
    pub error: Option<String>,
    /// The command that declares it in this account by hand, its token hidden (`MASK`): the real
    /// one is built when the user asks to copy it (`Core::mcp_manual_command`), and is never kept
    /// nor sent with the state.
    pub command: String,
}

// The declaration in each account, kept in step with the settings: « Claude et les agents peuvent piloter Escouade »
// turned on or off, an account added, switched on or off, the server on another port.
impl<R: Runtime> Core<R> {
    /// The app's `CLAUDE_CONFIG_DIR` and home folder as the account's `claude` goes by them
    /// (`accounts::claude_home`: the Linux home folder for one of WSL). In unit tests every core
    /// has a home of its own: the fake `claude` is told it and never goes by the real one.
    fn claude_app_env(&self, account: &Account, settings: &Settings) -> (Option<String>, PathBuf) {
        if accounts::program(account, settings).is_some_and(|p| p.wsl().is_some()) {
            return accounts::claude_home(account, settings);
        }
        if cfg!(test) {
            return (None, self.data.root().join("claude-home"));
        }
        accounts::app_env()
    }

    /// How the account's Claude Code is run to declare the server: its `claude`, its network
    /// settings, its folder (never Principal's), from the data folder.
    fn install_target(&self, settings: &Settings, account: &Account) -> Result<Target> {
        let program = accounts::program(account, settings).ok_or_else(|| {
            anyhow!(tr!(
                "Claude Code introuvable. Installe-le ou indique son chemin dans les réglages.",
                "Claude Code not found. Install it or give its path in the settings."
            ))
        })?;
        let (env, home) = self.claude_app_env(account, settings);
        let mut vars = [settings.claude_env(), accounts::launch_env(account)].concat();
        if cfg!(test) {
            // Tests may run inside a Claude Code session with a `CLAUDE_CONFIG_DIR` of its own, which
            // Principal's processes would inherit: blank, the fake `claude` goes by its home alone.
            if vars.iter().all(|(k, _)| k != "CLAUDE_CONFIG_DIR") {
                vars.push(("CLAUDE_CONFIG_DIR".into(), String::new()));
            }
            vars.push((
                "FAKE_CLAUDE_HOME".into(),
                home.to_string_lossy().into_owned(),
            ));
        }
        Ok(Target {
            program,
            env: vars,
            cwd: self.data.root().to_path_buf(),
            config: accounts::claude_json_with(account, env.as_deref(), &home),
            timeout: COMMAND_TIMEOUT,
        })
    }

    /// What the account would be told to run by hand to declare `entry`.
    fn manual_command(&self, settings: &Settings, account: &Account, entry: &Entry) -> String {
        let (env, home) = self.claude_app_env(account, settings);
        let claude_json = accounts::claude_json_with(account, env.as_deref(), &home);
        let replace = current(harness(), &claude_json).is_some();
        // A `claude` of WSL: the command for a terminal of its distribution, its folder there.
        if let Some(wsl) = accounts::program(account, settings).and_then(|p| p.wsl().cloned()) {
            let dir = accounts::own_dir(account).map(|d| wsl.linux_path(d).unwrap_or(d.into()));
            return harness().manual_declaration(false, &wsl.path, dir.as_deref(), entry, replace);
        }
        let typed = [account.claude_path.trim(), settings.claude_path.trim()]
            .into_iter()
            .find(|p| !p.is_empty())
            .unwrap_or("claude");
        harness().manual_declaration(
            cfg!(windows),
            typed,
            accounts::own_dir(account),
            entry,
            replace,
        )
    }

    /// The server declared in `account`: how that went.
    async fn declare_in(
        &self,
        settings: &Settings,
        account: &Account,
        entry: &Entry,
    ) -> Declaration {
        let done = match self.install_target(settings, account) {
            Ok(target) => declare(harness(), &target, entry).await.map(|_| ()),
            Err(e) => Err(e),
        };
        if let Err(e) = &done {
            log::warn!("mcp: not declared for account {}: {e:#}", account.id);
        }
        Declaration {
            account: account.id.clone(),
            ok: done.is_ok(),
            error: done.err().map(|e| format!("{e:#}")),
            command: mask_bearer(&self.manual_command(settings, account, entry)),
        }
    }

    /// The command that declares the server by hand in the account `account`, with the real token
    /// (« Copier la commande »). Only while the switch is on and the server runs: there is a token
    /// and a port to give.
    pub fn mcp_manual_command(&self, account: &str) -> Result<String> {
        let settings = self.settings.read().clone();
        let account = settings
            .accounts
            .iter()
            .find(|a| a.id == account)
            .ok_or_else(|| {
                anyhow!(tr!(
                    "compte Claude « {account} » introuvable",
                    "Claude account “{account}” not found"
                ))
            })?;
        let status = self.mcp.status();
        if !settings.mcp_enabled || !status.running {
            bail!(tr!(
                "Le serveur MCP ne tourne pas : active « Claude et les agents peuvent piloter Escouade ».",
                "The MCP server is not running: turn on “Claude and the agents can drive Escouade”."
            ));
        }
        let token = self.mcp.external_token()?;
        Ok(self.manual_command(&settings, account, &wanted(status.port, &token)))
    }

    /// « Claude et les agents peuvent piloter Escouade » turned on or off: saved like any setting, which starts or
    /// stops the server and declares it in the accounts (or takes it out of them). One change of
    /// the settings at a time, with those of the Claude accounts.
    pub fn set_mcp_enabled(self: &Arc<Self>, enabled: bool) -> Result<()> {
        let _one = self.claude_accounts_lock.lock();
        let mut settings = self.settings.read().clone();
        settings.mcp_enabled = enabled;
        self.save_settings(settings)
    }

    /// The declaration in Claude Code is to be brought in step with the settings: on its own task
    /// (the commands are slow), unless nothing is to be done (off, and nothing declared to take out).
    pub(crate) fn declare_in_claude(&self) {
        if !self.settings.read().mcp_enabled && !self.mcp.withdraw.load(Ordering::Acquire) {
            return;
        }
        let Some(core) = self.weak().upgrade() else {
            return;
        };
        tauri::async_runtime::spawn(async move { core.declare_now().await });
    }

    /// A Claude account was removed from the settings: its entry leaves its `.claude.json` (the
    /// folder stays on the disk, and the token would open the server from there for as long as the
    /// switch is on), whether the switch is on or off (a leftover goes too). On its own task, after
    /// the declaration under way; a failure is only logged. The token is not changed: the other
    /// accounts still hold it.
    pub(crate) fn withdraw_removed(&self, gone: Account) {
        let Some(core) = self.weak().upgrade() else {
            return;
        };
        tauri::async_runtime::spawn(async move {
            {
                let _one = core.mcp.declaring.lock().await;
                if !core.quitting.load(Ordering::Acquire) {
                    let settings = core.settings.read().clone();
                    let done = match core.install_target(&settings, &gone) {
                        Ok(target) => withdraw(harness(), &target).await.map(|_| ()),
                        Err(e) => Err(e),
                    };
                    if let Err(e) = done {
                        log::warn!(
                            "mcp: not taken out of the removed account {}: {e:#}",
                            gone.id
                        );
                    }
                }
            }
            #[cfg(test)]
            core.mcp.runs.fetch_add(1, Ordering::AcqRel);
        });
    }

    /// Brings Claude Code in step with the settings, one run at a time:
    /// - on, with the server running: the server declared in every active account (left alone when
    ///   it is there as wanted, replaced when it is another, added when it is absent), each account's
    ///   result told to the window;
    /// - off, after it was on: taken out of every account, whether active or not (the token was
    ///   changed when it was turned off, `McpServer::turned_off`, so that an entry that stays — a
    ///   refusal, a `claude` that is gone, a crash, the app quitting before this run — opens
    ///   nothing).
    pub(crate) async fn declare_now(&self) {
        self.declare_run().await;
        #[cfg(test)]
        self.mcp.runs.fetch_add(1, Ordering::AcqRel);
    }

    async fn declare_run(&self) {
        let _one = self.mcp.declaring.lock().await;
        let withdrawing = self.mcp.withdraw.swap(false, Ordering::AcqRel);
        if self.quitting.load(Ordering::Acquire) {
            return;
        }
        let settings = self.settings.read().clone();
        if !settings.mcp_enabled {
            if withdrawing {
                for account in &settings.accounts {
                    let Ok(target) = self.install_target(&settings, account) else {
                        continue;
                    };
                    if let Err(e) = withdraw(harness(), &target).await {
                        log::warn!("mcp: not taken out of account {}: {e:#}", account.id);
                    }
                }
            }
            self.mcp.tell_declared(Vec::new());
            return;
        }
        // Turned off and on again before the run: the token changed when it was turned off, and the
        // entries are replaced below, with the new one.
        let status = self.mcp.status();
        let token = self.mcp.external_token();
        let (true, Ok(token)) = (status.running, token) else {
            // Nothing to reach (the window says why: the server's own error).
            self.mcp.tell_declared(Vec::new());
            return;
        };
        let wanted = wanted(status.port, &token);
        let mut declared = Vec::new();
        for account in settings.accounts.iter().filter(|a| a.active) {
            declared.push(self.declare_in(&settings, account, &wanted).await);
        }
        self.mcp.tell_declared(declared);
    }
}
