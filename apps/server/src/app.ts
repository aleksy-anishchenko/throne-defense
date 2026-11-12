import rateLimit from '@fastify/rate-limit'
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

/**
 * API стоит за nginx на той же машине: для Node все запросы приходят с 127.0.0.1.
 * Настоящий адрес игрока nginx дописывает в конец заголовка X-Forwarded-For
 * (deploy/nginx/throne-defense.conf). Доверяем заголовку, только если запрос пришёл от nginx —
 * тогда request.ip = адрес игрока. Подделать его нельзя: всё, что игрок напишет в этот
 * заголовок сам, окажется левее адреса, который допишет nginx, и учтено не будет
 */
const TRUSTED_PROXY = '127.0.0.1'

/**
 * Не больше стольких запросов в минуту с одного адреса. Игра шлёт пару запросов за партию
 * (результат и топ), так что игрок до предела не дойдёт, а засыпать API запросами не выйдет.
 * Строже для отдельных маршрутов — в их настройках (config.rateLimit), например для POST /api/runs
 */
export const RATE_LIMIT_PER_MINUTE = 60
const RATE_LIMIT_WINDOW = '1 minute'

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
  const app = Fastify({ logger: options.logger ?? false, trustProxy: TRUSTED_PROXY })

  const database = openDatabase(options.databasePath)
  app.decorate('db', database)
  // app.close() закрывает и базу: недописанное из журнала WAL попадёт в основной файл
  app.addHook('onClose', async () => {
    database.close()
  })

  // Счётчики живут в памяти процесса и сбрасываются при перезапуске — для одного сервера хватает
  app.register(rateLimit, {
    max: RATE_LIMIT_PER_MINUTE,
    timeWindow: RATE_LIMIT_WINDOW,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Слишком много запросов. Попробуй через ${context.after}`,
    }),
  })

  app.register(healthRoutes)
  return app
}
