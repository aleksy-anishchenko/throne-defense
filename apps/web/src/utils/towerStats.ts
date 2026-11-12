// Как показывать характеристики башни: и в панели выбранной башни, и в меню выбора стража.

import type { StatKey, TowerDef, TowerStats } from '@throne/game'
import { formatDecimal, formatPercent } from './format'

/** Как подписывать и показывать каждую характеристику */
export const STAT_DISPLAY: Record<StatKey, { label: string; format: (value: number) => string }> = {
  damage: { label: 'урон', format: String },
  range: { label: 'дальность', format: formatDecimal },
  cooldown: { label: 'перезарядка', format: (value) => `${formatDecimal(value)} с` },
  slowAmount: { label: 'замедление', format: formatPercent },
  splashRadius: { label: 'взрыв', format: formatDecimal },
  pierceCount: { label: 'пронзает', format: String },
  burnDamage: { label: 'горение', format: String },
  fireRateBonus: { label: 'ускоряет соседей на', format: formatPercent },
  goldPerWave: { label: 'доход за волну', format: String },
  rootDuration: { label: 'держит в сети', format: (value) => `${formatDecimal(value)} с` },
  curseAmount: { label: 'урон по проклятым', format: (value) => `+${formatPercent(value)}` },
  knockbackDistance: { label: 'отбрасывает', format: formatDecimal },
}

/** «урон 9 → 15»: текущее значение и (если есть) значение после улучшения */
export function formatStatLine(
  statKey: StatKey,
  currentStats: TowerStats,
  nextStats: TowerStats | undefined,
): string {
  const { label, format } = STAT_DISPLAY[statKey]
  const currentText = format(currentStats[statKey] ?? 0)
  const nextText = nextStats ? format(nextStats[statKey] ?? 0) : null
  return nextText === null || nextText === currentText
    ? `${label} ${currentText}`
    : `${label} ${currentText} → ${nextText}`
}

/** Характеристики новой башни (ступень I) для карточки в меню: «урон 7 · дальность 2,4» */
export function describeNewTowerStats(def: TowerDef): string {
  return def.displayStats
    .map((statKey) => formatStatLine(statKey, def.tiers[0], undefined))
    .join(' · ')
}
