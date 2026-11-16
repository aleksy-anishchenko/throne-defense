import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('./api-process.mjs', import.meta.url))

/** Убираем все ресурсы даже при ошибке запуска браузера или одной из функций закрытия. */
export async function withResources(run) {
  const cleanup = []
  const errors = []
  let result
  try {
    result = await run((close) => cleanup.push(close))
  } catch (error) {
    errors.push(error)
  } finally {
    for (const close of cleanup.reverse()) {
      try {
        await close()
      } catch (error) {
        errors.push(error)
      }
    }
  }
  if (errors.length) {
    throw new AggregateError(
      errors,
      `Не удалось завершить e2e: ${errors.map((error) => error.message).join('; ')}`,
    )
  }
  return result
}

export async function startApi({
  executable = process.execPath,
  script = entry,
  timeout = 15_000,
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'throne-e2e-'))
  const releaseId = `e2e-${randomUUID()}`
  const child = spawn(executable, [script], {
    env: { ...process.env, DATABASE_PATH: join(directory, 'e2e.db'), RELEASE_ID: releaseId },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  let failure
  // close означает, что завершился процесс и закрылись его каналы.
  const closed = new Promise((resolve) => child.once('close', resolve))
  const failed = new Promise((_, reject) => {
    child.once('error', (error) => {
      failure = error
      reject(error)
    })
    child.once('exit', (code, signal) => {
      failure = new Error(`API завершилось: ${code ?? signal}`)
      reject(failure)
    })
  })
  // Обработчик остаётся и после успешного старта.
  void failed.catch(() => {})
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
    try {
      await closed
      await rm(directory, { recursive: true, force: true })
    } finally {
      clearTimeout(killTimer)
    }
  }
  let timer
  try {
    const ready = new Promise((resolve, reject) => {
      child.once('message', async (message) => {
        try {
          const address = message?.address
          if (typeof address !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(address)) {
            throw new Error('API прислало неверный адрес')
          }
          const response = await fetch(`${address}/api/ready`, {
            signal: AbortSignal.timeout(timeout),
          })
          const body = await response.json()
          if (!response.ok || body.ok !== true || body.releaseId !== releaseId) {
            throw new Error('Readiness ответила за другой процесс или API не готово')
          }
          if (failure) throw failure
          resolve({ address, stop })
        } catch (error) {
          reject(error)
        }
      })
    })
    return await Promise.race([
      ready,
      failed,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Истекло ожидание старта API')), timeout)
      }),
    ])
  } catch (error) {
    await stop()
    throw error
  } finally {
    clearTimeout(timer)
  }
}
