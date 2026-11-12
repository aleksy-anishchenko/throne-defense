import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { healthRoutes } from './routes/health.ts'

export interface BuildAppOptions {
  /** Писать ли журнал запросов. В тестах выключен, чтобы не засорять вывод */
  logger?: boolean
}

/**
 * Собирает приложение, но не запускает его на порту.
 * Так тесты вызывают маршруты через app.inject() без настоящей сети,
 * а main.ts берёт то же самое приложение и вызывает listen().
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false })
  app.register(healthRoutes)
  return app
}
