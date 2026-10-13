#!/usr/bin/env node
// Test double of the GitHub CLI: `gh pr create … --body-file -` prints the address of PR #12,
// `gh auth token` a token.
// Each call appends {argv, cwd, body} to <tmp>/fake-gh-<cwd with non-alphanumerics replaced by _>.jsonl.
// `gh pr list --head <branch> … --json …` and `gh pr view <url> --json …` answer from what a test wrote
// in <the same name>.pulls.json: an array of pull requests as `gh` gives them, each with its `headRefName`.
// Without that file, a branch has no pull request and none is found at an address.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (body += d));
process.stdin.on('end', () => {
  const log = path.join(os.tmpdir(), `fake-gh-${process.cwd().replace(/[^a-zA-Z0-9]/g, '_')}.jsonl`);
  fs.appendFileSync(log, JSON.stringify({ argv, cwd: process.cwd(), body }) + '\n');
  if (argv[0] === 'pr' && argv[1] === 'create') {
    process.stdout.write('https://github.com/acme/demo/pull/12\n');
  } else if (argv[0] === 'auth' && argv[1] === 'token') {
    process.stdout.write('gho_fake\n');
  } else if (argv[0] === 'pr' && (argv[1] === 'list' || argv[1] === 'view')) {
    let pulls = [];
    try {
      pulls = JSON.parse(fs.readFileSync(log.replace(/\.jsonl$/, '.pulls.json'), 'utf8'));
    } catch {
      // No file: GitHub has none.
    }
    if (argv[1] === 'list') {
      const head = argv[argv.indexOf('--head') + 1];
      process.stdout.write(JSON.stringify(pulls.filter((p) => p.headRefName === head)) + '\n');
    } else {
      const pr = pulls.find((p) => p.url === argv[2]);
      if (!pr) {
        process.stderr.write(`no pull requests found for ${argv[2]}\n`);
        process.exit(1);
      }
      process.stdout.write(JSON.stringify(pr) + '\n');
    }
  } else {
    process.stderr.write(`unsupported: ${argv.join(' ')}\n`);
    process.exit(1);
  }
});
