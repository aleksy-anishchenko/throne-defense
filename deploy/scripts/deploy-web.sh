#!/usr/bin/env bash
# Выложить игру на сервер вручную (до автодеплоя, этап 2).
# Запускать из корня репозитория:
#   deploy/scripts/deploy-web.sh          — показать, что изменится (ничего не трогает)
#   deploy/scripts/deploy-web.sh --apply  — выложить по-настоящему
#
# Адрес и пользователя можно поменять переменными: DEPLOY_HOST=… DEPLOY_USER=… deploy/scripts/deploy-web.sh

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-77.91.113.61}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="/var/www/throne-defense/"

npm run build

# Предохранитель: если сборка получилась пустой, rsync --delete стёр бы работающий сайт
if [[ ! -s apps/web/dist/index.html ]]; then
  echo "Сборка пустая (нет apps/web/dist/index.html) — ничего не выкладываю" >&2
  exit 1
fi

# / в конце dist/ — «содержимое папки», а не сама папка.
# --delete удаляет на сервере файлы, которых больше нет в сборке (старые index-XXXX.js).
# --delay-updates подменяет файлы разом в конце; --no-owner --no-group не переносят владельца с Mac
RSYNC_OPTIONS=(-av --delete --delay-updates --no-owner --no-group)

if [[ "${1:-}" == "--apply" ]]; then
  rsync "${RSYNC_OPTIONS[@]}" apps/web/dist/ "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"
  echo "Готово: игра выложена"
else
  rsync "${RSYNC_OPTIONS[@]}" --dry-run apps/web/dist/ "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"
  echo
  echo "Это была проверка (--dry-run): на сервере ничего не изменилось."
  echo "Если список выглядит разумно: deploy/scripts/deploy-web.sh --apply"
fi
