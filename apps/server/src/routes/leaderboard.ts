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
import { playerIdFromAuthorization } from '../services/players.ts'

/**
 * GET /api/leaderboard — общий топ: все залы и все версии баланса. Так спрашивает игра.
 * ?level=throne-hall — только один зал, ?balance=6 — только одна версия правил
 */
export async function leaderboardRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LeaderboardQuery }>(
    LEADERBOARD_PATH,
    // balance приходит строкой («4»): Fastify сам превратит её в число по схеме
    {
      schema: { querystring: LeaderboardQuerySchema, response: { 200: LeaderboardResponseSchema } },
    },
    async (request, reply): Promise<LeaderboardResponse> => {
      const scope = {
        levelId: request.query.level ?? null,
        balanceVersion: request.query.balance ?? null,
      }
      reply.header('Cache-Control', 'no-store')
      return {
        entries: topPlayers(app.db, scope, LEADERBOARD_SIZE),
        playerCount: countPlayers(app.db, scope),
        viewerPlayerId: playerIdFromAuthorization(request.headers.authorization),
      }
    },
  )
}
