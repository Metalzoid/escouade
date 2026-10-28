// What the real trials (real-harnesses.spec.ts, real-workflow.spec.ts) put back of the user's harnesses at their end: the
// sessions and entries of the trial's folders taken out, the configuration files as they were. Nothing of a token is read.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const CODEX_HOME = path.join(HOME, '.codex');

// ---------- what is put back at the end ----------

/** Files of `dir` (recursive) changed since `since`, whose text names a folder of the test's. */
function touched(dir: string, since: number, test: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }) as string[])
    .map((f) => path.join(dir, f))
    .filter((f) => {
      try {
        const st = fs.statSync(f);
        return st.isFile() && st.mtimeMs >= since && test(f);
      } catch {
        return false;
      }
    });
}

/** Whether a file names the folder of the test runs (the temporary folder of the run, outside of %TEMP%). */
const ours = (file: string) => fs.readFileSync(file, 'utf8').includes('escouade-js-tests');

/** Takes out of `file` the lines that name the test's folders. */
function dropLines(file: string) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  const kept = text
    .split('\n')
    .filter((l) => !l.includes('escouade-js-tests'))
    .join('\n');
  if (kept !== text) fs.writeFileSync(file, kept);
}

/** Codex: config.toml put back as it was, the sessions of the test's folders taken out. */
export function keepCodex() {
  const config = path.join(CODEX_HOME, 'config.toml');
  const saved = fs.existsSync(config) ? fs.readFileSync(config) : null;
  const since = Date.now();
  return () => {
    if (saved) fs.writeFileSync(config, saved);
    const sessions = touched(path.join(CODEX_HOME, 'sessions'), since, ours);
    const ids = sessions.map((f) => path.basename(f).match(/([0-9a-f-]{36})\.jsonl$/)?.[1]).filter(Boolean) as string[];
    for (const f of sessions) fs.rmSync(f);
    // Their lines in the index and in the history (what was typed in its interface).
    for (const name of ['session_index.jsonl', 'history.jsonl']) {
      const file = path.join(CODEX_HOME, name);
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      const kept = text
        .split('\n')
        .filter((l) => !ids.some((id) => l.includes(id)))
        .join('\n');
      if (kept !== text) fs.writeFileSync(file, kept);
    }
    console.log(`codex: config.toml put back, ${sessions.length} sessions taken out`);
  };
}

/**
 * Claude Code: the transcripts, sessions, history and folder entries (~/.claude.json, the trust of the folder given in its
 * interface) of the test's folders taken out.
 */
export function keepClaude() {
  const dir = path.join(HOME, '.claude');
  const since = Date.now();
  return () => {
    const projects = path.join(dir, 'projects');
    let gone = 0;
    for (const name of fs.existsSync(projects) ? fs.readdirSync(projects) : []) {
      if (name.includes('escouade-js-tests')) {
        // Its sessions' own folders of variables go with it.
        const sessions = (fs.readdirSync(path.join(projects, name), { recursive: true, encoding: 'utf8' }) as string[])
          .map((f) => path.basename(f).match(/^([0-9a-f-]{36}).jsonl$/)?.[1])
          .filter(Boolean) as string[];
        for (const id of sessions) fs.rmSync(path.join(dir, 'session-env', id), { recursive: true, force: true });
        fs.rmSync(path.join(projects, name), { recursive: true, force: true });
        gone++;
      }
    }
    // Read and written at once: the user's sessions write it too.
    const config = path.join(HOME, '.claude.json');
    if (fs.existsSync(config)) {
      const json = JSON.parse(fs.readFileSync(config, 'utf8'));
      const keys = Object.keys(json.projects ?? {}).filter((k) => k.includes('escouade-js-tests'));
      for (const k of keys) delete json.projects[k];
      if (keys.length) fs.writeFileSync(config, JSON.stringify(json, null, 2));
    }
    for (const f of touched(path.join(dir, 'sessions'), since, ours)) fs.rmSync(f);
    dropLines(path.join(dir, 'history.jsonl'));
    console.log(`claude: ${gone} project folders taken out of ~/.claude/projects`);
  };
}

/**
 * Copilot CLI: its Principal's config.json and mcp-config.json put back as they were (an mcp-config.json that was not
 * there taken out), the sessions of the trial's folders taken out of its session-state, and what the trial adds to
 * %LOCALAPPDATA%\copilot.
 */
export function keepCopilot() {
  const home = path.join(HOME, '.copilot');
  const saved = ['config.json', 'mcp-config.json'].map(
    (name) => [name, fs.existsSync(path.join(home, name)) ? fs.readFileSync(path.join(home, name)) : null] as const,
  );
  const sessions = path.join(home, 'session-state');
  const had = new Set(fs.existsSync(sessions) ? fs.readdirSync(sessions) : []);
  // The locks Copilot keeps for its sessions, one a session, some of sessions it keeps no folder of.
  const locks = path.join(sessions, '.session-operation-locks');
  const locked = new Set(fs.existsSync(locks) ? fs.readdirSync(locks) : []);
  const cache = path.join(process.env.LOCALAPPDATA ?? '', 'copilot');
  const list = (dir: string) => (fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }) as string[]) : []);
  const before = new Set(list(cache));
  return () => {
    for (const [name, bytes] of saved) {
      if (bytes) fs.writeFileSync(path.join(home, name), bytes);
      else fs.rmSync(path.join(home, name), { force: true });
    }
    const ours = (fs.existsSync(sessions) ? fs.readdirSync(sessions) : []).filter((id) => {
      const workspace = path.join(sessions, id, 'workspace.yaml');
      return !had.has(id) && fs.existsSync(workspace) && fs.readFileSync(workspace, 'utf8').includes('escouade-js-tests');
    });
    for (const id of ours) fs.rmSync(path.join(sessions, id), { recursive: true, force: true });
    const stale = (fs.existsSync(locks) ? fs.readdirSync(locks) : []).filter(
      (lock) => !locked.has(lock) && !fs.existsSync(path.join(sessions, lock.replace(/\.lock$/, ''))),
    );
    for (const lock of stale) fs.rmSync(path.join(locks, lock), { force: true });
    const added = list(cache)
      .filter((f) => !before.has(f))
      .sort((a, b) => b.length - a.length);
    for (const f of added) fs.rmSync(path.join(cache, f), { recursive: true, force: true });
    console.log(`copilot: config put back, ${ours.length} sessions and ${added.length} entries of %LOCALAPPDATA%\\copilot taken out`);
  };
}

/**
 * Mistral Vibe: the user's ~/.vibe (its config, its trust, its hooks; its key is in the system's keychain, never read)
 * as it was, byte for byte. Escouade gives each agent a VIBE_HOME of its own and should write nothing there: what
 * changed is put back and said, a file added naming the test's folders taken out.
 */
export function keepVibe() {
  const home = path.join(HOME, '.vibe');
  const list = () =>
    fs.existsSync(home)
      ? (fs.readdirSync(home, { recursive: true, encoding: 'utf8' }) as string[]).filter((f) => fs.statSync(path.join(home, f)).isFile())
      : [];
  const saved = new Map(list().map((f) => [f, fs.readFileSync(path.join(home, f))]));
  return () => {
    const changed: string[] = [];
    for (const [name, bytes] of saved) {
      const file = path.join(home, name);
      if (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)) {
        changed.push(name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
      }
    }
    const added = list().filter((f) => !saved.has(f));
    for (const f of added) if (ours(path.join(home, f))) fs.rmSync(path.join(home, f), { force: true });
    console.log(
      `vibe: ~/.vibe ${changed.length || added.length ? `changed (${[...changed, ...added].join(', ')}), put back` : 'as it was, byte for byte'}`,
    );
  };
}

/**
 * Antigravity CLI (ESC-272): each agent has a home of its own, so the user's ~/.gemini (which Gemini CLI shares) is never
 * to be touched. Its files are listed by size and date only, never read (`google_accounts.json` above all, and its logs,
 * which hold the account's address), and nothing is written back: a session of `agy` the user runs meanwhile writes its
 * own logs there. What changed is told.
 */
export function keepAgy() {
  const home = path.join(HOME, '.gemini');
  const list = () =>
    new Map(
      fs.existsSync(home)
        ? (fs.readdirSync(home, { recursive: true, encoding: 'utf8' }) as string[]).flatMap((f) => {
            try {
              const st = fs.statSync(path.join(home, f));
              return st.isFile() ? [[f, `${st.size}:${st.mtimeMs}`] as const] : [];
            } catch {
              return [];
            }
          })
        : [],
    );
  const before = list();
  return () => {
    const after = list();
    const changed = [...after].filter(([f, m]) => before.get(f) !== m).map(([f]) => f);
    const gone = [...before.keys()].filter((f) => !after.has(f));
    console.log(
      `agy: ~/.gemini ${changed.length || gone.length ? `changed (${[...changed, ...gone].join(', ')}): a session of the user's?` : 'untouched'}`,
    );
  };
}
