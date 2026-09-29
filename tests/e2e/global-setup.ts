import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { BUDGET_REPORT, SCREENSHOT_DIR } from './fixtures.ts';

// Clear last run's screenshots and frame budget, so what CI uploads and
// reports (and the nightly session reviews) is only what this run produced.
export default function globalSetup(): void {
  rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
  rmSync(dirname(BUDGET_REPORT), { recursive: true, force: true });
}
