import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend, project, resetApp } from '../test/ipc';
import { buffers } from './editor/buffers.svelte';
import { setLang } from './i18n';
import { askCloseProject } from './project-actions';
import { app } from './state.svelte';

describe('askCloseProject', () => {
  beforeEach(() => {
    resetApp({ projects: [project()] });
    fakeBackend();
  });
  afterEach(() => vi.restoreAllMocks());

  it('asks before closing, and says its history is kept and the files on the disk stay', () => {
    askCloseProject(project());
    expect(app.modal).toMatchObject({
      kind: 'confirm',
      title: 'Fermer « demo-api » ?',
      body: "Le projet quitte l'application : ses agents, ses terminaux et ses lancements s'arrêtent. Son historique (conversations, tickets, réglages) est gardé : rouvrir ce dossier le retrouve. Les fichiers et les worktrees sur le disque ne sont pas touchés.",
      confirm: 'Fermer le projet',
      danger: true,
    });
  });

  it('offers to erase the history too, a box unchecked at first', () => {
    askCloseProject(project());
    expect((app.modal as any).option).toEqual({ label: 'Effacer aussi son historique (conversations, tickets, réglages)', value: false });
  });

  it('asks in English, and adds the sentence about the unsaved files after its own', () => {
    setLang('en');
    vi.spyOn(buffers, 'unsavedIn').mockReturnValue(2);
    askCloseProject(project());
    expect(app.modal).toMatchObject({
      kind: 'confirm',
      title: 'Close “demo-api”?',
      body: 'The project leaves the app: its agents, terminals and launches stop. Its history (conversations, tickets, settings) is kept: adding this folder again brings it back. The files and worktrees on disk are not touched. 2 unsaved files in the editor will be lost.',
      confirm: 'Close the project',
      option: { label: 'Also erase its history (conversations, tickets, settings)', value: false },
    });
  });

  it('closes the project and keeps its history unless the box is checked', async () => {
    const backend = fakeBackend();
    askCloseProject(project());
    await (app.modal as any).onConfirm(false);
    expect(backend.called('remove_project')[0].args).toEqual({ id: 'p1', erase: false });
    expect(app.projects).toEqual([]);
  });

  it('erases the history with the project when the box is checked', async () => {
    const backend = fakeBackend();
    askCloseProject(project());
    await (app.modal as any).onConfirm(true);
    expect(backend.called('remove_project')[0].args).toEqual({ id: 'p1', erase: true });
    expect(app.projects).toEqual([]);
  });
});
