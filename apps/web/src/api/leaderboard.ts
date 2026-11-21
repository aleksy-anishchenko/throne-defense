// Запросы к API общего топа. Адреса и типы — из договора @throne/contracts, общего с сервером.
//
// Сеть ненадёжна: нет интернета, сервер перезапускается, API упало. Игра от этого
// не ломается — функции не бросают ошибок. Отказ в результате отличаем от сбоя сети.

import {
  isValidPlayerName,
  LEADERBOARD_PATH,
  PLAYER_PROFILE_PATH,
  RUNS_PATH,
  type LeaderboardQuery,
  type LeaderboardResponse,
  type PlayerProfile,
  type SubmitRunRequest,
  type SubmitRunResponse,
  type SubmitRunRejection,
} from '@throne/contracts'
import { browserPlayerToken } from '../utils/playerIdentity'

/** Дольше не ждём: игрок смотрит на экран итогов, «вечная загрузка» хуже, чем «недоступно» */
const REQUEST_TIMEOUT_MS = 5000

type RequestResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      code: SubmitRunRejection['code'] | 'unavailable'
      message: string
    }

const unavailable = {
  ok: false,
  code: 'unavailable',
  message: 'Таблица лучших сейчас недоступна.',
} as const

function isObject(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null
}

function isPlayerProfile(body: unknown): body is PlayerProfile {
  if (!isObject(body)) return false
  const { playerName } = body
  return typeof playerName === 'string' && isValidPlayerName(playerName)
}

function isIntegerAtLeast(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min
}

function isSubmitRunResponse(body: unknown): body is SubmitRunResponse {
  return (
    isPlayerProfile(body) &&
    'rank' in body &&
    isIntegerAtLeast(body.rank, 1) &&
    'playerCount' in body &&
    isIntegerAtLeast(body.playerCount, body.rank)
  )
}

function isLeaderboardResponse(body: unknown): body is LeaderboardResponse {
  if (!isObject(body)) return false
  const { entries, playerCount, viewerPlayerId } = body
  return (
    Array.isArray(entries) &&
    isIntegerAtLeast(playerCount, entries.length) &&
    (viewerPlayerId === undefined || typeof viewerPlayerId === 'string') &&
    entries.every((entry: unknown) => {
      if (!isObject(entry)) return false
      const { rank, playerId, playerName, score, wavesCleared, levelId } = entry
      return (
        isIntegerAtLeast(rank, 1) &&
        (playerId === undefined || typeof playerId === 'string') &&
        typeof playerName === 'string' &&
        isIntegerAtLeast(score, 0) &&
        isIntegerAtLeast(wavesCleared, 0) &&
        typeof levelId === 'string'
      )
    })
  )
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  validate: (body: unknown) => body is T,
): Promise<RequestResult<T>> {
  try {
    // AbortController, а не AbortSignal.timeout(): того нет в Safari до 16-й версии,
    // и на старом iPhone топ молча не работал бы никогда
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(path, { ...init, signal: controller.signal })
      if (!response.ok) {
        if (response.status === 503) {
          return {
            ...unavailable,
            message:
              'Сервер временно недоступен или обновляется. Попробуйте отправить результат позже.',
          }
        }
        if ([401, 404, 422].includes(response.status)) {
          const body: unknown = await response.json()
          if (isObject(body)) {
            const { code, message } = body
            if (
              typeof message === 'string' &&
              (code === 'outdated-balance' ||
                code === 'invalid-run' ||
                code === 'profile-required' ||
                code === 'invalid-name')
            ) {
              return { ok: false, code, message }
            }
          }
          if (response.status === 422)
            return { ok: false, code: 'invalid-run', message: 'Сервер не принял этот результат.' }
        }
        if (response.status === 400)
          return { ok: false, code: 'invalid-run', message: 'Сервер не принял этот результат.' }
        if (response.status === 429)
          return { ...unavailable, message: 'Слишком много отправок. Попробуйте через минуту.' }
        return unavailable
      }
      const body: unknown = await response.json()
      return validate(body) ? { ok: true, data: body } : unavailable
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    return unavailable
  }
}

async function writeWithProfile<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: PlayerProfile,
  validate: (response: unknown) => response is T,
): Promise<RequestResult<T>> {
  const token = await browserPlayerToken()
  if (!token) {
    return {
      ...unavailable,
      message: 'Для сохранения рекорда разрешите сайту хранить данные в браузере.',
    }
  }
  return requestJson(
    path,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    validate,
  )
}

/** Отправить результат партии. Ответ — место игрока в таблице */
export function submitRun(run: SubmitRunRequest): Promise<RequestResult<SubmitRunResponse>> {
  return writeWithProfile(RUNS_PATH, 'POST', run, isSubmitRunResponse)
}

export function updatePlayerName(playerName: string): Promise<RequestResult<PlayerProfile>> {
  return writeWithProfile(PLAYER_PROFILE_PATH, 'PATCH', { playerName }, isPlayerProfile)
}

export async function fetchLeaderboard(
  query: LeaderboardQuery,
): Promise<LeaderboardResponse | null> {
  // Без level — все залы, без balance — все версии баланса
  const search = new URLSearchParams()
  if (query.level) search.set('level', query.level)
  if (query.balance) search.set('balance', String(query.balance))
  const queryString = search.toString()
  const token = await browserPlayerToken()
  const result = await requestJson(
    queryString ? `${LEADERBOARD_PATH}?${queryString}` : LEADERBOARD_PATH,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    isLeaderboardResponse,
  )
  return result.ok ? result.data : null
}
