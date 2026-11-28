// Как показывать характеристики выбранной башни.

import type { RewardStats, StatKey, TowerDef, TowerStats } from '@throne/game'
import { displayStatValue } from '@throne/game'
import { formatDecimal, formatPercent, plural } from './format'

function cellUnit(range: number): string {
  return Number.isInteger(range) ? plural(range, ['клетка', 'клетки', 'клеток']) : 'клетки'
}

interface StatDisplay {
  label: string
  format: (value: number) => string | number
  unit?: (value: number) => string
}

/** Как подписывать и показывать каждую характеристику */
export const STAT_DISPLAY: Record<StatKey, StatDisplay> = {
  bleedShare: { label: 'Кровотечение за 3 с', format: formatPercent },
  bossBleedShare: { label: 'По Узурпатору за 3 с', format: formatPercent },
  shieldHealth: { label: 'Прочность щита', format: String },
  damage: { label: 'Урон', format: formatDecimal },
  attackRate: { label: 'Скорость атаки', format: formatDecimal, unit: () => 'атак/с' },
  range: { label: 'Дальность атаки', format: formatDecimal, unit: cellUnit },
  cooldown: { label: 'Перезарядка', format: formatDecimal, unit: () => 'с' },
  slowAmount: { label: 'Замедление', format: formatPercent },
  splashRadius: { label: 'Радиус взрыва', format: formatDecimal, unit: cellUnit },
  pierceCount: { label: 'Целей за выстрел', format: String },
  burnDamage: { label: 'Урон от горения', format: formatDecimal },
  fireRateBonus: { label: 'Бонус к скорости атаки', format: formatPercent },
  goldPerWave: { label: 'Доход за волну', format: String },
  rootDuration: { label: 'Время в сети', format: formatDecimal, unit: () => 'с' },
  curseAmount: { label: 'Урон по проклятым', format: (value) => `+${formatPercent(value)}` },
  healingReduction: { label: 'Получаемое лечение', format: (value) => `−${formatPercent(value)}` },
}

/**
 * Башня-аура (Звонарь) действует на башни, а башни стоят в центрах клеток: её дальность
 * растёт ступеньками, «плюс несколько клеток». Поэтому показываем не радиус, а число клеток
 */
export const isAuraTower = (stats: TowerStats): boolean => (stats.fireRateBonus ?? 0) > 0

/**
 * Сколько клеток вокруг (не считая своей) накрывает радиус range — если вокруг всё поле:
 * 1,5 → 8 соседних, 2,05 → 12, 2,3 → 20. Клетка считается, если до её центра не дальше range
 */
export function cellsInReach(range: number): number {
  const reach = Math.floor(range)
  let count = 0
  for (let deltaRow = -reach; deltaRow <= reach; deltaRow++) {
    for (let deltaCol = -reach; deltaCol <= reach; deltaCol++) {
      const isOwnCell = deltaRow === 0 && deltaCol === 0
      if (!isOwnCell && deltaCol ** 2 + deltaRow ** 2 <= range ** 2) count++
    }
  }
  return count
}

/** Зона действия до покупки, в тех же единицах, что и подсветка на поле. */
export function placementReach(def: TowerDef): string {
  const stats = def.tiers[0]
  if (def.id === 'spike-plate') return 'Одна клетка ковра'
  if (def.id === 'treasury') return 'По стороне и диагонали'
  if (isAuraTower(stats)) return `До ${cellsInReach(stats.range)} соседних клеток`
  return `Радиус ${formatDecimal(stats.range)} ${cellUnit(stats.range)}`
}

export function shopTowerLabel(def: TowerDef, isUnaffordable: boolean): string {
  if (!def.cost) return `${def.name}, бесплатно`
  const label = `${def.name}, цена ${def.cost}`
  return isUnaffordable ? `${label}, недостаточно золота` : label
}

export function shopPlacementDescription(def: TowerDef): string {
  if (def.id === 'treasury') return 'Казны рядом повышают доход'
  const bonus = def.tiers[0].fireRateBonus
  return bonus ? `Ускоряет стрельбу на ${formatPercent(bonus)}` : def.shortDescription
}

export function formatStatValue(key: StatKey, stats: TowerStats): string {
  const { format, unit } = STAT_DISPLAY[key]
  const value = displayStatValue(stats, key) ?? 0
  return `${format(value)}${unit ? ` ${unit(value)}` : ''}`
}

/** Значения можно прочитать по отдельности, включая единицы каждой ступени. */
export function formatTowerStat(
  def: TowerDef,
  key: StatKey,
  currentStats: TowerStats,
  nextStats?: TowerStats,
) {
  let label = STAT_DISPLAY[key].label
  if (key === 'range' && def.id === 'frost') label = 'Дальность'
  if (key === 'burnDamage' && currentStats.burnDuration) {
    label += ` (за ${formatDecimal(currentStats.burnDuration)} сек)`
  }
  const current = formatStatValue(key, currentStats)
  const next = nextStats ? formatStatValue(key, nextStats) : null
  return { label, current, next: next === current ? null : next }
}

export function towerInteractionHint(
  def: TowerDef,
  effects: Pick<RewardStats, 'secondBellShare' | 'iceAndFire'>,
): string {
  if (def.id === 'bell' && effects.secondBellShare > 0) {
    return `«Два колокола» добавляют ${formatPercent(effects.secondBellShare)} бонуса второго по силе Звонаря.`
  }
  if (effects.iceAndFire && (def.id === 'mage' || def.id === 'frost')) {
    return 'С благословением «Лёд и пламя» горение и замедление действуют одновременно.'
  }
  return def.interactionHint ?? ''
}
