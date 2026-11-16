import { spawn } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
} from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

export function command(program, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(program, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) accept()
      else reject(new Error(`${program}: ${code ?? signal}`))
    })
  })
}

async function releaseId(directory) {
  const id = (await readFile(join(directory, 'deploy/server/release-id'), 'utf8')).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new Error('Неверная метка релиза')
  return id
}

async function migrations(directory) {
  const path = join(directory, 'apps/server/src/db/migrations')
  const names = (await readdir(path)).filter((name) => name.endsWith('.sql')).sort()
  return Promise.all(names.map(async (name) => [name, await readFile(join(path, name), 'utf8')]))
}

async function linkTo(root, name, target) {
  const temporary = join(root, `${name}.next`)
  await rm(temporary, { force: true })
  await symlink(target, temporary)
  await rename(temporary, join(root, name))
}

export async function checkRelease(address, id) {
  if (id !== 'bootstrap') {
    const ready = await fetch(`${address}/api/ready`, { signal: AbortSignal.timeout(3000) })
    const body = await ready.json()
    if (!ready.ok || body.ok !== true || body.releaseId !== id) throw new Error('Релиз не готов')
  } else {
    const health = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(3000) })
    if (!health.ok) throw new Error('Bootstrap не отвечает')
  }
  const response = await fetch(`${address}/api/leaderboard`, { signal: AbortSignal.timeout(3000) })
  if (!response.ok || !Array.isArray((await response.json()).entries)) {
    throw new Error('Рейтинг не работает')
  }
}

async function waitForRelease(address, id) {
  let error
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await checkRelease(address, id)
      return
    } catch (cause) {
      error = cause
      await new Promise((accept) => setTimeout(accept, 500))
    }
  }
  throw error
}

async function probe(directory, databasePath, id, schemaVersion) {
  const child = spawn(process.execPath, [join(here, 'probe.mjs')], {
    env: {
      ...process.env,
      THRONE_RELEASE_DIR: directory,
      DATABASE_PATH: databasePath,
      RELEASE_ID: id,
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  const closed = new Promise((accept) => child.once('close', accept))
  let timer
  try {
    await new Promise((accept, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => reject(new Error(`Пробный API завершился: ${code}`)))
      timer = setTimeout(() => reject(new Error('Тайм-аут пробного API')), 15_000)
      child.once('message', async (message) => {
        try {
          if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(message?.address))
            throw new Error('Неверный адрес пробного API')
          await checkRelease(message.address, id)
          const snapshot = new DatabaseSync(databasePath, { readOnly: true })
          try {
            if (snapshot.prepare('PRAGMA user_version').get().user_version !== schemaVersion) {
              throw new Error('Кандидат изменил схему: нужен отдельный план миграции')
            }
          } finally {
            snapshot.close()
          }
          accept()
        } catch (error) {
          reject(error)
        }
      })
    })
  } finally {
    clearTimeout(timer)
    child.kill('SIGTERM')
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
    await closed
    clearTimeout(killTimer)
  }
}

/** root и run подменяются в локальных испытаниях; production вызывает с параметрами по умолчанию. */
export async function deployRelease({
  root = '/srv/throne-defense',
  rollback = false,
  run = command,
  verify = waitForRelease,
} = {}) {
  const previous = await readlink(join(root, 'current'))
  const envFile = join(root, 'shared/server.env')
  const config = parseEnv(await readFile(envFile, 'utf8'))
  const databasePath = config.DATABASE_PATH
  if (!databasePath || !isAbsolute(databasePath))
    throw new Error('DATABASE_PATH должен быть абсолютным')
  const db = resolve(databasePath)
  if (['incoming', 'releases', 'app'].some((name) => db.startsWith(`${join(root, name)}/`))) {
    throw new Error('Рабочая база должна храниться вне каталогов кода')
  }
  await stat(db) // Никогда не создавать пустую рабочую базу из-за опечатки.
  const port = Number(config.PORT || 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Неверный PORT')
  const address = `http://127.0.0.1:${port}`
  const source = rollback ? await readlink(join(root, 'previous')) : join(root, 'incoming')
  const id = await releaseId(source)
  const previousId = await releaseId(previous)
  if (JSON.stringify(await migrations(source)) !== JSON.stringify(await migrations(previous))) {
    throw new Error('Изменены миграции: автоматическая выкладка и откат запрещены')
  }
  let candidate = source
  if (!rollback) {
    await mkdir(join(root, 'releases'), { recursive: true })
    candidate = await mkdtemp(join(root, 'releases', `${id}-`))
    await cp(source, candidate, {
      recursive: true,
      filter: (path) => {
        const relativePath = relative(source, path)
        const serverData = join('apps', 'server', 'data')
        const isServerData =
          relativePath === serverData || relativePath.startsWith(`${serverData}${sep}`)
        return (
          !['node_modules', '.env', '.git'].includes(basename(path)) &&
          !isServerData &&
          !/\.(db|db-wal|db-shm)$/.test(path)
        )
      },
    })
    await run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: candidate })
  }
  const temporary = await mkdtemp(join(root, 'releases', '.probe-'))
  try {
    const snapshotPath = join(temporary, 'snapshot.db')
    const database = new DatabaseSync(db)
    let schemaVersion
    try {
      database.exec('PRAGMA busy_timeout = 10000')
      schemaVersion = database.prepare('PRAGMA user_version').get().user_version
      if (schemaVersion !== (await migrations(candidate)).length) {
        throw new Error('Версия рабочей схемы несовместима с релизом')
      }
      database.prepare('VACUUM INTO ?').run(snapshotPath)
    } finally {
      database.close()
    }
    await probe(candidate, snapshotPath, id, schemaVersion)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }

  async function start(directory) {
    // delete + start гарантирует смену cwd/script; reload мог бы сохранить прежний путь.
    await run('pm2', ['delete', 'throne-api'])
    await run('pm2', ['start', join(here, '../pm2/ecosystem.config.cjs')], {
      env: { ...process.env, THRONE_RELEASE_DIR: directory, THRONE_ENV_FILE: envFile },
    })
  }
  try {
    await start(candidate)
    await verify(address, id)
    await run('pm2', ['save'])
    await linkTo(root, 'previous', previous)
    await linkTo(root, 'current', candidate)
  } catch (error) {
    try {
      // При неудачном start процесса может не быть в pm2.
      await run('pm2', ['delete', 'throne-api']).catch(() => {})
      await run('pm2', ['start', join(here, '../pm2/ecosystem.config.cjs')], {
        env: { ...process.env, THRONE_RELEASE_DIR: previous, THRONE_ENV_FILE: envFile },
      })
      await verify(address, previousId)
      await run('pm2', ['save'])
      await linkTo(root, 'current', previous)
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Выкладка и откат не удались; требуется восстановление оператором',
        { cause: rollbackError },
      )
    }
    throw new Error('Выкладка не удалась; предыдущий релиз восстановлен', { cause: error })
  }
  console.log(`Активен релиз ${id}: ${candidate}`)
  return candidate
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await deployRelease({ rollback: process.argv[2] === 'rollback' })
}
