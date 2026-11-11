#!/usr/bin/env bash
# Выложить игру на сервер вручную. Обычно это делает GitHub Actions (.github/workflows/deploy.yml)
# после пуша в main; скрипт — запасной путь (например, если Actions недоступны).
# Запускать из корня репозитория:
#   deploy/scripts/deploy-web.sh          — показать, что изменится (ничего не трогает)
#   deploy/scripts/deploy-web.sh --apply  — выложить по-настоящему
#
# Выкладываем от пользователя deploy: он может только rsync в /var/www/throne-defense (rrsync),
# поэтому путь назначения — «/», для rrsync это корень папки игры.
# Не выкладывай от root: файлы стали бы принадлежать root, и автодеплой не смог бы их заменить.

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-77.91.113.61}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

# В новых macOS вместо rsync стоит openrsync от Apple. Он передаёт серверу параметры
# в своём формате, и rrsync на сервере его отвергает («invalid rsync-command syntax»).
# Нужен настоящий rsync: brew install rsync (он встанет в PATH раньше системного)
if rsync --version 2>&1 | grep -q openrsync; then
  echo "Нужен настоящий rsync, а не openrsync от Apple: brew install rsync" >&2
  echo "После установки открой новое окно терминала и проверь: rsync --version" >&2
  exit 1
fi

npm run build

# Предохранитель: если сборка получилась пустой, rsync --delete стёр бы работающий сайт
if [[ ! -s apps/web/dist/index.html ]]; then
  echo "Сборка пустая (нет apps/web/dist/index.html) — ничего не выкладываю" >&2
  exit 1
fi

# / в конце dist/ — «содержимое папки», а не сама папка.
# --delete удаляет на сервере файлы, которых больше нет в сборке (старые index-XXXX.js).
# --delay-updates подменяет файлы разом в конце; --no-owner --no-group не переносят владельца с Mac.
# Те же опции — в .github/workflows/deploy.yml
RSYNC_OPTIONS=(-av --delete --delay-updates --no-owner --no-group)

if [[ "${1:-}" == "--apply" ]]; then
  rsync "${RSYNC_OPTIONS[@]}" apps/web/dist/ "$DEPLOY_USER@$DEPLOY_HOST:/"
  echo "Готово: игра выложена"
else
  rsync "${RSYNC_OPTIONS[@]}" --dry-run apps/web/dist/ "$DEPLOY_USER@$DEPLOY_HOST:/"
  echo
  echo "Это была проверка (--dry-run): на сервере ничего не изменилось."
  echo "Если список выглядит разумно: deploy/scripts/deploy-web.sh --apply"
fi
