// Одна модель для поля, предпросмотра и подсказок. Правила ускорения берём из @throne/game.
import {
  TOWERS,
  bellCoverage,
  fireRateBonusOf,
  fireRateContributionsOf,
  type Tower,
} from '@throne/game'

export interface BellBuff {
  source: Tower
  tower: Tower
  bonus: number
}

export function bellBuffs(towers: readonly Tower[], secondBellShare = 0): BellBuff[] {
  return towers.flatMap((tower) =>
    fireRateContributionsOf(towers, tower, secondBellShare).map((contribution) => ({
      ...contribution,
      tower,
    })),
  )
}

export function focusedBellBuffs(buffs: readonly BellBuff[], selected: Tower | null | undefined) {
  return selected ? buffs.filter((buff) => buff.source === selected || buff.tower === selected) : []
}

export function bellPlacementPreview(
  towers: readonly Tower[],
  col: number,
  row: number,
  secondBellShare = 0,
) {
  // Новый Звонарь при равной силе уступит уже построенным.
  const source = { id: Infinity, def: TOWERS['bell'], tier: 0, x: col + 0.5, y: row + 0.5 }
  const bonus = source.def.tiers[source.tier].fireRateBonus ?? 0
  const covered = bellCoverage(towers, source)
  const withSource = [...towers, source]
  const improved = covered.flatMap((tower) => {
    const current = fireRateBonusOf(towers, tower, secondBellShare)
    const next = fireRateBonusOf(withSource, tower, secondBellShare)
    return next > current ? [{ tower, bonus: next }] : []
  })
  return { source, bonus, covered, improved }
}

export type BellPreview = ReturnType<typeof bellPlacementPreview>

export interface TowerBellPreview {
  sources: Tower[]
  tower: Pick<Tower, 'def' | 'x' | 'y'>
  bonus: number
}

/** Вторая сторона предпросмотра: ставим атакующую башню в уже действующую ауру. */
export function towerPlacementBellPreview(
  towers: readonly Tower[],
  towerId: string,
  col: number,
  row: number,
  secondBellShare = 0,
): TowerBellPreview | null {
  const def = TOWERS[towerId]
  if (!def?.takesFireRateBonus) return null
  const tower = { def, x: col + 0.5, y: row + 0.5 }
  const contributions = fireRateContributionsOf(towers, tower, secondBellShare)
  if (contributions.length === 0) return null
  return {
    sources: contributions.map(({ source }) => source),
    tower,
    bonus: contributions.reduce((sum, { bonus }) => sum + bonus, 0),
  }
}
