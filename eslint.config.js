import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['**/dist/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],
  {
    // TypeScript внутри <script setup lang="ts">
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['apps/web/src/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['packages/*/tools/**/*.ts', '**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Скрипт запускается в Node, но часть кода (page.evaluate) выполняется в браузере
    files: ['apps/web/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // Отключает правила оформления, за оформление отвечает Prettier
  prettier,
])
