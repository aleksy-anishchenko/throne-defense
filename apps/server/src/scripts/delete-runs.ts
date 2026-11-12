// Удалить результаты одного имени из общего топа (явный мусор, оскорбительное имя).
// Руками в базе ничего не меняем — только этим скриптом: он показывает, что удалит, и удаляет
// одной транзакцией.
//
// На сервере (от throne, из папки API):
//   su - throne
//   cd /srv/throne-defense/app/apps/server
//   node --env-file=.env src/scripts/delete-runs.ts "Имя"           — показать, что удалится
//   node --env-file=.env src/scripts/delete-runs.ts "Имя" --apply   — удалить
// API останавливать не нужно: SQLite дождётся своей очереди на запись (busy_timeout).
// Перед удалением — бэкап: /srv/throne-defense/bin/backup-database

import { loadConfig } from '../config.ts'
import { openDatabase } from '../db/database.ts'

const [playerName, flag] = process.argv.slice(2)
if (!playerName || (flag !== undefined && flag !== '--apply')) {
  console.error('Как запускать: node --env-file=.env src/scripts/delete-runs.ts "Имя" [--apply]')
  process.exit(1)
}
const isApply = flag === '--apply'

const database = openDatabase(loadConfig().databasePath)
try {
  const runs = database
    .prepare(
      `SELECT id, level_id, balance_version, score, waves_cleared, created_at FROM runs
       WHERE player_name = :player_name ORDER BY created_at`,
    )
    .all({ player_name: playerName })

  if (runs.length === 0) {
    console.log(`У имени «${playerName}» результатов нет. Имя должно совпадать точно, с регистром.`)
  } else {
    console.table(runs)
    if (isApply) {
      const result = database
        .prepare('DELETE FROM runs WHERE player_name = :player_name')
        .run({ player_name: playerName })
      console.log(`Удалено результатов: ${result.changes}`)
    } else {
      console.log(`Будет удалено результатов: ${runs.length}. Удалить: добавь --apply`)
    }
  }
} finally {
  database.close()
}
