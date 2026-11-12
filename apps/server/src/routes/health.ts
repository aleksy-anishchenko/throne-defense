import type { FastifyInstance } from 'fastify'

/**
 * GET /api/health — «сервер жив». По нему автодеплой и человек с curl
 * проверяют, что API поднялось. Ничего не читает и ничего не меняет.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true }))
}
