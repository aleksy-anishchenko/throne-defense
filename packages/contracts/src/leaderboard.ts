import Type from 'typebox'
import type { Static } from 'typebox'
import { ID_PATTERN } from './paths.ts'

/** Запрос GET /api/leaderboard */
export const LeaderboardQuerySchema = Type.Object(
  {
    level: Type.String({ pattern: ID_PATTERN }),
    // Рекорды разных версий баланса не смешиваются: v3 и v4 — разные игры
    balance: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
)
export type LeaderboardQuery = Static<typeof LeaderboardQuerySchema>

/** Строка таблицы: одно имя — одна строка, с его лучшим результатом */
export const LeaderboardEntrySchema = Type.Object({
  rank: Type.Integer({ minimum: 1 }),
  playerName: Type.String(),
  score: Type.Integer({ minimum: 0 }),
  wavesCleared: Type.Integer({ minimum: 0 }),
})
export type LeaderboardEntry = Static<typeof LeaderboardEntrySchema>

export const LeaderboardResponseSchema = Type.Object({
  /** Не больше LEADERBOARD_SIZE, лучшие сверху */
  entries: Type.Array(LeaderboardEntrySchema),
  /** Сколько всего разных имён в таблице */
  playerCount: Type.Integer({ minimum: 0 }),
})
export type LeaderboardResponse = Static<typeof LeaderboardResponseSchema>
