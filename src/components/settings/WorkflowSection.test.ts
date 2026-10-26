import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../../lib/i18n';
import { app } from '../../lib/state.svelte';
import type { Project, WorkflowFix } from '../../lib/types';
import { fakeBackend, project, resetApp } from '../../test/ipc';
import { gsdScan, gsdWorkflow } from '../../test/workflows';
import SettingsModal from '../modals/SettingsModal.svelte';

vi.mock('../../lib/terminals', () => ({ launchLog: () => ({}), disposeLog() {} }));

const save = () => userEvent.click(screen.getByRole('button', { name: /^(Enregistrer|Save)$/ }));
const section = () => document.querySelector<HTMLElement>('#sg-workflow')!;
const sentFixes = (backend: ReturnType<typeof fakeBackend>) =>
  backend.called('update_project').at(-1)!.args.project.workflowFixes as WorkflowFix[];

function open(over: Partial<Project> = {}, scan = gsdScan()) {
  resetApp({ projects: [project(over)] });
  app.modal = { kind: 'settings' };
  const backend = fakeBackend({ get_workflows: () => scan, refresh_workflows: () => ({ ...scan, readAt: scan.readAt + 60_000 }) });
  render(SettingsModal, { tab: 'projects', projectId: 'p1' });
  return backend;
}

describe('Réglages › Projets › Workflow (ESC-195)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 11, 0));
  });

  it('says what the rules read and when, reads again on « Relire », and lists what was found', async () => {
    const backend = open();
    const s = within(section());
    expect(await s.findByText('Lu par les règles à 10:12')).toBeInTheDocument();
    expect(s.getByText('~/.claude/commands/gsd')).toHaveTextContent('~/.claude/commands/gsd 4');
    expect(s.getByText('~/.claude/get-shit-done/workflows')).toHaveTextContent('2 par @');
    expect(s.getByText('.planning/STATE.md')).toBeInTheDocument();
    // A file gone is not said.
    expect(s.queryByText('.planning/GONE.md')).toBeNull();
    // Found: GSD, and a command alone.
    const gsd = s.getByRole('button', { name: 'Corriger les étapes de GSD' });
    expect(gsd).toHaveTextContent('4 étapes · 6 portes · 4 sous-agents');
    expect(gsd).toHaveTextContent('lu par les règles');
    expect(s.getByText('/commit').closest('.rrow')).toHaveTextContent('une commande seule, sans suitepas un workflow');
    await userEvent.click(s.getByRole('button', { name: 'Relire' }));
    expect(backend.called('refresh_workflows')).toHaveLength(1);
    expect(await s.findByText('Lu par les règles à 10:13')).toBeInTheDocument();
    // « Affiner… » waits for its agent, and says so.
    expect(s.getByRole('button', { name: 'Affiner…' })).toBeDisabled();
    expect(s.getByRole('button', { name: 'Affiner…' })).toHaveAccessibleDescription(/^Bientôt : l’agent qui affine/);
  });

  it('turns the reading again by itself off', async () => {
    const backend = open();
    await userEvent.click(within(section()).getByRole('switch', { name: 'Relire quand les fichiers changent' }));
    await save();
    expect(backend.called('update_project')[0].args.project).toMatchObject({ workflowsAutoRead: false });
  });

  it('renames, merges, removes, reorders and adds steps, the corrections saved with the project', async () => {
    const backend = open();
    const s = within(section());
    const name = (n: number) => s.getByRole('textbox', { name: `Nom de l’étape ${n}` });
    await userEvent.clear(await s.findByRole('textbox', { name: 'Nom de l’étape 1' }));
    await userEvent.type(name(1), 'Mise au point');
    expect(s.getByRole('button', { name: 'Corriger les étapes de GSD' })).toHaveTextContent('corrigé');
    // Planifier and Exécuter as one.
    await userEvent.click(s.getByRole('button', { name: 'Fusionner l’étape 2 avec la suivante' }));
    expect(s.getAllByRole('textbox', { name: /^Nom de l’étape/ })).toHaveLength(3);
    // Vérifier first, from the keyboard.
    name(3).focus();
    await userEvent.keyboard('{Alt>}{ArrowUp}{ArrowUp}{/Alt}');
    expect(name(1)).toHaveValue('gsd:verify-work');
    expect(name(1)).toHaveFocus();
    // The way back said with the names as corrected.
    expect(section().querySelector('.wf-er.loop')).toHaveTextContent('gsd:verify-work revient à gsd:plan-phase');
    // A step added, told by a file written.
    await userEvent.click(s.getByRole('button', { name: 'Ajouter une étape' }));
    expect(name(4)).toHaveFocus();
    await userEvent.type(name(4), 'Livrer');
    await userEvent.selectOptions(s.getByRole('combobox', { name: 'Ce qui signale l’étape 4' }), 'Fichier écrit');
    await userEvent.type(s.getByRole('textbox', { name: 'Valeur de ce qui signale l’étape 4' }), 'SHIPPED.md');
    // And one removed.
    await userEvent.click(s.getByRole('button', { name: 'Retirer l’étape 2' }));
    await save();
    expect(sentFixes(backend)).toEqual([
      {
        workflow: '|claude|gsd',
        steps: [
          { name: 'gsd:verify-work', from: ['gsd:verify-work'] },
          { name: 'gsd:plan-phase', from: ['gsd:plan-phase', 'gsd:execute-phase'] },
          { name: 'Livrer', signals: [{ file: 'SHIPPED.md' }] },
        ],
        removed: ['gsd:discuss-phase'],
      },
    ]);
  });

  it('moves a step dragged by its number', async () => {
    const backend = open();
    const s = within(section());
    await s.findByRole('textbox', { name: 'Nom de l’étape 1' });
    const rows = section().querySelectorAll('.wf-er:not(.loop)');
    await fireEvent.dragStart(rows[3].querySelector('.no')!);
    await fireEvent.dragOver(rows[0]);
    await fireEvent.drop(rows[0]);
    expect(s.getByRole('textbox', { name: 'Nom de l’étape 1' })).toHaveValue('gsd:verify-work');
    await save();
    expect(sentFixes(backend)[0].steps?.map((x) => x.from?.[0])).toEqual([
      'gsd:verify-work',
      'gsd:discuss-phase',
      'gsd:plan-phase',
      'gsd:execute-phase',
    ]);
  });

  it('keeps or removes a step the reading guessed', async () => {
    const guessed = gsdWorkflow({
      steps: [...gsdWorkflow().steps, { ...gsdWorkflow().steps[0], name: 'gsd:ship', command: '/gsd:ship', guessed: true }],
    });
    const backend = open({}, gsdScan({ workflows: [guessed] }));
    const s = within(section());
    await s.findByRole('textbox', { name: 'Nom de l’étape 5' });
    const row = section().querySelectorAll('.wf-er')[4] as HTMLElement;
    expect(row).toHaveClass('guess');
    expect(row).toHaveTextContent('deviné · /gsd:ship');
    await userEvent.click(within(row).getByRole('button', { name: 'Garder' }));
    expect(section().querySelectorAll('.wf-er')[4]).not.toHaveClass('guess');
    await save();
    expect(sentFixes(backend)[0].steps?.at(-1)).toEqual({ name: 'gsd:ship', from: ['gsd:ship'] });
  });

  it('says a correction that no longer matches anything', async () => {
    open({ workflowFixes: [{ workflow: '|claude|gsd', steps: [{ name: 'Ancienne', from: ['gsd:gone'] }] }] });
    expect(await within(section()).findByText('ne correspond plus à rien : la lecture n’a plus gsd:gone')).toBeInTheDocument();
  });

  it('sets a workflow apart, then brings it back', async () => {
    const backend = open();
    const s = within(section());
    await userEvent.click(await s.findByRole('button', { name: 'Ce n’est pas un workflow' }));
    expect(s.queryByText('Étapes')).toBeNull();
    expect(s.getByText('GSD').closest('.rrow')).toHaveTextContent('pas un workflow');
    await save();
    expect(sentFixes(backend)).toEqual([{ workflow: '|claude|gsd', dismissed: true }]);
    await userEvent.click(s.getByRole('button', { name: 'Rétablir' }));
    expect(s.getByText('Étapes')).toBeInTheDocument();
  });

  it('keeps the workflows in the repository by default, or on this machine when asked', async () => {
    const backend = open();
    const s = within(section());
    expect(await s.findByRole('radio', { name: 'Dans le dépôt' })).toBeChecked();
    expect(s.getByText(/^Les workflows tirés de la config du dépôt/)).toHaveTextContent('.escouade/workflows/');
    expect(s.getByText(/ne les commite jamais/)).toBeInTheDocument();
    await userEvent.click(s.getByRole('radio', { name: 'Sur cette machine' }));
    expect(s.getByRole('radio', { name: 'Sur cette machine' })).toBeChecked();
    await save();
    expect(backend.called('update_project')[0].args.project).toMatchObject({ workflowsInRepo: false });
  });

  it('says a file that cannot be read, one updated by the reading, and one of the team’s alone that it can remove', async () => {
    const scan = gsdScan({
      files: [{ id: '|claude|gsd', path: '.escouade/workflows/claude-gsd.yml', local: false, inRepo: true, updated: null }],
      unreadable: [{ path: '.escouade/workflows/broken.yml', why: 'version manque' }],
    });
    const backend = open({}, scan);
    const s = within(section());
    expect(await s.findByText('.escouade/workflows/broken.yml illisible : version manque')).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'Corriger les étapes de GSD' })).toHaveTextContent('dans le dépôt');
    expect(s.getByRole('button', { name: 'Corriger les étapes de GSD' })).toHaveTextContent('du dépôt');
    expect(
      s.getByText('Cette machine ne le lit pas : il vient de .escouade/workflows/claude-gsd.yml, du dépôt.', { exact: false }),
    ).toBeInTheDocument();
    await userEvent.click(s.getByRole('button', { name: 'Retirer du dépôt' }));
    expect(backend.called('remove_workflow_file')).toEqual([expect.objectContaining({ args: { id: 'p1', workflow: '|claude|gsd' } })]);
  });

  it('says what the reading changed of a workflow', async () => {
    open(
      {},
      gsdScan({
        files: [
          {
            id: '|claude|gsd',
            path: '~/.escouade/projects/p1/workflows/claude-gsd.yml',
            local: true,
            inRepo: false,
            updated: 'étapes ajoutées : gsd:ship',
          },
        ],
      }),
    );
    expect(await within(section()).findByText('mis à jour par la relecture')).toBeInTheDocument();
    // Of the user's own folders: on this machine, outside the repository.
    expect(within(section()).getByRole('button', { name: 'Corriger les étapes de GSD' })).toHaveTextContent(
      'sur cette machine (hors du dépôt)',
    );
  });

  it('says it in English', async () => {
    setLang('en');
    open();
    const s = within(section());
    expect(await s.findByText(/^Read by the rules at 10:12/)).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'Correct the steps of GSD' })).toHaveTextContent('4 steps · 6 entries · 4 subagents');
    expect(s.getByRole('button', { name: 'Merge step 1 with the next' })).toBeInTheDocument();
    expect(s.getByRole('radio', { name: 'In the repository' })).toBeChecked();
    expect(s.getByRole('button', { name: 'Add a step' })).toBeInTheDocument();
  });
});
