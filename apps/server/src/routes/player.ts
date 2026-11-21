import {
  isValidPlayerName,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_PROFILE_PATH,
  PlayerProfileSchema,
  SubmitRunRejectionSchema,
  type PlayerProfile,
} from '@throne/contracts'
import type { FastifyInstance } from 'fastify'
import { playerIdFromAuthorization, PROFILE_REQUIRED, renamePlayer } from '../services/players.ts'

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.patch<{ Body: PlayerProfile }>(
    PLAYER_PROFILE_PATH,
    {
      schema: {
        body: PlayerProfileSchema,
        response: {
          200: PlayerProfileSchema,
          401: SubmitRunRejectionSchema,
          404: SubmitRunRejectionSchema,
          422: SubmitRunRejectionSchema,
        },
      },
      bodyLimit: 1024,
    },
    async (request, reply) => {
      const playerId = playerIdFromAuthorization(request.headers.authorization)
      if (!playerId) {
        return reply.header('WWW-Authenticate', 'Bearer').code(401).send(PROFILE_REQUIRED)
      }
      const { playerName } = request.body
      if (!isValidPlayerName(playerName)) {
        return reply.code(422).send({
          code: 'invalid-name',
          message: `Имя должно содержать от 1 до ${PLAYER_NAME_MAX_LENGTH} видимых символов.`,
        })
      }
      if (!renamePlayer(app.db, playerId, playerName)) return reply.code(404).send(PROFILE_REQUIRED)
      return { playerName } satisfies PlayerProfile
    },
  )
}
