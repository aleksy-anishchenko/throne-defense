import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const { buildApp } = await import(
  pathToFileURL(join(process.env.THRONE_RELEASE_DIR, 'apps/server/src/app.ts'))
)
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
