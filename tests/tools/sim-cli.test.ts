import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../../tools/sim-cli.ts';
import { SCENARIO_NAMES } from '../../tools/scenarios.ts';

// The CLI's contract (M2 acceptance criteria): `npm run sim -- <scenario>`
// writes a CSV; an unknown name exits non-zero and lists the valid ones.
// Running every scenario is CI's job (`npm run sim -- all`), so these run
// only the fastest scenarios, into a temporary directory.

const ROOT = join(import.meta.dirname, '..', '..');

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { log: (l: string) => out.push(l), error: (l: string) => err.push(l) } };
}

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('npm run sim', () => {
  it('offers exactly the five scenarios the roadmap names', () => {
    expect([...SCENARIO_NAMES].sort()).toEqual(['full-wind-lock', 'rate-24h', 'runaway', 'rundown-72h', 'shock']);
  });

  it('writes the named scenario to <out>/<name>.csv and exits 0', () => {
    dir = mkdtempSync(join(tmpdir(), 'sim-cli-'));
    const t = io();
    expect(main(['runaway', '--out', dir], t.io)).toBe(0);
    expect(readdirSync(dir)).toEqual(['runaway.csv']);
    const lines = readFileSync(join(dir, 'runaway.csv'), 'utf8').trim().split('\n');
    // 30 s sampled 64 times a second, plus t = 0.
    expect(lines).toHaveLength(1 + 30 * 64 + 1);
    expect(lines[0]!.startsWith('time_s,')).toBe(true);
    expect(t.out.join('\n')).toContain('runaway: 1921 samples, detailed mode');
    expect(t.err).toEqual([]);
  });

  it('exits 2 on an unknown scenario, names it, lists every valid one, and writes nothing', () => {
    dir = mkdtempSync(join(tmpdir(), 'sim-cli-'));
    const t = io();
    expect(main(['runaway', 'no-such-thing', '--out', dir], t.io)).toBe(2);
    const message = t.err.join('\n');
    expect(message).toContain('Unknown scenario: no-such-thing');
    for (const name of SCENARIO_NAMES) expect(message).toContain(name);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('exits 2 with the usage when given no scenario, or --out with no directory', () => {
    const none = io();
    expect(main([], none.io)).toBe(2);
    expect(none.err.join('\n')).toContain('Valid scenarios:');
    const bare = io();
    expect(main(['runaway', '--out'], bare.io)).toBe(2);
    expect(bare.err.join('\n')).toContain('--out needs a directory');
  });

  it('exits non-zero through npm itself, as CI and a reader would run it', () => {
    const result = spawnSync('npm', ['run', '--silent', 'sim', '--', 'no-such-thing'], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Valid scenarios:');
  });

  it('defaults to tools/out, which git ignores', () => {
    const ignored = execFileSync('git', ['check-ignore', 'tools/out/runaway.csv'], { cwd: ROOT, encoding: 'utf8' });
    expect(ignored.trim()).toBe('tools/out/runaway.csv');
  });
});
