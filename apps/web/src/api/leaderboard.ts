// Запросы к API общего топа. Адреса и типы — из договора @throne/contracts, общего с сервером.
//
// Сеть ненадёжна: нет интернета, сервер перезапускается, API упало. Игра от этого
// не ломается — функции не бросают ошибок. Отказ в результате отличаем от сбоя сети.

import {
  LEADERBOARD_PATH,
  RUNS_PATH,
  type LeaderboardQuery,
  type LeaderboardResponse,
  type SubmitRunRequest,
  type SubmitRunResponse,
  type SubmitRunRejection,
} from '@throne/contracts'

/** Дольше не ждём: игрок смотрит на экран итогов, «вечная загрузка» хуже, чем «недоступно» */
const REQUEST_TIMEOUT_MS = 5000

type RequestResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      code: SubmitRunRejection['code'] | 'unavailable'
      message: string
    }

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<RequestResult<T>> {
  const unavailable = {
    ok: false,
    code: 'unavailable',
    message: 'Таблица лучших сейчас недоступна.',
  } as const
  try {
    // AbortController, а не AbortSignal.timeout(): того нет в Safari до 16-й версии,
    // и на старом iPhone топ молча не работал бы никогда
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(path, { ...init, signal: controller.signal })
      if (!response.ok) {
        if (response.status === 422) {
          const body: unknown = await response.json()
          if (
            typeof body === 'object' &&
            body !== null &&
            'code' in body &&
            'message' in body &&
            typeof body.message === 'string' &&
            (body.code === 'outdated-balance' || body.code === 'invalid-run')
          ) {
            return { ok: false, code: body.code, message: body.message }
          }
          return { ok: false, code: 'invalid-run', message: 'Сервер не принял этот результат.' }
        }
        if (response.status === 400)
          return { ok: false, code: 'invalid-run', message: 'Сервер не принял этот результат.' }
        if (response.status === 429)
          return { ...unavailable, message: 'Слишком много отправок. Попробуйте через минуту.' }
        return unavailable
      }
      return { ok: true, data: (await response.json()) as T }
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    return unavailable
  }
}

/** Отправить результат партии. Ответ — место игрока в таблице */
export function submitRun(run: SubmitRunRequest): Promise<RequestResult<SubmitRunResponse>> {
  return requestJson<SubmitRunResponse>(RUNS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  })
}

export async function fetchLeaderboard(
  query: LeaderboardQuery,
): Promise<LeaderboardResponse | null> {
  // Без level — все залы, без balance — все версии баланса
  const search = new URLSearchParams()
  if (query.level) search.set('level', query.level)
  if (query.balance) search.set('balance', String(query.balance))
  const queryString = search.toString()
  const result = await requestJson<LeaderboardResponse>(
    queryString ? `${LEADERBOARD_PATH}?${queryString}` : LEADERBOARD_PATH,
  )
  return result.ok ? result.data : null
}
