#!/usr/bin/env bash
# Выполняется от throne; общая блокировка исключает загрузку во время снимка incoming.
set -euo pipefail
if [[ "$(id -un)" != throne ]]; then
  echo "Запускай от пользователя throne" >&2
  exit 1
fi
umask 077
case "${1:-deploy}" in
  deploy|rollback) ;;
  *) echo "Допустимы deploy или rollback" >&2; exit 1 ;;
esac
exec flock -n /srv/throne-defense/deploy.lock \
  node /srv/throne-defense/incoming/deploy/server/release.mjs "${1:-deploy}"
