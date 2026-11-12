/** Настройки сервера. Берутся из переменных окружения (их заполняет файл .env, см. .env.example) */
export interface ServerConfig {
  port: number
  databasePath: string
}

const DEFAULT_PORT = 3000
const DEFAULT_DATABASE_PATH = './data/throne.db'
const MAX_PORT = 65535

/**
 * Читает настройки и сразу проверяет их. Ошибка в .env должна остановить запуск
 * с понятным текстом, а не всплыть потом странным поведением.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parsePort(env['PORT']),
    databasePath: parseDatabasePath(env['DATABASE_PATH']),
  }
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_PORT
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`PORT в .env должен быть целым числом от 1 до ${MAX_PORT}, а там «${value}»`)
  }
  return port
}

function parseDatabasePath(value: string | undefined): string {
  if (value === undefined || value.trim() === '') return DEFAULT_DATABASE_PATH
  return value.trim()
}
