import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'

/**
 * Только 127.0.0.1, не 0.0.0.0: снаружи к API попадают только через nginx,
 * который пересылает /api/ сюда. Порт напрямую из интернета недоступен,
 * даже если фаервол когда-нибудь его откроет.
 */
const HOST = '127.0.0.1'

const config = loadConfig()
const app = buildApp({ logger: true })

try {
  await app.listen({ host: HOST, port: config.port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
