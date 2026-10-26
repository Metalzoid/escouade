// The demo's repositories, for the website's screenshots: made-up projects with a little history (three made-up authors,
// two weeks, branches merged), whose files read as a real project's in the editor, the diffs and the git graph.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const AUTHORS = [
  { name: 'Camille Martin', email: 'camille@example.com' },
  { name: 'Inès Haddad', email: 'ines@example.com' },
  { name: 'Léo Garnier', email: 'leo@example.com' },
];
const DAY = 86_400_000;

function git(cwd: string, args: string[], env: Record<string, string> = {}) {
  return execFileSync('git', args, { cwd, stdio: 'pipe', env: { ...process.env, ...env }, encoding: 'utf8' });
}

function write(dir: string, files: Record<string, string>) {
  for (const [f, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), content);
  }
}

/** A step of a repository's history: files written, then a commit, `daysAgo` days ago, by one of the authors. */
interface Step {
  files?: Record<string, string>;
  message: string;
  daysAgo: number;
  author?: number;
  /** Made on a branch of that name, merged into main right after (`--no-ff`). */
  branch?: string;
}

/** A repository at `dir` on main, its history made of `steps`, its author for what comes after (an agent's commits). */
function repo(dir: string, steps: Step[]) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', AUTHORS[0].email]);
  git(dir, ['config', 'user.name', AUTHORS[0].name]);
  git(dir, ['config', 'core.autocrlf', 'false']);
  for (const s of steps) {
    const who = AUTHORS[s.author ?? 0];
    const when = new Date(Date.now() - s.daysAgo * DAY).toISOString();
    const env = {
      GIT_AUTHOR_NAME: who.name,
      GIT_AUTHOR_EMAIL: who.email,
      GIT_COMMITTER_NAME: who.name,
      GIT_COMMITTER_EMAIL: who.email,
      GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_DATE: when,
    };
    if (s.branch) git(dir, ['checkout', '-q', '-b', s.branch]);
    write(dir, s.files ?? {});
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', s.message], env);
    if (s.branch) {
      git(dir, ['checkout', '-q', 'main']);
      git(dir, ['merge', '-q', '--no-ff', '-m', `Merge branch '${s.branch}'`, s.branch], env);
      git(dir, ['branch', '-q', '-d', s.branch]);
    }
  }
}

// ---------- demo-api ----------

const USERS_ROUTE = `import { Router } from 'express';
import { db } from '../db/client';
import { requireAuth } from '../auth/middleware';

export const users = Router();

users.use(requireAuth);

users.get('/users', async (req, res) => {
  const users = await db.users.all();
  res.json(users);
});

users.get('/users/:id', async (req, res) => {
  const user = await db.users.find(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json(user);
});
`;

const JWT = `import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

export interface Claims {
  sub: string;
  role: 'admin' | 'member';
  exp: number;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function sign(claims: Claims): string {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(claims));
  const mac = createHmac('sha256', config.secret).update(\`\${head}.\${body}\`).digest('base64url');
  return \`\${head}.\${body}.\${mac}\`;
}

export function verify(token: string): Claims | null {
  const [head, body, mac] = token.split('.');
  const want = createHmac('sha256', config.secret).update(\`\${head}.\${body}\`).digest('base64url');
  if (!mac || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Claims;
  return claims.exp * 1000 > Date.now() ? claims : null;
}
`;

const SESSION = `import { sign, type Claims } from './jwt';

const HOUR = 3600;

export function openSession(userId: string, role: Claims['role']) {
  const exp = Math.floor(Date.now() / 1000) + 12 * HOUR;
  return { token: sign({ sub: userId, role, exp }), expiresIn: 12 * HOUR };
}
`;

const MIDDLEWARE = `import type { NextFunction, Request, Response } from 'express';
import { verify } from './jwt';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const claims = token ? verify(token) : null;
  if (!claims) return res.status(401).json({ error: 'unauthorized' });
  res.locals.user = claims;
  next();
}
`;

const SERVER = `import express from 'express';
import { users } from './routes/users';
import { invoices } from './routes/invoices';
import { health } from './routes/health';

const app = express();
app.use(express.json());
app.use(health);
app.use(users);
app.use(invoices);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(\`demo-api on :\${port}\`));
`;

const USERS_TEST = `import { describe, expect, it } from 'vitest';
import { request } from './helpers';

describe('GET /users', () => {
  it('lists the users', async () => {
    const res = await request.get('/users').auth('admin');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('refuses a request without a token', async () => {
    const res = await request.get('/users');
    expect(res.status).toBe(401);
  });
});
`;

const INVOICES = `import { Router } from 'express';
import { db } from '../db/client';

export const invoices = Router();

invoices.get('/invoices', async (req, res) => {
  const rows = await db.invoices.forAccount(res.locals.user.sub);
  res.json(rows);
});
`;

/** The launch commands' programs: a dev server, an API and a worker that fails, printing what theirs would. */
const SCRIPTS = {
  'scripts/web.mjs': `// The front's dev server, for the demo: what Vite prints, then requests now and then; it answers on $PORT when given one.
import http from 'node:http';
const port = process.env.PORT ?? '5173';
if (process.env.PORT) http.createServer((_q, r) => r.end('demo')).listen(Number(port));
const log = (s) => console.log(s);
log('');
log('  \\x1b[32m\\x1b[1mVITE\\x1b[22m v6.3.5\\x1b[39m  ready in \\x1b[1m412\\x1b[22m ms');
log('');
log('  \\x1b[32m➜\\x1b[39m  \\x1b[1mLocal\\x1b[22m:   \\x1b[36mhttp://localhost:' + port + '/\\x1b[39m');
log('  \\x1b[2m➜  Network: use --host to expose\\x1b[22m');
log('');
const pages = ['/', '/users', '/users?cursor=eyJpZCI6NTB9', '/invoices', '/settings'];
let i = 0;
setInterval(() => {
  const t = new Date().toLocaleTimeString('en-GB');
  log(\`\\x1b[2m\${t}\\x1b[22m \\x1b[36m[vite]\\x1b[39m \\x1b[32mhmr update\\x1b[39m \\x1b[2m\${pages[i++ % pages.length]}\\x1b[22m\`);
}, 1500);
`,
  'scripts/api.mjs': `// The API in watch mode, for the demo; it answers on $PORT when given one.
import http from 'node:http';
const port = process.env.PORT ?? '3000';
if (process.env.PORT) http.createServer((_q, r) => r.end('{}')).listen(Number(port));
console.log('\\x1b[36m[tsx]\\x1b[39m watching src/**/*.ts');
console.log('demo-api on :' + port);
const routes = ['GET /health 200 2ms', 'GET /users 200 18ms', 'GET /users?limit=50 200 21ms', 'POST /login 200 64ms', 'GET /invoices 200 33ms'];
let i = 0;
setInterval(() => console.log(routes[i++ % routes.length]), 900);
`,
  'scripts/seed.mjs': `// The demo's data, as a seed script would write it.
console.log('seeded 120 users, 48 invoices');
`,
  'scripts/worker.mjs': `// The billing worker, for the demo: it fails at its start, as a missing variable would make it.
console.log('[worker] connecting to the queue…');
setTimeout(() => {
  console.error('\\x1b[31mError: REDIS_URL is not set\\x1b[39m');
  console.error('    at connect (src/worker/queue.ts:12:11)');
  process.exit(1);
}, 400);
`,
};

export function makeDemoApi(dir: string) {
  repo(dir, [
    {
      daysAgo: 16,
      message: 'chore: scaffold the API',
      files: {
        'package.json': JSON.stringify(
          {
            name: 'demo-api',
            private: true,
            type: 'module',
            scripts: { dev: 'tsx watch src/server.ts', test: 'vitest run', 'test:e2e': 'playwright test' },
            dependencies: { express: '^5.1.0' },
            devDependencies: { tsx: '^4.20.0', typescript: '^5.9.0', vitest: '^3.2.0' },
          },
          null,
          2,
        ),
        '.gitignore': 'node_modules/\n.claude/\n',
        'README.md': '# demo-api\n\nThe API of the demo: users, sessions and invoices.\n\n```sh\nnpm install\nnpm run dev\n```\n',
        'src/server.ts': SERVER,
        'src/config.ts': "export const config = { secret: process.env.JWT_SECRET ?? 'dev-secret' };\n",
        'src/routes/health.ts':
          "import { Router } from 'express';\n\nexport const health = Router();\nhealth.get('/health', (_req, res) => res.json({ ok: true }));\n",
        'src/db/client.ts': "import { open } from './store';\n\nexport const db = open(process.env.DATABASE_URL ?? 'file:dev.db');\n",
        'src/db/store.ts':
          'export function open(url: string) {\n  return { url, users: table(), invoices: table() } as any;\n}\n\nfunction table() {\n  return { all: async () => [], find: async (_id: string) => null, forAccount: async (_id: string) => [] };\n}\n',
        ...SCRIPTS,
      },
    },
    { daysAgo: 15, author: 1, message: 'feat(users): list and show users', files: { 'src/routes/users.ts': USERS_ROUTE } },
    {
      daysAgo: 13,
      author: 1,
      branch: 'feat/auth',
      message: 'feat(auth): signed tokens and sessions',
      files: { 'src/auth/jwt.ts': JWT, 'src/auth/session.ts': SESSION, 'src/auth/middleware.ts': MIDDLEWARE },
    },
    { daysAgo: 11, author: 2, message: 'test(users): cover the users routes', files: { 'tests/users.test.ts': USERS_TEST } },
    {
      daysAgo: 9,
      branch: 'feat/invoices',
      message: 'feat(invoices): list the invoices of an account',
      files: { 'src/routes/invoices.ts': INVOICES },
    },
    { daysAgo: 7, author: 2, message: 'fix(auth): compare signatures in constant time' },
    { daysAgo: 5, author: 1, message: 'chore: Node 24 and TypeScript 5.9' },
    { daysAgo: 3, author: 0, branch: 'feat/health', message: 'feat: health check for the load balancer' },
    { daysAgo: 2, author: 2, message: 'docs: how to run the API locally' },
    { daysAgo: 1, author: 1, message: 'refactor(db): one client for the whole app' },
  ]);
}

// ---------- studio-web: a project of two repositories ----------

const HEADER = `import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function Header({ user }: { user: { name: string } }) {
  return (
    <header className="header">
      <Logo />
      <nav>
        <Link to="/projects">Projects</Link>
        <Link to="/team">Team</Link>
      </nav>
      <span className="user">{user.name}</span>
    </header>
  );
}
`;

const PROJECTS_ROUTE = `import { Router } from 'express';
import { db } from '../db';

export const projects = Router();

projects.get('/projects', async (_req, res) => {
  res.json(await db.projects.all());
});
`;

export function makeStudioWeb(dir: string) {
  repo(path.join(dir, 'web'), [
    {
      daysAgo: 12,
      message: 'chore: scaffold the studio',
      files: {
        'package.json': JSON.stringify({ name: 'studio-web', private: true, scripts: { dev: 'vite' } }, null, 2),
        'src/components/Header.tsx': HEADER,
        'src/components/Logo.tsx': 'export const Logo = () => <img src="/logo.svg" alt="Studio" height={24} />;\n',
        'src/main.tsx':
          "import { createRoot } from 'react-dom/client';\nimport { App } from './App';\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
      },
    },
    { daysAgo: 6, author: 2, message: 'feat: team page' },
    { daysAgo: 2, author: 1, message: 'style: tighter header' },
  ]);
  repo(path.join(dir, 'api'), [
    {
      daysAgo: 12,
      author: 1,
      message: 'chore: scaffold the studio API',
      files: {
        'package.json': JSON.stringify({ name: 'studio-api', private: true, scripts: { dev: 'tsx watch src/index.ts' } }, null, 2),
        'src/routes/projects.ts': PROJECTS_ROUTE,
        'src/db.ts': 'export const db = { projects: { all: async () => [] } };\n',
      },
    },
    { daysAgo: 4, author: 1, message: 'feat: list the projects' },
  ]);
}

// ---------- mobile-app ----------

const PROFILE = `import { Image, Pressable, Text, View } from 'react-native';
import { useUser } from '../hooks/useUser';
import { styles } from './ProfileScreen.styles';

export function ProfileScreen() {
  const user = useUser();
  return (
    <View style={styles.screen}>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.email}>{user.email}</Text>
      <Pressable style={styles.button} onPress={user.signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}
`;

export function makeMobileApp(dir: string) {
  repo(dir, [
    {
      daysAgo: 14,
      author: 2,
      message: 'chore: scaffold the app',
      files: {
        'package.json': JSON.stringify({ name: 'mobile-app', private: true, scripts: { start: 'expo start' } }, null, 2),
        // Where the agent of the demo puts the pictures it sends.
        '.gitignore': 'node_modules/\n.escouade-shots/\n',
        'src/screens/ProfileScreen.tsx': PROFILE,
        'src/screens/ProfileScreen.styles.ts':
          "import { StyleSheet } from 'react-native';\n\nexport const styles = StyleSheet.create({\n  screen: { flex: 1, padding: 24 },\n  name: { fontSize: 22, fontWeight: '600' },\n  email: { color: '#6b7280' },\n  button: { marginTop: 24, padding: 12, borderRadius: 10, backgroundColor: '#111827' },\n  buttonText: { color: 'white', textAlign: 'center' },\n});\n",
        'src/hooks/useUser.ts':
          "export function useUser() {\n  return { name: 'Alex Morgan', email: 'alex@example.com', signOut: () => {} };\n}\n",
      },
    },
    { daysAgo: 8, message: 'feat: sign in with a magic link' },
    { daysAgo: 3, author: 1, message: 'fix: keyboard covering the form on Android' },
  ]);
}

// ---------- infra ----------

export function makeInfra(dir: string) {
  repo(dir, [
    {
      daysAgo: 20,
      author: 1,
      message: 'chore: terraform for the staging cluster',
      files: {
        'main.tf':
          'terraform {\n  required_version = ">= 1.9"\n}\n\nmodule "cluster" {\n  source = "./modules/cluster"\n  name   = "staging"\n  nodes  = 3\n}\n',
        'modules/cluster/main.tf': 'variable "name" {}\nvariable "nodes" {}\n',
      },
    },
    { daysAgo: 10, author: 1, message: 'feat: production cluster' },
  ]);
}

/**
 * The worktree of a ticket's agent in `dir` (as Escouade makes one: `.claude/worktrees/<name>` on `ticket/<name>`), with the
 * agent's work committed on it: what « Tester » launches from. Gives its folder and its branch.
 */
export function ticketWorktree(dir: string, name: string, files: Record<string, string>, message: string) {
  const branch = `ticket/${name}`;
  const at = path.join(dir, '.claude', 'worktrees', name);
  git(dir, ['worktree', 'add', '-q', '-b', branch, at]);
  write(at, files);
  git(at, ['add', '-A']);
  git(at, ['commit', '-qm', message], { GIT_AUTHOR_NAME: 'Escouade', GIT_AUTHOR_EMAIL: 'agent@example.com' });
  return { path: at, branch };
}
