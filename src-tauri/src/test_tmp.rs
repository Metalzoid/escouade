//! The temporary folder of the tests: each test process (nextest starts one per test) has its own,
//! `<system temp>/escouade-tests/<pid>`, made before `main` and given as `TMP`, `TEMP` and
//! `TMPDIR`: whatever a test writes in the temporary folder (`test_dir`, the fake CLIs' logs, the
//! processes it starts) goes there. A process holds a lock on its folder's `.held` while it runs;
//! one reaper per suite (this binary, run on `reaper` alone) removes the folders whose lock was
//! let go of, the process gone, killed or not, then the root once no test has run for a while.
//! What a reaper killed before its end left is removed by the next one.

use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime};

/// Set for the reaper's process: the root it watches.
const REAPER: &str = "ESCOUADE_TESTS_REAPER";
/// The file of a folder its process holds a lock on.
const HELD: &str = ".held";
/// The root's file the running reaper holds a lock on.
const REAPER_LOCK: &str = "reaper.lock";
/// The reaper ends after this long without any test process, everything removed (nextest waits
/// a second before it tries a failed test again).
const QUIET: Duration = Duration::from_secs(5);
/// It ends after this long without any test process, whatever it could not remove (a child of a
/// test that still runs there): the next suite's reaper removes it.
const GIVE_UP: Duration = Duration::from_secs(60);
/// An empty folder is a process's just starting (its `.held` not made yet), for this long.
const STARTING: Duration = Duration::from_secs(5);

/// The lock this process holds on its folder, until it ends.
static HOLD: std::sync::OnceLock<File> = std::sync::OnceLock::new();

// SAFETY: run before `main`, on one thread; it only touches the files and the environment of this
// process, and starts a process.
#[ctor::ctor(unsafe)]
fn own_temporary_folder() {
    if std::env::var_os(REAPER).is_some() {
        return;
    }
    let root = std::env::temp_dir().join("escouade-tests");
    let Some(dir) = hold(&root) else { return };
    for k in ["TMP", "TEMP", "TMPDIR"] {
        // Edition 2021: safe; before `main`, nothing else runs.
        std::env::set_var(k, &dir);
    }
    start_reaper(&root);
}

/// This process's folder in `root`, made empty, and its lock held: none if it could not be.
fn hold(root: &Path) -> Option<PathBuf> {
    let dir = root.join(std::process::id().to_string());
    // An earlier process of the same id (Windows reuses them) left it: it is gone.
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).ok()?;
    let held = File::create(dir.join(HELD)).ok()?;
    held.try_lock().ok()?;
    HOLD.set(held).ok()?;
    Some(dir)
}

/// Starts the reaper of `root` unless one runs. It is its own process group (a Ctrl+C that stops
/// the suite does not stop it), outside nextest's job (Windows), its output nowhere: no test
/// waits for it.
fn start_reaper(root: &Path) {
    let free = File::create(root.join(REAPER_LOCK)).is_ok_and(|f| f.try_lock().is_ok());
    if !free {
        return;
    }
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let mut cmd = Command::new(exe);
    cmd.args([
        "--exact",
        "test_tmp::reaper",
        "--ignored",
        "--test-threads=1",
    ])
    .env(REAPER, root)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
        let flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP;
        // Its output is nowhere, but a process started here inherits every handle that may be:
        // those of nextest's pipes would keep them open after the test, which it would then call
        // leaky.
        let _kept = KeptHere::std_handles();
        // A job that does not allow it to leave refuses the start: then it stays in it.
        if cmd
            .creation_flags(flags | CREATE_BREAKAWAY_FROM_JOB)
            .spawn()
            .is_ok()
        {
            return;
        }
        cmd.creation_flags(flags);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let _ = cmd.spawn();
}

/// The handles this process may hand down that it keeps to itself for a while, until dropped.
#[cfg(windows)]
pub(crate) struct KeptHere(Vec<windows_sys::Win32::Foundation::HANDLE>);

#[cfg(windows)]
impl KeptHere {
    pub(crate) fn std_handles() -> Self {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::{
            GetHandleInformation, SetHandleInformation, HANDLE_FLAG_INHERIT,
        };
        let mut kept = Vec::new();
        for h in [
            std::io::stdin().as_raw_handle(),
            std::io::stdout().as_raw_handle(),
            std::io::stderr().as_raw_handle(),
        ] {
            let mut flags = 0;
            // SAFETY: the process's own standard handles, which stay open.
            unsafe {
                if GetHandleInformation(h, &mut flags) != 0
                    && flags & HANDLE_FLAG_INHERIT != 0
                    && SetHandleInformation(h, HANDLE_FLAG_INHERIT, 0) != 0
                {
                    kept.push(h);
                }
            }
        }
        KeptHere(kept)
    }
}

#[cfg(windows)]
impl Drop for KeptHere {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::{SetHandleInformation, HANDLE_FLAG_INHERIT};
        for h in &self.0 {
            // SAFETY: as above.
            unsafe { SetHandleInformation(*h, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) };
        }
    }
}

/// The reaper: started by the tests, it does nothing in a suite (`cargo test -- --ignored`).
#[test]
#[ignore = "the reaper of the tests' temporary folders, started by them"]
fn reaper() {
    if let Some(root) = std::env::var_os(REAPER) {
        reap(Path::new(&root));
    }
}

/// Removes the folders of `root` whose process is gone, until no test has run for `QUIET` and
/// all of them are gone (for `GIVE_UP` at most), then `root` itself if it is empty.
fn reap(root: &Path) {
    let Ok(lock) = File::create(root.join(REAPER_LOCK)) else {
        return;
    };
    if lock.try_lock().is_err() {
        return;
    }
    let mut quiet = Duration::ZERO;
    let every = Duration::from_millis(500);
    loop {
        std::thread::sleep(every);
        let (held, left) = sweep(root);
        quiet = if held == 0 {
            quiet + every
        } else {
            Duration::ZERO
        };
        if (left == 0 && quiet >= QUIET) || quiet >= GIVE_UP {
            break;
        }
    }
    drop(lock);
    let _ = std::fs::remove_file(root.join(REAPER_LOCK));
    let _ = std::fs::remove_dir(root);
}

/// Removes the folders of `root` whose process is gone: how many are still held, and how many of
/// the others could not go (a child of a test, killed late, still has a file open there: tried
/// again next time).
fn sweep(root: &Path) -> (usize, usize) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return (0, 0);
    };
    let (mut held, mut left) = (0, 0);
    for e in entries.flatten() {
        let dir = e.path();
        if !dir.is_dir() {
            continue;
        }
        if is_held(&dir) {
            held += 1;
        } else if std::fs::remove_dir_all(&dir).is_err() && dir.exists() {
            left += 1;
        }
    }
    (held, left)
}

/// Whether the process of `dir` still runs: it holds the lock of its `.held`, or is just making
/// it (its folder is empty, and new). One whose `.held` went with part of the folder is gone.
fn is_held(dir: &Path) -> bool {
    match OpenOptions::new().write(true).open(dir.join(HELD)) {
        // The lock taken here is let go of as `f` is dropped, before `dir` is removed.
        Ok(f) => f.try_lock().is_err(),
        Err(_) => {
            let empty = std::fs::read_dir(dir).is_ok_and(|mut d| d.next().is_none());
            let new = std::fs::metadata(dir)
                .and_then(|m| m.modified())
                .is_ok_and(|t| {
                    SystemTime::now()
                        .duration_since(t)
                        .is_ok_and(|age| age < STARTING)
                });
            empty && new
        }
    }
}

#[test]
fn a_test_writes_in_its_own_folder_and_the_reaper_removes_those_let_go_of() {
    let tmp = std::env::temp_dir();
    assert_eq!(tmp.parent().unwrap().file_name().unwrap(), "escouade-tests");
    assert_eq!(
        tmp.file_name().unwrap().to_string_lossy(),
        std::process::id().to_string()
    );
    assert!(is_held(&tmp));

    // A root of its own: a folder held, one let go of, one just made.
    let root = tmp.join("root");
    let (held, gone, starting) = (root.join("1"), root.join("2"), root.join("3"));
    for d in [&held, &gone] {
        std::fs::create_dir_all(d.join("sub")).unwrap();
    }
    std::fs::create_dir_all(&starting).unwrap();
    // One whose `.held` went with part of it (a removal cut short): gone too.
    let half = root.join("4");
    std::fs::create_dir_all(half.join("sub")).unwrap();
    let lock = File::create(held.join(HELD)).unwrap();
    lock.try_lock().unwrap();
    File::create(gone.join(HELD)).unwrap();
    assert_eq!(sweep(&root), (2, 0));
    assert!(held.is_dir() && starting.is_dir());
    assert!(!gone.exists() && !half.exists());
    drop(lock);
    std::fs::write(starting.join(HELD), "").unwrap();
    assert_eq!(sweep(&root), (0, 0));
    assert_eq!(std::fs::read_dir(&root).unwrap().count(), 0);
}
