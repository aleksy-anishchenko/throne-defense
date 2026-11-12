import Type from 'typebox'
import type { Static } from 'typebox'
import { ID_PATTERN } from './paths.ts'
import { PLAYER_NAME_MAX_LENGTH } from './player-name.ts'

/** Тело POST /api/runs */
export const SubmitRunRequestSchema = Type.Object(
  {
    // Длина в схеме — грубая проверка; точная (символы, а не байты, без невидимых) —
    // isValidPlayerName на сервере
    playerName: Type.String({ minLength: 1, maxLength: PLAYER_NAME_MAX_LENGTH }),
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
  /** Сколько разных имён в таблице этого уровня и версии баланса */
  playerCount: Type.Integer({ minimum: 1 }),
})
export type SubmitRunResponse = Static<typeof SubmitRunResponseSchema>
