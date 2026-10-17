//! « <harness> peut piloter Escouade » for a harness whose CLI cannot declare a server with its
//! header (Codex: `codex mcp add` takes no header, and `bearer_token` is refused for an HTTP entry):
//! Escouade writes the entry in the user config itself, and keeps all the rest of the file as it
//! was, comments and layout included (docs/ENGINES.md, « Le serveur MCP d'Escouade »).
//!
//! A harness only declares where and how (`UserConfig`): the file in the account's folder, its
//! format, the table of the servers and the names of an entry's fields. Reading, adding, removing
//! and the text to paste by hand are the same for all.

use crate::engine::mcp::SERVER;
use crate::mcp::install::{Entry, Standing};
use anyhow::{anyhow, bail, Context, Result};
use std::path::{Path, PathBuf};
use toml_edit::{DocumentMut, InlineTable, Item, Table};

/// The format of a user config.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    /// TOML (Codex's `config.toml`), edited by `toml_edit`.
    Toml,
}

/// Where and how a harness's user config holds an MCP server reached over HTTP with a header.
#[derive(Debug)]
pub struct UserConfig {
    /// The file, in the account's configuration folder (`accounts::config_dir`): `config.toml`.
    pub file: &'static str,
    /// The file as the window names it for the Principal: `~/.codex/config.toml`.
    pub shown: &'static str,
    pub format: Format,
    /// The table of the servers, from the top of the file: `["mcp_servers"]`.
    pub servers: &'static [&'static str],
    /// The field of the server's address: `url`.
    pub url: &'static str,
    /// The table of the headers sent at each call: `http_headers`.
    pub headers: &'static str,
}

/// The header that carries the token.
const AUTHORIZATION: &str = "Authorization";

impl UserConfig {
    /// What the file `config` says of Escouade's server. An entry that has no address or no bearer
    /// token in its headers is there with them empty: not the one wanted.
    pub fn declared(&self, config: &Path) -> Standing {
        let text = match std::fs::read_to_string(config) {
            Ok(text) => text,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Standing::NoFile,
            Err(_) => return Standing::Unreadable,
        };
        let Ok(doc) = text.parse::<DocumentMut>() else {
            return Standing::Unreadable;
        };
        let mut at: &Item = doc.as_item();
        for key in self.servers.iter().copied().chain([SERVER]) {
            match at.as_table_like().and_then(|t| t.get(key)) {
                Some(next) => at = next,
                None => return Standing::Absent,
            }
        }
        let field = |key: &str| at.as_table_like().and_then(|t| t.get(key));
        let url = field(self.url).and_then(Item::as_str).unwrap_or_default();
        let token = field(self.headers)
            .and_then(Item::as_table_like)
            .and_then(|h| h.get(AUTHORIZATION))
            .and_then(Item::as_str)
            .and_then(|h| h.strip_prefix("Bearer "))
            .unwrap_or_default();
        Standing::Declared(Entry {
            url: url.to_string(),
            token: token.to_string(),
        })
    }

    /// `entry` written in the file `config` (made, with its folder, when there is none), in place
    /// of an entry of that name; the rest of the file as it was. A `config` that is a link (an
    /// account sharing its Principal's settings, `accounts::link_file`) stays one: the file it
    /// leads to is the one written (`written_at`).
    pub fn add(&self, config: &Path, entry: &Entry) -> Result<()> {
        let config = &written_at(config);
        let (mut doc, crlf) = self.read(config, true)?;
        self.servers_of(&mut doc)?
            .insert(SERVER, Item::Table(self.table(entry)));
        self.write(config, &doc, crlf)
    }

    /// The server's entry taken out of the file `config`, and the table of the servers too when
    /// nothing is left in it and it had no line of its own (`[mcp_servers]`): the file as it was
    /// before `add`. No file, or no entry: nothing written.
    pub fn remove(&self, config: &Path) -> Result<()> {
        let config = &written_at(config);
        if !config.exists() {
            return Ok(());
        }
        let (mut doc, crlf) = self.read(config, false)?;
        if !self.take_out(doc.as_table_mut(), self.servers)? {
            return Ok(());
        }
        self.write(config, &doc, crlf)
    }

    /// What to add to the file by hand: the entry alone, as `add` writes it.
    pub fn snippet(&self, entry: &Entry) -> String {
        let mut doc = DocumentMut::new();
        match self.servers_of(&mut doc) {
            Ok(servers) => {
                servers.insert(SERVER, Item::Table(self.table(entry)));
            }
            Err(_) => return String::new(),
        }
        doc.to_string().trim().to_string()
    }

    /// The entry: the address, then the headers on one line.
    fn table(&self, entry: &Entry) -> Table {
        let mut headers = InlineTable::new();
        headers.insert(AUTHORIZATION, format!("Bearer {}", entry.token).into());
        let mut table = Table::new();
        table.insert(self.url, toml_edit::value(entry.url.as_str()));
        table.insert(self.headers, toml_edit::value(headers));
        table
    }

    /// The file parsed (an empty one when there is none and `missing_ok`, else an error), and
    /// whether its lines end with CRLF (`toml_edit` writes LF alone).
    fn read(&self, config: &Path, missing_ok: bool) -> Result<(DocumentMut, bool)> {
        let text = match std::fs::read_to_string(config) {
            Ok(text) => text,
            Err(e) if missing_ok && e.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(e) => {
                return Err(e).with_context(|| {
                    tr!(
                        "{file} n’a pas pu être lu",
                        "{file} could not be read",
                        file = config.display()
                    )
                })
            }
        };
        let crlf = text.contains("\r\n");
        let doc = match self.format {
            Format::Toml => text.parse::<DocumentMut>().map_err(|e| {
                anyhow!(tr!(
                    "{file} n’est pas un TOML valide, il n’a pas été modifié : {e}",
                    "{file} is not valid TOML, it was left alone: {e}",
                    file = config.display(),
                    e = e.message()
                ))
            })?,
        };
        Ok((doc, crlf))
    }

    /// The file written in one go, readable by its owner only: it holds a token. Its lines end
    /// with CRLF when they did (`crlf`).
    fn write(&self, config: &Path, doc: &DocumentMut, crlf: bool) -> Result<()> {
        if let Some(dir) = config.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut text = doc.to_string();
        if crlf {
            text = text.replace("\r\n", "\n").replace('\n', "\r\n");
        }
        crate::paths::write_private(config, text.as_bytes()).with_context(|| {
            tr!(
                "{file} n’a pas pu être écrit",
                "{file} could not be written",
                file = config.display()
            )
        })
    }

    /// The table of the servers, made as the header of the entry alone (`[mcp_servers.escouade]`)
    /// when there is none.
    fn servers_of<'a>(&self, doc: &'a mut DocumentMut) -> Result<&'a mut Table> {
        let mut at = doc.as_table_mut();
        for key in self.servers {
            let item = at.entry(key).or_insert_with(|| {
                let mut table = Table::new();
                table.set_implicit(true);
                Item::Table(table)
            });
            at = item.as_table_mut().ok_or_else(|| self.not_a_table(key))?;
        }
        Ok(at)
    }

    /// The server's entry taken out of `table`, under `path`; whether there was one. A table of
    /// the path left empty and implicit goes with it.
    fn take_out(&self, table: &mut Table, path: &[&str]) -> Result<bool> {
        let Some((key, rest)) = path.split_first() else {
            return Ok(table.remove(SERVER).is_some());
        };
        let Some(item) = table.get_mut(key) else {
            return Ok(false);
        };
        let inner = item.as_table_mut().ok_or_else(|| self.not_a_table(key))?;
        let removed = self.take_out(inner, rest)?;
        if removed && inner.is_empty() && inner.is_implicit() {
            table.remove(key);
        }
        Ok(removed)
    }

    fn not_a_table(&self, key: &str) -> anyhow::Error {
        anyhow!(tr!(
            "« {key} » n’est pas une table dans {file} : il n’a pas été modifié",
            "“{key}” is not a table in {file}: it was left alone",
            file = self.file
        ))
    }
}

/// The file `config` is written as: itself, or for a link the file it leads to (followed to the
/// end, `canonicalize`; a link to nothing yet, its target), never a file in place of the link,
/// which would end the sharing for good. A link that cannot be read is written as itself.
pub fn written_at(config: &Path) -> PathBuf {
    let is_link = std::fs::symlink_metadata(config).is_ok_and(|m| m.file_type().is_symlink());
    if !is_link {
        return config.to_path_buf();
    }
    if let Ok(real) = std::fs::canonicalize(config) {
        return real;
    }
    match std::fs::read_link(config) {
        Ok(to) => config.parent().map_or(to.clone(), |dir| dir.join(&to)),
        Err(_) => config.to_path_buf(),
    }
}

/// What tells two user configs apart: two accounts whose `config.toml` leads to the same file
/// (one linked to Principal's) have the same.
pub fn same_file_key(config: &Path) -> PathBuf {
    std::fs::canonicalize(config).unwrap_or_else(|_| written_at(config))
}

/// Refused: a harness with no user config of its own to declare the server in.
pub fn none() -> Result<()> {
    bail!(tr!(
        "Ce harness ne déclare pas le serveur MCP d’Escouade.",
        "This harness does not declare Escouade’s MCP server."
    ))
}
