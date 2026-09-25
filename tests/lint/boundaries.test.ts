import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Every architectural lint rule is proven by a fixture that must fail it. A
// rule that is misconfigured, or silently stops matching after an ESLint
// upgrade, would otherwise pass every build without anyone noticing.

const FIXTURE_DIR = join(import.meta.dirname, 'fixtures');
const eslint = new ESLint({ cwd: join(import.meta.dirname, '..', '..') });

interface Fixture {
  file: string;
  lintAs: string;
  expectedRule: string | null;
  code: string;
}

function readFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => {
      const code = readFileSync(join(FIXTURE_DIR, file), 'utf8');
      const lintAs = /^\/\/ lint-as: (\S+)$/m.exec(code)?.[1];
      const expected = /^\/\/ expect: (\S+)/m.exec(code)?.[1];
      if (!lintAs || !expected) throw new Error(`${file} needs "// lint-as:" and "// expect:" headers`);
      return {
        file,
        lintAs,
        expectedRule: expected === 'nothing.' ? null : expected,
        code,
      };
    });
}

const fixtures = readFixtures();

describe('architectural lint rules', () => {
  it('has a fixture for every boundary PLAN.md and the M0 task name', () => {
    const names = fixtures.map((f) => f.file);
    for (const required of [
      'sim-imports-runtime.ts',
      'sim-imports-widgets.ts',
      'sim-set-timeout.ts',
      'sim-math-random.ts',
      'widget-raf.ts',
      'scheduler-raf-allowed.ts',
    ]) {
      expect(names).toContain(required);
    }
  });

  for (const fixture of fixtures) {
    const verdict = fixture.expectedRule ? `fails ${fixture.expectedRule}` : 'passes';
    it(`${fixture.file} ${verdict} when linted as ${fixture.lintAs}`, async () => {
      const [result] = await eslint.lintText(fixture.code, {
        filePath: fixture.lintAs,
      });
      const rules = (result?.messages ?? []).map((m) => m.ruleId ?? `parse error: ${m.message}`);
      if (fixture.expectedRule) {
        expect(rules).toContain(fixture.expectedRule);
      } else {
        expect(rules).toEqual([]);
      }
    });
  }
});
