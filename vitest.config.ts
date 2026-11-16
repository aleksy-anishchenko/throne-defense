import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/server/test/**/*.test.ts',
      'apps/web/e2e/**/*.test.mjs',
      'tools/**/*.test.ts',
      'deploy/**/*.test.mjs',
    ],
  },
})
