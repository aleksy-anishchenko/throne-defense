// Как pm2 запускает API на сервере. Лежит в репозитории, на сервер едет вместе с кодом.
// Запускается от throne менеджером deploy/server/release.mjs с THRONE_RELEASE_DIR
// и THRONE_ENV_FILE. Однократная подготовка и ручной откат — deploy/RELEASES.md.
// .cjs, а не .js: корневой package.json объявляет "type": "module", а pm2 читает конфиг через require

const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { parseEnv } = require('node:util')
const releaseDirectory = process.env.THRONE_RELEASE_DIR
const envFile = process.env.THRONE_ENV_FILE
if (!releaseDirectory || !envFile) throw new Error('Нужны THRONE_RELEASE_DIR и THRONE_ENV_FILE')
const config = parseEnv(readFileSync(envFile, 'utf8'))
const releaseId = readFileSync(join(releaseDirectory, 'deploy/server/release-id'), 'utf8').trim()
if (!releaseId) throw new Error('Пустой идентификатор релиза')

module.exports = {
  apps: [
    {
      name: 'throne-api',
      cwd: join(releaseDirectory, 'apps/server'),
      script: 'src/main.ts',
      // Явно Node: по расширению .ts pm2 может выбрать другой запускатель.
      // Node 24 выполняет TypeScript сам, сборка не нужна
      interpreter: 'node',
      // --env-file, а не --env-file-if-exists, как в npm run dev:server:
      // без shared/server.env API не должно стартовать с настройками по умолчанию
      node_args: `--env-file=${envFile}`,
      // Один процесс: SQLite пишет один процесс, а нагрузки на второй нет
      instances: 1,
      exec_mode: 'fork',
      // Утечка памяти не съест сервер вместе с VPN: при 200 МБ pm2 перезапустит API
      max_memory_restart: '200M',
      env: {
        ...config,
        PORT: config.PORT || '3000',
        NODE_ENV: 'production',
        RELEASE_ID: releaseId,
      },
    },
  ],
}
