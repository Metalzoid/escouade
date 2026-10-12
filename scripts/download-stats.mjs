#!/usr/bin/env node
// The downloads of the releases, as GitHub counts them (a counter per file of a release, that
// only goes up): kept day by day in stats/downloads.csv, and summed up in the README between
// <!-- stats:start --> and <!-- stats:end -->.
//   node scripts/download-stats.mjs            → asks GitHub (GITHUB_TOKEN if set), writes both
//   node scripts/download-stats.mjs file.json  → the same from a saved answer of the API (tests)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = 'guillaume-gagnaire/escouade';
export const HEADER = 'date,tag,macos,windows,linux,macosUpdates,checks';
export const START = '<!-- stats:start -->';
export const END = '<!-- stats:end -->';

/**
 * What a file of a release is: an installer by system, an update of the Mac app, a check for
 * updates (latest.json, read by every running copy of the app), or nothing counted (signatures).
 * Windows' updater downloads the installer itself: its count holds the updates too.
 */
export function kindOf(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.sig')) return null;
  if (n === 'latest.json') return 'checks';
  if (n.endsWith('.dmg')) return 'macos';
  if (n.endsWith('.app.tar.gz')) return 'macosUpdates';
  if (n.endsWith('.exe') || n.endsWith('.msi') || n.endsWith('.nsis.zip') || n.endsWith('.msi.zip')) return 'windows';
  if (n.endsWith('.appimage') || n.endsWith('.deb') || n.endsWith('.rpm') || n.endsWith('.appimage.tar.gz')) return 'linux';
  return null;
}

const KINDS = ['macos', 'windows', 'linux', 'macosUpdates', 'checks'];
const zero = () => Object.fromEntries(KINDS.map((k) => [k, 0]));

/** Each published release (no draft), the latest first, with its counts by kind. */
export function countsOf(releases) {
  return releases
    .filter((r) => !r.draft)
    .map((r) => {
      const counts = zero();
      for (const a of r.assets ?? []) {
        const kind = kindOf(a.name);
        if (kind) counts[kind] += a.download_count ?? 0;
      }
      return { tag: r.tag_name, date: (r.published_at ?? r.created_at ?? '').slice(0, 10), counts };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.tag.localeCompare(a.tag, 'en', { numeric: true }));
}

/** The CSV with today's counts in place of any taken today already. */
export function withToday(csv, today, releases) {
  const lines = csv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() && l !== HEADER && !l.startsWith(`${today},`));
  for (const r of releases) lines.push([today, r.tag, ...KINDS.map((k) => r.counts[k])].join(','));
  return [HEADER, ...lines].join('\n') + '\n';
}

/** The totals by kind of each day the CSV has, oldest first. */
export function totalsByDay(csv) {
  const days = new Map();
  for (const line of csv.split('\n').slice(1)) {
    const [date, , ...values] = line.split(',');
    if (!date || values.length < KINDS.length) continue;
    const t = days.get(date) ?? zero();
    KINDS.forEach((k, i) => (t[k] += Number(values[i]) || 0));
    days.set(date, t);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const fmt = (n) => n.toLocaleString('fr-FR').replace(/ | /g, ' ');

/** The README's section: totals, the last 7 days when the history goes that far, the versions. */
export function section(releases, csv, today) {
  const total = zero();
  for (const r of releases) for (const k of KINDS) total[k] += r.counts[k];
  const installers = total.macos + total.windows + total.linux;
  const out = [
    START,
    '',
    `Relevé chaque jour par [une tâche planifiée](.github/workflows/stats.yml) d'après les compteurs de GitHub (dernier relevé : ${today} ; historique dans [stats/downloads.csv](stats/downloads.csv)).`,
    '',
    `- **${fmt(installers)}** téléchargements d'installeurs : ${fmt(total.macos)} pour macOS, ${fmt(total.windows)} pour Windows (mises à jour comprises : l'app se met à jour avec l'installeur), ${fmt(total.linux)} pour Linux.`,
    `- **${fmt(total.macosUpdates)}** mises à jour de l'app macOS par la mise à jour intégrée.`,
    `- **${fmt(total.checks)}** vérifications de mise à jour : chaque copie de l'app qui tourne lit \`latest.json\` à son démarrage puis régulièrement, ce qui donne une idée de l'usage (pas un nombre d'utilisateurs).`,
  ];
  const days = totalsByDay(csv);
  const last = days.at(-1);
  const weekAgo = [...days].reverse().find(([d]) => last && daysBetween(d, last[0]) >= 7);
  if (last && weekAgo) {
    const delta = (k) => last[1][k] - weekAgo[1][k];
    const inst = delta('macos') + delta('windows') + delta('linux');
    out.push(
      `- Sur les 7 derniers jours : **+${fmt(inst)}** téléchargements d'installeurs, **+${fmt(delta('macosUpdates'))}** mises à jour macOS, **+${fmt(delta('checks'))}** vérifications de mise à jour.`,
    );
  }
  out.push(
    '',
    '| Version | Publiée le | macOS | Windows | Linux | Mises à jour macOS | Vérifications |',
    '|---|---|---:|---:|---:|---:|---:|',
  );
  for (const r of releases.slice(0, 10)) {
    const c = r.counts;
    out.push(
      `| ${r.tag} | ${r.date} | ${fmt(c.macos)} | ${fmt(c.windows)} | ${fmt(c.linux)} | ${fmt(c.macosUpdates)} | ${fmt(c.checks)} |`,
    );
  }
  if (releases.length > 10) out.push('', `Les ${releases.length - 10} versions plus anciennes comptent dans les totaux.`);
  out.push('', END);
  return out.join('\n');
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** The README with its section in place of the one between the markers. */
export function withSection(readme, body) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start < 0 || end < start) throw new Error(`README: ${START} … ${END} introuvables`);
  return readme.slice(0, start) + body + readme.slice(end + END.length);
}

async function fetchReleases() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'escouade-stats' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  for (let page = 1; page < 20; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitHub : ${res.status} ${await res.text()}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const input = process.argv[2];
  const raw = input ? JSON.parse(fs.readFileSync(input, 'utf8')) : await fetchReleases();
  const releases = countsOf(raw);
  const today = new Date().toISOString().slice(0, 10);
  const csvFile = path.join(root, 'stats', 'downloads.csv');
  const csv = withToday(fs.existsSync(csvFile) ? fs.readFileSync(csvFile, 'utf8') : '', today, releases);
  fs.mkdirSync(path.dirname(csvFile), { recursive: true });
  fs.writeFileSync(csvFile, csv);
  const readmeFile = path.join(root, 'README.md');
  fs.writeFileSync(readmeFile, withSection(fs.readFileSync(readmeFile, 'utf8'), section(releases, csv, today)));
  console.log(`${releases.length} versions relevées le ${today}`);
}
