// Стража: выбор цели и выстрел. Сами башни — в data/towers.ts.

import { REFUND_RATE } from '../data/balance.ts'
import type { Enemy, TargetMode, Tower, TowerDef, TowerStats, World } from '../types.ts'

export const towerStats = (tower: Tower): TowerStats => tower.def.tiers[tower.tier]

/** Все способы выбрать цель, в том порядке, в каком их перебирает кнопка в панели башни */
export const TARGET_MODES: readonly TargetMode[] = ['first', 'strongest', 'nearest']

/** Цена следующего улучшения или null, если ступень максимальная */
export function upgradeCost(tower: Tower): number | null {
  return tower.tier < tower.def.tiers.length - 1 ? tower.def.upgradeCosts[tower.tier] : null
}

/** Сколько золота вложено в башню ступени tier (постройка + все улучшения) */
export function investedGold(def: TowerDef, tier: number): number {
  let sum = def.cost
  for (let i = 0; i < tier; i++) sum += def.upgradeCosts[i]
  return sum
}

/** Сколько вернут при продаже */
export const refundFor = (def: TowerDef, tier: number): number =>
  Math.floor(investedGold(def, tier) * REFUND_RATE)

/** Квадрат расстояния от башни до врага, клеток² */
const distanceSquared = (tower: Tower, enemy: Enemy) =>
  (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2

/**
 * Лучше ли враг candidate, чем best, как цель для режима mode.
 * При равенстве (одинаковое здоровье, одинаковое расстояние) выигрывает тот, кто ближе к трону
 */
function isBetterTarget(tower: Tower, mode: TargetMode, candidate: Enemy, best: Enemy): boolean {
  if (mode === 'strongest' && candidate.hp !== best.hp) return candidate.hp > best.hp
  if (mode === 'nearest') {
    const candidateDistance = distanceSquared(tower, candidate)
    const bestDistance = distanceSquared(tower, best)
    if (candidateDistance !== bestDistance) return candidateDistance < bestDistance
  }
  return candidate.pathDistance > best.pathDistance
}

/** Цель башни: враг в радиусе, лучший для её режима (tower.targetMode). Нет цели — null */
function findTarget(world: World, tower: Tower, stats: TowerStats): Enemy | null {
  const rangeSquared = stats.range * stats.range
  let best: Enemy | null = null
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || distanceSquared(tower, enemy) > rangeSquared) continue
    if (!best || isBetterTarget(tower, tower.targetMode, enemy, best)) best = enemy
  }
  return best
}

/**
 * Насколько быстрее стреляет башня из-за Звонарей рядом: 0.2 — на 20%.
 * Несколько Звонарей не складываются — действует самый сильный (иначе пять колоколов
 * вокруг одной баллисты превратили бы её в пулемёт)
 */
function fireRateBonusFor(tower: Tower, bells: readonly Tower[]): number {
  let bonus = 0
  for (const bell of bells) {
    const stats = towerStats(bell)
    const isInRange = (bell.x - tower.x) ** 2 + (bell.y - tower.y) ** 2 <= stats.range ** 2
    if (isInRange) bonus = Math.max(bonus, stats.fireRateBonus ?? 0)
  }
  return bonus
}

/** Каждая башня, у которой прошла перезарядка, стреляет в свою цель (см. findTarget) */
export function updateTowers(world: World, dt: number): void {
  const towers = world.state.towers
  const bells = towers.filter((tower) => (towerStats(tower).fireRateBonus ?? 0) > 0)

  for (const tower of towers) {
    // Звонарь и Казна не стреляют
    const fire = tower.def.fire
    if (!fire) continue

    const bonus = tower.def.takesFireRateBonus ? fireRateBonusFor(tower, bells) : 0
    tower.cooldownLeft -= dt * (1 + bonus)
    if (tower.cooldownLeft > 0) continue

    const stats = towerStats(tower)
    const target = findTarget(world, tower, stats)
    if (!target) {
      // Целей нет: башня готова и ждёт. Обнуляем остаток перезарядки, чтобы он не уходил
      // всё глубже в минус, пока никого нет; выстрелит она, как только появится враг в радиусе
      tower.cooldownLeft = 0
      continue
    }

    tower.cooldownLeft = stats.cooldown
    tower.aimAngle = Math.atan2(target.y - tower.y, target.x - tower.x)
    fire(world, tower, target, stats)
    world.emit('fire', { tower, stats })
  }
}

/** Казна: каждая башня с доходом приносит золото за отбитую волну */
export function payTowerIncome(world: World): void {
  for (const tower of world.state.towers) {
    const gold = towerStats(tower).goldPerWave ?? 0
    if (gold <= 0) continue
    world.state.gold += gold
    world.emit('income', { tower, gold })
  }
}
