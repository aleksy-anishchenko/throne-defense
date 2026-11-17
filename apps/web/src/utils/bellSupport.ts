// Одна модель для поля, предпросмотра и подсказок. Правила ускорения берём из @throne/game.
import {
  TOWERS,
  bellCoverage,
  fireRateBonusOf,
  fireRateSourceOf,
  towerStats,
  type Tower,
} from '@throne/game'

export interface BellBuff {
  source: Tower
  tower: Tower
  bonus: number
}

export function bellBuffs(towers: readonly Tower[]): BellBuff[] {
  return towers.flatMap((tower) => {
    const source = fireRateSourceOf(towers, tower)
    return source ? [{ source, tower, bonus: towerStats(source).fireRateBonus ?? 0 }] : []
  })
}

export function focusedBellBuffs(buffs: readonly BellBuff[], selected: Tower | null | undefined) {
  return selected ? buffs.filter((buff) => buff.source === selected || buff.tower === selected) : []
}

export function bellPlacementPreview(towers: readonly Tower[], col: number, row: number) {
  const source = { def: TOWERS['bell'], tier: 0, x: col + 0.5, y: row + 0.5 }
  const bonus = source.def.tiers[source.tier].fireRateBonus ?? 0
  const covered = bellCoverage(towers, source)
  // Уже получающие такой же или больший бонус башни не изображаем как усиленные новой аурой.
  const improved = covered.filter((tower) => fireRateBonusOf(towers, tower) < bonus)
  return { source, bonus, covered, improved }
}

export type BellPreview = ReturnType<typeof bellPlacementPreview>

export interface TowerBellPreview {
  source: Tower
  tower: Pick<Tower, 'def' | 'x' | 'y'>
  bonus: number
}

/** Вторая сторона предпросмотра: ставим атакующую башню в уже действующую ауру. */
export function towerPlacementBellPreview(
  towers: readonly Tower[],
  towerId: string,
  col: number,
  row: number,
): TowerBellPreview | null {
  const def = TOWERS[towerId]
  if (!def?.takesFireRateBonus) return null
  const tower = { def, x: col + 0.5, y: row + 0.5 }
  const source = fireRateSourceOf(towers, tower)
  return source ? { source, tower, bonus: towerStats(source).fireRateBonus ?? 0 } : null
}
