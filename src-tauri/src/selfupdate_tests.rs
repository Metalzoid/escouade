use super::*;
use serde_json::json;
use std::collections::HashMap;

fn vars(set: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let map: HashMap<String, String> = set
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    move |k: &str| map.get(k).cloned()
}

#[test]
fn the_users_own_choice_to_turn_claude_codes_update_off_is_read_as_claude_code_reads_it() {
    let none = vars(&[]);
    assert_eq!(user_off(&none, None, None), None);
    // In the environment Escouade was started with, truthy as Claude Code reads it.
    for (name, value) in [
        ("DISABLE_AUTOUPDATER", "1"),
        ("DISABLE_AUTOUPDATER", "true"),
        ("DISABLE_UPDATES", "yes"),
    ] {
        assert_eq!(
            user_off(&vars(&[(name, value)]), None, None).as_deref(),
            Some(name)
        );
    }
    assert_eq!(
        user_off(&vars(&[("DISABLE_AUTOUPDATER", "0")]), None, None),
        None
    );
    // Any value of this one, `0` included.
    assert_eq!(
        user_off(
            &vars(&[("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "0")]),
            None,
            None
        )
        .as_deref(),
        Some("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC")
    );
    // In the `env` of its settings.json (as Claude Code's own migration writes it).
    let settings = json!({ "env": { "DISABLE_AUTOUPDATER": "1" } });
    assert_eq!(
        user_off(&none, Some(&settings), None).as_deref(),
        Some("DISABLE_AUTOUPDATER")
    );
    assert_eq!(
        user_off(&none, Some(&json!({ "env": { "OTHER": "1" } })), None),
        None
    );
    // `autoUpdates: false` of its .claude.json, unless a native installation wrote it itself.
    let off = json!({ "autoUpdates": false, "installMethod": "npm-global" });
    assert_eq!(
        user_off(&none, None, Some(&off)).as_deref(),
        Some("autoUpdates: false")
    );
    let native = json!({ "autoUpdates": false, "installMethod": "native",
                         "autoUpdatesProtectedForNative": true });
    assert_eq!(user_off(&none, None, Some(&native)), None);
    assert_eq!(
        user_off(&none, None, Some(&json!({ "autoUpdates": true }))),
        None
    );
}

#[test]
fn what_claude_update_says_is_read() {
    let updated = outcome(
        true,
        Some(0),
        "Current version: 2.1.300\nChecking for updates...\n\x1b[32mSuccessfully updated from 2.1.300 to version 2.1.302\x1b[39m\n",
    );
    assert_eq!(
        (
            updated.state,
            updated.from.as_deref(),
            updated.version.as_deref()
        ),
        (State::Updated, Some("2.1.300"), Some("2.1.302"))
    );
    let same = outcome(true, Some(0), "Claude Code is up to date (2.1.302)\n");
    assert_eq!(
        (same.state, same.version.as_deref()),
        (State::UpToDate, Some("2.1.302"))
    );
    // Homebrew, WinGet: no version said (read afterwards).
    let brew = outcome(true, Some(0), "Claude is up to date!\n");
    assert_eq!((brew.state, brew.version), (State::UpToDate, None));
    // An error in a line: its last.
    let failed = outcome(
        false,
        Some(1),
        "Checking for updates...\nError: EACCES: permission denied, rename '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code'\n\n",
    );
    assert_eq!(failed.state, State::Failed);
    assert_eq!(
        failed.line.as_deref(),
        Some("Error: EACCES: permission denied, rename '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code'")
    );
    let silent = outcome(false, Some(3), "");
    assert_eq!(
        (silent.state, silent.line.as_deref()),
        (State::Failed, Some("exit code 3"))
    );
}

/// What the fake `claude update` wrote to `log`.
fn update_log(log: &Path) -> Vec<Value> {
    std::fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

const HELPER_LOG: &str = "ESCOUADE_TEST_UPDATE_LOG";
const HELPER_OUT: &str = "ESCOUADE_TEST_UPDATE_OUT";

/// Run by `an_update_started_apart_outlives_escouade`: plays Escouade, which starts
/// `claude update` apart, then is killed as an app's tree is.
#[test]
#[ignore]
fn update_helper() {
    let (Ok(log), Ok(out)) = (std::env::var(HELPER_LOG), std::env::var(HELPER_OUT)) else {
        return;
    };
    let program = Program::Native(PathBuf::from(crate::core_tests::fake_cli()));
    let env = vec![
        ("FAKE_CLAUDE_UPDATE_LOG".to_string(), log),
        ("FAKE_CLAUDE_UPDATE_MS".to_string(), "2500".to_string()),
    ];
    let cwd = std::env::temp_dir();
    let launch = program
        .launch(&cwd.to_string_lossy(), &["update".to_string()], &env)
        .unwrap();
    let mut child = spawn_apart(&launch, &cwd, Path::new(&out)).unwrap();
    println!("update pid {}", child.id());
    // Escouade waits for it, as `update` does; it is killed meanwhile.
    let _ = child.wait();
}

#[test]
fn an_update_started_apart_outlives_escouade_killed() {
    let dir = crate::paths::test_dir("selfupdate-apart");
    let log = dir.join("update.jsonl");
    let out = dir.join("claude-update.log");
    let mut cmd = std::process::Command::new(std::env::current_exe().unwrap());
    cmd.args(["--exact", "selfupdate::tests::update_helper", "--ignored"])
        .env(HELPER_LOG, &log)
        .env(HELPER_OUT, &out)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    // Nothing of nextest's handed down to the helper, then to the update, which outlives it.
    #[cfg(windows)]
    let kept = crate::test_tmp::KeptHere::std_handles();
    let mut app = cmd.spawn().unwrap();
    #[cfg(windows)]
    drop(kept);
    let start = Instant::now();
    while !update_log(&log).iter().any(|l| l["started"] == json!(true)) {
        assert!(
            start.elapsed() < Duration::from_secs(30),
            "the update never started"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
    // Escouade killed (on Unix with its whole process group, as a stopped agent's is): the
    // update goes on.
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", "--", &format!("-{}", app.id())])
            .status();
    }
    let _ = app.kill();
    let _ = app.wait();
    assert!(!update_log(&log).iter().any(|l| l["done"] == json!(true)));
    while !update_log(&log).iter().any(|l| l["done"] == json!(true)) {
        assert!(
            start.elapsed() < Duration::from_secs(30),
            "the update was cut: {:?}",
            update_log(&log)
        );
        std::thread::sleep(Duration::from_millis(100));
    }
    // Its output went to its file, not to a pipe that died with the app.
    let start = Instant::now();
    while !std::fs::read_to_string(&out)
        .unwrap_or_default()
        .contains("up to date")
    {
        assert!(start.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(50));
    }
    // Its end, which holds what it inherited of the test's (nextest would call it leaky).
    std::thread::sleep(Duration::from_secs(1));
}

#[tokio::test]
async fn escouade_runs_claude_update_unless_switched_off_and_says_what_it_said() {
    let dir = crate::paths::test_dir("selfupdate-run");
    let mut settings = Settings {
        claude_path: crate::core_tests::fake_cli(),
        claude_self_update: false,
        ..Default::default()
    };
    // Off: not run, and said so.
    run_once(&settings, &dir).await;
    assert!(!dir.join("claude-update.log").exists());
    assert_eq!(status(&settings).state, State::Off);
    // On: run, what it said kept, its version told.
    settings.claude_self_update = true;
    run_once(&settings, &dir).await;
    let s = status(&settings);
    assert_eq!(
        (s.state, s.version.as_deref()),
        (State::UpToDate, Some("2.1.301"))
    );
    assert!(s.at.is_some());
    assert!(std::fs::read_to_string(dir.join("claude-update.log"))
        .unwrap()
        .contains("up to date"));
    // Not found: said, with what to do.
    settings.claude_path = dir.join("nowhere").to_string_lossy().into_owned();
    run_once(&settings, &dir).await;
    let s = status(&settings);
    assert_eq!(s.state, State::Missing);
    assert!(s
        .line
        .unwrap()
        .contains("npm install -g @anthropic-ai/claude-code"));
}
