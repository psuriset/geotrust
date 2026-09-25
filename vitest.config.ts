import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: ['packages/**/*.ts'],
      exclude: [
        'packages/plugin/src/index.ts',
        'packages/domain/src/types.ts',
        'packages/presentation/src/geolibre-api.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { perFile: true, statements: 81, branches: 81, functions: 81, lines: 81 },
    },
  },
});
