import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Physics and runtime logic run under plain Node. Tests that need a DOM
    // opt in per file with `// @vitest-environment happy-dom`.
    environment: 'node',
  },
});
