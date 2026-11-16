#!/usr/bin/env bash
# Общая публикация для CI и ручной выкладки. Ресурсы раньше HTML, старые файлы сохраняются.
set -euo pipefail
source_dir="${1:?Нужна папка сборки}"
destination="${2:?Нужна папка назначения}"
shift 2
test -s "$source_dir/index.html"
test -d "$source_dir/assets"
options=(-av --delay-updates --no-owner --no-group -e "${THRONE_RSYNC_SSH:-ssh}")
rsync "${options[@]}" "$@" --exclude=/index.html "$source_dir/" "$destination"
# У HTML может совпасть размер и секундный mtime с предыдущей сборкой.
rsync "${options[@]}" --checksum "$@" "$source_dir/index.html" "$destination"
