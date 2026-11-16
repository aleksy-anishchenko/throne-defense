import { fork } from 'node:child_process'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readlink,
  symlink,
  rm,
  readdir,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { checkRelease, deployRelease } from './release.mjs'

const cleanup = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

// Маленькое настоящее HTTP/SQLite-приложение. Инфраструктура испытывается без VPS и pm2.
const appSource = `
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { BALANCE_VERSION } from '../../../packages/game/src/core/game.ts'
export function buildApp({databasePath, releaseId}) {
  const db = new DatabaseSync(databasePath)
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (releaseId === 'bad-probe') res.statusCode = 503
    res.end(JSON.stringify(req.url === '/api/leaderboard'
      ? {entries: db.prepare('SELECT * FROM runs').all()}
      : {ok: releaseId !== 'bad-probe', releaseId, balanceVersion: BALANCE_VERSION}))
  })
  return {
    listen: ({host, port}) => new Promise((accept) => server.listen(port, host, () =>
      accept('http://127.0.0.1:' + server.address().port))),
    close: () => new Promise((accept) => server.close(() => { db.close(); accept() }))
  }
}
`

async function fixture(id = 'new-release') {
  const root = await mkdtemp(join(tmpdir(), 'throne-release-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'shared'))
  await mkdir(join(root, 'releases'))
  const dbPath = join(root, 'live.db')
  const db = new DatabaseSync(dbPath)
  db.exec(
    'CREATE TABLE runs (score INTEGER); INSERT INTO runs VALUES (42); PRAGMA user_version = 1',
  )
  db.close()
  await writeFile(join(root, 'shared/server.env'), `DATABASE_PATH=${dbPath}\nPORT=3000\n`)
  const previous = join(root, 'releases/old')
  for (const [directory, name] of [
    [previous, 'old-release'],
    [join(root, 'incoming'), id],
  ]) {
    await mkdir(join(directory, 'apps/server/src/db/migrations'), { recursive: true })
    await mkdir(join(directory, 'deploy/server'), { recursive: true })
    await mkdir(join(directory, 'apps/server/data'), { recursive: true })
    await mkdir(join(directory, 'packages/game/src/core'), { recursive: true })
    await mkdir(join(directory, 'packages/game/src/data'), { recursive: true })
    await writeFile(join(directory, 'package.json'), '{"type":"module"}')
    await writeFile(join(directory, 'apps/server/src/app.ts'), appSource)
    await writeFile(join(directory, 'apps/server/data/local.db'), 'do not copy')
    await writeFile(
      join(directory, 'packages/game/src/core/game.ts'),
      "export { BALANCE_VERSION } from '../data/balance.ts'\n",
    )
    await writeFile(
      join(directory, 'packages/game/src/data/balance.ts'),
      'export const BALANCE_VERSION = 9\n',
    )
    await writeFile(
      join(directory, 'apps/server/src/db/migrations/001-runs.sql'),
      'CREATE TABLE runs (score INTEGER);',
    )
    await writeFile(join(directory, 'deploy/server/release-id'), name)
  }
  await symlink(previous, join(root, 'current'))
  let active
  let live
  const events = []
  async function stop() {
    if (!live) return
    const child = live
    live = undefined
    const closed = new Promise((accept) => child.once('close', accept))
    child.kill('SIGTERM')
    await closed
  }
  cleanup.push(stop)
  async function start(directory) {
    active = directory
    const releaseId = (await readFile(join(directory, 'deploy/server/release-id'), 'utf8')).trim()
    live = fork(fileURLToPath(new URL('./probe.mjs', import.meta.url)), [], {
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
        RELEASE_ID: releaseId,
        THRONE_RELEASE_DIR: directory,
      },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    })
    const child = live
    const address = await new Promise((accept, reject) => {
      child.once('message', ({ address }) => accept(address))
      child.once('error', reject)
      child.once('exit', (code) => reject(new Error(`exit ${code}`)))
    })
    child.address = address
  }
  await start(previous)
  return {
    root,
    previous,
    events,
    active: () => active,
    async verify(_address, releaseId) {
      await checkRelease(live.address, releaseId)
    },
    async run(program, args, options) {
      events.push([program, ...args])
      if (program === 'npm') return // Нет внешних зависимостей у испытательного приложения.
      if (args[0] === 'delete') await stop()
      else if (args[0] === 'start') await start(options.env.THRONE_RELEASE_DIR)
    },
    scores() {
      const db = new DatabaseSync(dbPath)
      try {
        return db
          .prepare('SELECT score FROM runs')
          .all()
          .map(({ score }) => score)
      } finally {
        db.close()
      }
    },
  }
}

it('установка падает: старый HTTP-процесс и его файлы остаются рабочими', async () => {
  const f = await fixture()
  await expect(
    deployRelease({
      ...f,
      run: async () => {
        throw new Error('npm ci failed')
      },
    }),
  ).rejects.toThrow('npm ci failed')
  await f.verify('', 'old-release')
  expect(await readlink(join(f.root, 'current'))).toBe(f.previous)
  expect(f.scores()).toEqual([42])
})

it('неуспешная readiness кандидата не останавливает старый API', async () => {
  const f = await fixture('bad-probe')
  await expect(deployRelease(f)).rejects.toThrow('Релиз не готов')
  await f.verify('', 'old-release')
  expect(f.events.some(([program]) => program === 'pm2')).toBe(false)
  expect((await readdir(join(f.root, 'releases'))).some((name) => name.startsWith('.probe-'))).toBe(
    false,
  )
})

it('успешное переключение и ручной откат сохраняют базу', async () => {
  const f = await fixture()
  const candidate = await deployRelease(f)
  expect(await readlink(join(f.root, 'current'))).toBe(candidate)
  expect(await readlink(join(f.root, 'previous'))).toBe(f.previous)
  await f.verify('', 'new-release')
  expect(await readFile(join(candidate, 'packages/game/src/data/balance.ts'), 'utf8')).toContain(
    'BALANCE_VERSION = 9',
  )
  await expect(readFile(join(candidate, 'apps/server/data/local.db'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
  const db = new DatabaseSync(join(f.root, 'live.db'))
  db.exec('INSERT INTO runs VALUES (99)')
  db.close()
  await deployRelease({ ...f, rollback: true })
  await f.verify('', 'old-release')
  expect(f.scores()).toEqual([42, 99])
})

it.each(['start', 'verify', 'save'])(
  'отказ после остановки старого API (%s) возвращает его',
  async (failure) => {
    const f = await fixture()
    let failed = false
    await expect(
      deployRelease({
        ...f,
        run: async (program, args, options) => {
          if (!failed && program === 'pm2' && args[0] === failure) {
            failed = true
            throw new Error('отказ')
          }
          await f.run(program, args, options)
        },
        verify: async (address, id) => {
          if (!failed && failure === 'verify') {
            failed = true
            throw new Error('отказ проверки')
          }
          await f.verify(address, id)
        },
      }),
    ).rejects.toThrow('предыдущий релиз восстановлен')
    await f.verify('', 'old-release')
    expect(await readlink(join(f.root, 'current'))).toBe(f.previous)
    expect(f.scores()).toEqual([42])
  },
)

it('изменение миграций блокирует выкладку до установки и остановки API', async () => {
  const f = await fixture()
  await writeFile(
    join(f.root, 'incoming/apps/server/src/db/migrations/002-new.sql'),
    'ALTER TABLE runs ADD COLUMN extra TEXT',
  )
  await expect(deployRelease(f)).rejects.toThrow('Изменены миграции')
  expect(f.events).toEqual([])
  await f.verify('', 'old-release')
})

it('расхождение версии рабочей схемы не меняет работающий API', async () => {
  const f = await fixture()
  const db = new DatabaseSync(join(f.root, 'live.db'))
  db.exec('PRAGMA user_version = 2')
  db.close()
  await expect(deployRelease(f)).rejects.toThrow('Версия рабочей схемы')
  await f.verify('', 'old-release')
})
