// Исторические критерии баланса запускаются явно, отдельно от проверок текущей версии.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tools/balance/**/*.legacy.ts'],
  },
})
