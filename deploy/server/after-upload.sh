#!/usr/bin/env bash
# Выполняется НА СЕРВЕРЕ от пользователя throne, после того как код API залит в /srv/throne-defense/app:
# ставит зависимости, (пере)запускает API в pm2 и проверяет, что оно отвечает.
# Его вызывает deploy/scripts/deploy-server.sh (ручная выкладка), а с шага 3.5 — автодеплой.

set -euo pipefail

APP_DIR=/srv/throne-defense/app
ENV_FILE="$APP_DIR/apps/server/.env"
HEALTH_ATTEMPTS=20
HEALTH_PAUSE_SECONDS=0.5

if [[ "$(id -un)" != "throne" ]]; then
  echo "Запускай от пользователя throne: у root свой, отдельный pm2" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет $ENV_FILE — без него API не стартует (см. PLAN.md, шаг 3.3)" >&2
  exit 1
fi

cd "$APP_DIR"

# npm ci ставит ровно то, что в package-lock.json; --omit=dev — без линтера, тестов и Vite.
# Сайта (apps/web) на сервере нет, поэтому ставятся только зависимости API
npm ci --omit=dev --no-audit --no-fund

# startOrReload: в первый раз запускает, дальше перезапускает с новым кодом
pm2 startOrReload deploy/pm2/ecosystem.config.cjs --update-env
# Запомнить список процессов: его поднимет служба pm2-throne после перезагрузки VPS
pm2 save

port="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2 || true)"
port="${port:-3000}"

# Node стартует не мгновенно — несколько раз спрашиваем «жив?»
for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++)); do
  if curl -fsS "http://127.0.0.1:$port/api/health"; then
    echo
    echo "API отвечает"
    exit 0
  fi
  sleep "$HEALTH_PAUSE_SECONDS"
done

echo "API не отвечает на /api/health. Последние строки журнала:" >&2
pm2 logs throne-api --nostream --lines 30 >&2
exit 1
