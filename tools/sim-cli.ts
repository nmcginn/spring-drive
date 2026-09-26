// `npm run sim -- <scenario> [<scenario>…] [--out <dir>]`, or `all`.
// Runs each named scenario headless and writes its samples to
// `<dir>/<scenario>.csv`, by default tools/out/, which git ignores.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { samplesToCsv } from './csv.ts';
import { SCENARIO_NAMES, SCENARIOS } from './scenarios.ts';

export const DEFAULT_OUT_DIR = join(import.meta.dirname, 'out');

export interface CliIo {
  log: (line: string) => void;
  error: (line: string) => void;
}

function usage(): string {
  const width = Math.max(...SCENARIO_NAMES.map((n) => n.length));
  const lines = Object.entries(SCENARIOS).map(([name, s]) => `  ${name.padEnd(width)}  ${s.description}`);
  return ['Usage: npm run sim -- <scenario>… | all [--out <dir>]', '', 'Valid scenarios:', ...lines].join('\n');
}

/** Runs the CLI and returns its exit code: 0 on success, 2 on a usage error. */
export function main(argv: readonly string[], io: CliIo): number {
  const names: string[] = [];
  let outDir = DEFAULT_OUT_DIR;
  const args = [...argv];
  for (let arg = args.shift(); arg !== undefined; arg = args.shift()) {
    if (arg === '--out') {
      const dir = args.shift();
      if (!dir) {
        io.error('--out needs a directory.\n\n' + usage());
        return 2;
      }
      outDir = resolve(dir);
    } else if (arg === 'all') {
      names.push(...SCENARIO_NAMES);
    } else {
      names.push(arg);
    }
  }
  if (names.length === 0) {
    io.error(usage());
    return 2;
  }
  const unknown = names.filter((n) => !Object.hasOwn(SCENARIOS, n));
  if (unknown.length > 0) {
    io.error(`Unknown scenario: ${unknown.join(', ')}\n\n${usage()}`);
    return 2;
  }

  mkdirSync(outDir, { recursive: true });
  for (const [name, scenario] of Object.entries(SCENARIOS).filter(([n]) => names.includes(n))) {
    const { mode, params, samples } = scenario.run();
    const path = join(outDir, `${name}.csv`);
    writeFileSync(path, samplesToCsv(samples, params));
    io.log(`${name}: ${samples.length} samples, ${mode} mode -> ${relative(process.cwd(), path)}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { log: console.log, error: console.error });
}
