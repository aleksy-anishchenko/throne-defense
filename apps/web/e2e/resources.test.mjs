import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'
import { startApi, withResources } from './resources.mjs'

const cleanup = []
const exec = promisify(execFile)
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function fixture(source) {
  const directory = await mkdtemp(join(tmpdir(), 'throne-fixture-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const script = join(directory, 'child.mjs')
  await writeFile(script, source)
  return script
}

it('ошибка запуска браузера закрывает API и удаляет временную базу', async () => {
  let address
  const before = (await readdir(tmpdir())).filter((name) => name.startsWith('throne-e2e-'))
  await expect(
    withResources(async (close) => {
      const api = await startApi()
      address = api.address
      close(api.stop)
      expect((await fetch(`${address}/api/ready`)).status).toBe(200)
      throw new Error('Браузер отсутствует')
    }),
  ).rejects.toThrow('Браузер отсутствует')
  await expect(fetch(`${address}/api/health`)).rejects.toThrow()
  const after = (await readdir(tmpdir())).filter((name) => name.startsWith('throne-e2e-'))
  expect(after.sort()).toEqual(before.sort())
})

it('сбой одного закрытия не мешает остальной уборке', async () => {
  const calls = []
  await expect(
    withResources(async (close) => {
      close(() => calls.push('api'))
      close(() => {
        throw new Error('preview')
      })
      close(() => calls.push('browser'))
    }),
  ).rejects.toThrow('preview')
  expect(calls).toEqual(['browser', 'api'])
})

it('занятый чужим сервисом порт не используется и чужая readiness отклоняется', async () => {
  let requests = 0
  const other = createServer((_request, response) => {
    requests++
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ ok: true, releaseId: 'other' }))
  })
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise((resolve) => other.close(resolve)))
  const otherAddress = `http://127.0.0.1:${other.address().port}`
  const api = await startApi()
  cleanup.push(api.stop)
  expect(api.address).not.toBe(otherAddress)
  expect(requests).toBe(0)
  const script = await fixture(
    `process.send({ address: ${JSON.stringify(otherAddress)} }); setInterval(() => {}, 1000)`,
  )
  await expect(startApi({ script })).rejects.toThrow('другой процесс')
  expect(requests).toBe(1)
})

it('ошибка spawn и ранний exit завершают ожидание с ошибкой', async () => {
  await expect(startApi({ executable: '/nonexistent-throne-node' })).rejects.toThrow()
  const script = await fixture('process.exit(23)')
  await expect(startApi({ script })).rejects.toThrow('23')
})

it('тайм-аут убирает зависший старт', async () => {
  const script = await fixture('setInterval(() => {}, 1000)')
  await expect(startApi({ script, timeout: 100 })).rejects.toThrow('Истекло ожидание')
})

it('проверка выкладки принимает готовый релиз и отклоняет другой идентификатор', async () => {
  const api = await startApi()
  cleanup.push(api.stop)
  const { releaseId } = await (await fetch(`${api.address}/api/ready`)).json()
  const script = fileURLToPath(new URL('../../../deploy/server/check-ready.mjs', import.meta.url))
  await expect(exec(process.execPath, [script, api.address, releaseId])).resolves.toMatchObject({
    stderr: '',
  })
  await expect(exec(process.execPath, [script, api.address, 'old-release'])).rejects.toThrow()
})
