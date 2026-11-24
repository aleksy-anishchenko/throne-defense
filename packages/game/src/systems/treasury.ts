import type { Tower, World } from '../types.ts'

export const TREASURY_NEIGHBOR_REACH = 1

/** Казны на соседних клетках, включая диагонали. */
export function treasuryNeighbors(
  towers: readonly Tower[],
  tower: Pick<Tower, 'def' | 'col' | 'row'>,
): Tower[] {
  if (tower.def.id !== 'treasury') return []
  return towers.filter(
    (other) =>
      other !== tower &&
      other.def.id === 'treasury' &&
      Math.abs(other.col - tower.col) <= TREASURY_NEIGHBOR_REACH &&
      Math.abs(other.row - tower.row) <= TREASURY_NEIGHBOR_REACH,
  )
}

/** Бонус за Казны рядом: по 10%, максимум 30%. */
export function treasuryBonusOf(
  towers: readonly Tower[],
  tower: Pick<Tower, 'def' | 'col' | 'row'>,
): number {
  return Math.min(3, treasuryNeighbors(towers, tower).length) * 0.1
}

/** Фактический доход за волну, округлённый вниз до целой монеты. */
export function treasuryIncomeWithNeighbors(base: number, neighbors: number): number {
  return Math.floor((base * (10 + Math.min(3, neighbors))) / 10)
}

export function treasuryIncomeOf(towers: readonly Tower[], tower: Tower): number {
  const base = tower.def.tiers[tower.tier].goldPerWave ?? 0
  return treasuryIncomeWithNeighbors(base, treasuryNeighbors(towers, tower).length)
}

/** Казна: выплата каждой башни учитывает её собственных соседей. */
export function payTowerIncome(world: World): void {
  for (const tower of world.state.towers) {
    const gold = treasuryIncomeOf(world.state.towers, tower)
    if (gold <= 0) continue
    world.state.gold += gold
    world.emit('income', { tower, gold })
  }
}
