// Договор API: адреса, схемы и типы запросов и ответов.
// Общий для сайта (apps/web) и сервера (apps/server) — они друг друга не импортируют.
//
// ⚠️ Схемы (…Schema) — это TypeBox, он нужен только серверу. Сайт берёт отсюда адреса,
// типы и правила имени; файлы со схемами сборщик сайта выбрасывает ("sideEffects": false).
// Новое для сайта клади в файлы без TypeBox (paths.ts, player-name.ts)
export { HEALTH_PATH, ID_PATTERN, LEADERBOARD_PATH, LEADERBOARD_SIZE, RUNS_PATH } from './paths.ts'
export {
  PLAYER_NAME_MAX_LENGTH,
  countCharacters,
  isValidPlayerName,
  normalizePlayerName,
} from './player-name.ts'
export { HealthResponseSchema } from './health.ts'
export type { HealthResponse } from './health.ts'
export {
  LeaderboardEntrySchema,
  LeaderboardQuerySchema,
  LeaderboardResponseSchema,
} from './leaderboard.ts'
export type { LeaderboardEntry, LeaderboardQuery, LeaderboardResponse } from './leaderboard.ts'
export { SubmitRunRequestSchema, SubmitRunResponseSchema } from './runs.ts'
export type { SubmitRunRequest, SubmitRunResponse } from './runs.ts'
