// Враги: появление, движение по ковру, прорыв к трону, лечение и распад на части.

import { BOILING_OIL, hpMultiplier } from '../data/balance.ts'
import { ENEMIES } from '../data/enemies.ts'
import type { Enemy, World } from '../types.ts'
import { rewardStats } from './rewards.ts'

/** Насколько отстают друг от друга по ковру те, на кого распался враг, клеток */
const SPLIT_SPACING = 0.22

/** Сколько союзников один знахарь может получать за один импульс */
export const MAX_HEAL_TARGETS = 3

const BANNER_RECIPIENTS = new Set(['rebel', 'scout', 'armor'])

/** Сильнейшая прибавка к броне от живого генерала в радиусе. */
export function bannerArmorOf(enemies: readonly Enemy[], recipient: Enemy): number {
  if (recipient.isDead || !BANNER_RECIPIENTS.has(recipient.def.id)) return 0
  let armor = 0
  for (const enemy of enemies) {
    const banner = enemy.def.banner
    if (!banner || enemy.isDead || banner.armor <= armor) continue
    const dx = enemy.x - recipient.x
    const dy = enemy.y - recipient.y
    if (dx * dx + dy * dy <= banner.radius * banner.radius) armor = banner.armor
  }
  return armor
}

/** Выпустить врага enemyId: от двери или (pathDistance) с указанного места ковра */
export function spawnEnemy(world: World, enemyId: string, pathDistance = 0): void {
  // Волны проверены при загрузке уровня, так что сюда неизвестный id попадает только по ошибке в коде
  if (!Object.hasOwn(ENEMIES, enemyId)) throw new Error(`Неизвестный враг «${enemyId}»`)
  const def = ENEMIES[enemyId]
  const state = world.state
  const giantHealth = def.isGiant ? rewardStats(state).giantHealthMultiplier : 1
  const hp = Math.round(def.hp * hpMultiplier(state.wave, world.level.waveCount) * giantHealth)
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
    wildfire: false,
    oilTimeLeft: 0,
    rootTimeLeft: 0,
    rootImmunityLeft: 0,
    rootDuration: 0,
    curseTimeLeft: 0,
    curseAmount: 0,
    armorBreakTimeLeft: 0,
    isDead: false,
  })
}

/** Сколько клеток пройдёт враг за шаг с текущей сетью и замедлениями. */
export function enemyStepDistance(enemy: Enemy, dt: number, enemySpeedMultiplier: number): number {
  if (enemy.rootTimeLeft > 0) return 0
  const frostSlow = enemy.slowTimeLeft > 0 ? enemy.slowFactor : 0
  let travelTime = dt * (1 - frostSlow)
  if (enemy.oilTimeLeft > 0) {
    const oilSlow = BOILING_OIL.slowAmount * (1 - (enemy.def.slowResistance ?? 0))
    travelTime -= Math.min(dt, enemy.oilTimeLeft) * Math.max(0, oilSlow - frostSlow)
  }
  return enemy.def.speed * enemySpeedMultiplier * travelTime
}

/**
 * Сдвинуть всех врагов на dt секунд.
 * Возвращает true, если трон устоял (можно продолжать бой),
 * и false, если кто-то дошёл до трона и жизни кончились — трон пал, игра проиграна.
 */
export function moveEnemies(world: World, dt: number): boolean {
  const state = world.state
  const { path } = world.level
  const { enemySpeedMultiplier } = rewardStats(state)

  for (const enemy of state.enemies) {
    if (enemy.isDead) continue
    const distance = enemyStepDistance(enemy, dt, enemySpeedMultiplier)
    if (enemy.slowTimeLeft > 0) enemy.slowTimeLeft -= dt
    tickStatusTimers(world, enemy, dt)
    enemy.pathDistance += distance

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
 * Таймеры сети, проклятия, снятия брони и устойчивости после сети.
 * Сеть кончилась на горящем враге — значит, сгорела (событие netBurn для картинки)
 */
function tickStatusTimers(world: World, enemy: Enemy, dt: number): void {
  const wasRooted = enemy.rootTimeLeft > 0
  enemy.rootTimeLeft = Math.max(0, enemy.rootTimeLeft - dt)
  if (wasRooted && enemy.rootTimeLeft === 0 && enemy.burnTimeLeft > 0) world.emit('netBurn', enemy)
  enemy.rootImmunityLeft = Math.max(0, enemy.rootImmunityLeft - dt)
  enemy.curseTimeLeft = Math.max(0, enemy.curseTimeLeft - dt)
  enemy.armorBreakTimeLeft = Math.max(0, enemy.armorBreakTimeLeft - dt)
}

/** Лечить ли этого соседа: живой, раненый, не знахарь и в радиусе лечения */
function canHeal(healer: Enemy, other: Enemy, radius: number): boolean {
  return (
    other !== healer &&
    !other.isDead &&
    !other.def.heal &&
    !other.def.immuneToHealing &&
    other.hp < other.maxHp &&
    (other.x - healer.x) ** 2 + (other.y - healer.y) ** 2 <= radius * radius
  )
}

/**
 * Знахари лечат соседей (себя — нет). Проклятие ослабляет получаемое лечение:
 * важен статус получателя, а не знахаря. Сила уже выбрана по сильнейшему Колдуну.
 */
export function updateHealers(world: World, dt: number): void {
  const enemies = world.state.enemies
  for (const healer of enemies) {
    const heal = healer.def.heal
    if (!heal || healer.isDead) continue
    healer.healCooldownLeft -= dt
    if (healer.healCooldownLeft > 0) continue
    healer.healCooldownLeft = heal.cooldown

    const amount = healer.maxHp * heal.amount * rewardStats(world.state).enemyHealingMultiplier
    const targets = enemies
      .filter((other) => canHeal(healer, other, heal.radius))
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)
      .slice(0, MAX_HEAL_TARGETS)
    const totalBudget = amount * MAX_HEAL_TARGETS
    for (const other of targets) {
      const healingShare = other.curseTimeLeft > 0 ? Math.max(0, 1 - other.curseAmount) : 1
      const distributed = Math.min(amount, totalBudget / targets.length)
      other.hp = Math.min(other.maxHp, other.hp + distributed * healingShare)
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
