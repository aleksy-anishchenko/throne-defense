import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { IN_MEMORY_DATABASE, openDatabase } from '../src/db/database.ts'
import { loadMigrations, migrate, readUserVersion } from '../src/db/migrate.ts'

const VALID_RUN = {
  player_name: 'Василиса',
  level_id: 'throne-hall',
  score: 12345,
  waves_cleared: 12,
  balance_version: 4,
}

function insertRun(database: DatabaseSync, run: Record<string, string | number>): void {
  database
    .prepare(
      `INSERT INTO runs (player_name, level_id, score, waves_cleared, balance_version)
       VALUES (:player_name, :level_id, :score, :waves_cleared, :balance_version)`,
    )
    .run(run)
}

describe('миграции из apps/server/src/db/migrations', () => {
  it('номера идут подряд с 001', () => {
    const migrations = loadMigrations()
    expect(migrations.length).toBeGreaterThan(0)
    expect(migrations.map((migration) => migration.version)).toEqual(
      migrations.map((_, index) => index + 1),
    )
  })

  it('новая база получает все миграции, повторный запуск ничего не делает', () => {
    const database = new DatabaseSync(IN_MEMORY_DATABASE)
    const migrations = loadMigrations()
    expect(migrate(database, migrations)).toEqual(migrations.map((migration) => migration.version))
    expect(readUserVersion(database)).toBe(migrations.length)
    expect(migrate(database, migrations)).toEqual([])
    database.close()
  })
})

describe('таблица runs', () => {
  const database = openDatabase(IN_MEMORY_DATABASE)
  afterAll(() => {
    database.close()
  })

  it('принимает нормальный результат и сама ставит дату', () => {
    insertRun(database, VALID_RUN)
    const row = database.prepare('SELECT * FROM runs').get() as Record<string, unknown>
    expect(row).toMatchObject(VALID_RUN)
    expect(row['created_at']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('имя до 20 букв — кириллица считается буквами, а не байтами', () => {
    expect(() => insertRun(database, { ...VALID_RUN, player_name: 'Я'.repeat(20) })).not.toThrow()
    expect(() => insertRun(database, { ...VALID_RUN, player_name: 'Я'.repeat(21) })).toThrow()
  })

  it('не принимает мусор', () => {
    const garbage = [
      { player_name: '' },
      { player_name: ' Вася' },
      { score: -1 },
      { waves_cleared: -1 },
      { balance_version: 0 },
      // STRICT: строка в числовой колонке
      { score: 'много' },
    ]
    for (const change of garbage) {
      expect(
        () => insertRun(database, { ...VALID_RUN, ...change }),
        JSON.stringify(change),
      ).toThrow()
    }
  })
})

describe('migrate: защита от ошибок', () => {
  let directory = ''
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  function migrationsDirectory(files: Record<string, string>): string {
    directory = mkdtempSync(join(tmpdir(), 'throne-migrations-'))
    for (const [fileName, sql] of Object.entries(files)) {
      writeFileSync(join(directory, fileName), sql)
    }
    return directory
  }

  it('пропуск в номерах — ошибка', () => {
    const path = migrationsDirectory({ '001-a.sql': 'SELECT 1;', '003-c.sql': 'SELECT 1;' })
    expect(() => loadMigrations(path)).toThrow(/ожидался номер 2/)
  })

  it('неправильное имя файла — ошибка', () => {
    const path = migrationsDirectory({ '1-runs.sql': 'SELECT 1;' })
    expect(() => loadMigrations(path)).toThrow(/имя должно быть/)
  })

  it('упавшая миграция откатывается целиком', () => {
    const path = migrationsDirectory({
      '001-ok.sql': 'CREATE TABLE a (id INTEGER);',
      '002-broken.sql': 'CREATE TABLE b (id INTEGER); THIS IS NOT SQL;',
    })
    const database = new DatabaseSync(IN_MEMORY_DATABASE)
    expect(() => migrate(database, loadMigrations(path))).toThrow(/002-broken\.sql/)
    expect(readUserVersion(database)).toBe(1)
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    expect(tables).toEqual([{ name: 'a' }])
    database.close()
  })

  it('база новее кода — не стартуем', () => {
    const database = new DatabaseSync(IN_MEMORY_DATABASE)
    database.exec('PRAGMA user_version = 99')
    expect(() => migrate(database, [])).toThrow(/Код старше базы/)
    database.close()
  })
})

describe('openDatabase с файлом', () => {
  let directory = ''
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('создаёт папку, а данные переживают закрытие и повторное открытие', () => {
    directory = mkdtempSync(join(tmpdir(), 'throne-db-'))
    const path = join(directory, 'nested', 'throne.db')

    const first = openDatabase(path)
    insertRun(first, VALID_RUN)
    first.close()

    const second = openDatabase(path)
    expect(second.prepare('SELECT count(*) AS count FROM runs').get()).toEqual({ count: 1 })
    second.close()
  })
})
