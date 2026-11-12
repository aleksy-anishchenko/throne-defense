// Договор API: адреса, схемы и типы запросов и ответов.
// Общий для сайта (apps/web) и сервера (apps/server) — они друг друга не импортируют.
export { HEALTH_PATH, HealthResponseSchema } from './health.ts'
export type { HealthResponse } from './health.ts'
export {
  LEADERBOARD_PATH,
  LEADERBOARD_SIZE,
  LeaderboardEntrySchema,
  LeaderboardQuerySchema,
  LeaderboardResponseSchema,
} from './leaderboard.ts'
export type { LeaderboardEntry, LeaderboardQuery, LeaderboardResponse } from './leaderboard.ts'
export {
  PLAYER_NAME_MAX_LENGTH,
  countCharacters,
  isValidPlayerName,
  normalizePlayerName,
} from './player-name.ts'
export { ID_PATTERN, RUNS_PATH, SubmitRunRequestSchema, SubmitRunResponseSchema } from './runs.ts'
export type { SubmitRunRequest, SubmitRunResponse } from './runs.ts'
