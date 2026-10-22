// Records GitHub's answers for the tests of `forge/github_api.rs`, from a public repository's merged
// pull request, through the GitHub CLI's token: `node record.mjs [owner/repo] [number]`.
// Fields the client does not read (the hundreds of `*_url`, `_links`, `repo`…) are cut out, which
// keeps the files small; what is kept is as GitHub sent it.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [repo = 'cli/cli', number = '14768'] = process.argv.slice(2);
const [owner, name] = repo.split('/');

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
const api = (path) => JSON.parse(gh('api', path));
const keep = new Set(['html_url', 'target_url', 'environment_url', 'log_url', 'details_url']);
const trim = (v) => {
  if (Array.isArray(v)) return v.map(trim);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === '_links' || k === 'repo' || k === 'node_id' || k === 'permissions') continue;
      if ((k === 'url' || k.endsWith('_url')) && !keep.has(k) && !(typeof x === 'string' && x.startsWith('https://github.com/'))) continue;
      if (k === 'body' && typeof x === 'string') {
        out[k] = x.slice(0, 400);
        continue;
      }
      out[k] = trim(x);
    }
    return out;
  }
  return v;
};
const save = (file, data) => writeFileSync(join(here, file), JSON.stringify(trim(data), null, 2) + '\n');

const fields =
  'number url title state isDraft headRefName baseRefName mergeable autoMergeRequest { enabledAt } ' +
  'latestOpinionatedReviews(first: 50) { nodes { state } } reviewThreads(first: 100) { nodes { isResolved } } ' +
  'commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }';
const graphql = (query, vars) =>
  JSON.parse(gh('api', 'graphql', '-f', `query=${query}`, ...Object.entries(vars).flatMap(([k, v]) => ['-F', `${k}=${v}`])));

const pr = api(`repos/${repo}/pulls/${number}`);
save('pull.json', pr);
const sha = pr.head.sha;
save('check-runs.json', api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`));
save('status.json', api(`repos/${repo}/commits/${sha}/status?per_page=100`));
save('reviews.json', api(`repos/${repo}/pulls/${number}/reviews?per_page=100`));
save('issue-comments.json', api(`repos/${repo}/issues/${number}/comments?per_page=100`));
save(
  'graphql-pulls.json',
  graphql(
    `query Pulls($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { p${number}: pullRequest(number: ${number}) { ${fields} } } }`,
    { owner, name },
  ),
);
save(
  'graphql-branch.json',
  graphql(
    `query PullsOfBranch($owner: String!, $name: String!, $branch: String!) { repository(owner: $owner, name: $name) { pullRequests(headRefName: $branch, first: 10, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { ${fields} } } } }`,
    { owner, name, branch: pr.head.ref },
  ),
);
save(
  'graphql-threads.json',
  graphql(
    `
      query Threads($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                isResolved
                path
                line
                comments(first: 50) {
                  nodes {
                    databaseId
                    author {
                      login
                    }
                    body
                  }
                }
              }
            }
          }
        }
      }
    `,
    { owner, name, number },
  ),
);
const deployments = api(`repos/${repo}/deployments?per_page=2`);
save('deployments.json', deployments);
save('deployment-statuses.json', api(`repos/${repo}/deployments/${deployments[0].id}/statuses?per_page=1`));
const job = api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).check_runs.find((r) => r.app.slug === 'github-actions');
if (job) {
  writeFileSync(
    join(here, 'job-log.txt'),
    gh('api', `repos/${repo}/actions/jobs/${job.id}/logs`).split('\n').slice(0, 40).join('\n') + '\n',
  );
  writeFileSync(join(here, 'job-id.txt'), String(job.id));
}
