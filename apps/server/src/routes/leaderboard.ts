import {
  LEADERBOARD_PATH,
  LEADERBOARD_SIZE,
  LeaderboardQuerySchema,
  LeaderboardResponseSchema,
  type LeaderboardQuery,
  type LeaderboardResponse,
} from '@throne/contracts'
import type { FastifyInstance } from 'fastify'
import { countPlayers, topPlayers } from '../services/leaderboard.ts'

/**
 * GET /api/leaderboard?balance=6 — общий топ по всем залам; ?level=throne-hall&balance=6 —
 * только один зал. Версии баланса не смешиваются
 */
export async function leaderboardRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LeaderboardQuery }>(
    LEADERBOARD_PATH,
    // balance приходит строкой («4»): Fastify сам превратит её в число по схеме
    {
      schema: { querystring: LeaderboardQuerySchema, response: { 200: LeaderboardResponseSchema } },
    },
    async (request): Promise<LeaderboardResponse> => {
      const scope = { levelId: request.query.level ?? null, balanceVersion: request.query.balance }
      return {
        entries: topPlayers(app.db, scope, LEADERBOARD_SIZE),
        playerCount: countPlayers(app.db, scope),
      }
    },
  )
}
