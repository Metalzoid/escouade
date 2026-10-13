import { describe, expect, it } from 'vitest';
import { branchPrefixProblem, worktreeLabel, worktreesRoot, worktreesRootProblem } from './worktrees';

describe('the folder of the agents’ worktrees', () => {
  const project = 'C:\\code\\app';

  it('is .claude/worktrees of the project unless it says where, from its folder or absolute', () => {
    expect(worktreesRoot(project, '')).toBe('C:\\code\\app\\.claude\\worktrees');
    expect(worktreesRoot(project, '  ')).toBe('C:\\code\\app\\.claude\\worktrees');
    expect(worktreesRoot(project, '.worktrees')).toBe('C:\\code\\app\\.worktrees');
    // `..` taken away as written: a sibling of the project's folder.
    expect(worktreesRoot(project, '../app-worktrees')).toBe('C:\\code\\app-worktrees');
    expect(worktreesRoot(project, '..\\app-worktrees')).toBe('C:\\code\\app-worktrees');
    expect(worktreesRoot(project, ' ./wt/../wt2/ ')).toBe('C:\\code\\app\\wt2');
    expect(worktreesRoot(project, '..')).toBe('C:\\code');
    expect(worktreesRoot(project, 'D:\\worktrees\\app')).toBe('D:\\worktrees\\app');
    expect(worktreesRoot(project, 'D:/worktrees/app')).toBe('D:\\worktrees\\app');
    // As « Copier en tant que chemin » gives it, and from the home folder after `~`.
    expect(worktreesRoot(project, '"D:\\worktrees\\app"')).toBe('D:\\worktrees\\app');
    expect(worktreesRoot(project, '~/worktrees/app')).toBe('~\\worktrees\\app');
    expect(worktreesRoot(project, '~wt')).toBe('C:\\code\\app\\~wt');
    // A project of macOS or Linux keeps its slashes, and a backslash is a character of a name there.
    expect(worktreesRoot('/Users/me/app', '../app-worktrees')).toBe('/Users/me/app-worktrees');
    expect(worktreesRoot('/Users/me/app', '/tmp/wt')).toBe('/tmp/wt');
    expect(worktreesRoot('/Users/me/app', '..\\wt')).toBe('/Users/me/app/..\\wt');
  });

  it('is neither the project’s folder, nor one holding it, nor in a .git folder', () => {
    for (const fine of ['', '.worktrees', '../app-worktrees', '.claude/worktrees', 'D:\\wt', '~/wt', '\\\\server\\share\\wt', '"../wt"']) {
      expect(worktreesRootProblem(project, fine), fine).toBeNull();
    }
    for (const itself of ['.', './', 'sub/..', '../app', '../APP', 'C:\\code\\app', 'c:/code/app/', '"../app"']) {
      expect(worktreesRootProblem(project, itself), itself).toBe('itself');
    }
    for (const holding of ['..', '../..', 'C:\\', 'c:/code']) {
      expect(worktreesRootProblem(project, holding), holding).toBe('contains');
    }
    // From D:'s current folder, from the current drive's root: neither the project's nor whole.
    for (const partial of ['D:wt', '\\wt', '/wt']) {
      expect(worktreesRootProblem(project, partial), partial).toBe('partial');
    }
    expect(worktreesRootProblem('/Users/me/app', '/wt')).toBeNull();
    expect(worktreesRootProblem('/Users/me/app', '..')).toBe('contains');
    for (const git of ['.git', '.git/worktrees', '../app/.git/wt', 'sub/.GIT/x']) {
      expect(worktreesRootProblem(project, git), git).toBe('git');
    }
  });

  it('shows a worktree from the project’s folder, or whole on another drive', () => {
    expect(worktreeLabel(project, 'C:\\code\\app\\.claude\\worktrees\\login')).toBe('.claude/worktrees/login');
    expect(worktreeLabel(project, 'c:/code/app/.worktrees/login')).toBe('.worktrees/login');
    expect(worktreeLabel(project, 'C:\\code\\app-worktrees\\login')).toBe('../app-worktrees/login');
    expect(worktreeLabel(project, 'D:\\wt\\login')).toBe('D:\\wt\\login');
    expect(worktreeLabel('/Users/me/app', '/Users/me/wt/login')).toBe('../wt/login');
  });
});

describe('a branch prefix', () => {
  it('is one git takes before a name', () => {
    for (const ok of ['', 'escouade/', 'ticket/', 'feat/gg-', 'users/gg/', 'wip.', 'a.lock', 'résumé/']) {
      expect(branchPrefixProblem(ok), ok).toBe(false);
    }
    for (const bad of [
      '-',
      '/',
      'a//',
      'a b',
      'a..',
      '.x/',
      'a/.b/',
      'x.lock/',
      'a~',
      'a^',
      'a:',
      'a?',
      'a*',
      'a[',
      'a\\',
      'a@{',
      'a\t',
      'a\u007f',
    ]) {
      expect(branchPrefixProblem(bad), JSON.stringify(bad)).toBe(true);
    }
  });
});
