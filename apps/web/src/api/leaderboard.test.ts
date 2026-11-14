import { afterEach, describe, expect, it, vi } from 'vitest'
import { BALANCE_VERSION } from '@throne/game'
import { fetchLeaderboard, submitRun } from './leaderboard'

const run = {
  playerName: 'Страж',
  levelId: 'throne-hall',
  score: 100,
  wavesCleared: 0,
  balanceVersion: BALANCE_VERSION,
}
afterEach(() => vi.unstubAllGlobals())

describe('ответы рейтинга', () => {
  it('возвращает место при успешной отправке', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ rank: 2, playerCount: 3 })))
    expect(await submitRun(run)).toEqual({ ok: true, data: { rank: 2, playerCount: 3 } })
  })
  it('отличает устаревший баланс и сохраняет объяснение сервера', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'outdated-balance', message: 'Обновите страницу' },
            { status: 422 },
          ),
        ),
    )
    expect(await submitRun(run)).toEqual({
      ok: false,
      code: 'outdated-balance',
      message: 'Обновите страницу',
    })
  })
  it('не предлагает повторять отклонённый результат', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'invalid-run', message: 'Столько очков не бывает' },
            { status: 422 },
          ),
        ),
    )
    expect(await submitRun(run)).toMatchObject({ ok: false, code: 'invalid-run' })
  })
  it('сбой сети остаётся временной ошибкой, а чтение таблицы возвращает null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await submitRun(run)).toMatchObject({ ok: false, code: 'unavailable' })
    expect(await fetchLeaderboard({})).toBeNull()
  })
  it('ограничение частоты объясняет, когда можно повторить', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    expect(await submitRun(run)).toMatchObject({
      ok: false,
      code: 'unavailable',
      message: expect.stringContaining('через минуту'),
    })
  })
})
