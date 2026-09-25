// lint-as: src/sim/fixture.ts
// expect: no-restricted-imports
import { getScheduler } from '../runtime/scheduler.ts';
export const s = getScheduler;
