// The temporary folder of the screenshots' run, the app's and its processes' too, beside the demo's folder rather than in
// the user's profile (nothing of the machine in a picture), removed at its end (scripts/test-tmp.ts).
import { ownTemporaryFolder } from '../../scripts/test-tmp';

export default () => ownTemporaryFolder('site-shots', `${process.env.ESCOUADE_E2E_ROOT}-tmp`);
