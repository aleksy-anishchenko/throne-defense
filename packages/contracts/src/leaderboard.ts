import Type from 'typebox'
import type { Static } from 'typebox'
import { ID_PATTERN } from './paths.ts'

/** Запрос GET /api/leaderboard */
export const LeaderboardQuerySchema = Type.Object(
  {
    // Нет — общий топ по всем залам (их несколько, карта на партию выпадает случайно)
    level: Type.Optional(Type.String({ pattern: ID_PATTERN })),
    // Нет — все версии баланса вместе: рекорды не пропадают, когда меняются правила.
    // С balance — только эта версия (так спрашивали прежние версии игры)
    balance: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
)
export type LeaderboardQuery = Static<typeof LeaderboardQuerySchema>

/** Лучший результат игрока. У старых записей с одним именем общий результат. */
export const LeaderboardEntrySchema = Type.Object({
  rank: Type.Integer({ minimum: 1 }),
  /** Публичный идентификатор профиля. Старые записи содержат только имя. */
  playerId: Type.Optional(Type.String()),
  playerName: Type.String(),
  score: Type.Integer({ minimum: 0 }),
  wavesCleared: Type.Integer({ minimum: 0 }),
  /** В каком зале сыграна эта (лучшая) партия */
  levelId: Type.String(),
})
export type LeaderboardEntry = Static<typeof LeaderboardEntrySchema>

export const LeaderboardResponseSchema = Type.Object({
  /** Не больше LEADERBOARD_SIZE, лучшие сверху */
  entries: Type.Array(LeaderboardEntrySchema),
  /** Сколько всего игроков в таблице */
  playerCount: Type.Integer({ minimum: 0 }),
  viewerPlayerId: Type.Optional(Type.String()),
})
export type LeaderboardResponse = Static<typeof LeaderboardResponseSchema>
