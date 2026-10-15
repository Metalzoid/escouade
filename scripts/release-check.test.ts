// @vitest-environment node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REQUIRED, problems } from './release-check.mjs';

const TAG = 'v1.7.7';
const BASE = `https://github.com/guillaume-gagnaire/escouade/releases/download/${TAG}`;

// The shape of a real latest.json (1.7.7): the four systems, plus the per-format entries.
function latestJson() {
  const entry = (file: string) => ({ signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZw==', url: `${BASE}/${file}` });
  return {
    version: '1.7.7',
    notes: 'Notes.',
    pub_date: '2026-10-15T10:00:00Z',
    platforms: {
      'linux-x86_64': entry('Escouade_1.7.7_amd64.AppImage'),
      'linux-x86_64-appimage': entry('Escouade_1.7.7_amd64.AppImage'),
      'linux-x86_64-deb': entry('Escouade_1.7.7_amd64.deb'),
      'windows-x86_64': entry('Escouade_1.7.7_x64-setup.exe'),
      'windows-x86_64-nsis': entry('Escouade_1.7.7_x64-setup.exe'),
      'darwin-aarch64': entry('Escouade_universal.app.tar.gz'),
      'darwin-x86_64': entry('Escouade_universal.app.tar.gz'),
      'darwin-aarch64-app': entry('Escouade_universal.app.tar.gz'),
      'darwin-x86_64-app': entry('Escouade_universal.app.tar.gz'),
    } as Record<string, { signature: string; url: string }>,
  };
}

// The assets of the draft, as the GitHub API lists them.
function assetList() {
  const asset = (name: string, extra: Record<string, unknown> = {}) => ({ name, state: 'uploaded', size: 4096, ...extra });
  return [
    asset('Escouade_1.7.7_amd64.AppImage'),
    asset('Escouade_1.7.7_amd64.AppImage.sig'),
    asset('Escouade_1.7.7_amd64.deb'),
    asset('Escouade_1.7.7_amd64.deb.sig'),
    asset('Escouade_1.7.7_universal.dmg'),
    asset('Escouade_1.7.7_x64-setup.exe'),
    asset('Escouade_1.7.7_x64-setup.exe.sig'),
    asset('Escouade_universal.app.tar.gz'),
    asset('Escouade_universal.app.tar.gz.sig'),
    asset('latest.json'),
  ];
}

describe('release check', () => {
  it('names the four systems the updater needs', () => {
    expect(REQUIRED).toEqual(['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64']);
  });

  it('finds nothing to say about a complete latest.json whose files are all in the draft', () => {
    expect(problems(latestJson(), assetList(), TAG)).toEqual([]);
  });

  it('accepts a pre-release tag', () => {
    const latest = latestJson();
    latest.version = '1.8.0-beta.1';
    for (const p of Object.values(latest.platforms)) p.url = p.url.replace('/v1.7.7/', '/v1.8.0-beta.1/');
    expect(problems(latest, assetList(), 'v1.8.0-beta.1')).toEqual([]);
  });

  it('refuses a latest.json of another version than the tag', () => {
    const latest = latestJson();
    latest.version = '1.7.6';
    const found = problems(latest, assetList(), TAG);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('1.7.6');
    expect(found[0]).toContain(TAG);
  });

  it('refuses a latest.json without a version', () => {
    const latest: Record<string, unknown> = latestJson();
    delete latest.version;
    expect(problems(latest, assetList(), TAG)).toHaveLength(1);
  });

  it.each(['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64'])('refuses a latest.json that misses %s', (platform) => {
    const latest = latestJson();
    delete latest.platforms[platform];
    const found = problems(latest, assetList(), TAG);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(platform);
  });

  it('refuses a latest.json without any platform', () => {
    expect(problems({ version: '1.7.7' }, assetList(), TAG)).toHaveLength(REQUIRED.length);
    expect(problems({ version: '1.7.7', platforms: {} }, assetList(), TAG)).toHaveLength(REQUIRED.length);
  });

  it('refuses an empty or missing signature, on a required platform or not', () => {
    const latest = latestJson();
    latest.platforms['windows-x86_64'].signature = '';
    const found = problems(latest, assetList(), TAG);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('windows-x86_64');
    expect(found[0]).toContain('signature');

    const other = latestJson();
    delete (other.platforms['linux-x86_64-deb'] as Partial<{ signature: string }>).signature;
    const foundOther = problems(other, assetList(), TAG);
    expect(foundOther).toHaveLength(1);
    expect(foundOther[0]).toContain('linux-x86_64-deb');
  });

  it('refuses a file that latest.json names and the draft does not hold', () => {
    const assets = assetList().filter((a) => a.name !== 'Escouade_1.7.7_x64-setup.exe');
    const found = problems(latestJson(), assets, TAG);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.includes('Escouade_1.7.7_x64-setup.exe'))).toBe(true);
    expect(found.some((f) => f.includes('windows-x86_64'))).toBe(true);
  });

  it('refuses a file still being uploaded', () => {
    const assets = assetList().map((a) => (a.name === 'Escouade_universal.app.tar.gz' ? { ...a, state: 'starter' } : a));
    const found = problems(latestJson(), assets, TAG);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.includes('Escouade_universal.app.tar.gz'))).toBe(true);
    expect(found[0]).toContain('starter');
  });

  it('refuses an empty file', () => {
    const assets = assetList().map((a) => (a.name === 'Escouade_1.7.7_amd64.AppImage' ? { ...a, size: 0 } : a));
    const found = problems(latestJson(), assets, TAG);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.includes('Escouade_1.7.7_amd64.AppImage'))).toBe(true);
  });

  it('refuses a link under another tag, such as the untagged one of a draft', () => {
    const latest = latestJson();
    latest.platforms['darwin-aarch64'].url =
      'https://github.com/guillaume-gagnaire/escouade/releases/download/untagged-0123abcd/Escouade_universal.app.tar.gz';
    const found = problems(latest, assetList(), TAG);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('darwin-aarch64');
    expect(found[0]).toContain('untagged-0123abcd');
  });

  it('refuses a link that is not a release download, or not a link at all', () => {
    const latest = latestJson();
    latest.platforms['linux-x86_64'].url = 'https://example.com/Escouade_1.7.7_amd64.AppImage';
    latest.platforms['linux-x86_64-deb'].url = 'not a url';
    latest.platforms['windows-x86_64'].url = '';
    const found = problems(latest, assetList(), TAG);
    expect(found).toHaveLength(3);
    expect(found.some((f) => f.includes('linux-x86_64:'))).toBe(true);
    expect(found.some((f) => f.includes('linux-x86_64-deb'))).toBe(true);
    expect(found.some((f) => f.includes('windows-x86_64'))).toBe(true);
  });

  it('reads a file name or a tag written with %xx escapes', () => {
    const latest = latestJson();
    latest.platforms['windows-x86_64'].url = `${BASE}/Escouade%201.7.7%20setup.exe`;
    const assets = [...assetList(), { name: 'Escouade 1.7.7 setup.exe', state: 'uploaded', size: 10 }];
    expect(problems(latest, assets, TAG)).toEqual([]);

    const tagged = latestJson();
    tagged.platforms['windows-x86_64'].url = `${BASE.replace('v1.7.7', 'v1.7.%37')}/Escouade_1.7.7_x64-setup.exe`;
    expect(problems(tagged, assetList(), TAG)).toEqual([]);
  });

  it('ignores a query string on the link', () => {
    const latest = latestJson();
    latest.platforms['windows-x86_64'].url = `${BASE}/Escouade_1.7.7_x64-setup.exe?download=1`;
    expect(problems(latest, assetList(), TAG)).toEqual([]);
  });
});

describe('release check command', () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'release-check.mjs');

  function run(latest: unknown, assets: unknown) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccm-release-check-'));
    const latestFile = path.join(dir, 'latest.json');
    const assetsFile = path.join(dir, 'assets.json');
    fs.writeFileSync(latestFile, JSON.stringify(latest));
    fs.writeFileSync(assetsFile, JSON.stringify(assets));
    return spawnSync(process.execPath, [script, latestFile, assetsFile, TAG], { encoding: 'utf8' });
  }

  it('prints a summary and exits 0 when nothing is wrong', () => {
    const result = run(latestJson(), assetList());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('windows-x86_64');
    expect(result.stdout).toContain('Escouade_1.7.7_x64-setup.exe');
    expect(result.stdout).not.toContain('::error::');
  });

  it('prints each problem as a workflow error and exits 1', () => {
    const latest = latestJson();
    delete latest.platforms['darwin-x86_64'];
    latest.platforms['windows-x86_64'].signature = '';
    const result = run(latest, assetList());
    expect(result.status).toBe(1);
    const errors = result.stdout.split('\n').filter((l) => l.startsWith('::error::'));
    expect(errors).toHaveLength(2);
    expect(result.stdout).toContain('darwin-x86_64');
    expect(result.stdout).toContain('windows-x86_64');
  });
});
