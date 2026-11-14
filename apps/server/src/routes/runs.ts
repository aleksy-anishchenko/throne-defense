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
        response: { 200: SubmitRunResponseSchema, 422: SubmitRunRejectionSchema },
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
        return reply.code(422).send(rejection)
      }

      insertRun(app.db, run)
      // Место — в общем топе (все залы, все версии баланса): его и показывает игра
      const place = playerPlace(app.db, { levelId: null, balanceVersion: null }, run.playerName)
      // Только что записали — место есть всегда; проверка — для TypeScript
      if (place === null) throw new Error('Результат записан, но не найден')
      return place satisfies SubmitRunResponse
    },
  )
}
