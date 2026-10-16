import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DraftAttachment } from '../lib/attachments';
import { setLang } from '../lib/i18n';
import type { AttachedFile } from '../lib/types';
import AttachmentChip from './AttachmentChip.svelte';

const MB = 1024 * 1024;
const attached = (name: string, size: number, origin = false): AttachedFile => ({
  name,
  size,
  origin,
  path: `/data/a1/1f2e/${name}`,
  claudePath: `/data/a1/1f2e/${name}`,
});
/** A file sent by its path, as the composer holds it. */
const chip = (name: string, size: number, over: Partial<DraftAttachment> = {}): DraftAttachment => ({
  kind: 'file',
  name,
  mediaType: '',
  data: '',
  size,
  file: attached(name, size),
  ...over,
});

describe('AttachmentChip', () => {
  it('shows the name and the size of the file, and takes it away', async () => {
    const onremove = vi.fn();
    render(AttachmentChip, { attachment: chip('sources.zip', 3 * MB), onremove });
    expect(screen.getByText('sources.zip')).toBeInTheDocument();
    expect(screen.getByText('3 Mo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer sources.zip' }));
    expect(onremove).toHaveBeenCalledOnce();
  });

  it('writes a size under 1 Mo in Ko', () => {
    render(AttachmentChip, { attachment: chip('notes.md', 12 * 1024, { kind: 'text', file: undefined }), onremove: () => {} });
    expect(screen.getByText('12 Ko')).toBeInTheDocument();
  });

  it('draws an icon by type of file', () => {
    const cases: [string, string][] = [
      ['sources.zip', 'archive'],
      ['budget.xlsx', 'sheet'],
      ['plan.docx', 'document'],
      ['demo.mp4', 'video'],
      ['memo.mp3', 'audio'],
      ['main.rs', 'code'],
      ['setup.exe', 'generic'],
    ];
    for (const [name, icon] of cases) {
      const { container, unmount } = render(AttachmentChip, { attachment: chip(name, 1024), onremove: () => {} });
      expect(container.querySelector('[data-icon]'), name).toHaveAttribute('data-icon', icon);
      unmount();
    }
  });

  it('warns of a big file, saying it is copied to the disk', () => {
    render(AttachmentChip, { attachment: chip('film.mkv', 250 * MB, { warn: true }), onremove: () => {} });
    const warning = screen.getByRole('img', { name: 'Gros fichier : 250 Mo, copié sur le disque' });
    expect(warning).toHaveAttribute('data-tip', 'Gros fichier : 250 Mo, copié sur le disque');
  });

  it('warns of a big file attached where it is, saying nothing was copied', () => {
    const file = attached('film.mkv', 250 * MB, true);
    render(AttachmentChip, { attachment: chip('film.mkv', 250 * MB, { warn: true, file }), onremove: () => {} });
    expect(screen.getByRole('img', { name: 'Gros fichier : 250 Mo, joint là où il est, sans copie' })).toBeInTheDocument();
  });

  it('marks a file attached where it is, and says in a tooltip that it is read there', () => {
    const file = attached('rapport.xlsx', 3 * MB, true);
    render(AttachmentChip, { attachment: chip('rapport.xlsx', 3 * MB, { file }), onremove: () => {} });
    const mark = screen.getByRole('img', { name: 'Fichier d’origine, lu là où il est' });
    expect(mark).toHaveAttribute('data-tip', 'Fichier d’origine, lu là où il est');
  });

  it('marks nothing on a copy, nor on a file not attached yet or one that goes in the message', () => {
    const { unmount } = render(AttachmentChip, { attachment: chip('rapport.xlsx', 3 * MB), onremove: () => {} });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    unmount();
    const checking = chip('rapport.xlsx', 3 * MB, { file: undefined, copying: true, progress: 0 });
    const second = render(AttachmentChip, { attachment: checking, onremove: () => {} });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    second.unmount();
    render(AttachmentChip, { attachment: chip('notes.md', 1024, { kind: 'text', file: undefined }), onremove: () => {} });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps the mark of an original file along with the warning of a big one', () => {
    const file = attached('film.mkv', 250 * MB, true);
    render(AttachmentChip, { attachment: chip('film.mkv', 250 * MB, { warn: true, file }), onremove: () => {} });
    expect(screen.getByRole('img', { name: 'Fichier d’origine, lu là où il est' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gros fichier : 250 Mo, joint là où il est, sans copie' })).toBeInTheDocument();
  });

  it('warns of nothing a file under the threshold', () => {
    render(AttachmentChip, { attachment: chip('film.mkv', 3 * MB), onremove: () => {} });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows how far its copy went', () => {
    render(AttachmentChip, {
      attachment: chip('film.mkv', 250 * MB, { file: undefined, copying: true, progress: 0.42 }),
      onremove: () => {},
    });
    const bar = screen.getByRole('progressbar', { name: 'Copie de film.mkv' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42 %')).toBeInTheDocument();
  });

  it('shows no progress once copied', () => {
    render(AttachmentChip, { attachment: chip('film.mkv', 250 * MB), onremove: () => {} });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/ %$/)).not.toBeInTheDocument();
  });

  it('can still be taken away while copied: that cancels the copy', async () => {
    const onremove = vi.fn();
    render(AttachmentChip, { attachment: chip('film.mkv', 250 * MB, { file: undefined, copying: true, progress: 0 }), onremove });
    await userEvent.click(screen.getByRole('button', { name: 'Retirer film.mkv' }));
    expect(onremove).toHaveBeenCalledOnce();
  });

  it('says the mark of an original file in English', () => {
    setLang('en');
    render(AttachmentChip, {
      attachment: chip('rapport.xlsx', 3 * MB, { file: attached('rapport.xlsx', 3 * MB, true) }),
      onremove: () => {},
    });
    const mark = screen.getByRole('img', { name: 'Original file, read where it is' });
    expect(mark).toHaveAttribute('data-tip', 'Original file, read where it is');
  });

  it('speaks English', () => {
    setLang('en');
    render(AttachmentChip, {
      attachment: chip('film.mkv', 250 * MB, { warn: true, file: undefined, copying: true, progress: 0.5 }),
      onremove: () => {},
    });
    expect(screen.getByRole('button', { name: 'Remove film.mkv' })).toBeInTheDocument();
    expect(screen.getByText('250 MB')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Big file: 250 MB, copied to the disk' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Copying film.mkv' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});
