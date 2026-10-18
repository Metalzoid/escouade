// Vitest's `globalSetup`: the run's temporary folder of its own, removed at its end (scripts/test-tmp.ts).
import { ownTemporaryFolder } from './test-tmp';

export default () => ownTemporaryFolder('vitest');
