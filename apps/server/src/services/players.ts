import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export const PROFILE_REQUIRED = {
  code: 'profile-required',
  message: 'Профиль браузера недоступен. Обновите игру и попробуйте ещё раз.',
} as const

/** Браузер хранит секретный ключ. В базе и ответах API — его публичный хеш. */
export function playerIdFromAuthorization(authorization: string | undefined): string | undefined {
  const match = /^Bearer ([0-9a-f]{64})$/i.exec(authorization ?? '')
  if (!match) return undefined
  return createHash('sha256').update(Buffer.from(match[1], 'hex')).digest('hex')
}

export function renamePlayer(database: DatabaseSync, id: string, name: string): boolean {
  const update = database.prepare('UPDATE players SET player_name = ? WHERE id = ?')
  return update.run(name, id).changes > 0
}
