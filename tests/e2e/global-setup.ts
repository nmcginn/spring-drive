import { rmSync } from 'node:fs';
import { SCREENSHOT_DIR } from './fixtures.ts';

// Clear last run's screenshots, so the directory CI uploads (and the nightly
// session reviews) holds only what this run produced.
export default function globalSetup(): void {
  rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
}
