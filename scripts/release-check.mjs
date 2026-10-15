#!/usr/bin/env node
// Checks a draft release before it is published: the updater reads its latest.json, which must
// name every system and only files the draft holds.
//   node scripts/release-check.mjs <latest.json> <assets.json> <tag>
// assets.json is the draft's `GET /releases/<id>/assets`. Prints each problem as a workflow
// error and exits 1, or prints a summary and exits 0.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The updater of each system looks its own key up: a latest.json without one stops its updates.
export const REQUIRED = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64'];

/** `{ tag, name }` of a `…/releases/download/<tag>/<name>` link, %xx escapes decoded; null for any other. */
function download(url) {
  let parts;
  try {
    parts = new URL(url).pathname.split('/').slice(-4).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [releases, kind, tag, name] = parts;
  return parts.length === 4 && releases === 'releases' && kind === 'download' && tag && name ? { tag, name } : null;
}

/** What is wrong with `latest` (the parsed latest.json) for `tag`, given the draft's `assets`; empty when it is fine. */
export function problems(latest, assets, tag) {
  const found = [];
  const version = String(tag).replace(/^v/, '');
  if (latest?.version !== version) {
    found.push(`latest.json says version ${latest?.version ?? '(none)'}, but the tag ${tag} is version ${version}`);
  }
  const platforms = latest?.platforms && typeof latest.platforms === 'object' ? latest.platforms : {};
  for (const name of REQUIRED) {
    if (!(name in platforms)) found.push(`latest.json has no ${name} platform`);
  }
  const files = Array.isArray(assets) ? assets : [];
  // Every entry is checked, the required ones or not: the updater only reads the former, but a
  // broken link in the others would be a trap for whoever reads them.
  for (const [name, entry] of Object.entries(platforms)) {
    const signature = entry?.signature;
    if (typeof signature !== 'string' || !signature.trim()) found.push(`${name}: no signature`);
    const target = download(entry?.url);
    if (!target) {
      found.push(`${name}: the link "${entry?.url || ''}" is not a …/releases/download/<tag>/<file> link`);
      continue;
    }
    if (target.tag !== tag) {
      found.push(`${name}: the link is under ${target.tag}, not under ${tag}`);
      continue;
    }
    const asset = files.find((a) => a?.name === target.name);
    if (!asset) found.push(`${name}: ${target.name} is not among the files of the release`);
    else if (asset.state !== 'uploaded') found.push(`${name}: ${target.name} is "${asset.state}", not uploaded`);
    else if (!(asset.size > 0)) found.push(`${name}: ${target.name} is empty`);
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A workflow command stops at the end of the line.
  const oneLine = (text) => String(text).replace(/\s*\r?\n\s*/g, ' ');
  const fail = (message) => {
    console.log(`::error::${oneLine(message)}`);
    process.exitCode = 1;
  };
  const [latestFile, assetsFile, tag] = process.argv.slice(2);
  if (!latestFile || !assetsFile || !tag) {
    fail('usage: node scripts/release-check.mjs <latest.json> <assets.json> <tag>');
  } else {
    let latest;
    let assets;
    try {
      latest = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
      assets = JSON.parse(fs.readFileSync(assetsFile, 'utf8'));
    } catch (error) {
      fail(`cannot read ${latestFile} and ${assetsFile}: ${error.message}`);
    }
    if (latest !== undefined) {
      const found = problems(latest, assets, tag);
      for (const problem of found) fail(problem);
      if (!found.length) {
        const platforms = Object.entries(latest.platforms);
        const names = [...new Set(platforms.map(([, entry]) => download(entry.url).name))];
        console.log(`latest.json is complete for ${tag}`);
        console.log(`  platforms: ${platforms.map(([name]) => name).join(', ')}`);
        console.log(`  files: ${names.join(', ')}`);
      }
    }
  }
}
