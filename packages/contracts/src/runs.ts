import Type from 'typebox'
import type { Static } from 'typebox'
import { ID_PATTERN } from './paths.ts'
import { PlayerNameSchema } from './player-profile.ts'

/** Тело POST /api/runs */
export const SubmitRunRequestSchema = Type.Object(
  {
    // Длина в схеме — грубая проверка; точная (символы, а не байты, без невидимых) —
    // isValidPlayerName на сервере
    playerName: PlayerNameSchema,
    levelId: Type.String({ pattern: ID_PATTERN }),
    score: Type.Integer({ minimum: 0 }),
    /** Сколько волн отбито — как поле wave в рекорде браузера */
    wavesCleared: Type.Integer({ minimum: 0 }),
    /** BALANCE_VERSION игры, в которую играли */
    balanceVersion: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
)
export type SubmitRunRequest = Static<typeof SubmitRunRequestSchema>

/** Место игрока в таблице после этой партии — по его лучшему результату */
export const SubmitRunResponseSchema = Type.Object({
  /** 1 — первое место. У равных счетов одно место */
  rank: Type.Integer({ minimum: 1 }),
  /** Сколько игроков в общем топе (все залы и версии баланса) */
  playerCount: Type.Integer({ minimum: 1 }),
  playerName: PlayerNameSchema,
})
export type SubmitRunResponse = Static<typeof SubmitRunResponseSchema>

/** Отказ принять результат или обновить профиль */
export const SubmitRunRejectionSchema = Type.Object({
  code: Type.Union([
    Type.Literal('outdated-balance'),
    Type.Literal('invalid-run'),
    Type.Literal('server-updating'),
    Type.Literal('profile-required'),
    Type.Literal('invalid-name'),
  ]),
  message: Type.String(),
})
export type SubmitRunRejection = Static<typeof SubmitRunRejectionSchema>
