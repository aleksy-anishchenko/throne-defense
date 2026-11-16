#!/usr/bin/env bash
# «Вахтёр» для ключа автодеплоя API. На сервере лежит как /srv/throne-defense/bin/deploy-command
# (владелец root — пользователь throne не может его поменять) и стоит в authorized_keys у throne:
#   command="/srv/throne-defense/bin/deploy-command",restrict ssh-ed25519 AAAA… github-actions-api
# Что бы ни попросил вошедший по этому ключу, sshd запускает этот скрипт, а саму просьбу кладёт
# в SSH_ORIGINAL_COMMAND. Разрешены:
#   1. rsync в /srv/throne-defense/incoming под блокировкой;
#   2. «after-upload» — подготовка релиза, проверка, переключение с откатом;
#   3. «deployment-ready» — проверка однократной подготовки каталогов.
# Остальное, включая обычный вход с терминалом, отклоняется.
# Поменял этот файл — скопируй его на сервер заново (см. PLAN.md, «Сервер»): сам он не обновляется.

set -euo pipefail

APP_DIR=/srv/throne-defense/incoming
ROOT=/srv/throne-defense

if [[ ! -L "$ROOT/current" || ! -d "$ROOT/current" || ! -f "$ROOT/shared/server.env" || ! -w "$ROOT/deploy.lock" ]]; then
  echo "Сначала подготовьте releases/current/shared по deploy/RELEASES.md" >&2
  exit 1
fi

case "${SSH_ORIGINAL_COMMAND:-}" in
  "rsync --server "*)
    # rrsync сам проверит опции rsync и не выпустит его за пределы папки
    exec flock -n "$ROOT/deploy.lock" /usr/bin/rrsync "$APP_DIR"
    ;;
  "after-upload")
    exec bash "$APP_DIR/deploy/server/after-upload.sh"
    ;;
  "deployment-ready")
    echo "release-layout-v1"
    ;;
  *)
    echo "Разрешены только rsync, after-upload и deployment-ready" >&2
    exit 1
    ;;
esac
