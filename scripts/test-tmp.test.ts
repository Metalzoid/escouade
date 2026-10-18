import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ownTemporaryFolder } from './test-tmp';

describe('the temporary folder of a run of the tests', () => {
  it('is the one this run of Vitest writes in', () => {
    expect(path.basename(path.dirname(os.tmpdir()))).toBe('escouade-js-tests');
    expect(path.basename(os.tmpdir())).toMatch(/^vitest-\d+$/);
  });

  it('is given to the processes started, taken away at the end, and those a killed run left go', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'));
    try {
      // Left by a run that was killed: its process is gone.
      const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid!;
      const left = path.join(base, 'escouade-js-tests', `e2e-${dead}`);
      fs.mkdirSync(path.join(left, 'sub'), { recursive: true });
      // That of a run going on: kept.
      const running = path.join(base, 'escouade-js-tests', `e2e-${process.ppid}`);
      fs.mkdirSync(running);

      const tmp = os.tmpdir();
      const end = ownTemporaryFolder('t', base);
      const dir = path.join(base, 'escouade-js-tests', `t-${process.pid}`);
      expect(os.tmpdir()).toBe(dir);
      expect(fs.existsSync(left)).toBe(false);
      expect(fs.existsSync(running)).toBe(true);
      const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("os").tmpdir())'], { encoding: 'utf8' });
      expect(child.stdout).toBe(dir);
      fs.writeFileSync(path.join(dir, 'x.txt'), 'x');

      end();
      expect(os.tmpdir()).toBe(tmp);
      expect(fs.existsSync(dir)).toBe(false);
      expect(fs.readdirSync(path.join(base, 'escouade-js-tests'))).toEqual([`e2e-${process.ppid}`]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
