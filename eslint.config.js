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
    // __APP_VERSION__ подставляет Vite при сборке (define в vite.config.ts)
    languageOptions: { globals: { ...globals.browser, __APP_VERSION__: 'readonly' } },
  },
  {
    files: ['tools/**/*.ts', 'apps/server/**/*.ts', '**/*.config.{js,cjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Скрипт запускается в Node, но часть кода (page.evaluate) выполняется в браузере
    files: ['apps/web/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Логика игры детерминирована: одинаковые действия — одинаковый результат.
    // На этом держится будущая проверка партий на сервере (этап 5 в PLAN.md)
    files: ['packages/game/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'В логике игры нет случайности. Нужна — генератор с зерном (seed).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Логика игры не знает реального времени: время идёт только через advance(dt).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Логика игры не знает реального времени: время идёт только через advance(dt).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vue', message: 'Логика игры не знает про Vue: она общая с сервером.' },
            { name: 'pinia', message: 'Логика игры не знает про Pinia: она общая с сервером.' },
          ],
        },
      ],
    },
  },
  {
    // Рисование получает игру и BoardView аргументами и не знает про Vue и стор
    files: ['apps/web/src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vue', message: 'render/ не знает про Vue: всё нужное приходит аргументами.' },
            {
              name: 'pinia',
              message: 'render/ не знает про Pinia: всё нужное приходит аргументами.',
            },
          ],
          patterns: [
            {
              regex: '(^|/)stores(/|$)',
              message: 'render/ не знает про стор: всё нужное приходит аргументами.',
            },
          ],
        },
      ],
    },
  },
  // Отключает правила оформления, за оформление отвечает Prettier
  prettier,
])
