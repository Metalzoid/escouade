//! GitHub Copilot CLI, the fourth engine: a `copilot --server --stdio` process per agent, driven
//! over the protocol of its SDK by a client of Escouade's own (`process`, docs/PROTOCOL.md,
//! « Copilot SDK »; neither the SDK's crate nor ACP, chosen by the user on 2026-10-18), its events
//! translated by `AgentRt::copilot_frame` (`agent/copilot.rs`).
//!
//! What it does as Escouade drives it comes from the real runs of Copilot CLI 1.0.98 on a Copilot
//! Free account (ESC-23, docs/TODO-1.8.md, point 0, « Copilot CLI »), whose streams are in
//! `tests/fixtures/copilot/` and whose schemas are `tests/fixtures/engines/copilot-1.0.98.*`. Its
//! accounts, credits, cost, Escouade's MCP server and its written texts come with ESC-40.

#[cfg(test)]
pub(crate) mod bench;
mod locate;
mod process;
#[cfg(test)]
mod schema_tests;
pub(crate) mod terminal;

#[cfg(test)]
pub(crate) use bench::fake_copilot;
use process::CopilotProcess;

use super::registry::{
    CostKind, EngineCaps, ForkPoint, Install, MidTurn, ModeCap, ModelDecl, QuotaKind, Tested,
    ToldModel,
};
use super::{
    mcp, BoxFuture, Engine, Escouade, Message, OneShot, Process, Program, Room, Spawn, StartLost,
    Weight,
};
use crate::agent::{AgentRt, Effects};
use crate::core::{size_label, Attachment, MAX_IMAGE, MAX_TOTAL};
use crate::i18n::{self, Lang};
use crate::model::EngineId;
use anyhow::{bail, Result};
use serde_json::{json, Map, Value};

/// GitHub Copilot CLI.
pub struct Copilot;

pub static COPILOT: Copilot = Copilot;

/// The versions of Copilot CLI Escouade was tested with: its server as the real run of 2026-10-18
/// found it (ESC-23).
pub const TESTED: Tested = Tested {
    oldest: "1.0.98",
    newest: "1.0.98",
};

/// Its installer, npm's package.
const INSTALL: Install = Install {
    windows: "npm install -g @github/copilot",
    unix: "npm install -g @github/copilot",
};

/// The models of its menu until a process of the account has listed them: those its real run on a
/// Free account ran (`gpt-6-luna` chosen by `auto`, `gpt-5-mini` taken by `session.model.switchTo`).
/// Never `auto`, which picks a model itself.
const MODELS: [(&str, &str); 2] = [("gpt-6-luna", "GPT-6 Luna"), ("gpt-5-mini", "GPT-5 mini")];

/// The efforts Escouade's menu has, in its order: a model's `supportedReasoningEfforts` among them.
const EFFORTS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

/// The variables whose values Copilot strips from its commands and MCP servers (`--secret-env-vars`):
/// the tokens it may be given.
const SECRETS: &str = "GH_TOKEN,GITHUB_TOKEN,COPILOT_GITHUB_TOKEN,ESCOUADE_MCP_TOKEN";

/// The model, effort and mode in force (Copilot takes them at once, `session.model.switchTo` and
/// `session.mode.set`).
#[derive(Debug, Clone, Default)]
pub(crate) struct Settings {
    pub model: String,
    pub effort: String,
    /// Escouade's mode, turned into Copilot's by `permission_mode` and `agent_mode`.
    pub mode: String,
}

/// The permission mode of Copilot for Escouade's `mode` (`session.permissions.setMode`): `allow-all`
/// without permissions, else `manual`, Escouade's rules answering the safe requests themselves
/// (`agent/copilot.rs`). Never `assisted`: experimental, and its judge failed on the real run.
pub(crate) fn permission_mode(mode: &str) -> &'static str {
    if mode == "bypassPermissions" {
        "allow-all"
    } else {
        "manual"
    }
}

/// The mode of Copilot's agent for Escouade's `mode` (`session.mode.set`): `plan` to plan,
/// `autopilot` for « Auto » (it goes on by itself up to the end of its task), else `interactive`.
pub(crate) fn agent_mode(mode: &str) -> &'static str {
    match mode {
        "plan" => "plan",
        "auto" => "autopilot",
        _ => "interactive",
    }
}

/// The modes Escouade gives Copilot, in the menu's order.
const MODES: [&str; 5] = [
    "auto",
    "default",
    "plan",
    "acceptEdits",
    "bypassPermissions",
];

/// What a mode means in Copilot, as the menu says it: no sandbox in its server mode (1.0.98), only
/// Escouade's rules.
fn meaning(lang: Lang, mode: &str) -> String {
    match mode {
        "auto" => tr_in!(
            lang,
            "Copilot enchaîne seul jusqu’au bout de sa tâche (autopilot). Les lectures et écritures du dossier de l’agent, git add et git commit passent ; le reste demande. Pas de bac à sable : une commande acceptée peut tout faire.",
            "Copilot goes on by itself to the end of its task (autopilot). Reads and writes in the agent’s folder, git add and git commit go through; the rest asks. No sandbox: an accepted command can do anything."
        ),
        "plan" => tr_in!(
            lang,
            "Copilot étudie et propose un plan sans rien modifier ; ses lectures dans le dossier de l’agent passent, ses questions arrivent dans ce mode. Pas de bac à sable : seules les règles d’Escouade protègent.",
            "Copilot studies and proposes a plan without changing anything; its reads in the agent’s folder go through, its questions come in this mode. No sandbox: only Escouade’s rules protect."
        ),
        "acceptEdits" => tr_in!(
            lang,
            "Les lectures et écritures du dossier de l’agent, git add et git commit passent sans demander ; les autres commandes, le web et les chemins hors du dossier demandent. Pas de bac à sable : une commande acceptée peut tout faire.",
            "Reads and writes in the agent’s folder, git add and git commit go through without asking; other commands, the web and paths outside the folder ask. No sandbox: an accepted command can do anything."
        ),
        "bypassPermissions" => tr_in!(
            lang,
            "Copilot ne demande rien (allow-all) : commandes, fichiers, web et tout le disque. Pas de bac à sable.",
            "Copilot asks nothing (allow-all): commands, files, the web and the whole disk. No sandbox."
        ),
        _ => tr_in!(
            lang,
            "Les lectures et écritures du dossier de l’agent passent sans demander ; les commandes (git add et git commit compris), le web, les outils MCP et les chemins hors du dossier demandent. Copilot n’a pas de bac à sable en mode serveur : seules ces règles protègent, et une commande acceptée peut tout faire.",
            "Reads and writes in the agent’s folder go through without asking; commands (git add and git commit included), the web, MCP tools and paths outside the folder ask. Copilot has no sandbox in its server mode: only these rules protect, and an accepted command can do anything."
        ),
    }
}

/// What Copilot does, as Escouade drives it.
pub fn caps() -> EngineCaps {
    let lang = i18n::ui();
    EngineCaps {
        modes: MODES
            .into_iter()
            .map(|id| ModeCap {
                id,
                meaning: Some(meaning(lang, id)),
            })
            .collect(),
        effort: true,
        images: true,
        // Whether a model reads them depends on the model: refused for now.
        pdf: false,
        fork: ForkPoint::Event,
        resume_other_account: false,
        // `immediate`: the running turn takes it at once.
        mid_turn: MidTurn::Immediate,
        slash_commands: false,
        // The credits of the month come with ESC-40.
        quota: QuotaKind::None,
        quota_windows: Vec::new(),
        // Its nano-AIU at the end of each turn (`session.usage_checkpoint`).
        cost: CostKind::Exact,
        terminal_view: true,
        remote_control: false,
        background_tasks: false,
        todo_tools: false,
        default_refusal: false,
    }
}

/// The arguments of its server: no update of its own, no built-in MCP server (GitHub's, with the
/// account), no temporary folder open without a question, and the tokens kept from its commands.
fn args() -> Vec<String> {
    [
        "--server",
        "--stdio",
        "--no-auto-update",
        "--disable-builtin-mcps",
        "--disallow-temp-dir",
    ]
    .iter()
    .map(|s| s.to_string())
    .chain(std::iter::once(format!("--secret-env-vars={SECRETS}")))
    .collect()
}

/// The models of the account: those of `models.list` (`listed`), else of `session.model.list`
/// (`of_session.list`), each with its efforts, whether it reads images and its multiplier; on a
/// Free account both are empty (tried), and the menu keeps its declared models, each with its tier
/// of price (`modelPriceCategories`). A model its policy disables is left out.
pub(crate) fn catalog(
    listed: Option<&Value>,
    of_session: Option<&Value>,
) -> Option<Vec<ToldModel>> {
    let tiers: Vec<(String, String)> = of_session
        .and_then(|s| s["modelPriceCategories"].as_array())
        .into_iter()
        .flatten()
        .filter_map(|c| {
            Some((
                c["id"].as_str()?.to_string(),
                c["priceCategory"].as_str()?.to_string(),
            ))
        })
        .collect();
    let tier = |id: &str| tiers.iter().find(|(m, _)| m == id).map(|(_, t)| t.clone());
    let list = listed
        .and_then(|l| l["models"].as_array())
        .filter(|a| !a.is_empty())
        .or_else(|| of_session.and_then(|s| s["list"].as_array()))
        .cloned()
        .unwrap_or_default();
    let mut models: Vec<ToldModel> = list
        .iter()
        .filter(|m| m["policy"]["state"] != "disabled")
        .filter_map(|m| {
            let id = m["id"].as_str()?;
            let multiplier = match &m["billing"]["multiplier"] {
                Value::Number(n) => Some(n.to_string()),
                _ => None,
            };
            Some(ToldModel {
                id: id.to_string(),
                label: m["name"].as_str().unwrap_or(id).to_string(),
                efforts: m["supportedReasoningEfforts"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|e| e.as_str().map(str::to_string))
                    .collect(),
                default_effort: m["defaultReasoningEffort"].as_str().map(str::to_string),
                images: m["capabilities"]["supports"]["vision"] == true,
                default: false,
                provider: None,
                price: m["modelPickerPriceCategory"]
                    .as_str()
                    .map(str::to_string)
                    .or_else(|| tier(id)),
                multiplier,
            })
        })
        .collect();
    if models.is_empty() {
        models = MODELS
            .iter()
            .map(|&(id, label)| ToldModel {
                id: id.to_string(),
                label: label.to_string(),
                efforts: Vec::new(),
                default_effort: None,
                images: false,
                default: false,
                provider: None,
                multiplier: None,
                price: tier(id),
            })
            .collect();
    }
    if let Some(first) = models.first_mut() {
        first.default = true;
    }
    Some(models)
}

/// The answer « Pour cette session » to the permission `data` (`permission.requested`): what it is
/// remembered for, by its kind. Never `approve-permanently` nor `approve-for-location`, which write
/// a rule of their own in Copilot's config (decided by the user on 2026-10-18).
pub(crate) fn session_approval(data: &Value) -> Value {
    let r = &data["permissionRequest"];
    let approval = match r["kind"].as_str().unwrap_or_default() {
        "shell" => {
            let ids: Vec<Value> = r["commands"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|c| c["identifier"].as_str().map(|s| json!(s)))
                .collect();
            json!({ "kind": "commands", "commandIdentifiers": ids })
        }
        "read" => json!({ "kind": "read" }),
        "write" => json!({ "kind": "write" }),
        "mcp" => json!({ "kind": "mcp", "serverName": r["serverName"], "toolName": r["toolName"] }),
        "url" => {
            let host = r["url"]
                .as_str()
                .and_then(|u| reqwest::Url::parse(u).ok())
                .and_then(|u| u.host_str().map(str::to_string));
            return match host {
                Some(domain) => json!({ "kind": "approve-for-session", "domain": domain }),
                None => json!({ "kind": "approve-once" }),
            };
        }
        _ => return json!({ "kind": "approve-once" }),
    };
    json!({ "kind": "approve-for-session", "approval": approval })
}

/// The values of a form (`elicitation.requested`) from its card: each field's answer (by the
/// question the card made of it, `input.questions[].id` its field), as its schema types it.
pub(crate) fn form_content(schema: &Value, input: &Value) -> Value {
    let props = &schema["properties"];
    let mut out = Map::new();
    for q in input["questions"].as_array().into_iter().flatten() {
        let (Some(field), Some(text)) = (q["id"].as_str(), q["question"].as_str()) else {
            continue;
        };
        let Some(answer) = input["answers"][text].as_str().map(str::trim) else {
            continue;
        };
        if answer.is_empty() {
            continue;
        }
        let value = match props[field]["type"].as_str() {
            Some("number") => answer
                .replace(',', ".")
                .parse::<f64>()
                .ok()
                .and_then(serde_json::Number::from_f64)
                .map(Value::Number),
            Some("integer") => answer.parse::<i64>().ok().map(Value::from),
            Some("boolean") => Some(json!(is_yes(answer))),
            Some("array") => Some(json!(answer
                .split(", ")
                .map(str::to_string)
                .collect::<Vec<_>>())),
            _ => None,
        }
        .unwrap_or_else(|| json!(answer));
        out.insert(field.to_string(), value);
    }
    Value::Object(out)
}

/// Whether the answer to a field yes or no says yes, in either language.
pub(crate) fn is_yes(answer: &str) -> bool {
    [Lang::Fr, Lang::En].iter().any(|l| answer == yes(*l)) || answer.eq_ignore_ascii_case("true")
}

pub(crate) fn yes(lang: Lang) -> String {
    tr_in!(lang, "Oui", "Yes")
}

pub(crate) fn no(lang: Lang) -> String {
    tr_in!(lang, "Non", "No")
}

/// Refused: the protocol of its server is not the one Escouade speaks.
fn protocol_refused(lang: Lang, version: &Value) -> String {
    tr_in!(
        lang,
        "Copilot CLI parle le protocole {version}, Escouade le protocole {ours} : mets Copilot CLI à jour (npm install -g @github/copilot@latest).",
        "Copilot CLI speaks protocol {version}, Escouade protocol {ours}: update Copilot CLI (npm install -g @github/copilot@latest).",
        ours = process::PROTOCOL
    )
}

/// Refused: no account is signed in to Copilot.
fn not_signed_in(lang: Lang) -> String {
    tr_in!(
        lang,
        "Copilot CLI n’est connecté à aucun compte GitHub : connecte-toi avec copilot login.",
        "Copilot CLI isn’t signed in to any GitHub account: sign in with copilot login."
    )
}

/// A message to Copilot: its text, the images joined to it (`blob`), the text files joined to it as
/// text. A PDF is refused.
fn message(text: &str, attachments: &[Attachment]) -> Result<Value> {
    let mut blobs = Vec::new();
    let mut texts = Vec::new();
    let mut total = 0;
    for a in attachments {
        total += a.data.len() / 4 * 3;
        match a.media_type.as_str() {
            t if t.starts_with("image/") => {
                if a.data.len() / 4 * 3 > MAX_IMAGE {
                    let lang = i18n::ui();
                    bail!(tr_in!(
                        lang,
                        "{name} dépasse {max}",
                        "{name} is over {max}",
                        name = a.name,
                        max = size_label(lang, MAX_IMAGE)
                    ));
                }
                blobs.push(json!({
                    "type": "blob", "data": a.data, "mimeType": t, "displayName": a.name,
                }));
            }
            "text/plain" => texts.push(format!("{}:\n\n{}", a.name, a.data)),
            t => bail!(tr!(
                "« {name} » ({t}) ne peut pas être joint : Copilot lit les images et les fichiers texte, pas les PDF ni les autres fichiers.",
                "“{name}” ({t}) can’t be attached: Copilot reads images and text files, not PDFs nor other files.",
                name = a.name
            )),
        }
    }
    if total > MAX_TOTAL {
        let lang = i18n::ui();
        bail!(tr_in!(
            lang,
            "Les fichiers joints à un message sont limités à {max} en tout.",
            "The files attached to a message are limited to {max} in all.",
            max = size_label(lang, MAX_TOTAL)
        ));
    }
    texts.push(text.to_string());
    let prompt = texts
        .into_iter()
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let mut m = json!({ "prompt": prompt });
    if !blobs.is_empty() {
        m["attachments"] = Value::Array(blobs);
    }
    Ok(m)
}

fn not_yet() -> String {
    tr!(
        "Copilot ne le fait pas encore dans Escouade",
        "Copilot doesn’t do it in Escouade yet"
    )
}

impl Engine for Copilot {
    fn id(&self) -> EngineId {
        EngineId::Copilot
    }

    fn name(&self) -> &'static str {
        "Copilot CLI"
    }

    fn speaker(&self) -> &'static str {
        "Copilot"
    }

    /// `systemMessage` of the session: no command line to fit in.
    fn instructions_room(&self) -> Option<Room> {
        None
    }

    /// A subagent of Copilot (its `task` tool) takes no message once it runs.
    fn subagent_relay(&self, _: Lang, _: &str, _: &str, _: &str) -> Option<String> {
        None
    }

    fn locate(&self, configured: &str, _wsl_distro: &str) -> Option<Program> {
        locate::find(configured)
    }

    fn tested(&self) -> Tested {
        TESTED
    }

    fn oldest_reason(&self, lang: Lang) -> String {
        tr_in!(
            lang,
            "son serveur n’a été vérifié qu’à partir de celle-ci (docs/PROTOCOL.md)",
            "its server was only checked from that one on (docs/PROTOCOL.md)"
        )
    }

    fn update_command(&self) -> &'static str {
        "npm install -g @github/copilot@latest"
    }

    fn version_args(&self) -> &'static [&'static str] {
        &["--version"]
    }

    fn caps(&self) -> EngineCaps {
        caps()
    }

    fn accounts(&self) -> super::registry::AccountStore {
        super::registry::AccountStore::ConfigDir {
            var: "COPILOT_HOME",
        }
    }

    fn terminal(&self) -> Option<&'static dyn super::TerminalView> {
        Some(&terminal::COPILOT_TERMINAL)
    }

    fn install(&self) -> Install {
        INSTALL
    }

    fn models(&self) -> Vec<ModelDecl> {
        MODELS
            .iter()
            .map(|&(id, label)| ModelDecl {
                id,
                label,
                effort: true,
                auto: true,
            })
            .collect()
    }

    fn efforts(&self) -> &'static [&'static str] {
        &EFFORTS
    }

    fn supports_effort(&self, _model: &str) -> bool {
        true
    }

    fn supports_auto(&self, _model: &str) -> bool {
        true
    }

    /// `tokenLimit` of `session.usage_info` on its real run (`gpt-6-luna`).
    fn context_window(&self, _model: &str) -> u64 {
        272_000
    }

    fn spawn(
        &self,
        spawn: Spawn,
        on_frame: super::OnFrame,
        on_exit: super::OnExit,
    ) -> Result<Process> {
        let args = args();
        log::info!(
            "{}: starting {} {} in {} (account {})",
            spawn.label,
            spawn.program.describe(),
            args.join(" "),
            spawn.cwd,
            spawn.account
        );
        let settings = Settings {
            model: spawn.model.clone(),
            effort: spawn.effort.clone(),
            mode: spawn.mode.clone(),
        };
        let instructions = spawn.append_prompt.clone().filter(|p| !p.trim().is_empty());
        let opts = process::Opts {
            program: spawn.program,
            cwd: spawn.cwd,
            args,
            env: spawn.env,
            start: spawn.start,
            settings,
            instructions,
        };
        let p: Process = CopilotProcess::spawn(opts, on_frame, on_exit)?;
        Ok(p)
    }

    fn message(&self, text: &str, attachments: &[Attachment]) -> Result<Message> {
        message(text, attachments).map(Message)
    }

    fn translate(&self, rt: &mut AgentRt, frame: &Value, fx: &mut Effects) {
        rt.copilot_frame(frame, fx);
    }

    /// A session that cannot be resumed is told by `session.resume`: a new one is opened.
    fn start_lost(&self, _stderr: &str) -> Option<StartLost> {
        None
    }

    /// The texts written by a model come with ESC-40 (`copilot -p`).
    fn one_shot<'a>(&'a self, _ask: OneShot<'a>) -> BoxFuture<'a, Result<String>> {
        Box::pin(async move { bail!(not_yet()) })
    }

    fn writer(&self, _weight: Weight) -> &'static str {
        "Copilot"
    }

    fn grant_file(&self, _url: &str, _token: &str) -> Option<Vec<u8>> {
        None
    }

    fn refusal(&self) -> Option<Value> {
        None
    }

    /// Kept out for now: an entry of the user's is turned off for the session (`process`); ESC-40
    /// gives it.
    fn escouade_launch(&self, _escouade: &Escouade) -> mcp::Launch {
        mcp::Launch::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recorded(file: &str) -> Vec<Value> {
        bench::recorded(file)
    }

    #[test]
    fn each_mode_of_escouade_has_its_permissions_and_agent_mode_in_copilot() {
        assert_eq!(permission_mode("bypassPermissions"), "allow-all");
        for mode in ["default", "plan", "acceptEdits", "auto"] {
            assert_eq!(permission_mode(mode), "manual", "{mode}");
        }
        assert_eq!(agent_mode("plan"), "plan");
        assert_eq!(agent_mode("auto"), "autopilot");
        assert_eq!(agent_mode("acceptEdits"), "interactive");
        assert_eq!(agent_mode("default"), "interactive");
        for mode in MODES {
            let (fr, en) = (meaning(Lang::Fr, mode), meaning(Lang::En, mode));
            assert!(!fr.is_empty() && !en.is_empty() && fr != en, "{mode}");
            assert!(
                fr.contains("bac à sable") && en.contains("sandbox"),
                "{mode}"
            );
        }
        assert_eq!(caps().modes.len(), 5);
    }

    #[test]
    fn the_server_has_no_builtin_mcp_nor_temporary_folder_and_hides_the_tokens() {
        let a = args();
        for flag in [
            "--server",
            "--stdio",
            "--no-auto-update",
            "--disable-builtin-mcps",
            "--disallow-temp-dir",
        ] {
            assert!(a.iter().any(|x| x == flag), "{flag}");
        }
        assert!(a
            .iter()
            .any(|x| x.starts_with("--secret-env-vars=") && x.contains("GH_TOKEN")));
        assert!(!a.iter().any(|x| x == "--experimental"), "no assisted mode");
    }

    #[test]
    fn a_free_account_lists_no_model_and_the_menu_keeps_its_own_with_their_price() {
        let list = recorded("first-turn.jsonl")
            .into_iter()
            .find(|m| m["result"]["modelPriceCategories"].is_array())
            .expect("the answer to session.model.list");
        let models = catalog(Some(&json!({ "models": [] })), Some(&list["result"])).unwrap();
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, ["gpt-6-luna", "gpt-5-mini"]);
        assert_eq!(models[0].price.as_deref(), Some("low"));
        assert!(models[0].default && !models[1].default);
        assert!(models.iter().all(|m| m.id != "auto"));
    }

    #[test]
    fn a_listed_model_says_its_multiplier_efforts_and_images() {
        let listed = json!({ "models": [
            { "id": "claude-sonnet-4.5", "name": "Claude Sonnet 4.5",
              "capabilities": { "supports": { "vision": true } },
              "billing": { "multiplier": 3 },
              "supportedReasoningEfforts": ["low", "medium", "high"], "defaultReasoningEffort": "medium" },
            { "id": "gpt-5-mini", "name": "GPT-5 mini", "billing": { "multiplier": 0.33 } },
            { "id": "o9", "name": "O9", "policy": { "state": "disabled" } },
        ] });
        let models = catalog(Some(&listed), None).unwrap();
        assert_eq!(models.len(), 2, "the disabled one left out");
        let sonnet = &models[0];
        assert_eq!(sonnet.multiplier.as_deref(), Some("3"));
        assert_eq!(sonnet.efforts, ["low", "medium", "high"]);
        assert_eq!(sonnet.default_effort.as_deref(), Some("medium"));
        assert!(sonnet.images && sonnet.default);
        assert_eq!(models[1].multiplier.as_deref(), Some("0.33"));
    }

    #[test]
    fn for_this_session_remembers_each_kind_and_never_writes_a_rule_of_copilots() {
        let of = |r: Value| session_approval(&json!({ "permissionRequest": r }));
        let shell = of(json!({ "kind": "shell", "commands": [{ "identifier": "npm test" }] }));
        assert_eq!(shell["kind"], "approve-for-session");
        assert_eq!(shell["approval"]["commandIdentifiers"], json!(["npm test"]));
        assert_eq!(of(json!({ "kind": "write" }))["approval"]["kind"], "write");
        assert_eq!(of(json!({ "kind": "read" }))["approval"]["kind"], "read");
        let mcp = of(json!({ "kind": "mcp", "serverName": "essai", "toolName": "ping" }));
        assert_eq!(mcp["approval"]["serverName"], "essai");
        assert_eq!(
            of(json!({ "kind": "url", "url": "https://example.com/a" }))["domain"],
            "example.com"
        );
        for kind in ["shell", "write", "read", "mcp", "url", "memory"] {
            let a = of(json!({ "kind": kind, "url": "https://x.y" }));
            let s = a.to_string();
            assert!(
                !s.contains("approve-permanently") && !s.contains("approve-for-location"),
                "{s}"
            );
        }
    }

    #[test]
    fn a_forms_answers_are_typed_as_its_schema_says() {
        let schema = json!({ "type": "object", "properties": {
            "prenom": { "type": "string", "title": "Prénom" },
            "age": { "type": "number", "title": "Âge" },
            "n": { "type": "integer" },
            "ok": { "type": "boolean" },
            "vide": { "type": "string" },
        } });
        let input = json!({
            "questions": [
                { "id": "prenom", "question": "Prénom" }, { "id": "age", "question": "Âge" },
                { "id": "n", "question": "n" }, { "id": "ok", "question": "ok" },
                { "id": "vide", "question": "vide" },
            ],
            "answers": { "Prénom": "Camille", "Âge": "30,5", "n": "4", "ok": "Oui", "vide": "" },
        });
        assert_eq!(
            form_content(&schema, &input),
            json!({ "prenom": "Camille", "age": 30.5, "n": 4, "ok": true })
        );
    }

    #[test]
    fn a_message_takes_its_images_and_text_files_and_refuses_a_pdf() {
        let file = |name: &str, media: &str, data: &str| Attachment {
            name: name.into(),
            media_type: media.into(),
            data: data.into(),
        };
        let m = message(
            "Regarde",
            &[
                file("a.png", "image/png", "iVBORw0KGgo="),
                file("notes.txt", "text/plain", "bonjour"),
            ],
        )
        .unwrap();
        assert_eq!(m["prompt"], "notes.txt:\n\nbonjour\n\nRegarde");
        assert_eq!(m["attachments"][0]["type"], "blob");
        assert_eq!(m["attachments"][0]["mimeType"], "image/png");
        assert!(message("x", &[file("a.pdf", "application/pdf", "JVBERi0=")]).is_err());
        assert_eq!(
            message("bonjour", &[]).unwrap(),
            json!({ "prompt": "bonjour" })
        );
    }
}
