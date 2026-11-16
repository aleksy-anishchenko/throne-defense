import { buildApp } from '../../server/src/app.ts'

// Отдельный процесс с настоящим приложением, временной БД и портом от ОС.
const app = buildApp({
  databasePath: process.env.DATABASE_PATH,
  releaseId: process.env.RELEASE_ID,
})
process.once('SIGTERM', async () => {
  await app.close()
  process.exit(0)
})
const address = await app.listen({ host: '127.0.0.1', port: 0 })
process.send({ address })
