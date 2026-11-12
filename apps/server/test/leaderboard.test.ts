import {
  LEADERBOARD_PATH,
  LEADERBOARD_SIZE,
  RUNS_PATH,
  type LeaderboardResponse,
  type SubmitRunRequest,
} from '@throne/contracts'
import { BALANCE_VERSION, LEVELS, createLevel, maxPossibleScore } from '@throne/game'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.ts'
import { IN_MEMORY_DATABASE } from '../src/db/database.ts'

const LEVEL_ID = 'throne-hall'

function run(playerName: string, score: number, wavesCleared = 10): SubmitRunRequest {
  return { playerName, levelId: LEVEL_ID, score, wavesCleared, balanceVersion: BALANCE_VERSION }
}

describe('общий топ', () => {
  let app: FastifyInstance
  // У каждого теста своя пустая база в памяти и свои счётчики частоты
  beforeEach(() => {
    app = buildApp({ databasePath: IN_MEMORY_DATABASE })
  })
  afterEach(async () => {
    await app.close()
  })

  // Разные адреса игроков: иначе упрёмся в ограничение «10 результатов в минуту с адреса»
  let playerIp = 0
  const submit = (body: unknown) =>
    app.inject({
      method: 'POST',
      url: RUNS_PATH,
      payload: body as object,
      headers: { 'x-forwarded-for': `203.0.113.${++playerIp % 250}` },
    })
  const leaderboard = async (balance = BALANCE_VERSION) =>
    (
      await app.inject({
        method: 'GET',
        url: `${LEADERBOARD_PATH}?level=${LEVEL_ID}&balance=${balance}`,
      })
    ).json<LeaderboardResponse>()

  it('первый результат — первое место из одного', async () => {
    const response = await submit(run('Василиса', 5000))
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ rank: 1, playerCount: 1 })
  })

  it('место считается по лучшему результату имени, одно имя — одна строка', async () => {
    await submit(run('Василиса', 5000))
    await submit(run('Иван', 7000))
    expect((await submit(run('Василиса', 3000))).json()).toEqual({ rank: 2, playerCount: 2 })
    expect((await submit(run('Василиса', 9000))).json()).toEqual({ rank: 1, playerCount: 2 })

    const table = await leaderboard()
    expect(table.playerCount).toBe(2)
    expect(table.entries).toEqual([
      { rank: 1, playerName: 'Василиса', score: 9000, wavesCleared: 10 },
      { rank: 2, playerName: 'Иван', score: 7000, wavesCleared: 10 },
    ])
  })

  it('равный счёт — одно место, выше тот, кто набрал раньше', async () => {
    await submit(run('Первый', 5000))
    await submit(run('Второй', 5000))
    await submit(run('Третий', 4000))
    const table = await leaderboard()
    expect(table.entries.map((entry) => [entry.rank, entry.playerName])).toEqual([
      [1, 'Первый'],
      [1, 'Второй'],
      [3, 'Третий'],
    ])
  })

  it(`в таблице не больше ${LEADERBOARD_SIZE} строк, лучшие сверху`, async () => {
    for (let i = 1; i <= LEADERBOARD_SIZE + 3; i++) await submit(run(`Игрок ${i}`, i * 100))
    const table = await leaderboard()
    expect(table.playerCount).toBe(LEADERBOARD_SIZE + 3)
    expect(table.entries).toHaveLength(LEADERBOARD_SIZE)
    expect(table.entries[0].playerName).toBe(`Игрок ${LEADERBOARD_SIZE + 3}`)
  })

  it('версии баланса не смешиваются', async () => {
    await submit(run('Василиса', 5000))
    expect((await leaderboard(BALANCE_VERSION + 1)).entries).toEqual([])
  })

  it('400 на мусор: не те поля и типы', async () => {
    for (const body of [
      {},
      { ...run('Вася', 100), score: 'много' },
      { ...run('Вася', 100), score: -5 },
      { ...run('Вася', 100), levelId: 'DROP TABLE runs' },
      { ...run('Вася', 100), playerName: 'Я'.repeat(21) },
    ]) {
      expect((await submit(body)).statusCode, JSON.stringify(body)).toBe(400)
    }
  })

  it('422 на неправдоподобное — в таблицу не попадает', async () => {
    const level = createLevel(LEVELS.find((def) => def.id === LEVEL_ID)!)
    const tooMuch = maxPossibleScore(level, 3) + 1
    for (const body of [
      run('Читер', tooMuch, 3),
      run('Читер', 100, 10_000),
      run(' Вася', 100),
      // Имя, пустое на вид (корейский «заполнитель»), и партия без очков
      run('\u3164', 100),
      run('Вася', 0, 0),
      { ...run('Вася', 100), levelId: 'no-such-level' },
      { ...run('Вася', 100), balanceVersion: BALANCE_VERSION - 1 },
    ]) {
      const response = await submit(body)
      expect(response.statusCode, JSON.stringify(body)).toBe(422)
      expect(response.json().message).toBeTruthy()
    }
    expect((await leaderboard()).playerCount).toBe(0)
  })

  it('400 на неправильный запрос таблицы', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${LEADERBOARD_PATH}?level=${LEVEL_ID}`,
    })
    expect(response.statusCode).toBe(400)
  })

  it('больше 10 результатов в минуту с одного адреса — 429', async () => {
    const fromOnePlayer = () =>
      app.inject({
        method: 'POST',
        url: RUNS_PATH,
        payload: run('Вася', 100),
        headers: { 'x-forwarded-for': '198.51.100.1' },
      })
    for (let i = 0; i < 10; i++) expect((await fromOnePlayer()).statusCode).toBe(200)
    expect((await fromOnePlayer()).statusCode).toBe(429)
  })
})
