import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { migrate } from './migrate.ts'

/** База в памяти: живёт, пока открыта, на диск не пишется. Для тестов */
export const IN_MEMORY_DATABASE = ':memory:'

/** Сколько ждать, если файл базы занят (например, бэкап из шага 3.7), а не падать сразу */
const BUSY_TIMEOUT_MS = 5000

/**
 * Открывает базу SQLite (встроенный в Node модуль node:sqlite — ничего не надо собирать
 * на сервере), настраивает её и применяет новые миграции.
 */
export function openDatabase(path: string): DatabaseSync {
  if (path !== IN_MEMORY_DATABASE) {
    // При первом запуске папки может не быть (у себя на Mac — apps/server/data)
    mkdirSync(dirname(path), { recursive: true })
  }

  const database = new DatabaseSync(path)
  try {
    // WAL: чтение не ждёт записи, а запись при сбое питания не портит базу
    database.exec('PRAGMA journal_mode = WAL')
    // Связи между таблицами (появятся в этапе 4) SQLite по умолчанию не проверяет — включаем
    database.exec('PRAGMA foreign_keys = ON')
    database.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
    migrate(database)
  } catch (error) {
    database.close()
    throw error
  }
  return database
}
