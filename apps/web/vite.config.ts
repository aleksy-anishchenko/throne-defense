import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // import ... from '@/stores/game' вместо '../../stores/game'
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
