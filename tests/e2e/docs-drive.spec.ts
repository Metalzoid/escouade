// The drive of the documents (ESC-260) on a temporary repository with two folders: files dropped on the drive read and
// filed by Escouade itself (a PDF by its text into « Comptes rendus », a planning into a folder made for it), one
// dropped in a folder staying there, a card dragged onto another folder, the search in the documents and the text
// Escouade read, and a document cited by a page of the spec. The captures go to ESCOUADE_E2E_SHOTS, dark and light.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { addProject, expect, test } from './fixture';

const SHOTS = process.env.ESCOUADE_E2E_SHOTS;

/** A PDF of one page, its lines in Helvetica, its cross-reference table right (as `docsextract_tests::pdf_bytes`). */
function pdf(lines: string[]): Buffer {
  let content = 'BT /F1 14 Tf 72 760 Td 18 TL\n';
  for (const l of lines) content += `(${l.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj T*\n`;
  content += 'ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n';
  const at: number[] = [];
  objects.forEach((o, i) => {
    at.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const a of at) out += `${String(a).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const theme = (page: Page, t: 'dark' | 'light') =>
  page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  }, t);

async function shoot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const t of ['dark', 'light'] as const) {
    await theme(page, t);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `documents-${name}-${t}.png`) });
  }
  await theme(page, 'dark');
}

test('the drive files a file dropped by itself, moves one, searches the documents and says what cites them', async ({ app }) => {
  test.setTimeout(240_000);
  const { page } = app;
  await page.setViewportSize({ width: 1440, height: 900 });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: app.repo, encoding: 'utf8' });
  const docs = path.join(app.repo, '.escouade', 'documents');
  fs.mkdirSync(path.join(docs, 'Comptes rendus'), { recursive: true });
  fs.mkdirSync(path.join(docs, 'Juridique'), { recursive: true });
  fs.writeFileSync(
    path.join(docs, 'Comptes rendus', 'CR comité du 08-10.md'),
    '# Comité du 8 octobre\n\nPrésents : le bureau. Ordre du jour : les adhésions.\n',
  );
  fs.writeFileSync(path.join(docs, 'Juridique', 'Contrat de prestation.md'), '# Contrat\n\nLes clauses de résiliation.\n');
  // A page of the spec that cites a document of the drive.
  fs.mkdirSync(path.join(app.repo, '.escouade', 'spec', 'adhesion'), { recursive: true });
  fs.writeFileSync(
    path.join(app.repo, '.escouade', 'spec', 'adhesion', 'relance.md'),
    '---\ntitle: "Relance"\nsubject: "Adhésion"\nsources: ["documents/Comptes rendus/CR comité du 08-10.md"]\ntickets: []\ndecisions: []\ncompared: null\n---\n\nOn relance à 30 jours.\n',
  );
  git('add', '.');
  git('commit', '-qm', 'docs');

  await addProject(page, app.repo, { firstAgent: false });
  await page.getByRole('group', { name: 'Vue du projet' }).getByRole('button', { name: 'Docs' }).click();
  await page
    .getByRole('region', { name: 'Espaces des docs' })
    .getByRole('button', { name: /Documents/ })
    .click();

  // The folders, and each file with what cites it and who added it (git).
  const tree = page.getByRole('navigation', { name: 'Dossiers des documents' });
  await expect(tree.getByRole('button', { name: /Tous les documents\s*2/ })).toBeVisible();
  await expect(tree.getByRole('button', { name: /^Comptes rendus/ })).toBeVisible();
  const cr = page.locator('[data-document="Comptes rendus/CR comité du 08-10.md"]');
  await expect(cr).toContainText('cité 1 fois');
  await expect(cr).toContainText('e2e ·');
  await expect(page.locator('[data-dropzone]')).toContainText('Escouade les lit et les range seul');

  // Dropped on the drive: a PDF whose name says nothing, read and filed by its text; a planning, in a folder made for it.
  const input = page.locator('[data-documents-input]');
  await input.setInputFiles([
    {
      name: 'scan-0042.pdf',
      mimeType: 'application/pdf',
      buffer: pdf(['Compte rendu de la reunion du bureau', 'Presents : Claire, Guillaume.']),
    },
    { name: 'roadmap.md', mimeType: 'text/markdown', buffer: Buffer.from('# Roadmap\n\nLes jalons du projet jusqu’en juin.\n') },
  ]);
  await expect(page.locator('[data-notice="scan-0042.pdf"]')).toContainText('rangé dans « Comptes rendus »', { timeout: 30_000 });
  await expect(page.locator('[data-notice="roadmap.md"]')).toContainText('rangé dans un nouveau dossier, « Planning »', {
    timeout: 30_000,
  });
  expect(fs.existsSync(path.join(docs, 'Comptes rendus', 'scan-0042.pdf'))).toBe(true);
  expect(fs.existsSync(path.join(docs, 'Planning', 'roadmap.md'))).toBe(true);
  await expect(tree.getByRole('button', { name: /^Planning\s*1/ })).toBeVisible();
  // Its text read here, kept outside the repository; nothing committed.
  expect(git('status', '--porcelain')).toContain('.escouade/documents/');
  expect(fs.readdirSync(path.join(app.repo, '.escouade', 'documents', 'Comptes rendus'))).not.toContain('scan-0042.txt');
  await shoot(page, 'dropped');

  // A folder open: its files, the drop filing in it.
  await tree.getByRole('button', { name: /^Comptes rendus/ }).click();
  await expect(page.getByRole('heading', { name: 'Comptes rendus' })).toBeVisible();
  await expect(page.locator('[data-document]')).toHaveCount(2);
  await expect(page.locator('[data-dropzone]')).toContainText('pour les ranger dans « Comptes rendus »');
  await input.setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Notes de séance.') }]);
  await expect(page.locator('[data-notice="notes.txt"]')).toContainText('ajouté à « Comptes rendus »', { timeout: 30_000 });
  await expect(page.locator('[data-document]')).toHaveCount(3);
  await shoot(page, 'folder');

  // A card dragged onto another folder moves there.
  await page.locator('[data-document="Comptes rendus/notes.txt"]').dragTo(tree.locator('[data-folder="Juridique"]'));
  await expect.poll(() => fs.existsSync(path.join(docs, 'Juridique', 'notes.txt')), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('[data-document]')).toHaveCount(2);

  // The search: by the words here (no vectors' model downloaded), the PDF found by its text, opened on what was read.
  await page.getByRole('button', { name: /Rechercher dans les documents/ }).click();
  await page.getByRole('searchbox', { name: 'Recherche dans les documents' }).fill('reunion bureau');
  const hit = page.locator('[data-hit="Comptes rendus/scan-0042.pdf"]');
  await expect(hit).toContainText('Compte rendu de la reunion du bureau', { timeout: 15_000 });
  await shoot(page, 'search');
  await hit.click();
  const preview = page.getByRole('dialog', { name: 'scan-0042.pdf' });
  await expect(preview.locator('[data-preview]')).toContainText('Presents : Claire, Guillaume.');
  await shoot(page, 'preview');
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
});
