//! The tests' fake `codex` as a program (`tests/fixtures/fake-codex.mjs`, run with node), its
//! arguments passed on as they came. Under Windows, its `.cmd` cannot start Codex's interface:
//! cmd.exe reads the `<` of `-c hooks.state={"C:\<session-flags>\…"…}` as a redirection, where the
//! real `codex.exe` takes it as it is. `cargo test` builds it (`target/<profile>/examples`).

use std::path::Path;
use std::process::Command;

fn main() {
    let script = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("fake-codex.mjs");
    let status = Command::new("node")
        .arg(script)
        .args(std::env::args_os().skip(1))
        .status();
    std::process::exit(match status {
        Ok(s) => s.code().unwrap_or(1),
        Err(e) => {
            eprintln!("fake codex: node not started: {e}");
            127
        }
    });
}
