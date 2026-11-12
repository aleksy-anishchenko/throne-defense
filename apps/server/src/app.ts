import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './db/database.ts'
import { healthRoutes } from './routes/health.ts'

// app.db доступна во всех маршрутах (как provide/inject во Vue). Здесь — её тип для TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync
  }
}

export interface BuildAppOptions {
  /** Файл базы SQLite. В тестах — IN_MEMORY_DATABASE */
  databasePath: string
  /** Писать ли журнал запросов. В тестах выключен, чтобы не засорять вывод */
  logger?: boolean
}

/**
 * Собирает приложение, но не запускает его на порту.
 * Так тесты вызывают маршруты через app.inject() без настоящей сети,
 * а main.ts берёт то же самое приложение и вызывает listen().
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false })

  const database = openDatabase(options.databasePath)
  app.decorate('db', database)
  // app.close() закрывает и базу: недописанное из журнала WAL попадёт в основной файл
  app.addHook('onClose', async () => {
    database.close()
  })

  app.register(healthRoutes)
  return app
}
