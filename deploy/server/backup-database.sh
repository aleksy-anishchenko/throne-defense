#!/usr/bin/env bash
# Бэкап базы API. На сервере лежит как /srv/throne-defense/bin/backup-database (владелец root),
# запускается раз в неделю от пользователя throne — расписание в deploy/cron/throne-defense.
# Руками (от root): su - throne -c /srv/throne-defense/bin/backup-database
#
# Не cp, а VACUUM INTO самого SQLite: простая копия может поймать базу посреди записи
# и получится битый файл. VACUUM INTO делает согласованный снимок, даже пока API пишет,
# и сразу в обычном режиме (без WAL) — один самодостаточный файл, заодно сжатый.

set -euo pipefail

# Пути можно подменить переменными — только чтобы проверить скрипт на своей машине
DATABASE="${THRONE_DATABASE:-/srv/throne-defense/data/throne.db}"
BACKUP_DIR="${THRONE_BACKUP_DIR:-/srv/throne-defense/backups}"
# Раз в неделю × 8 ≈ два месяца истории
KEEP_BACKUPS=8
# Если база занята записью — подождать до 10 с, а не падать
BUSY_TIMEOUT_MS=10000

# Без этой проверки sqlite3 молча создал бы пустую базу и «успешно» её сохранил
if [[ ! -f "$DATABASE" ]]; then
  echo "Нет базы $DATABASE — бэкапить нечего" >&2
  exit 1
fi

# Бэкапы читает только throne: там имена игроков
umask 077
mkdir -p "$BACKUP_DIR"

target="$BACKUP_DIR/throne-$(date -u +%Y-%m-%dT%H%M%SZ).db"
temporary="$target.partial"

# Что бы ни случилось дальше — недоделанный снимок не остаётся лежать рядом с бэкапами
trap 'rm -f "$temporary"' EXIT

# VACUUM INTO рабочую базу только читает. Без -readonly: базе в режиме WAL даже для чтения
# нужен служебный файл -shm, а «только чтение» не может его создать, если API остановлено
sqlite3 "$DATABASE" ".timeout $BUSY_TIMEOUT_MS" "VACUUM INTO '$temporary'"

# Проверить снимок, прежде чем считать его бэкапом
integrity="$(sqlite3 "$temporary" 'PRAGMA integrity_check')"
if [[ "$integrity" != "ok" ]]; then
  echo "Бэкап не прошёл проверку целостности: $integrity" >&2
  exit 1
fi
mv "$temporary" "$target"

# Оставляем KEEP_BACKUPS самых новых: в именах дата, поэтому сортировка по имени — по времени
find "$BACKUP_DIR" -maxdepth 1 -name 'throne-*.db' | sort -r | tail -n +$((KEEP_BACKUPS + 1)) |
  while IFS= read -r old_backup; do
    rm -f -- "$old_backup"
  done

count="$(find "$BACKUP_DIR" -maxdepth 1 -name 'throne-*.db' | wc -l | tr -d ' ')"
echo "Бэкап готов: $target ($(du -h "$target" | cut -f1)), всего бэкапов: $count"
