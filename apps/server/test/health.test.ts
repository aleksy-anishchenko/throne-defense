import { HEALTH_PATH } from '@throne/contracts'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp, RATE_LIMIT_PER_MINUTE } from '../src/app.ts'
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

describe('ограничение частоты запросов', () => {
  it(`после ${RATE_LIMIT_PER_MINUTE} запросов в минуту с одного адреса — 429, другим адресам можно`, async () => {
    const app = buildApp({ databasePath: IN_MEMORY_DATABASE })
    // Как за nginx: запрос приходит с 127.0.0.1, адрес игрока — в X-Forwarded-For
    const fromPlayer = (ip: string) =>
      app.inject({ method: 'GET', url: HEALTH_PATH, headers: { 'x-forwarded-for': ip } })

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      expect((await fromPlayer('203.0.113.1')).statusCode).toBe(200)
    }
    const limited = await fromPlayer('203.0.113.1')
    expect(limited.statusCode).toBe(429)
    expect(limited.json().message).toMatch(/Слишком много запросов/)

    expect((await fromPlayer('203.0.113.2')).statusCode).toBe(200)
    // Подделка не помогает: игрок пишет в заголовок чужой адрес, nginx дописывает настоящий в конец
    expect((await fromPlayer('198.51.100.7, 203.0.113.1')).statusCode).toBe(429)
    await app.close()
  })
})
