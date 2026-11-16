import {
  HEALTH_PATH,
  READY_PATH,
  HealthResponseSchema,
  ReadyResponseSchema,
} from '@throne/contracts'
import type { FastifyInstance } from 'fastify'
import { loadMigrations, readUserVersion } from '../db/migrate.ts'

/**
 * Liveness не зависит от базы. Readiness проверяет схему и дешёвое чтение рейтинга.
 * Это не проверка свободного диска и не гарантия успешной будущей записи.
 */
export async function healthRoutes(
  app: FastifyInstance,
  options: { releaseId: string },
): Promise<void> {
  const schemaVersion = loadMigrations().length
  app.get(
    HEALTH_PATH,
    // Схема ответа из договора: Fastify отправит только описанные в ней поля
    { schema: { response: { 200: HealthResponseSchema } } },
    async () => ({ ok: true as const }),
  )
  app.get(
    READY_PATH,
    { schema: { response: { 200: ReadyResponseSchema, 503: ReadyResponseSchema } } },
    async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
      try {
        if (readUserVersion(app.db) !== schemaVersion) {
          throw new Error('Несовместимая версия схемы рейтинга')
        }
        app.db
          .prepare(
            'SELECT id, player_name, level_id, score, waves_cleared, balance_version, created_at FROM runs LIMIT 1',
          )
          .get()
        return { ok: true, releaseId: options.releaseId, schemaVersion }
      } catch (error) {
        app.log.error({ err: error }, 'Рейтинг не готов')
        return reply.code(503).send({ ok: false, releaseId: options.releaseId, schemaVersion })
      }
    },
  )
}
