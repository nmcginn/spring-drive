import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// src/sim is typechecked under its own tsconfig, without the DOM lib or
// Node's types (decision 2). These fixtures prove that config really rejects
// browser and Node globals, rather than trusting that it does.

const ROOT = join(import.meta.dirname, '..', '..');
const FIXTURE_DIR = join(ROOT, 'tests', 'types', 'fixtures');

function simCompilerOptions(): ts.CompilerOptions {
  const configPath = join(ROOT, 'src', 'sim', 'tsconfig.json');
  const { config, error } = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return ts.parseJsonConfigFileContent(config, ts.sys, join(ROOT, 'src', 'sim')).options;
}

function typeErrors(file: string): string[] {
  const program = ts.createProgram([join(FIXTURE_DIR, file)], simCompilerOptions());
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('the src/sim tsconfig', () => {
  it('rejects the DOM', () => {
    expect(typeErrors('sim-uses-document.ts').join('\n')).toMatch(/Cannot find name 'document'/);
  });

  it('rejects timers, which exist in neither ES2022 nor the sim', () => {
    expect(typeErrors('sim-uses-set-timeout.ts').join('\n')).toMatch(/Cannot find name 'setTimeout'/);
  });

  it("rejects Node's globals, so the sim cannot come to depend on Node either", () => {
    expect(typeErrors('sim-uses-process.ts').join('\n')).toMatch(/Cannot find name 'process'/);
  });

  it('accepts plain ES2022, so the failures above are not a broken config', () => {
    expect(typeErrors('sim-pure-ok.ts')).toEqual([]);
  });

  it('covers every fixture in the directory', () => {
    expect(readdirSync(FIXTURE_DIR).sort()).toEqual([
      'sim-pure-ok.ts',
      'sim-uses-document.ts',
      'sim-uses-process.ts',
      'sim-uses-set-timeout.ts',
    ]);
  });
});
