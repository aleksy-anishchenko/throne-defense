import { HEALTH_PATH } from '@throne/contracts'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.ts'
import { IN_MEMORY_DATABASE } from '../src/db/database.ts'
import { loadConfig } from '../src/config.ts'

describe('GET /api/health', () => {
  const app = buildApp({ databasePath: IN_MEMORY_DATABASE })
  afterAll(async () => {
    await app.close()
  })

  it('отвечает { ok: true }', async () => {
    // inject() вызывает маршрут напрямую, без порта и сети
    const response = await app.inject({ method: 'GET', url: HEALTH_PATH })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('на неизвестный адрес отвечает 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nope' })
    expect(response.statusCode).toBe(404)
  })
})

describe('loadConfig', () => {
  it('без .env берёт значения по умолчанию', () => {
    expect(loadConfig({})).toEqual({ port: 3000, databasePath: './data/throne.db' })
  })

  it('читает PORT и DATABASE_PATH', () => {
    expect(loadConfig({ PORT: '4000', DATABASE_PATH: '/srv/data/throne.db' })).toEqual({
      port: 4000,
      databasePath: '/srv/data/throne.db',
    })
  })

  it('не пускает неправильный порт', () => {
    for (const port of ['abc', '0', '70000', '30.5']) {
      expect(() => loadConfig({ PORT: port })).toThrow(/PORT/)
    }
  })
})
