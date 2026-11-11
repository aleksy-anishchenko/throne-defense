// Враги: появление, движение по ковру, прорыв к трону.

import { hpMul } from '../data/balance.ts'
import { ENEMIES } from '../data/enemies.ts'
import type { World } from '../types.ts'

export function spawn(w: World, enemyId: string): void {
  const def = ENEMIES[enemyId]
  const s = w.state
  const hp = Math.round(def.hp * hpMul(s.wave, w.level.maxWave))
  const [x, y] = w.level.path.points[0]
  s.enemies.push({
    id: s.nextId++,
    def,
    hp,
    maxHp: hp,
    d: 0,
    x,
    y,
    slowT: 0,
    slowF: 0,
    dead: false,
  })
}

/**
 * Сдвинуть всех врагов на dt секунд.
 * Возвращает false, если кто-то дошёл до трона и трон пал.
 */
export function moveEnemies(w: World, dt: number): boolean {
  const s = w.state
  const { path } = w.level

  for (const e of s.enemies) {
    if (e.dead) continue
    let sp = e.def.speed
    if (e.slowT > 0) {
      sp *= 1 - e.slowF
      e.slowT -= dt
    }
    e.d += sp * dt

    if (e.d >= path.length) {
      // Дошёл до трона
      e.dead = true
      s.lives -= e.def.dmg
      w.emit('leak', e)
      if (s.lives <= 0) {
        s.lives = 0
        s.phase = 'over'
        w.emit('defeat', undefined)
        return false
      }
      continue
    }

    const [x, y] = path.posAt(e.d)
    e.x = x
    e.y = y
  }
  return true
}
