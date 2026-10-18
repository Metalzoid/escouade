// Playwright's `globalSetup`: the run's temporary folder of its own, which the app it starts and its
// processes write in too, removed at its end (scripts/test-tmp.ts).
import { ownTemporaryFolder } from '../../scripts/test-tmp';

export default () => ownTemporaryFolder('e2e');
