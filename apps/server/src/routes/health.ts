import { HEALTH_PATH, HealthResponseSchema } from '@throne/contracts'
import type { HealthResponse } from '@throne/contracts'
import type { FastifyInstance } from 'fastify'

/**
 * GET /api/health — «сервер жив». По нему автодеплой и человек с curl
 * проверяют, что API поднялось. Ничего не читает и ничего не меняет.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    HEALTH_PATH,
    // Схема ответа из договора: Fastify отправит только описанные в ней поля
    { schema: { response: { 200: HealthResponseSchema } } },
    async (): Promise<HealthResponse> => ({ ok: true }),
  )
}
