#!/usr/bin/env bash
# Выложить API на сервер вручную. С шага 3.5 это будет делать GitHub Actions; скрипт — запасной путь.
# Запускать из корня репозитория:
#   deploy/scripts/deploy-server.sh          — показать, что изменится (ничего не трогает)
#   deploy/scripts/deploy-server.sh --apply  — выложить по-настоящему
#
# Заливаем от root (твой личный ключ), файлы сразу отдаём пользователю throne (--chown).
# Потом от throne запускается deploy/server/after-upload.sh: npm ci, pm2, проверка релиза.

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-77.91.113.61}"
APP_DIR=/srv/throne-defense/incoming

# Нужен настоящий rsync (--chown), а не openrsync от Apple: brew install rsync
if rsync --version 2>&1 | grep -q openrsync; then
  echo "Нужен настоящий rsync, а не openrsync от Apple: brew install rsync" >&2
  echo "После установки открой новое окно терминала и проверь: rsync --version" >&2
  exit 1
fi

if [[ ! -f package.json || ! -d apps/server ]]; then
  echo "Запускай из корня репозитория: deploy/scripts/deploy-server.sh" >&2
  exit 1
fi

# Сломанное на сервер не везём: линтер, типы и тесты должны быть зелёными
npm run lint
npm run typecheck
npm test

# Ручная выкладка копирует и незакоммиченные файлы: помечаем такую сборку отдельно.
release_id="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  release_id="$release_id-dirty-$(date -u +%Y%m%dT%H%M%SZ)"
fi
printf '%s\n' "$release_id" > deploy/server/release-id

# Что едет — список в deploy/server/upload-paths.txt (общий с автодеплоем в deploy.yml).
# --files-from сохраняет пути как есть: apps/server → $APP_DIR/apps/server; -r — с вложенными папками.
# --delete удаляет на сервере файлы, которых больше нет в репозитории, — но только внутри
# перечисленных папок. Исключённое (--exclude) он не трогает: так уцелеют .env с настройками
# сервера и node_modules, которые ставит npm ci на сервере. Свой .env с Mac тоже не уедет.
# Скрипт копирует папку как есть, а не git: .gitignore ему не указ. Поэтому руками
# исключаем и базу для разработки (apps/server/data/*.db и её -wal/-shm)
RSYNC_OPTIONS=(
  -av
  -r
  --files-from=deploy/server/upload-paths.txt
  --delete
  --delay-updates
  --chown=throne:throne
  --exclude=.env
  --exclude=node_modules/
  --exclude=.DS_Store
  --exclude='*.db'
  --exclude='*.db-wal'
  --exclude='*.db-shm'
)

if [[ "${1:-}" == "--apply" ]]; then
  ssh "root@$DEPLOY_HOST" "su - throne -c 'test -L /srv/throne-defense/current && test -f /srv/throne-defense/shared/server.env && test -w /srv/throne-defense/deploy.lock'"
  # Та же блокировка, что у ограниченного ключа CI и after-upload.
  RSYNC_OPTIONS+=(--rsync-path="flock -n /srv/throne-defense/deploy.lock rsync")
  rsync "${RSYNC_OPTIONS[@]}" . "root@$DEPLOY_HOST:$APP_DIR/"
  # su - throne: команды от throne, с его окружением (его pm2, его папка ~/.npm)
  ssh "root@$DEPLOY_HOST" "su - throne -c 'bash $APP_DIR/deploy/server/after-upload.sh'"
  echo
  node deploy/server/check-ready.mjs https://throne-defense.ru "$release_id"
else
  rsync "${RSYNC_OPTIONS[@]}" --dry-run . "root@$DEPLOY_HOST:$APP_DIR/"
  echo
  echo "Это пробный прогон: на сервере ничего не изменилось. Выложить: $0 --apply"
fi
