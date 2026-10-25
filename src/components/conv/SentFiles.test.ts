import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../lib/i18n';
import type { SentView, ToolItem } from '../../lib/types';
import { fakeBackend, resetApp } from '../../test/ipc';
import SentFiles from './SentFiles.svelte';

const A = 'data:image/png;base64,QQ==';
const B = 'data:image/png;base64,Qg==';

const call = (input: Record<string, unknown>): ToolItem => ({
  kind: 'tool',
  id: 'toolu_1',
  name: 'SendUserFile',
  input: { status: 'normal', display: 'render', ...input },
  status: 'ok',
  ts: 0,
});

function show(input: Record<string, unknown>, views: SentView[]) {
  const backend = fakeBackend({ sent_files: () => views });
  const r = render(SentFiles, { item: call(input), agentId: 'ag', engine: 'claude' });
  return { ...r, backend };
}

const thumbs = () => screen.queryAllByRole('button', { name: /^Voir .* en grand$/ });

beforeEach(() => {
  setLang('fr');
  resetApp({});
});

describe('SentFiles', () => {
  it('says who sent what, shows the caption and opens the viewer on a thumbnail', async () => {
    show({ files: ['C:/w/a.png', 'C:/w/b.png'], caption: 'Les deux **vues**' }, [
      { name: 'a.png', kind: 'image', state: 'ok', size: 10, url: A },
      { name: 'b.png', kind: 'image', state: 'ok', size: 10, url: B },
    ]);
    expect(screen.getByText('Envoyé par Claude')).toBeInTheDocument();
    expect(screen.getByText('vues').tagName).toBe('STRONG');
    await waitFor(() => expect(thumbs()).toHaveLength(2));
    expect(screen.getByText('2 images')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Voir b.png en grand' }));
    const viewer = screen.getByRole('dialog', { name: 'Images envoyées' });
    expect(within(viewer).getByRole('img')).toHaveAttribute('src', B);
    expect(within(viewer).getByText('2 sur 2')).toBeInTheDocument();
    // Next goes round to the first; the arrows too.
    await userEvent.click(within(viewer).getByRole('button', { name: 'Image suivante' }));
    expect(within(viewer).getByRole('img')).toHaveAttribute('src', A);
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(viewer).getByRole('img')).toHaveAttribute('src', B);
    await userEvent.click(within(viewer).getByRole('button', { name: 'Image précédente' }));
    expect(within(viewer).getByText('1 sur 2')).toBeInTheDocument();
    // Échap closes it.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the other files with « Ouvrir » and « Afficher dans le dossier », asked of the core by their rank', async () => {
    const { backend } = show({ files: ['C:/w/a.png', 'C:/w/contrat.pdf'] }, [
      { name: 'a.png', kind: 'image', state: 'ok', size: 10, url: A },
      { name: 'contrat.pdf', kind: 'file', state: 'ok', size: 1468006 },
    ]);
    await waitFor(() => expect(screen.getByText('1,4 Mo')).toBeInTheDocument());
    expect(screen.getByText('1 image et 1 fichier')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir contrat.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Afficher contrat.pdf dans le dossier' }));
    expect(backend.called('sent_file_open').map((c) => c.args)).toEqual([
      { agentId: 'ag', itemId: 'toolu_1', index: 1, reveal: false },
      { agentId: 'ag', itemId: 'toolu_1', index: 1, reveal: true },
    ]);
  });

  it('says a file gone, one of a private project, an image too heavy, without actions on what is not there', async () => {
    show({ files: ['C:/w/gone.pdf', 'D:/secret/x.png', 'C:/w/huge.png'] }, [
      { name: 'gone.pdf', kind: 'file', state: 'missing' },
      { name: 'x.png', kind: 'file', state: 'fenced' },
      { name: 'huge.png', kind: 'file', state: 'ok', size: 12 * 1024 * 1024, big: true },
    ]);
    await waitFor(() => expect(screen.getByText('Fichier introuvable')).toBeInTheDocument());
    expect(screen.getByText('Fichier d’un projet privé, non affiché')).toBeInTheDocument();
    expect(screen.getByText(/Image trop lourde pour l’aperçu/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ouvrir gone.pdf' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ouvrir x.png' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvrir huge.png' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('lists the images as files when the agent attached them (`display: "attach"`), the viewer still a click away', async () => {
    show({ files: ['C:/w/a.png'], display: 'attach' }, [{ name: 'a.png', kind: 'image', state: 'ok', size: 2048, url: A }]);
    await waitFor(() => expect(screen.getByText('2 Ko')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Ouvrir a.png' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir a.png en grand' }));
    expect(within(screen.getByRole('dialog')).getByRole('img')).toHaveAttribute('src', A);
    // One image: no previous nor next.
    expect(screen.queryByRole('button', { name: 'Image suivante' })).not.toBeInTheDocument();
  });

  it('never offers to open a program or a script the agent sent: only its folder', async () => {
    show({ files: ['C:/w/deploy.ps1', 'C:/w/doc.pdf'] }, [
      { name: 'deploy.ps1', kind: 'file', state: 'ok', size: 120, runnable: true },
      { name: 'doc.pdf', kind: 'file', state: 'ok', size: 2048 },
    ]);
    await waitFor(() => expect(screen.getByText('deploy.ps1')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ouvrir doc.pdf' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Ouvrir deploy.ps1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afficher deploy.ps1 dans le dossier' })).toBeInTheDocument();
  });

  it('shows the names while the core reads them, in English too', async () => {
    setLang('en');
    fakeBackend({ sent_files: () => new Promise(() => {}) });
    render(SentFiles, { item: call({ files: ['C:\\w\\report.html'] }), agentId: 'ag', engine: 'claude' });
    expect(screen.getByText('Sent by Claude')).toBeInTheDocument();
    expect(screen.getByText('report.html')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

describe('Markdown: an image of a message by a local path (ESC-171)', () => {
  it('is read by the core for the agent, and says so when it cannot be', async () => {
    const { default: Markdown } = await import('./Markdown.svelte');
    const backend = fakeBackend({ agent_local_image: (a: { src: string }) => (a.src.endsWith('a.png') ? A : null) });
    const { container } = render(Markdown, { text: '![rendu](C:/w/a.png) ![autre](C:/w/gone.png)', agentId: 'ag' });
    await waitFor(() => expect(container.querySelector('img[alt="rendu"]')).toHaveAttribute('src', A));
    await waitFor(() => expect(container.querySelector('[data-img-off]')).toHaveAttribute('title', 'Image introuvable : C:/w/gone.png'));
    expect(container.querySelector('[data-img-off]')).toHaveTextContent('autre');
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(backend.called('agent_local_image').map((c) => c.args)).toEqual([
      { agentId: 'ag', src: 'C:/w/a.png' },
      { agentId: 'ag', src: 'C:/w/gone.png' },
    ]);
  });

  it('downloads an image of the web through the core on « Afficher l’image » only', async () => {
    const { default: Markdown } = await import('./Markdown.svelte');
    const backend = fakeBackend({ remote_image: () => B });
    const { container } = render(Markdown, { text: 'voici ![plan](https://example.com/p.png?k=1)', agentId: 'ag' });
    await new Promise((r) => setTimeout(r, 20));
    expect(backend.called('remote_image')).toEqual([]);
    expect(container.querySelector('img')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Afficher l’image' }));
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', B));
    expect(container.querySelector('img')).toHaveAttribute('alt', 'plan');
    expect(backend.called('remote_image').map((c) => c.args)).toEqual([{ src: 'https://example.com/p.png?k=1' }]);
  });

  it('is never read without the agent whose message it is', async () => {
    const { default: Markdown } = await import('./Markdown.svelte');
    const backend = fakeBackend({});
    const { container } = render(Markdown, { text: '![rendu](C:/w/a.png)' });
    await waitFor(() => expect(container.querySelector('[data-img-off]')).toHaveAttribute('title', 'Image introuvable : C:/w/a.png'));
    expect(container.querySelector('img')).toBeNull();
    expect(backend.called('agent_local_image')).toEqual([]);
  });
});
