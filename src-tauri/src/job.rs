//! A process and everything it spawns (dev servers started by the Bash tool, MCP servers,
//! `cmd` → `node` chains…) live and die together.
//!
//! On Windows, a Job Object created with KILL_ON_JOB_CLOSE, so the whole tree also dies if the
//! app crashes or is killed. On macOS (and other Unixes), the process group the child leads
//! (see `isolate`): killed as a whole when the job is terminated or dropped.

/// What the processes of a job use.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct JobUsage {
    pub cpu: std::time::Duration,
    /// Working sets, in bytes.
    pub memory: u64,
    pub processes: u32,
}

#[cfg(windows)]
mod imp {
    use super::JobUsage;
    use std::ffi::c_void;
    use std::time::Duration;
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_MORE_DATA, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, IsProcessInJob,
        JobObjectBasicAccountingInformation, JobObjectBasicProcessIdList,
        JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
        TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        JOBOBJECT_BASIC_PROCESS_ID_LIST, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::ProcessStatus::{
        K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    pub struct Job(HANDLE);

    // SAFETY: a job handle is a kernel object handle, usable from any thread.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        pub fn new() -> Option<Self> {
            // SAFETY: plain Win32 calls; the handle is owned by the returned Job.
            unsafe {
                let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if h.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    h,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                if ok == 0 {
                    CloseHandle(h);
                    return None;
                }
                Some(Job(h))
            }
        }

        /// A job holding `child` (started by tokio) and what it starts.
        ///
        /// What `child` started before it joined the job (a `.cmd` shim's `cmd` starts its program
        /// at once) is put in the job too: such a process would escape `terminate` and `usage`.
        pub fn for_child(child: &tokio::process::Child) -> Option<Self> {
            let job = Self::new()?;
            if !job.assign_handle(child.raw_handle()?) {
                return None;
            }
            if let Some(pid) = child.id() {
                job.adopt_started_by(pid);
            }
            Some(job)
        }

        /// Puts in the job the processes `pid` started, and those they started, that are not in it
        /// already. Gone ones, or ones that refuse (a job of their own that cannot nest), are left
        /// out; returns how many joined.
        fn adopt_started_by(&self, pid: u32) -> usize {
            let mut family: Vec<(u32, u32)> = Vec::new();
            // SAFETY: a snapshot of the machine's processes, read to its end and closed; the entry
            // is a plain struct whose size is declared as the API asks.
            unsafe {
                let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
                if snapshot == INVALID_HANDLE_VALUE {
                    return 0;
                }
                let mut entry: PROCESSENTRY32W = std::mem::zeroed();
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                let mut more = Process32FirstW(snapshot, &mut entry);
                while more != 0 {
                    family.push((entry.th32ProcessID, entry.th32ParentProcessID));
                    more = Process32NextW(snapshot, &mut entry);
                }
                CloseHandle(snapshot);
            }
            let mut found: Vec<u32> = Vec::new();
            let mut parents = vec![pid];
            while let Some(parent) = parents.pop() {
                for &(id, of) in &family {
                    if of == parent && id != pid && !found.contains(&id) {
                        found.push(id);
                        parents.push(id);
                    }
                }
            }
            found
                .into_iter()
                // SAFETY: the handle is checked, handed to the job and closed.
                .filter(|&id| unsafe {
                    let h = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, id);
                    if h.is_null() {
                        return false;
                    }
                    let joined = AssignProcessToJobObject(self.0, h) != 0;
                    CloseHandle(h);
                    joined
                })
                .count()
        }

        /// A job holding `child` (started in a pseudo-console) and what it starts.
        pub fn for_pty(child: &dyn portable_pty::Child) -> Option<Self> {
            let job = Self::new()?;
            job.assign_handle(child.as_raw_handle()?).then_some(job)
        }

        /// Assigns a process by handle (e.g. `tokio::process::Child::raw_handle`).
        pub fn assign_handle(&self, process: *mut c_void) -> bool {
            // SAFETY: the caller passes a live process handle.
            unsafe { AssignProcessToJobObject(self.0, process as HANDLE) != 0 }
        }

        /// Kills every process of the job.
        pub fn terminate(&self) {
            // SAFETY: valid job handle owned by self.
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }

        /// Lets the processes of the job live on when it is dropped (a shell that ended by itself
        /// leaves what its user detached): the job keeps holding them, but no longer kills them
        /// when its handle closes. `terminate` still does.
        pub fn release(&self) {
            // SAFETY: valid job handle owned by self, a buffer of the declared size.
            unsafe {
                let info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                SetInformationJobObject(
                    self.0,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
            }
        }

        /// What the job's processes use: CPU time since they joined it (ended ones included),
        /// and the memory of those still running.
        pub fn usage(&self) -> Option<JobUsage> {
            // SAFETY: plain Win32 queries on our own job handle, into buffers of the declared size.
            unsafe {
                let mut acc: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = std::mem::zeroed();
                let ok = QueryInformationJobObject(
                    self.0,
                    JobObjectBasicAccountingInformation,
                    &mut acc as *mut _ as *mut c_void,
                    std::mem::size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                    std::ptr::null_mut(),
                );
                if ok == 0 {
                    return None;
                }
                let ticks = (acc.TotalUserTime + acc.TotalKernelTime).max(0) as u64;
                Some(JobUsage {
                    cpu: Duration::from_nanos(ticks * 100),
                    memory: self
                        .pids()
                        .into_iter()
                        .map(|pid| self.working_set(pid))
                        .sum(),
                    processes: acc.ActiveProcesses,
                })
            }
        }

        /// The ids of the job's processes (the first thousand).
        pub fn pids(&self) -> Vec<u32> {
            const MAX: usize = 1024;
            // u64 cells: the list's header and ids need 8-byte alignment.
            let mut buf = vec![0u64; 1 + MAX];
            // SAFETY: `buf` holds a JOBOBJECT_BASIC_PROCESS_ID_LIST with room for MAX ids; the ids
            // are read through a pointer derived from the whole buffer, not from the 1-item array.
            unsafe {
                let ok = QueryInformationJobObject(
                    self.0,
                    JobObjectBasicProcessIdList,
                    buf.as_mut_ptr() as *mut c_void,
                    (buf.len() * 8) as u32,
                    std::ptr::null_mut(),
                );
                // More processes than room: the list holds the first ones.
                if ok == 0 && GetLastError() != ERROR_MORE_DATA {
                    return Vec::new();
                }
                let list = buf.as_ptr() as *const JOBOBJECT_BASIC_PROCESS_ID_LIST;
                let n = ((*list).NumberOfProcessIdsInList as usize).min(MAX);
                let ids = std::ptr::addr_of!((*list).ProcessIdList) as *const usize;
                std::slice::from_raw_parts(ids, n)
                    .iter()
                    .map(|&pid| pid as u32)
                    .collect()
            }
        }

        /// The working set of one of the job's processes, 0 when it is gone (its id may already
        /// be another process's).
        fn working_set(&self, pid: u32) -> u64 {
            // SAFETY: the handle is checked, used for two queries and closed.
            unsafe {
                let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if h.is_null() {
                    return 0;
                }
                let mut in_job = 0;
                let mut mem: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
                let size = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
                let ok = IsProcessInJob(h, self.0, &mut in_job) != 0
                    && in_job != 0
                    && K32GetProcessMemoryInfo(h, &mut mem, size) != 0;
                CloseHandle(h);
                if ok {
                    mem.WorkingSetSize as u64
                } else {
                    0
                }
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: closing our own handle; with KILL_ON_JOB_CLOSE (unless released) this ends
            // the tree.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(unix)]
mod imp {
    use super::JobUsage;
    use std::time::Duration;

    /// A process group, by the id of its leader.
    pub struct Job(i32);

    impl Job {
        /// A job holding `child`, started by tokio after `isolate`, and what it starts.
        pub fn for_child(child: &tokio::process::Child) -> Option<Self> {
            Some(Job(child.id()?.try_into().ok()?))
        }

        /// A job holding `child`, started in a pseudo-console: the session it leads is also its
        /// process group.
        pub fn for_pty(child: &dyn portable_pty::Child) -> Option<Self> {
            Some(Job(child.process_id()?.try_into().ok()?))
        }

        /// Kills every process of the group.
        pub fn terminate(&self) {
            // SAFETY: plain syscall; a group that is already gone only yields ESRCH.
            unsafe {
                libc::killpg(self.0, libc::SIGKILL);
            }
        }

        /// Nothing to release: a group is killed when the job is dropped, so a terminal whose
        /// shell may end leaving what its user detached has no job on Unix (see `pty`).
        pub fn release(&self) {}

        /// What the group's running processes use (CPU time of those still running, resident
        /// memory), read from `ps`.
        pub fn usage(&self) -> Option<JobUsage> {
            let out = std::process::Command::new("ps")
                .args(["-A", "-o", "pgid=,rss=,time="])
                .stderr(std::process::Stdio::null())
                .output()
                .ok()?;
            out.status.success().then_some(())?;
            Some(parse_ps(&String::from_utf8_lossy(&out.stdout), self.0))
        }

        /// The ids of the group's running processes, read from `ps`.
        pub fn pids(&self) -> Vec<u32> {
            let Ok(out) = std::process::Command::new("ps")
                .args(["-A", "-o", "pgid=,pid="])
                .stderr(std::process::Stdio::null())
                .output()
            else {
                return Vec::new();
            };
            parse_pids(&String::from_utf8_lossy(&out.stdout), self.0)
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // Like KILL_ON_JOB_CLOSE: whatever the leader left running goes with it.
            self.terminate();
        }
    }

    /// Sums the `pgid rss time` lines of `ps` for group `pgid`.
    pub(super) fn parse_ps(out: &str, pgid: i32) -> JobUsage {
        let mut u = JobUsage::default();
        for line in out.lines() {
            let mut f = line.split_whitespace();
            let (Some(g), Some(rss), Some(time)) = (f.next(), f.next(), f.next()) else {
                continue;
            };
            if g.parse::<i32>().ok() != Some(pgid) {
                continue;
            }
            u.processes += 1;
            u.memory += rss.parse::<u64>().unwrap_or(0) * 1024;
            u.cpu += parse_cpu_time(time).unwrap_or_default();
        }
        u
    }

    /// The ids of the `pgid pid` lines of `ps` for group `pgid`.
    pub(super) fn parse_pids(out: &str, pgid: i32) -> Vec<u32> {
        out.lines()
            .filter_map(|line| {
                let mut f = line.split_whitespace();
                let (g, pid) = (f.next()?, f.next()?);
                (g.parse::<i32>().ok()? == pgid)
                    .then(|| pid.parse::<u32>().ok())
                    .flatten()
            })
            .collect()
    }

    /// `ps` CPU times:`[[dd-]hh:]mm:ss[.cc]` (Linux `00:01:02`, macOS `1:02.03`).
    pub(super) fn parse_cpu_time(s: &str) -> Option<Duration> {
        let (days, rest) = match s.split_once('-') {
            Some((d, r)) => (d.parse::<u64>().ok()?, r),
            None => (0, s),
        };
        let mut secs = 0f64;
        for part in rest.split(':') {
            secs = secs * 60.0 + part.parse::<f64>().ok()?;
        }
        Some(Duration::from_secs_f64(secs + days as f64 * 86_400.0))
    }
}

#[cfg(not(any(windows, unix)))]
mod imp {
    pub struct Job;

    impl Job {
        pub fn for_child(_child: &tokio::process::Child) -> Option<Self> {
            None
        }
        pub fn for_pty(_child: &dyn portable_pty::Child) -> Option<Self> {
            None
        }
        pub fn terminate(&self) {}
        pub fn release(&self) {}
        pub fn usage(&self) -> Option<super::JobUsage> {
            None
        }
        pub fn pids(&self) -> Vec<u32> {
            Vec::new()
        }
    }
}

/// Prepares `cmd` so that `Job::for_child` can hold the process and what it starts: on Unix, the
/// child leads a process group of its own.
pub fn isolate(cmd: &mut tokio::process::Command) {
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(not(unix))]
    let _ = cmd;
}

pub use imp::Job;

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::process::Command;

    fn alive(pid: u32) -> bool {
        let out = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
    }

    #[test]
    fn dropping_the_job_kills_the_process() {
        let mut child = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Start-Sleep 60"])
            .spawn()
            .unwrap();
        let job = Job::new().unwrap();
        assert!(job.assign_handle(std::os::windows::io::AsRawHandle::as_raw_handle(&child)));
        drop(job);
        child.wait().unwrap();
        assert!(!alive(child.id()));
    }

    #[test]
    fn a_released_job_kills_nothing_when_it_is_dropped() {
        // Not `ping`: the terminals' tests count the machine's `ping` processes.
        let mut child = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Start-Sleep 30"])
            .spawn()
            .unwrap();
        let job = Job::new().unwrap();
        assert!(job.assign_handle(std::os::windows::io::AsRawHandle::as_raw_handle(&child)));
        job.release();
        drop(job);
        std::thread::sleep(std::time::Duration::from_millis(500));
        let survived = child.try_wait().unwrap().is_none();
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(survived, "the released job killed its process");
    }

    #[tokio::test]
    async fn a_program_the_process_started_before_it_joined_the_job_is_held_too() {
        // What a `.cmd` shim does: `cmd` starts its program at once, maybe before the job exists.
        // The program says it runs, by a file; `cmd` waits for it to end.
        let up = std::env::temp_dir().join(format!("ccm-job-adopt-{}", std::process::id()));
        let _ = std::fs::remove_file(&up);
        let mut cmd = tokio::process::Command::new("cmd");
        cmd.args([
            "/c",
            "node",
            "-e",
            "require('fs').writeFileSync(process.argv[1],'x');setTimeout(function(){},30000)",
        ])
        .arg(&up)
        .kill_on_drop(true);
        let mut child = cmd.spawn().unwrap();
        for _ in 0..400 {
            if up.exists() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert!(up.exists(), "the program did not start");
        let job = Job::for_child(&child).unwrap();
        // `cmd` and its program (node may also have a helper): not just the process itself.
        assert!(job.usage().unwrap().processes >= 2, "{:?}", job.pids());
        job.terminate();
        child.wait().await.unwrap();
        let _ = std::fs::remove_file(&up);
    }

    #[test]
    fn tells_the_cpu_time_and_memory_of_its_processes() {
        let mut child = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                // Busy until it used 1.5 s of CPU, however loaded the machine.
                "while ((Get-Process -Id $PID).TotalProcessorTime.TotalSeconds -lt 1.5) {}; Start-Sleep 60",
            ])
            .spawn()
            .unwrap();
        let job = Job::new().unwrap();
        assert!(job.assign_handle(std::os::windows::io::AsRawHandle::as_raw_handle(&child)));
        let mut usage = job.usage().unwrap();
        // Two minutes: a loaded CI runner gave it 0.4 s of CPU in 30 s.
        for _ in 0..1200 {
            if usage.cpu > std::time::Duration::from_secs(1) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
            usage = job.usage().unwrap();
        }
        assert!(usage.cpu > std::time::Duration::from_secs(1), "{usage:?}");
        assert_eq!(usage.processes, 1);
        assert!(usage.memory > 10 * 1024 * 1024, "{usage:?}");
        drop(job);
        child.wait().unwrap();
    }
}

#[cfg(all(test, unix))]
mod unix_tests {
    use super::imp::{parse_cpu_time, parse_pids, parse_ps};
    use super::*;
    use std::time::Duration;

    #[test]
    fn reads_the_cpu_times_of_ps() {
        assert_eq!(
            parse_cpu_time("1:02.50"),
            Some(Duration::from_millis(62_500))
        );
        assert_eq!(parse_cpu_time("01:00:03"), Some(Duration::from_secs(3603)));
        assert_eq!(
            parse_cpu_time("2-00:00:00"),
            Some(Duration::from_secs(172_800))
        );
        assert_eq!(parse_cpu_time("n/a"), None);
    }

    #[test]
    fn sums_the_processes_of_the_group() {
        let out = " 42  1000 0:01.00\n 42  24 0:00.50\n 7 99999 9:00.00\n";
        let u = parse_ps(out, 42);
        assert_eq!(u.processes, 2);
        assert_eq!(u.memory, 1024 * 1024);
        assert_eq!(u.cpu, Duration::from_millis(1500));
    }

    #[test]
    fn lists_the_pids_of_the_group() {
        let out = " 42  100\n 42  101\n 7  102\n junk\n 42 x\n";
        assert_eq!(parse_pids(out, 42), vec![100, 101]);
    }

    #[tokio::test]
    async fn dropping_the_job_kills_the_whole_group() {
        let mut cmd = tokio::process::Command::new("sh");
        // The grandchild outlives its parent, which echoes its pid.
        cmd.args(["-c", "sleep 60 & echo $!; wait"])
            .stdout(std::process::Stdio::piped());
        isolate(&mut cmd);
        let mut child = cmd.spawn().unwrap();
        let job = Job::for_child(&child).unwrap();
        let mut out = tokio::io::BufReader::new(child.stdout.take().unwrap());
        let mut line = String::new();
        tokio::io::AsyncBufReadExt::read_line(&mut out, &mut line)
            .await
            .unwrap();
        let grandchild: i32 = line.trim().parse().unwrap();
        assert!(job.usage().unwrap().processes >= 2);
        drop(job);
        child.wait().await.unwrap();
        for _ in 0..100 {
            // SAFETY: signal 0 only checks that the process exists.
            if unsafe { libc::kill(grandchild, 0) } != 0 {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        panic!("grandchild {grandchild} survived the job");
    }
}
