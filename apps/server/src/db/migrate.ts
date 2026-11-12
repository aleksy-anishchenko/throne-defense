import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'

/** Одна миграция: файл migrations/NNN-что-делает.sql */
export interface Migration {
  version: number
  fileName: string
  sql: string
}

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url))
/** 001-runs.sql: три цифры номера, дефис, название маленькими латинскими буквами */
const MIGRATION_FILE_NAME = /^(\d{3})-[a-z0-9-]+\.sql$/

/**
 * Читает миграции из папки по порядку номеров. Номера — подряд с 1, без пропусков и повторов:
 * иначе непонятно, какие из них уже применены к базе.
 */
export function loadMigrations(directory: string = MIGRATIONS_DIR): Migration[] {
  const fileNames = readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()

  return fileNames.map((fileName, index) => {
    const match = MIGRATION_FILE_NAME.exec(fileName)
    if (match === null) {
      throw new Error(`Миграция «${fileName}»: имя должно быть вида 001-create-runs.sql`)
    }
    const version = Number(match[1])
    const expectedVersion = index + 1
    if (version !== expectedVersion) {
      throw new Error(
        `Миграция «${fileName}»: ожидался номер ${expectedVersion} — номера идут подряд с 001`,
      )
    }
    return { version, fileName, sql: readFileSync(join(directory, fileName), 'utf8') }
  })
}

/**
 * Номер последней применённой миграции хранится в самом файле базы (PRAGMA user_version,
 * у новой базы — 0). Применяем только те, что новее, каждую в своей транзакции:
 * упала посередине — база остаётся как была, а сервер не стартует с понятной ошибкой.
 * Возвращает номера применённых сейчас миграций.
 */
export function migrate(
  database: DatabaseSync,
  migrations: Migration[] = loadMigrations(),
): number[] {
  const currentVersion = readUserVersion(database)
  const latestVersion = migrations.length

  // Например, откатили код на старую версию, а база уже прошла новые миграции.
  // Старый код с новой базой может испортить данные — лучше не стартовать
  if (currentVersion > latestVersion) {
    throw new Error(
      `База на версии ${currentVersion}, а код знает миграции только до ${latestVersion}. ` +
        'Код старше базы — выложи свежий код',
    )
  }

  const applied: number[] = []
  for (const migration of migrations.slice(currentVersion)) {
    database.exec('BEGIN')
    try {
      database.exec(migration.sql)
      // user_version меняется внутри той же транзакции и откатится вместе с ней
      database.exec(`PRAGMA user_version = ${migration.version}`)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw new Error(`Миграция «${migration.fileName}» не применилась`, { cause: error })
    }
    applied.push(migration.version)
  }
  return applied
}

export function readUserVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}
