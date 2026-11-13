// Враги: появление, движение по ковру, прорыв к трону, лечение и распад на части.

import { hpMultiplier } from '../data/balance.ts'
import { ENEMIES } from '../data/enemies.ts'
import type { Enemy, World } from '../types.ts'

/** Насколько отстают друг от друга по ковру те, на кого распался враг, клеток */
const SPLIT_SPACING = 0.22

/** Выпустить врага enemyId: от двери или (pathDistance) с указанного места ковра */
export function spawnEnemy(world: World, enemyId: string, pathDistance = 0): void {
  // Волны проверены при загрузке уровня, так что сюда неизвестный id попадает только по ошибке в коде
  if (!Object.hasOwn(ENEMIES, enemyId)) throw new Error(`Неизвестный враг «${enemyId}»`)
  const def = ENEMIES[enemyId]
  const state = world.state
  const hp = Math.round(def.hp * hpMultiplier(state.wave, world.level.waveCount))
  const [x, y] = world.level.path.positionAt(pathDistance)
  state.enemies.push({
    id: state.nextId++,
    def,
    hp,
    maxHp: hp,
    pathDistance,
    x,
    y,
    slowTimeLeft: 0,
    slowFactor: 0,
    healCooldownLeft: def.heal?.cooldown ?? 0,
    burnDamageLeft: 0,
    burnTimeLeft: 0,
    rootTimeLeft: 0,
    rootImmunityLeft: 0,
    rootDuration: 0,
    curseTimeLeft: 0,
    curseAmount: 0,
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
    // В сети — стоит. Замедление при этом идёт своим чередом
    if (enemy.rootTimeLeft > 0) speed = 0
    tickStatusTimers(world, enemy, dt)
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

/**
 * Часы сети, проклятия и «устойчивости» после них. Не ниже нуля — так проще читать состояние.
 * Сеть кончилась на горящем враге — значит, сгорела (событие netBurn для картинки)
 */
function tickStatusTimers(world: World, enemy: Enemy, dt: number): void {
  const wasRooted = enemy.rootTimeLeft > 0
  enemy.rootTimeLeft = Math.max(0, enemy.rootTimeLeft - dt)
  if (wasRooted && enemy.rootTimeLeft === 0 && enemy.burnTimeLeft > 0) world.emit('netBurn', enemy)
  enemy.rootImmunityLeft = Math.max(0, enemy.rootImmunityLeft - dt)
  enemy.curseTimeLeft = Math.max(0, enemy.curseTimeLeft - dt)
}

/** Лечить ли этого соседа: живой, раненый и в радиусе лечения */
function canHeal(healer: Enemy, other: Enemy, radius: number): boolean {
  return (
    other !== healer &&
    !other.isDead &&
    other.hp < other.maxHp &&
    (other.x - healer.x) ** 2 + (other.y - healer.y) ** 2 <= radius * radius
  )
}

/** Знахари лечат соседей (себя — нет: поэтому их и выгодно убивать первыми) */
export function updateHealers(world: World, dt: number): void {
  const enemies = world.state.enemies
  for (const healer of enemies) {
    const heal = healer.def.heal
    if (!heal || healer.isDead) continue
    healer.healCooldownLeft -= dt
    if (healer.healCooldownLeft > 0) continue
    healer.healCooldownLeft = heal.cooldown

    const amount = healer.maxHp * heal.amount
    for (const other of enemies) {
      if (canHeal(healer, other, heal.radius)) other.hp = Math.min(other.maxHp, other.hp + amount)
    }
    world.emit('heal', { x: healer.x, y: healer.y, radius: heal.radius })
  }
}

/** Погибший враг распадается: его «осколки» встанут в очередь и выйдут в конце шага */
export function queueSplit(world: World, enemy: Enemy): void {
  const split = enemy.def.splitInto
  if (!split) return
  for (let i = 0; i < split.count; i++) {
    world.state.splitQueue.push({
      enemyId: split.enemyId,
      // Чуть позади друг друга, чтобы не слиплись в одну точку
      pathDistance: Math.max(0, enemy.pathDistance - i * SPLIT_SPACING),
    })
  }
}

/**
 * Выпустить тех, кто в очереди распада. Отдельным шагом, а не сразу при гибели:
 * иначе тот же взрыв или волна холода, что убили Горыныча, задели бы и «осколки»
 */
export function spawnSplits(world: World): void {
  const queue = world.state.splitQueue
  if (!queue.length) return
  for (const { enemyId, pathDistance } of queue) spawnEnemy(world, enemyId, pathDistance)
  world.state.splitQueue = []
}
