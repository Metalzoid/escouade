import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../lib/i18n';
import { app } from '../lib/state.svelte';
import type { WorkflowScan, WorkflowTrack } from '../lib/types';
import { workflows } from '../lib/workflows.svelte';
import { agent, fakeBackend, project, resetApp, ticket } from '../test/ipc';
import { getByTip } from '../test/tip';
import { GSD_ID, gsd, paginationUsers, passage, ralph, scanOf, track } from '../test/workflows';
import SidePanel from './SidePanel.svelte';

const AGENTS = [
  agent({ id: 'a1', name: 'pagination-users', status: 'running' }),
  agent({ id: 'a2', name: 'refacto-auth', status: 'waiting' }),
  agent({ id: 'a3', name: 'dem-5-export', status: 'running', ticketId: 't1' }),
];

function backend(scan: WorkflowScan, tracks: WorkflowTrack[]) {
  return fakeBackend({
    get_workflows: () => scan,
    get_workflow_tracks: () => tracks,
    git_files: () => [],
    git_log: () => ({ commits: [], head: 'main' }),
  });
}

const gsdTracks = () => [
  paginationUsers('a1'),
  track('a2', {
    step: 'gsd:execute-phase',
    subagents: ['gsd-executor'],
    passages: [passage(1, 'gsd:execute-phase', 0, 3, { outcome: 'running' })],
  }),
  track('a3', {
    step: 'gsd:plan-phase',
    ticketLoop: [1, 5],
    passages: [passage(1, 'gsd:plan-phase', 0, 3, { outcome: 'running', pass: 2 })],
  }),
];

async function open(scan: WorkflowScan, tracks: WorkflowTrack[], openAgent = 'a1') {
  const be = backend(scan, tracks);
  render(SidePanel, { project: project(), agent: app.agents[openAgent], docked: true });
  await userEvent.click(await screen.findByRole('tab', { name: /^Workflow/ }));
  return be;
}

describe('the Workflow tab', () => {
  beforeEach(() => resetApp({ projects: [project()], agents: AGENTS, tickets: [ticket({ id: 't1', key: 'DEM-5', column: 'doing' })] }));

  it('sits between Historique and PR et CI, with the count of the agents that follow a workflow', async () => {
    backend(scanOf(gsd()), gsdTracks());
    render(SidePanel, { project: project(), agent: app.agents.a1, docked: true });
    const tabs = await screen.findAllByRole('tab');
    await waitFor(() =>
      expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Non commités 0', 'Historique', 'Workflow 3', 'PR et CI dans la 2.1']),
    );
  });

  it('draws the rail: the steps, their doors, subagents, files and ways back, the agents on them', async () => {
    await open(scanOf(gsd()), gsdTracks());
    const tab = await screen.findByTestId('workflow');
    await within(tab).findByText('Verify work', { selector: '.wf-name' });
    expect(within(tab).getByText('4 étapes', { exact: false })).toHaveTextContent(
      '4 étapes · phase 3 sur 6 d’après .planning/STATE.md · lu à 10:12',
    );
    const steps = [...tab.querySelectorAll('.wf-step')];
    expect(steps.map((s) => s.querySelector('.wf-name')?.textContent)).toEqual([
      'Discuss phase',
      'Plan phase',
      'Execute phase',
      'Verify work',
    ]);
    expect(steps[1].querySelector('.wf-detail')).toHaveTextContent('gsd-phase-researchergsd-plannergsd-plan-checker jusqu’à 3 tours');
    expect(steps[0].querySelector('.wf-detail')).toHaveTextContent('écrit CONTEXT.md');
    expect(steps[3].querySelector('.wf-detail')).toHaveTextContent('retour à Plan phase');
    // The open agent's step stands out, its pill is current.
    expect(steps[3]).toHaveClass('here', 'busy');
    expect(steps[0]).not.toHaveClass('busy');
    expect(within(steps[3] as HTMLElement).getByRole('button', { name: 'pagination-users' })).toHaveAttribute('aria-current', 'true');
    expect(within(steps[2] as HTMLElement).getByRole('button', { name: 'refacto-auth' })).toHaveClass('wait');
    // The way back drawn in the gutter, and the next round dashed from the end.
    await waitFor(() => expect(tab.querySelectorAll('.wf-edges path')).toHaveLength(2));
    expect(tab.querySelector('.wf-edges path.outer')).not.toBeNull();
    expect(tab.querySelector('.wf-end')).toHaveTextContent('The milestone is complete');
  });

  it('opens an agent from its pill', async () => {
    await open(scanOf(gsd()), gsdTracks());
    await userEvent.click(await screen.findByRole('button', { name: 'refacto-auth' }));
    expect(app.ui.selectedAgent.p1).toBe('a2');
  });

  it('puts a door in the open agent’s composer, without sending it; « +2 » shows the rest', async () => {
    const be = await open(scanOf(gsd()), gsdTracks());
    const gates = await screen.findByText('Portes d’entrée');
    const head = gates.parentElement!;
    expect([...head.querySelectorAll('button.gate')].map((b) => b.textContent)).toEqual([
      '/gsd:autonomous',
      '/gsd:next',
      '/gsd:progress',
      '+2',
    ]);
    await userEvent.click(within(head).getByRole('button', { name: '+2' }));
    expect(within(head).getByRole('button', { name: '/gsd:quick' })).toBeInTheDocument();
    await userEvent.click(within(head).getByRole('button', { name: '/gsd:next' }));
    expect(app.composerPut).toEqual({ agentId: 'a1', text: '/gsd:next' });
    expect(be.calls.filter((c) => c.cmd === 'send_message')).toEqual([]);
  });

  it('lists the agents in the workflow: step, subagent, pass, ticket loop, time and cost', async () => {
    await open(scanOf(gsd()), gsdTracks());
    const list = (await screen.findByText('Agents dans GSD')).nextElementSibling as HTMLElement;
    expect(screen.getByText('Agents dans GSD')).toHaveTextContent('3 en cours');
    const rows = [...list.querySelectorAll('.wf-ag')];
    expect(rows.map((r) => r.querySelector('.where')?.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Verify work · gsd-verifier · 2ᵉ passage',
      'Execute phase · gsd-executor',
      'Plan phase · 2ᵉ passage · boucle 1/5 du ticket',
    ]);
    expect(rows[2]).toHaveTextContent('DEM-5');
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(rows[0].querySelectorAll('.pips i.done')).toHaveLength(3);
    expect(rows[0].querySelector('.nums')).toHaveTextContent('48m 00s · 3,91 $');
  });

  it('shows the open agent’s history, the way back with its reason; another agent’s by a click, without leaving the conversation', async () => {
    await open(scanOf(gsd()), gsdTracks());
    const head = await screen.findByText('Historique de pagination-users');
    expect(head).toHaveTextContent('phase 3 ·');
    const tab = screen.getByTestId('workflow');
    const evs = [...tab.querySelectorAll('.wf-hist .ev')];
    expect(evs.map((e) => e.querySelector('.what b')?.textContent)).toEqual([
      'Discuss phase',
      'Plan phase',
      'Execute phase',
      'Verify work',
      'Retour à Plan phase',
      'Plan phase',
      'Execute phase',
      'Verify work',
    ]);
    expect(evs[3]).toHaveClass('bad');
    expect(evs[3]).toHaveTextContent('2 écarts');
    expect(evs[4]).toHaveClass('back');
    expect(evs[4]).toHaveTextContent('prévu par verify-work.md');
    expect(evs[7]).toHaveClass('on');
    expect(tab.querySelectorAll('.wf-strip i')).toHaveLength(7);
    await userEvent.click(screen.getByRole('button', { name: /refacto-auth.*Execute phase/ }));
    expect(screen.getByText('Historique de refacto-auth')).toBeInTheDocument();
    expect(app.ui.selectedAgent.p1 ?? 'a1').toBe('a1');
  });

  it('keeps the current phase first, « Tout voir » for the ones before', async () => {
    const tr = paginationUsers('a1');
    tr.passages = [passage(0, 'gsd:discuss-phase', -60, 5), passage(9, 'gsd:verify-work', -50, 5), ...tr.passages];
    await open(scanOf(gsd()), [tr]);
    await screen.findByText('Historique de pagination-users');
    const tab = screen.getByTestId('workflow');
    expect(tab.querySelectorAll('.wf-hist .ev')).toHaveLength(8);
    await userEvent.click(screen.getByRole('button', { name: 'Tout voir' }));
    expect(tab.querySelectorAll('.wf-hist .ev')).toHaveLength(10);
  });

  it('folds the rail to a line a step, kept for the project', async () => {
    await open(scanOf(gsd()), gsdTracks());
    await userEvent.click(await screen.findByRole('button', { name: 'Replier les étapes' }));
    const tab = screen.getByTestId('workflow');
    expect(tab.querySelector('.wf-graph')).toHaveClass('folded');
    expect(screen.queryByText('Portes d’entrée')).toBeNull();
    expect(screen.queryByText('Agents dans GSD')).toBeNull();
    expect(screen.getByText('Historique de pagination-users')).toBeInTheDocument();
    expect(workflows.isFolded('p1')).toBe(true);
    expect(localStorage.getItem('escouade.workflowFolded.p1') ?? '1').toBe('1');
    await userEvent.click(screen.getByRole('button', { name: 'Déplier les étapes' }));
    expect(tab.querySelector('.wf-graph')).not.toHaveClass('folded');
  });

  it('says an agent outside the workflow, a partial follow and a workflow that changed', async () => {
    const tracks = [
      paginationUsers('a1'),
      track('a2', {
        outside: 'lance la suite e2e à ta demande',
        passages: [
          passage(1, 'gsd:execute-phase', 0, 3),
          passage(2, null, 3, 8, { outcome: 'running', doing: 'lance la suite e2e à ta demande' }),
        ],
      }),
      track('a3', { step: 'gsd:verify-work', behind: true, support: { partial: true, missing: ['subagents', 'cost'] }, passages: [] }),
    ];
    app.agents.a3 = { ...app.agents.a3, engine: 'codex' };
    await open(scanOf(gsd()), tracks);
    const tab = await screen.findByTestId('workflow');
    await within(tab).findByText('Agents dans GSD');
    expect(screen.getByText('Agents dans GSD')).toHaveTextContent('2 en cours · 1 sorti');
    const out = screen.getByRole('button', { name: /refacto-auth.*Hors du workflow/ });
    expect(out).toHaveClass('off');
    expect(out).toHaveTextContent('Hors du workflow depuis');
    expect(out).toHaveTextContent('lance la suite e2e à ta demande');
    // Its pill stays on the step it left, greyed.
    const exec = tab.querySelectorAll('.wf-step')[2] as HTMLElement;
    expect(within(exec).getByRole('button', { name: 'refacto-auth' })).toHaveClass('off');
    const partial = tab.querySelectorAll('.wf-ag')[2] as HTMLElement;
    expect(partial).toHaveTextContent('Suivi partiel');
    expect(partial).toHaveTextContent('Codex : il manque les sous-agents, le coût par étape.');
    expect(within(tab).getByRole('status')).toHaveTextContent('Le workflow a changé à 10:12. dem-5-export garde sa version');
    await userEvent.click(within(tab).getByRole('button', { name: 'Revoir les étapes' }));
    expect(app.modal).toEqual({ kind: 'settings', tab: 'projects', projectId: 'p1' });
  });

  it('draws a guessed step dashed', async () => {
    const w = gsd();
    w.steps.push({ ...w.steps[3], name: 'gsd:ship', command: '/gsd:ship', order: 4, agents: [], writes: [], guessed: true });
    await open(scanOf(w), gsdTracks());
    const tab = await screen.findByTestId('workflow');
    const guess = (await within(tab).findByText('Ship')).closest('.wf-step')!;
    expect(guess).toHaveClass('guess');
    expect(guess).toHaveTextContent('deviné : nommé par verify-work.md, jamais vu en cours');
  });

  it('shows a loop of one prompt by its turns and its checklist', async () => {
    const turn = (n: number, ticked: boolean | null, outcome: 'done' | 'running' = 'done') => ({
      n,
      at: new Date(2026, 9, 26, 12, n).getTime(),
      ended: null,
      ms: 60_000,
      cost: 0.2,
      checked: { done: 3 + n, total: 6 },
      ticked,
      outcome,
    });
    const tr = track('a1', { workflow: ralph().id, turns: [turn(1, true), turn(2, false), turn(3, null, 'running')] });
    await open(scanOf(ralph()), [tr]);
    const tab = await screen.findByTestId('workflow');
    await within(tab).findByText('Un prompt relancé à chaque tour', { exact: false });
    expect(within(tab).getByRole('img', { name: '6 cases cochées sur 6' })).toBeInTheDocument();
    expect([...tab.querySelectorAll('.wf-turns i')].map((i) => i.classList[0])).toEqual(['ok', 'bad', 'on', ...Array(17).fill('todo')]);
    expect(within(tab).getByText('Tour 3 · en cours', { selector: '.txt b' })).toBeInTheDocument();
    expect(within(tab).getByText('Sortie : plus de case vide, ou 20 tours.')).toBeInTheDocument();
    expect([...tab.querySelectorAll('.wf-step .wf-name')].map((n) => n.textContent)).toHaveLength(4);
    expect(tab.querySelectorAll('.wf-step')[2]).toHaveTextContent('retour à Implement it, and only it.');
    expect([...tab.querySelectorAll('.wf-hist .what b')].map((b) => b.textContent)).toEqual([
      'Tour 3 · en cours',
      'Tour 2 · non coché',
      'Tour 1 · coché',
    ]);
    expect(tab.querySelectorAll('.wf-hist .ev.bad')).toHaveLength(1);
    // No fold for a loop: its turns are its rail.
    expect(screen.queryByRole('button', { name: 'Replier les étapes' })).toBeNull();
  });

  it('says what was looked for when the project has no workflow, and the two ways out', async () => {
    const scan = scanOf();
    scan.untraced = [{ name: 'GSD', harness: 'claude', steps: 4 }];
    await open(scan, []);
    expect(await screen.findByRole('heading', { name: 'Pas de workflow dans demo-api' })).toBeInTheDocument();
    expect(screen.getByText('.claude/commands').parentElement).toHaveTextContent('rien');
    expect(screen.getByText('GSD').parentElement).toHaveTextContent('jamais lancé ici');
    expect(screen.getByRole('tab', { name: 'Workflow' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Analyser avec un agent…' }));
    expect(app.modal).toEqual({ kind: 'settings', tab: 'projects', projectId: 'p1' });
  });

  it('chooses among several workflows in its menu, a repository’s named by it', async () => {
    await open(scanOf(gsd(), { ...ralph(), repo: 'web' }), gsdTracks());
    await userEvent.click(await screen.findByRole('button', { name: 'Workflow' }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((b) => b.textContent),
    ).toEqual(['GSD', 'web · Ralph']);
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'web · Ralph' }));
    expect(workflows.chosen.p1).toBe(ralph().id);
    expect(await screen.findByText('Un prompt relancé à chaque tour', { exact: false })).toBeInTheDocument();
  });

  it('follows the tracks as they come', async () => {
    await open(scanOf(gsd()), [paginationUsers('a1')]);
    await screen.findByText('Agents dans GSD');
    workflows.take(track('a2', { step: 'gsd:discuss-phase', passages: [passage(1, 'gsd:discuss-phase', 0, 1, { outcome: 'running' })] }));
    const tab = screen.getByTestId('workflow');
    await waitFor(() =>
      expect(within(tab.querySelectorAll('.wf-step')[0] as HTMLElement).getByRole('button', { name: 'refacto-auth' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: /^Workflow/ })).toHaveTextContent('Workflow 2');
    void GSD_ID;
  });

  it('shows the workflow as the project has it: a step renamed by the user under its name, its agent on it', async () => {
    // What effective_workflows gives once « Plan phase » was renamed « Plan : revue » in Réglages › Projets › Workflow
    // (ESC-195); the tracking, corrected too, puts the agent on « Plan : revue ».
    const w = gsd();
    const corrected = {
      ...w,
      steps: w.steps.map((st) => (st.name === 'gsd:plan-phase' ? { ...st, name: 'Plan : revue', also: ['gsd:plan-phase'] } : st)),
    };
    corrected.transitions = w.transitions.map((tr) => ({
      ...tr,
      from: tr.from === 'gsd:plan-phase' ? 'Plan : revue' : tr.from,
      to: tr.to === 'gsd:plan-phase' ? 'Plan : revue' : tr.to,
    }));
    const tr = track('a1', { step: 'Plan : revue', passages: [passage(1, 'Plan : revue', 0, 3, { outcome: 'running' })] });
    fakeBackend({ get_workflows: () => scanOf(w), effective_workflows: () => [corrected], get_workflow_tracks: () => [tr] });
    render(SidePanel, { project: project(), agent: app.agents.a1, docked: true });
    await userEvent.click(await screen.findByRole('tab', { name: /^Workflow/ }));
    const tab = await screen.findByTestId('workflow');
    const names = async () => [...tab.querySelectorAll('.wf-step .wf-name')].map((n) => n.textContent);
    await waitFor(async () => expect(await names()).toEqual(['Discuss phase', 'Plan : revue', 'Execute phase', 'Verify work']));
    const plan = tab.querySelectorAll('.wf-step')[1] as HTMLElement;
    expect(plan).toHaveClass('here');
    expect(within(plan).getByRole('button', { name: 'pagination-users' })).toHaveAttribute('aria-current', 'true');
    // Its way back says the new name too, and so do the agent's row and its history.
    expect(tab.querySelectorAll('.wf-step')[3]).toHaveTextContent('retour à Plan : revue');
    expect(tab.querySelector('.wf-ag .where')).toHaveTextContent('Plan : revue');
    expect(tab.querySelector('.wf-hist .what b')).toHaveTextContent('Plan : revue');
  });

  it('leaves out a workflow the user dismissed: the tab then says it has none', async () => {
    const scan = scanOf(gsd(), ralph());
    fakeBackend({ get_workflows: () => scan, effective_workflows: () => [ralph()], get_workflow_tracks: () => [] });
    render(SidePanel, { project: project(), agent: app.agents.a1, docked: true });
    await userEvent.click(await screen.findByRole('tab', { name: /^Workflow/ }));
    expect(await screen.findByText('Un prompt relancé à chaque tour', { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Workflow' }));
    expect(
      within(screen.getByRole('menu'))
        .getAllByRole('menuitemradio')
        .map((b) => b.textContent),
    ).toEqual(['Ralph']);
  });

  it('says it has no workflow when the only one was dismissed, and reads them again when the corrections change', async () => {
    let effective = [] as ReturnType<typeof gsd>[];
    const be = fakeBackend({ get_workflows: () => scanOf(gsd()), effective_workflows: () => effective, get_workflow_tracks: () => [] });
    const { rerender } = render(SidePanel, { project: project(), agent: app.agents.a1, docked: true });
    await userEvent.click(await screen.findByRole('tab', { name: /^Workflow/ }));
    expect(await screen.findByRole('heading', { name: 'Pas de workflow dans demo-api' })).toBeInTheDocument();
    // « Ce n'est pas un workflow » undone in the settings: the project comes back with its corrections changed.
    effective = [gsd()];
    const before = be.called('effective_workflows').length;
    await rerender({
      project: project({ workflowFixes: [{ workflow: GSD_ID, steps: [{ name: 'Discuter', from: ['gsd:discuss-phase'] }] }] }),
      agent: app.agents.a1,
      docked: true,
    });
    await waitFor(() => expect(be.called('effective_workflows').length).toBeGreaterThan(before));
    expect(await screen.findByText('Discuss phase', { selector: '.wf-name' })).toBeInTheDocument();
  });

  it('speaks English', async () => {
    setLang('en');
    await open(scanOf(gsd()), gsdTracks());
    expect(await screen.findByText('Entry points')).toBeInTheDocument();
    expect(screen.getByText('Agents in GSD')).toBeInTheDocument();
    expect(screen.getByText('History of pagination-users')).toBeInTheDocument();
    expect(getByTip(document.body, 'Fold the steps')).toBeInTheDocument();
  });
});
