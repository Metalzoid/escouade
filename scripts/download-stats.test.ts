// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { countsOf, END, HEADER, kindOf, section, START, totalsByDay, withSection, withToday } from './download-stats.mjs';

const asset = (name: string, download_count: number) => ({ name, download_count });
const RELEASES = [
  {
    tag_name: 'v1.7.2',
    published_at: '2026-10-11T18:00:00Z',
    assets: [
      asset('Escouade_1.7.2_universal.dmg', 19),
      asset('Escouade_1.7.2_x64-setup.exe', 10),
      asset('Escouade_1.7.2_x64-setup.exe.sig', 3),
      asset('Escouade_universal.app.tar.gz', 3),
      asset('Escouade_1.7.2_amd64.AppImage', 2),
      asset('Escouade_1.7.2_amd64.deb', 1),
      asset('latest.json', 1000),
    ],
  },
  {
    tag_name: 'v1.7.1',
    published_at: '2026-10-10T18:00:00Z',
    assets: [asset('latest.json', 145), asset('Escouade_1.7.1_x64-setup.exe', 1)],
  },
  { tag_name: 'v1.8.0', draft: true, assets: [asset('latest.json', 9)] },
];

describe('download stats', () => {
  it('tells installers by system, updates and checks apart, and leaves the signatures out', () => {
    expect(['a.dmg', 'a.exe', 'a.AppImage', 'a.deb', 'a.app.tar.gz', 'latest.json', 'a.exe.sig'].map(kindOf)).toEqual([
      'macos',
      'windows',
      'linux',
      'linux',
      'macosUpdates',
      'checks',
      null,
    ]);
  });

  it('counts each published release, the latest first', () => {
    const r = countsOf(RELEASES);
    expect(r.map((x) => x.tag)).toEqual(['v1.7.2', 'v1.7.1']);
    expect(r[0].counts).toEqual({ macos: 19, windows: 10, linux: 3, macosUpdates: 3, checks: 1000 });
    expect(r[0].date).toBe('2026-10-11');
  });

  it('keeps one reading a day, the last of the day winning', () => {
    const r = countsOf(RELEASES);
    let csv = withToday('', '2026-10-12', r);
    csv = withToday(csv, '2026-10-12', r);
    expect(csv.split('\n')[0]).toBe(HEADER);
    expect(csv.trim().split('\n')).toHaveLength(3);
    csv = withToday(csv, '2026-10-19', r);
    expect(totalsByDay(csv).map(([d]) => d)).toEqual(['2026-10-12', '2026-10-19']);
  });

  it('sums them up in the README, the last 7 days once the history goes that far', () => {
    const before = countsOf(RELEASES);
    let csv = withToday('', '2026-10-12', before);
    expect(section(before, csv, '2026-10-12')).not.toContain('7 derniers jours');
    const after = countsOf(RELEASES);
    after[0].counts.macos += 5;
    after[0].counts.checks += 700;
    csv = withToday(csv, '2026-10-19', after);
    const s = section(after, csv, '2026-10-19');
    expect(s).toContain("**38** téléchargements d'installeurs : 24 pour macOS, 11 pour Windows");
    expect(s).toContain("**+5** téléchargements d'installeurs");
    expect(s).toContain('**+700** vérifications');
    expect(s).toContain('| v1.7.2 | 2026-10-11 | 24 | 10 | 3 | 3 | 1 700 |');
    const readme = `# Escouade\n\n${START}\nold\n${END}\n\n## Prérequis\n`;
    const next = withSection(readme, s);
    expect(next).toContain('## Prérequis');
    expect(next).not.toContain('old');
    expect(() => withSection('# rien', s)).toThrow();
  });
});
