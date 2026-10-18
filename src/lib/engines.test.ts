import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  anyCan,
  can,
  canFork,
  capsOf,
  choosesEngine,
  effortsOf,
  engineOf,
  engineOptions,
  favoritesOf,
  modelCost,
  modelMenu,
  modelsOf,
  modelTakes,
  modesOf,
  offered,
  searchesModels,
  setFavorite,
  showsCost,
  showsMark,
  speakerOf,
  writerOf,
  writerOptions,
} from './engines';
import { setLang } from './i18n';
import { EFFORTS, modelLabel, MODES } from './models';
import { app } from './state.svelte';
import { agent, BARE_ENGINE, CLAUDE_ENGINE, fakeBackend, resetApp } from '../test/ipc';

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

describe('the harnesses offered (ESC-29)', () => {
  beforeEach(() => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, BARE_ENGINE];
  });

  it('are the harnesses found: a harness that is not found is offered nowhere', () => {
    app.enginesFound = ['claude'];
    expect(offered().map((e) => e.id)).toEqual(['claude']);
    expect(choosesEngine()).toBe(false);
    app.enginesFound = ['claude', 'codex'];
    expect(choosesEngine()).toBe(true);
    expect(engineOptions()).toEqual([
      { value: 'claude', label: 'Claude Code' },
      { value: 'codex', label: 'Harness nu' },
    ]);
    // The one a ticket or a project has stays listed, though it is not found any more.
    app.enginesFound = ['claude'];
    expect(engineOptions('codex').map((o) => o.value)).toEqual(['claude', 'codex']);
  });

  it('show their brand only once agents run on two of them, archived ones aside', () => {
    resetApp({ agents: [agent({ id: 'a1' }), agent({ id: 'a2' })] });
    expect(showsMark()).toBe(false);
    resetApp({ agents: [agent({ id: 'a1' }), agent({ id: 'a2', engine: 'codex', archived: true })] });
    expect(showsMark()).toBe(false);
    resetApp({ agents: [agent({ id: 'a1' }), agent({ id: 'a2', engine: 'codex' })] });
    expect(showsMark()).toBe(true);
  });

  it('give the composer the models and efforts of the harness, each model with what it takes', () => {
    const claude = { engine: 'claude' as const };
    const bare = { engine: 'codex' as const };
    expect(modelsOf(claude).map((m) => m.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
    expect(modelsOf(bare).map((m) => m.id)).toEqual(['gpt-5.5', 'gpt-5.5-mini']);
    expect(effortsOf(claude, EFFORTS).map((e) => e.value)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(effortsOf(bare, EFFORTS)).toEqual([]);
    // As Claude Code's rule: all but Haiku, its full ids too; a model it does not declare takes them.
    expect(modelTakes(claude, 'opus', 'effort')).toBe(true);
    expect(modelTakes(claude, 'haiku', 'effort')).toBe(false);
    expect(modelTakes(claude, 'claude-haiku-4-5-20251001', 'auto')).toBe(false);
    expect(modelTakes(claude, 'claude-opus-5-5', 'auto')).toBe(true);
    expect(modelTakes(bare, 'gpt-5.5', 'effort')).toBe(false);
  });
});

describe('the models a harness lists for its account (ESC-37)', () => {
  beforeEach(() => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, { ...BARE_ENGINE, caps: { ...BARE_ENGINE.caps, effort: true } }];
  });

  it('take the place of those it declares, each with its own efforts', () => {
    const codex = { engine: 'codex' as const, model: 'gpt-6-luna' };
    // Until it has listed them: its declaration's.
    expect(modelsOf(codex).map((m) => m.id)).toEqual(['gpt-5.5', 'gpt-5.5-mini']);
    app.engineModels = {
      codex: [
        { id: 'gpt-6-luna', label: 'GPT-6-Luna', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', images: true, default: true },
        { id: 'gpt-mini', label: 'GPT Mini', efforts: [], defaultEffort: null, images: false, default: false },
      ],
    };
    expect(modelsOf(codex)).toEqual([
      { id: 'gpt-6-luna', label: 'GPT-6-Luna' },
      { id: 'gpt-mini', label: 'GPT Mini' },
    ]);
    expect(effortsOf(codex, EFFORTS).map((e) => e.value)).toEqual(['low', 'medium', 'high']);
    expect(modelTakes(codex, 'gpt-6-luna', 'effort')).toBe(true);
    expect(modelTakes(codex, 'gpt-mini', 'effort')).toBe(false);
    expect(modelTakes(codex, 'gpt-mini', 'auto')).toBe(true);
    // Named as its harness names it, wherever a model is shown.
    expect(modelLabel('gpt-6-luna')).toBe('GPT-6-Luna');
    // Claude Code's menu is its own still.
    expect(modelsOf({ engine: 'claude' }).map((m) => m.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
  });
});

describe('what a model costs beside the others (ESC-39)', () => {
  beforeEach(() => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, { ...BARE_ENGINE, id: 'copilot', caps: { ...BARE_ENGINE.caps, effort: true } }];
  });

  it('is its multiplier, else its tier of price, else nothing', () => {
    const copilot = { engine: 'copilot' as const };
    app.engineModels = {
      copilot: [
        { id: 'sonnet', label: 'Claude Sonnet 4.5', efforts: [], defaultEffort: null, images: true, default: true, multiplier: '3' },
        { id: 'mini', label: 'GPT-5 mini', efforts: [], defaultEffort: null, images: false, default: false, multiplier: '0.33' },
        { id: 'luna', label: 'GPT-6 Luna', efforts: [], defaultEffort: null, images: false, default: false, price: 'low' },
        { id: 'plain', label: 'Plain', efforts: [], defaultEffort: null, images: false, default: false },
      ],
    };
    expect(modelCost(copilot, 'sonnet')).toEqual({ label: '×3', title: 'Coûte 3 fois le tarif de base' });
    expect(modelCost(copilot, 'mini')?.label).toBe('×0,33');
    expect(modelCost(copilot, 'luna')?.label).toBe('coût bas');
    expect(modelCost(copilot, 'plain')).toBeUndefined();
    expect(modelCost({ engine: 'claude' }, 'opus')).toBeUndefined();
    setLang('en');
    expect(modelCost(copilot, 'mini')?.label).toBe('×0.33');
    expect(modelCost(copilot, 'luna')?.label).toBe('low cost');
    setLang('fr');
  });
});

describe('the name of the agents of a harness (ESC-31)', () => {
  beforeEach(() => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, BARE_ENGINE];
  });

  it('is the one it declares: Claude for Claude Code, the default harness’s for what has none', () => {
    expect(speakerOf('claude')).toBe('Claude');
    expect(speakerOf(null)).toBe('Claude');
    expect(speakerOf('codex')).toBe('Nu');
  });

  it('is its name when it declares none, its id when the backend does not know it', () => {
    app.engines = [CLAUDE_ENGINE, { ...BARE_ENGINE, speaker: '' }];
    expect(speakerOf('codex')).toBe('Harness nu');
    expect(speakerOf('opencode')).toBe('opencode');
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

describe('« Modèle des textes rédigés »', () => {
  beforeEach(() => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, BARE_ENGINE];
  });

  it('offers the model of each harness found, and only those', () => {
    app.enginesFound = ['claude', 'codex'];
    expect(writerOptions()).toEqual([
      { value: 'claude', label: 'Claude Haiku' },
      { value: 'codex', label: 'Nu mini' },
    ]);
    app.enginesFound = ['codex'];
    expect(writerOptions()).toEqual([{ value: 'codex', label: 'Nu mini' }]);
    app.enginesFound = [];
    expect(writerOptions()).toEqual([]);
  });

  it('goes to the harness chosen while it is found, else to Claude Haiku, else to the first found', () => {
    app.enginesFound = ['codex', 'claude'];
    expect(writerOf(null)).toBe('claude');
    expect(writerOf('codex')).toBe('codex');
    app.enginesFound = ['claude'];
    expect(writerOf('codex')).toBe('claude');
    app.enginesFound = ['codex'];
    expect(writerOf(null)).toBe('codex');
    expect(writerOf('claude')).toBe('codex');
    app.enginesFound = [];
    expect(writerOf('claude')).toBeNull();
  });
});

describe('the models of the providers of a harness (ESC-44)', () => {
  beforeEach(() => {
    resetApp();
    app.engines = [CLAUDE_ENGINE, { ...BARE_ENGINE, id: 'opencode', models: [], caps: { ...BARE_ENGINE.caps, effort: true } }];
  });

  it('are searched, the favorites first in their order, each with its provider', async () => {
    const oc = { engine: 'opencode' as const, model: 'ollama/qwen' };
    expect(searchesModels(oc)).toBe(false);
    app.engineModels = {
      opencode: [
        {
          id: 'ollama/gpt-oss',
          label: 'gpt-oss',
          efforts: ['low', 'high'],
          defaultEffort: null,
          images: false,
          default: false,
          provider: 'Ollama (local)',
        },
        { id: 'ollama/qwen', label: 'Qwen', efforts: [], defaultEffort: null, images: false, default: true, provider: 'Ollama (local)' },
        {
          id: 'lmstudio/devstral',
          label: 'Devstral',
          efforts: [],
          defaultEffort: null,
          images: true,
          default: false,
          provider: 'LM Studio',
        },
      ],
    };
    expect(searchesModels(oc)).toBe(true);
    expect(modelMenu(oc).map((m) => m.id)).toEqual(['ollama/gpt-oss', 'ollama/qwen', 'lmstudio/devstral']);
    app.settings = { ...app.settings, favoriteModels: { opencode: ['lmstudio/devstral', 'ollama/qwen'] } };
    const menu = modelMenu(oc);
    expect(menu.map((m) => [m.id, m.favorite])).toEqual([
      ['lmstudio/devstral', true],
      ['ollama/qwen', true],
      ['ollama/gpt-oss', false],
    ]);
    expect(menu[0].provider).toBe('LM Studio');
    expect(favoritesOf('opencode')).toEqual(['lmstudio/devstral', 'ollama/qwen']);
    // A variant is the effort of the model that has it.
    expect(effortsOf({ engine: 'opencode', model: 'ollama/gpt-oss' }, EFFORTS).map((e) => e.value)).toEqual(['low', 'high']);
    expect(modelTakes(oc, 'ollama/qwen', 'effort')).toBe(false);
    // Marked at once, through the backend.
    const backend = fakeBackend({ favorite_model_set: () => ({ opencode: ['ollama/gpt-oss'] }) });
    await setFavorite('opencode', 'ollama/gpt-oss', true);
    expect(backend.called('favorite_model_set')[0].args).toEqual({ engine: 'opencode', model: 'ollama/gpt-oss', favorite: true });
    expect(favoritesOf('opencode')).toEqual(['ollama/gpt-oss']);
  });
});
