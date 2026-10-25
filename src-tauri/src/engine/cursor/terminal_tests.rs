use super::*;
use crate::engine::terminal::HookServer;
use crate::engine::{Escouade, Program};
use crate::model::AgentMeta;

fn launch_of(meta: &AgentMeta, session: Option<&str>) -> TerminalArgs {
    let access = Escouade::Denied { file: None };
    CURSOR_TERMINAL.launch(&TerminalLaunch {
        meta,
        session,
        remote: None,
        private_file: Path::new("/data/tui/a1.json"),
        hooks: HookServer {
            url: "http://127.0.0.1:4120/hook",
            token_var: "ESCOUADE_HOOK_TOKEN",
            url_var: "ESCOUADE_HOOK_URL",
            command: Some(Path::new("/opt/escouade/escouade-hook")),
        },
        access: &access,
        fence: &crate::fence::Fence::default(),
        program: &Program::Native(PathBuf::new()),
    })
}

fn pair(a: &[String], k: &str) -> Option<String> {
    a.windows(2).find(|w| w[0] == k).map(|w| w[1].clone())
}

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("escouade-{name}-{}", crate::model::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn a_session_is_resumed_by_its_id_with_the_agents_model_and_mode_and_no_update() {
    let meta = AgentMeta {
        session_id: Some("s1".into()),
        model: "claude-opus-5-5[context=300k,effort=medium,fast=false]".into(),
        mode: "plan".into(),
        ..Default::default()
    };
    let a = launch_of(&meta, None).args;
    assert_eq!(a[0], "--disable-auto-update");
    assert_eq!(pair(&a, "--resume").as_deref(), Some("s1"));
    // By its id, its options left to the account.
    assert_eq!(pair(&a, "--model").as_deref(), Some("claude-opus-5-5"));
    assert_eq!(pair(&a, "--mode").as_deref(), Some("plan"));
    assert!(!a.iter().any(|x| x == "--force"));
    // No hook: no plugin, nor any of Escouade's hooks in its environment.
    assert!(!a.iter().any(|x| x == "--plugin-dir"), "{a:?}");
}

#[test]
fn a_new_agent_on_auto_in_everything_accepted_starts_the_session_escouade_names() {
    let meta = AgentMeta {
        model: AUTO.into(),
        mode: "bypassPermissions".into(),
        ..Default::default()
    };
    let args = launch_of(&meta, Some("u-1"));
    assert_eq!(pair(&args.args, "--resume").as_deref(), Some("u-1"));
    assert_eq!(pair(&args.args, "--model").as_deref(), Some("auto"));
    assert!(args.args.iter().any(|x| x == "--force"));
    assert!(args.file.is_none() && args.files.is_empty());
    assert_eq!(args.env.len(), 1);
    assert_eq!(args.env[0].0, PROJECTS_VAR);
    // « Demander » and « Accepter les modifications »: its own way of asking, no option.
    for mode in ["default", "acceptEdits"] {
        let meta = AgentMeta {
            mode: mode.into(),
            ..Default::default()
        };
        let a = launch_of(&meta, Some("u-1")).args;
        assert!(!a.iter().any(|x| x == "--force" || x == "--mode"), "{a:?}");
        assert!(
            !a.iter().any(|x| x == "--model"),
            "no model, none given: {a:?}"
        );
    }
    assert!(CURSOR_TERMINAL.names_its_session());
    assert!(CURSOR_TERMINAL.resumes_any());
    assert!(!CURSOR_TERMINAL.says_session_lost(b"anything"));
}

#[test]
fn its_shell_is_never_git_bash_and_no_folder_is_added_to_its_workspace() {
    let masked = CURSOR_TERMINAL.masked_env(&[]);
    assert_eq!(
        masked,
        [
            ("MSYSTEM".to_string(), String::new()),
            ("EXEPATH".to_string(), String::new())
        ]
    );
    assert!(CURSOR_TERMINAL
        .read_dir_args(Path::new("C:/data/files/a1"))
        .is_empty());
}

#[test]
fn a_folder_is_named_as_cursor_names_it_in_its_projects() {
    // As Cursor CLI 2026.10.22 named them (~/.cursor/projects, ESC-24 and ESC-49).
    assert_eq!(
        project_key(r"C:\Users\user\AppData\Local\Temp\esc24\wt-agent1"),
        "C-Users-user-AppData-Local-Temp-esc24-wt-agent1"
    );
    assert_eq!(
        project_key("/home/u/dev/my.app/.claude/worktrees/x_1/"),
        "home-u-dev-my-app-claude-worktrees-x-1"
    );
}

#[test]
fn its_transcript_is_found_in_any_workspace_once_written_and_its_trust_by_its_file() {
    let projects = temp("cursor-projects");
    let cwd = r"C:\work\repo";
    assert!(asks_trust(&projects, cwd));
    let dir = projects.join(project_key(cwd));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(".workspace-trusted"), "{}").unwrap();
    assert!(!asks_trust(&projects, cwd));
    assert!(asks_trust(&projects, r"C:\work\other"));

    assert_eq!(find_transcript(&projects, "s1"), None);
    let file = dir.join("agent-transcripts").join("s1").join("s1.jsonl");
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    std::fs::write(&file, "{}\n").unwrap();
    assert_eq!(find_transcript(&projects, "s1"), Some(file));
    // Never a path for a session.
    assert_eq!(find_transcript(&projects, "../s1"), None);
    assert_eq!(find_transcript(&projects, ""), None);
}

#[test]
fn the_relay_is_a_rule_always_applied_in_the_agents_folder() {
    let path = CURSOR_TERMINAL.relay_path(Path::new("C:/work/wt")).unwrap();
    assert_eq!(
        path,
        Path::new("C:/work/wt")
            .join(".cursor")
            .join("rules")
            .join("escouade-relais.mdc")
    );
    let file = String::from_utf8(CURSOR_TERMINAL.relay_file("  # Avant\n\nUn mot.\n")).unwrap();
    assert!(file.starts_with("---\n"), "{file}");
    assert!(
        file.contains("\nalwaysApply: true\n---\n\n# Avant\n\nUn mot.\n"),
        "{file}"
    );
}

#[test]
fn a_message_waits_while_it_may_be_on_its_question_about_the_folder() {
    // `paste_refusal` reads `projects_dir`: in the unit tests a folder of no workspace's.
    let cwd = temp("cursor-untrusted").to_string_lossy().into_owned();
    let refused = CURSOR_TERMINAL.paste_refusal(Path::new("."), &cwd, false);
    assert!(refused.is_some_and(|r| r.contains("Cursor")));
    // Past it (it wrote in its transcript since it started): nothing is refused.
    assert!(CURSOR_TERMINAL
        .paste_refusal(Path::new("."), &cwd, true)
        .is_none());
}
