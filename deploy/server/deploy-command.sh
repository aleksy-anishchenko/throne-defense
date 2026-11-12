#!/usr/bin/env bash
# «Вахтёр» для ключа автодеплоя API. На сервере лежит как /srv/throne-defense/bin/deploy-command
# (владелец root — пользователь throne не может его поменять) и стоит в authorized_keys у throne:
#   command="/srv/throne-defense/bin/deploy-command",restrict ssh-ed25519 AAAA… github-actions-api
# Что бы ни попросил вошедший по этому ключу, sshd запускает этот скрипт, а саму просьбу кладёт
# в SSH_ORIGINAL_COMMAND. Разрешены ровно две вещи:
#   1. rsync в /srv/throne-defense/app — через rrsync, как у ключа сайта (только эта папка);
#   2. «after-upload» — npm ci, перезапуск API и проверка (deploy/server/after-upload.sh).
# Остальное, включая обычный вход с терминалом, отклоняется.
# Поменял этот файл — скопируй его на сервер заново (см. PLAN.md, «Сервер»): сам он не обновляется.

set -euo pipefail

APP_DIR=/srv/throne-defense/app

case "${SSH_ORIGINAL_COMMAND:-}" in
  "rsync --server "*)
    # rrsync сам проверит опции rsync и не выпустит его за пределы папки
    exec /usr/bin/rrsync "$APP_DIR"
    ;;
  "after-upload")
    exec bash "$APP_DIR/deploy/server/after-upload.sh"
    ;;
  *)
    echo "Этому ключу можно только rsync в папку API и after-upload" >&2
    exit 1
    ;;
esac
