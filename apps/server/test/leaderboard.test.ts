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
import { insertRun } from '../src/services/leaderboard.ts'

const LEVEL_ID = 'throne-hall'

/** Второй зал — для проверок общего топа по всем залам */
const OTHER_LEVEL_ID = LEVELS.find((def) => def.id !== LEVEL_ID)!.id

function run(
  playerName: string,
  score: number,
  wavesCleared = 10,
  levelId = LEVEL_ID,
): SubmitRunRequest {
  return { playerName, levelId, score, wavesCleared, balanceVersion: BALANCE_VERSION }
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
  /** Таблица одного зала (все версии баланса) */
  const leaderboard = async () =>
    (
      await app.inject({ method: 'GET', url: `${LEADERBOARD_PATH}?level=${LEVEL_ID}` })
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
      { rank: 1, playerName: 'Василиса', score: 9000, wavesCleared: 10, levelId: LEVEL_ID },
      { rank: 2, playerName: 'Иван', score: 7000, wavesCleared: 10, levelId: LEVEL_ID },
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

  it('без level — общий топ по всем залам, у строки — зал рекорда', async () => {
    await submit(run('Василиса', 5000))
    // Место — сразу в общем топе: Иван второй, хоть в своём зале он один
    expect((await submit(run('Иван', 3000, 10, OTHER_LEVEL_ID))).json()).toEqual({
      rank: 2,
      playerCount: 2,
    })
    // Лучший результат Василисы — в другом зале: зал в строке — тот, где рекорд
    await submit(run('Василиса', 8000, 10, OTHER_LEVEL_ID))
    const common = (
      await app.inject({ method: 'GET', url: LEADERBOARD_PATH })
    ).json<LeaderboardResponse>()
    expect(common.entries.map((entry) => [entry.playerName, entry.score, entry.levelId])).toEqual([
      ['Василиса', 8000, OTHER_LEVEL_ID],
      ['Иван', 3000, OTHER_LEVEL_ID],
    ])
    // С level — только этот зал
    expect((await leaderboard()).entries.map((entry) => entry.score)).toEqual([5000])
  })

  it('рекорды прошлых версий баланса остаются в общем топе; ?balance= отбирает одну версию', async () => {
    // Прислать результат старой версии нельзя (422 ниже) — такие партии остались с тех пор,
    // когда эта версия была текущей. Кладём прямо в базу
    insertRun(app.db, { ...run('Старожил', 9000), balanceVersion: BALANCE_VERSION - 1 })
    // Место нового игрока — в общей таблице вместе со старыми рекордами
    expect((await submit(run('Василиса', 5000))).json()).toEqual({ rank: 2, playerCount: 2 })

    const all = (
      await app.inject({ method: 'GET', url: LEADERBOARD_PATH })
    ).json<LeaderboardResponse>()
    expect(all.entries.map((entry) => entry.playerName)).toEqual(['Старожил', 'Василиса'])

    const current = (
      await app.inject({ method: 'GET', url: `${LEADERBOARD_PATH}?balance=${BALANCE_VERSION}` })
    ).json<LeaderboardResponse>()
    expect(current.entries.map((entry) => entry.playerName)).toEqual(['Василиса'])
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
    for (const query of ['balance=0', 'balance=шесть', 'level=DROP%20TABLE']) {
      const response = await app.inject({ method: 'GET', url: `${LEADERBOARD_PATH}?${query}` })
      expect(response.statusCode, query).toBe(400)
    }
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
