#!/usr/bin/env node
// Posts the release notes of a version (its section of CHANGELOG.md) to Escouade's Discord.
//   node scripts/discord.mjs v1.8.5 --dry-run → prints the messages, posts nothing
//   node scripts/discord.mjs v1.8.5           → posts them through the webhook in ESCOUADE_DISCORD_WEBHOOK

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FALLBACK, releaseNotes } from './changelog.mjs';

/** Discord's limit for the content of one message. */
export const LIMIT = 2000;

const RELEASES = 'https://github.com/guillaume-gagnaire/escouade/releases/tag';

/** The notes of `tag` as Discord messages: the version and a link to its release, then the notes, cut between lines. */
export function discordMessages(notes, tag) {
  const version = String(tag).replace(/^v/, '');
  const head = `## Escouade ${version}\n-# [Release sur GitHub](<${RELEASES}/v${version}>)`;
  return pack(
    `${head}\n\n${notes}`.split('\n').flatMap((line) => cutLine(line, LIMIT)),
    LIMIT,
  );
}

/** `line` in pieces of at most `limit` characters, cut at a space when there is one. */
function cutLine(line, limit) {
  const pieces = [];
  let rest = line;
  while (rest.length > limit) {
    const space = rest.lastIndexOf(' ', limit);
    const at = space > 0 ? space : limit;
    pieces.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  pieces.push(rest);
  return pieces;
}

const carried = (line) => line.trim() === '' || line.startsWith('#');

/** `lines` (each within `limit`) joined into messages within `limit`; a heading ending a message opens the next one instead. */
function pack(lines, limit) {
  const messages = [];
  let current = [];
  for (const line of lines) {
    if (current.length && [...current, line].join('\n').length > limit) {
      let keep = current.length;
      while (keep > 0 && carried(current[keep - 1])) keep--;
      if (keep === 0 || [...current.slice(keep), line].join('\n').length > limit) keep = current.length;
      messages.push(current.slice(0, keep).join('\n').trim());
      current = current.slice(keep);
    }
    current.push(line);
  }
  messages.push(current.join('\n').trim());
  return messages.filter(Boolean);
}

/** Posts `messages` one after the other to the webhook at `url`, waiting out Discord's rate limit; mentions no one. */
export async function postMessages(
  url,
  messages,
  { fetch = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  const target = new URL(url);
  target.searchParams.set('wait', 'true');
  for (const content of messages) {
    for (;;) {
      const res = await fetch(target.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      });
      if (res.status === 429) {
        const { retry_after: seconds = 1 } = await res.json().catch(() => ({}));
        await sleep(Math.ceil(seconds * 1000));
        continue;
      }
      // Discord's answer only: the webhook's URL holds its token.
      if (!res.ok) throw new Error(`Discord a refusé le message (${res.status}) : ${await res.text()}`);
      break;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [tag, flag] = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const notes = releaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), tag ?? '');
  if (!tag || notes === FALLBACK) {
    console.error(`Pas de section ${tag ?? '(version manquante)'} dans CHANGELOG.md.`);
    process.exit(1);
  }
  const messages = discordMessages(notes, tag);
  if (flag === '--dry-run') {
    process.stdout.write(messages.join('\n\n— — —\n\n') + '\n');
  } else {
    const url = process.env.ESCOUADE_DISCORD_WEBHOOK;
    if (!url) {
      console.error('ESCOUADE_DISCORD_WEBHOOK manquante : l’URL du webhook du salon Discord.');
      process.exit(1);
    }
    await postMessages(url, messages);
    console.log(`${messages.length} message(s) posté(s) sur Discord.`);
  }
}
