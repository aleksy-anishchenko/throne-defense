// Стража: выбор цели и выстрел. Сами башни — в data/towers.ts.

import { REFUND_RATE } from '../data/balance.ts'
import type { Enemy, Tower, TowerDef, TowerStats, World } from '../types.ts'

export const towerStats = (tower: Tower): TowerStats => tower.def.tiers[tower.tier]

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

/** Цель башни: враг в радиусе, который дальше всех прошёл по ковру (ближе всех к трону). Нет цели — null */
function findTarget(world: World, tower: Tower, stats: TowerStats): Enemy | null {
  const rangeSquared = stats.range * stats.range
  let best: Enemy | null = null
  for (const enemy of world.state.enemies) {
    if (enemy.isDead) continue
    const deltaX = enemy.x - tower.x
    const deltaY = enemy.y - tower.y
    if (
      deltaX * deltaX + deltaY * deltaY <= rangeSquared &&
      (!best || enemy.pathDistance > best.pathDistance)
    )
      best = enemy
  }
  return best
}

/** Каждая башня, у которой прошла перезарядка, стреляет в того, кто ближе всех к трону */
export function updateTowers(world: World, dt: number): void {
  for (const tower of world.state.towers) {
    tower.cooldownLeft -= dt
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
    tower.def.fire(world, tower, target, stats)
    world.emit('fire', { tower, stats })
  }
}
