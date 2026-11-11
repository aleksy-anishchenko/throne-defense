// Враги: появление, движение по ковру, прорыв к трону.

import { hpMultiplier } from '../data/balance.ts'
import { ENEMIES } from '../data/enemies.ts'
import type { World } from '../types.ts'

export function spawnEnemy(world: World, enemyId: string): void {
  // Волны проверены при загрузке уровня, так что сюда неизвестный id попадает только по ошибке в коде
  if (!Object.hasOwn(ENEMIES, enemyId)) throw new Error(`Неизвестный враг «${enemyId}»`)
  const def = ENEMIES[enemyId]
  const state = world.state
  const hp = Math.round(def.hp * hpMultiplier(state.wave, world.level.waveCount))
  const [x, y] = world.level.path.points[0]
  state.enemies.push({
    id: state.nextId++,
    def,
    hp,
    maxHp: hp,
    pathDistance: 0,
    x,
    y,
    slowTimeLeft: 0,
    slowFactor: 0,
    isDead: false,
  })
}

/**
 * Сдвинуть всех врагов на dt секунд.
 * Возвращает true, если трон устоял (можно продолжать бой),
 * и false, если кто-то дошёл до трона и жизни кончились — трон пал, игра проиграна.
 */
export function moveEnemies(world: World, dt: number): boolean {
  const state = world.state
  const { path } = world.level

  for (const enemy of state.enemies) {
    if (enemy.isDead) continue
    let speed = enemy.def.speed
    if (enemy.slowTimeLeft > 0) {
      speed *= 1 - enemy.slowFactor
      enemy.slowTimeLeft -= dt
    }
    enemy.pathDistance += speed * dt

    if (enemy.pathDistance >= path.length) {
      // Дошёл до трона
      enemy.isDead = true
      state.lives -= enemy.def.throneDamage
      world.emit('leak', enemy)
      if (state.lives <= 0) {
        state.lives = 0
        state.phase = 'lost'
        world.emit('defeat', undefined)
        return false
      }
      continue
    }

    const [x, y] = path.positionAt(enemy.pathDistance)
    enemy.x = x
    enemy.y = y
  }
  return true
}
