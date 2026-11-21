import {
  RUNS_PATH,
  SubmitRunRequestSchema,
  SubmitRunResponseSchema,
  SubmitRunRejectionSchema,
  type SubmitRunRequest,
  type SubmitRunResponse,
} from '@throne/contracts'
import type { FastifyInstance } from 'fastify'
import { insertRun, playerPlace } from '../services/leaderboard.ts'
import { runRejection } from '../services/plausibility.ts'
import { playerIdFromAuthorization, PROFILE_REQUIRED } from '../services/players.ts'

/**
 * Строже общего ограничения: игра шлёт один результат за партию, а партия идёт минуты.
 * 10 в минуту хватит с запасом даже на «сыграть ещё раз» сразу после поражения
 */
const RUNS_PER_MINUTE = 10
/** Запрос — пять коротких полей. Больше килобайта — это не игра */
const BODY_LIMIT_BYTES = 1024

/** POST /api/runs — принять результат партии и сказать, какое теперь место у игрока */
export async function runsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SubmitRunRequest }>(
    RUNS_PATH,
    {
      // Тело запроса Fastify проверит по схеме сам: не то — ответит 400, не дойдя до кода ниже
      schema: {
        body: SubmitRunRequestSchema,
        response: {
          200: SubmitRunResponseSchema,
          401: SubmitRunRejectionSchema,
          422: SubmitRunRejectionSchema,
          503: SubmitRunRejectionSchema,
        },
      },
      bodyLimit: BODY_LIMIT_BYTES,
      config: { rateLimit: { max: RUNS_PER_MINUTE, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const run = request.body
      const rejection = runRejection(run)
      if (rejection !== null) {
        // В журнал — чтобы видеть попытки подделки; в базу такое не попадает
        request.log.warn({ run, rejection }, 'результат отклонён')
        if (rejection.code === 'server-updating') {
          return reply.header('Retry-After', '30').code(503).send(rejection)
        }
        return reply.code(422).send(rejection)
      }

      const playerId = playerIdFromAuthorization(request.headers.authorization)
      if (!playerId) {
        return reply.header('WWW-Authenticate', 'Bearer').code(401).send(PROFILE_REQUIRED)
      }
      const playerName = insertRun(app.db, run, playerId)
      // Место — в общем топе (все залы, все версии баланса): его и показывает игра
      const place = playerPlace(app.db, { levelId: null, balanceVersion: null }, playerId)
      // Только что записали — место есть всегда; проверка — для TypeScript
      if (place === null) throw new Error('Результат записан, но не найден')
      return { ...place, playerName } satisfies SubmitRunResponse
    },
  )
}
