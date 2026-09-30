// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The architecture's hard boundaries (PLAN.md, "Hard boundaries") are
// enforced here rather than left to review. Each rule has a fixture under
// tests/lint/fixtures that must fail, checked by tests/lint/boundaries.test.ts,
// so a rule that silently stops matching is caught too.

const ANIMATION_FRAME_MESSAGE =
  'Only src/runtime/scheduler.ts drives animation. Register a tick with the scheduler instead (decision 3).';

/** requestAnimationFrame is banned everywhere but the scheduler. */
const noAnimationFrame = {
  'no-restricted-globals': [
    'error',
    { name: 'requestAnimationFrame', message: ANIMATION_FRAME_MESSAGE },
    { name: 'cancelAnimationFrame', message: ANIMATION_FRAME_MESSAGE },
  ],
  'no-restricted-properties': [
    'error',
    ...['window', 'globalThis', 'self'].flatMap((object) => [
      {
        object,
        property: 'requestAnimationFrame',
        message: ANIMATION_FRAME_MESSAGE,
      },
      {
        object,
        property: 'cancelAnimationFrame',
        message: ANIMATION_FRAME_MESSAGE,
      },
    ]),
  ],
};

const SIM_TIMER_MESSAGE = 'src/sim is pure: time is an argument, never a timer (decision 2).';
const SIM_RANDOM_MESSAGE = 'src/sim uses a seeded RNG only, so runs are reproducible (decision 2, test 8).';
const SIM_TIMERS = ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'requestIdleCallback'];

/** The simulation: no DOM, no timers, no unseeded randomness, no upward imports. */
const simRules = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          regex: '(^|/)(runtime|widgets)(/|$)',
          message: 'src/sim must not import from runtime or widgets. The dependency points the other way.',
        },
      ],
    },
  ],
  'no-restricted-globals': [
    'error',
    ...noAnimationFrame['no-restricted-globals'].slice(1),
    ...SIM_TIMERS.map((name) => ({ name, message: SIM_TIMER_MESSAGE })),
    ...['window', 'document', 'navigator', 'performance'].map((name) => ({
      name,
      message: 'src/sim has no DOM and no clock; it runs unchanged under Node (decision 2).',
    })),
  ],
  'no-restricted-properties': [
    'error',
    ...noAnimationFrame['no-restricted-properties'].slice(1),
    { object: 'Math', property: 'random', message: SIM_RANDOM_MESSAGE },
    { object: 'Date', property: 'now', message: SIM_TIMER_MESSAGE },
    ...['globalThis', 'self'].flatMap((object) =>
      SIM_TIMERS.map((property) => ({
        object,
        property,
        message: SIM_TIMER_MESSAGE,
      })),
    ),
  ],
};

// Colours come only from the palette (CLAUDE.md, widget rules), and a widget
// takes a part's colour only through src/widgets/shared/colours.ts, which says
// once what each drawn thing is coloured as (decision 40).
const COLOUR_LITERAL_MESSAGE = 'Colours come from src/runtime/palette.ts tokens only, never a literal.';
const COLOUR_LITERALS = [
  { selector: 'Literal[value=/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i]', message: COLOUR_LITERAL_MESSAGE },
  { selector: 'Literal[value=/^(?:rgb|hsl)a?\\(/i]', message: COLOUR_LITERAL_MESSAGE },
  { selector: 'TemplateElement[value.raw=/^(?:rgb|hsl)a?\\(/i]', message: COLOUR_LITERAL_MESSAGE },
];
const PART_ACCESS_MESSAGE =
  'Widgets colour parts through colours(t) in src/widgets/shared/colours.ts, so a quantity is the same colour everywhere (decision 40).';
const PART_ACCESS = [
  { selector: "MemberExpression[property.name='parts']", message: PART_ACCESS_MESSAGE },
  { selector: "ObjectPattern > Property[key.name='parts']", message: PART_ACCESS_MESSAGE },
];

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'tools/out/', 'tests/lint/fixtures/'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      ...noAnimationFrame,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/runtime/scheduler.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },
  {
    // A test that dereferences null should fail loudly, which is exactly what
    // the assertion does; guarding every lookup would bury the intent.
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Playwright tests wait on the page's frames to observe the scheduler;
    // they do not drive any animation of their own.
    files: ['tests/e2e/**/*.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    languageOptions: { globals: {} },
    rules: simRules,
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/runtime/palette.ts'],
    rules: { 'no-restricted-syntax': ['error', ...COLOUR_LITERALS] },
  },
  {
    files: ['src/widgets/**/*.ts'],
    ignores: ['src/widgets/shared/colours.ts'],
    rules: { 'no-restricted-syntax': ['error', ...COLOUR_LITERALS, ...PART_ACCESS] },
  },
  {
    // Config files and tools run under Node.
    files: ['*.config.{js,ts}', 'tools/**/*.{js,mjs,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
