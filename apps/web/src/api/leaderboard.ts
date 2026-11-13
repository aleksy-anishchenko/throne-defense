// Запросы к API общего топа. Адреса и типы — из договора @throne/contracts, общего с сервером.
//
// Сеть ненадёжна: нет интернета, сервер перезапускается, API упало. Игра от этого
// не ломается — функции не бросают ошибок, а возвращают null («топа сейчас нет»).

import {
  LEADERBOARD_PATH,
  RUNS_PATH,
  type LeaderboardQuery,
  type LeaderboardResponse,
  type SubmitRunRequest,
  type SubmitRunResponse,
} from '@throne/contracts'

/** Дольше не ждём: игрок смотрит на экран итогов, «вечная загрузка» хуже, чем «недоступно» */
const REQUEST_TIMEOUT_MS = 5000

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  try {
    // AbortController, а не AbortSignal.timeout(): того нет в Safari до 16-й версии,
    // и на старом iPhone топ молча не работал бы никогда
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(path, { ...init, signal: controller.signal })
      if (!response.ok) return null
      return (await response.json()) as T
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    return null
  }
}

/** Отправить результат партии. Ответ — место игрока в таблице */
export function submitRun(run: SubmitRunRequest): Promise<SubmitRunResponse | null> {
  return requestJson<SubmitRunResponse>(RUNS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  })
}

export function fetchLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResponse | null> {
  // Без level — общий топ по всем залам
  const search = new URLSearchParams({ balance: String(query.balance) })
  if (query.level) search.set('level', query.level)
  return requestJson<LeaderboardResponse>(`${LEADERBOARD_PATH}?${search}`)
}
