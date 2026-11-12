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
    const response = await fetch(path, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!response.ok) return null
    return (await response.json()) as T
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
  const search = new URLSearchParams({ level: query.level, balance: String(query.balance) })
  return requestJson<LeaderboardResponse>(`${LEADERBOARD_PATH}?${search}`)
}
