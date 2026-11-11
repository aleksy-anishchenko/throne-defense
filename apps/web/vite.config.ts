import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/** Короткий хеш текущего коммита — по нему видно, какая версия выложена. Без git — 'dev' */
function gitShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

/** Дата сборки по-русски: 12.11.2026 */
const buildDate = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // import ... from '@/stores/game' вместо '../../stores/game'
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Подставляется в код при сборке (как константа). Тип объявлен в src/env.d.ts
  define: {
    __APP_VERSION__: JSON.stringify(`${gitShortHash()} · ${buildDate}`),
  },
})
