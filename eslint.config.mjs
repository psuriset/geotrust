import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
const modules = [
  'domain',
  'ingestion',
  'normalization',
  'analysis',
  'provenance',
  'dependencies',
  'config',
  'geoevent',
  'feeds',
  'storage',
  'gateway',
];
const allowed = {
  domain: [],
  ingestion: ['domain'],
  normalization: ['domain'],
  analysis: ['domain'],
  provenance: ['domain'],
  dependencies: ['domain'],
  config: [],
  geoevent: ['domain', 'provenance'],
  feeds: ['geoevent', 'storage'],
  storage: ['geoevent'],
  gateway: ['feeds', 'geoevent'],
};
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  ...modules.map((name) => ({
    files: ['packages/' + name + '/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [...modules, 'plugin', 'presentation']
                .filter((other) => other !== name && !allowed[name].includes(other))
                .map((other) => '**/' + other + '/**'),
              message: 'Respect the documented module dependency direction.',
            },
          ],
        },
      ],
    },
  })),
);
