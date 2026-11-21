import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});
