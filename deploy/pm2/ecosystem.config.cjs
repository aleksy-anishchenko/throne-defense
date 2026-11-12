// Как pm2 запускает API на сервере. Лежит в репозитории, на сервер едет вместе с кодом.
// Запускать от пользователя throne (не root):
//   pm2 start /srv/throne-defense/app/deploy/pm2/ecosystem.config.cjs   — первый запуск
//   pm2 reload throne-api                                               — после выкладки
//   pm2 save                                 — запомнить список, чтобы поднять его после перезагрузки
// .cjs, а не .js: корневой package.json объявляет "type": "module", а pm2 читает конфиг через require

module.exports = {
  apps: [
    {
      name: 'throne-api',
      cwd: '/srv/throne-defense/app/apps/server',
      script: 'src/main.ts',
      // Явно Node: по расширению .ts pm2 может выбрать другой запускатель.
      // Node 24 выполняет TypeScript сам, сборка не нужна
      interpreter: 'node',
      // --env-file, а не --env-file-if-exists, как в npm run dev:server:
      // на сервере без .env API не должно молча стартовать с настройками по умолчанию
      node_args: '--env-file=.env',
      // Один процесс: SQLite пишет один процесс, а нагрузки на второй нет
      instances: 1,
      exec_mode: 'fork',
      // Утечка памяти не съест сервер вместе с VPN: при 200 МБ pm2 перезапустит API
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production' },
    },
  ],
}
