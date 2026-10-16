import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { anyCan, can, canFork, capsOf, engineOf, modesOf, showsCost } from './engines';
import { MODES } from './models';
import { app } from './state.svelte';
import { BARE_ENGINE, CLAUDE_ENGINE, resetApp } from '../test/ipc';

describe('the capabilities of a harness', () => {
  beforeEach(() => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, BARE_ENGINE];
  });

  it('are read from what the harness declares, the default one for what has none yet', () => {
    expect(engineOf('claude')?.name).toBe('Claude Code');
    expect(engineOf(null)?.name).toBe('Claude Code');
    expect(engineOf('codex')?.name).toBe('Harness nu');
    // One the backend does not declare: nothing of it is shown.
    expect(capsOf('cursor')).toBeNull();
    expect(can({ engine: 'cursor' }, 'remoteControl')).toBe(false);
  });

  it('show what Claude Code does today and hide what a bare harness lacks', () => {
    const claude = { engine: 'claude' as const };
    const bare = { engine: 'codex' as const };
    for (const flag of ['terminalView', 'remoteControl', 'backgroundTasks', 'effort', 'images', 'pdf', 'slashCommands'] as const) {
      expect(can(claude, flag)).toBe(true);
      expect(can(bare, flag)).toBe(false);
    }
    expect(canFork(claude)).toBe(true);
    expect(canFork(bare)).toBe(false);
    expect(showsCost(claude)).toBe(true);
    expect(showsCost(bare)).toBe(false);
    expect(modesOf(claude, MODES).map((m) => m.value)).toEqual(['auto', 'default', 'plan', 'acceptEdits', 'bypassPermissions']);
    expect(modesOf(bare, MODES).map((m) => m.value)).toEqual(['default', 'plan']);
  });

  it('tell whether any harness has a function, for a setting of them all', () => {
    expect(anyCan('remoteControl')).toBe(true);
    app.engines = [BARE_ENGINE];
    expect(anyCan('remoteControl')).toBe(false);
  });
});

describe('the window', () => {
  /** Every source file of the window but the tests. */
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
    });
  }

  it('never decides from the name of a harness, only from its capabilities', () => {
    const offenders: string[] = [];
    // `engine === 'claude'`, `.engine !== "codex"`, `engine == 'opencode'`, `case 'copilot':` after a switch on an engine…
    const byName =
      /engine\)?\s*[!=]==?\s*['"](claude|codex|copilot|cursor|opencode)['"]|['"](claude|codex|copilot|cursor|opencode)['"]\s*[!=]==?\s*\S*engine\b|switch\s*\([^)]*engine[^)]*\)/;
    // The search finds what it is for.
    for (const line of ["if (agent.engine === 'claude')", 'a.engine !== "codex"', "'opencode' === t.engine", 'switch (agent.engine) {']) {
      expect(byName.test(line), line).toBe(true);
    }
    expect(byName.test("can(agent, 'remoteControl')")).toBe(false);
    for (const file of sources(join(__dirname, '..'))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (byName.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
