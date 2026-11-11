// Стража: выбор цели и выстрел. Сами башни — в data/towers.ts.

import { REFUND_RATE } from '../data/balance.ts'
import type { Enemy, Tower, TowerDef, TowerStats, World } from '../types.ts'

export const towerStats = (t: Tower): TowerStats => t.def.levels[t.lv]

/** Цена следующего улучшения или null, если уровень максимальный */
export function upgradeCost(t: Tower): number | null {
  return t.lv < t.def.levels.length - 1 ? t.def.upgrades[t.lv] : null
}

/** Сколько золота вложено в башню уровня lv (постройка + все улучшения) */
export function invested(def: TowerDef, lv: number): number {
  let sum = def.cost
  for (let i = 0; i < lv; i++) sum += def.upgrades[i]
  return sum
}

/** Сколько вернут при продаже */
export const refundFor = (def: TowerDef, lv: number): number =>
  Math.floor(invested(def, lv) * REFUND_RATE)

/** Каждая башня, у которой прошла перезарядка, стреляет в того, кто ближе всех к трону */
export function updateTowers(w: World, dt: number): void {
  for (const t of w.state.towers) {
    t.cd -= dt
    if (t.cd > 0) continue

    const s = towerStats(t)
    const r2 = s.range * s.range
    let best: Enemy | null = null
    for (const e of w.state.enemies) {
      if (e.dead) continue
      const dx = e.x - t.x
      const dy = e.y - t.y
      if (dx * dx + dy * dy <= r2 && (!best || e.d > best.d)) best = e
    }
    if (!best) {
      t.cd = 0
      continue
    }

    t.cd = s.rate
    t.aim = Math.atan2(best.y - t.y, best.x - t.x)
    t.def.fire(w, t, best, s)
    w.emit('fire', { tower: t, stats: s })
  }
}
