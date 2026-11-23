// Как показывать характеристики выбранной башни.

import type { RewardStats, StatKey, TowerDef, TowerStats } from '@throne/game'
import { displayStatValue, MAGE_BURN } from '@throne/game'
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
  damage: { label: 'Урон', format: formatDecimal },
  attackRate: { label: 'Скорость атаки', format: formatDecimal, unit: () => 'атак/с' },
  range: { label: 'Дальность атаки', format: formatDecimal, unit: cellUnit },
  cooldown: { label: 'Перезарядка', format: formatDecimal, unit: () => 'с' },
  slowAmount: { label: 'Замедление', format: formatPercent },
  splashRadius: { label: 'Радиус взрыва', format: formatDecimal, unit: cellUnit },
  pierceCount: { label: 'Целей за выстрел', format: String },
  burnDamage: { label: `Урон от горения за ${MAGE_BURN.duration} с`, format: formatDecimal },
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
  if (def.id === 'treasury') return 'По стороне и диагонали'
  if (isAuraTower(stats)) return `До ${cellsInReach(stats.range)} соседних клеток`
  return `Радиус ${formatDecimal(stats.range)} ${cellUnit(stats.range)}`
}

export function shopPlacementDescription(def: TowerDef): string {
  if (def.id === 'treasury') return 'Казны рядом повышают доход'
  const bonus = def.tiers[0].fireRateBonus
  return bonus ? `Ускоряет стрельбу на ${formatPercent(bonus)}` : def.shortDescription
}

/** Дальность ауры — числом клеток */
const AURA_RANGE_DISPLAY: StatDisplay = { label: 'Соседних клеток', format: cellsInReach }

function statDisplay(key: StatKey, stats: TowerStats): StatDisplay {
  return key === 'range' && isAuraTower(stats) ? AURA_RANGE_DISPLAY : STAT_DISPLAY[key]
}

export function formatStatValue(key: StatKey, stats: TowerStats): string {
  const { format, unit } = statDisplay(key, stats)
  const value = displayStatValue(stats, key) ?? 0
  return `${format(value)}${unit ? ` ${unit(value)}` : ''}`
}

/** Текущее и следующее значения делят одну подпись и единицу измерения. */
export function formatStatLine(
  statKey: StatKey,
  currentStats: TowerStats,
  nextStats: TowerStats | undefined,
): string {
  const { label, format } = statDisplay(statKey, currentStats)
  const currentText = format(displayStatValue(currentStats, statKey) ?? 0)
  const last = nextStats ?? currentStats
  const changed = currentText !== format(displayStatValue(last, statKey) ?? 0)
  return `${label} — ${changed ? `${currentText} → ` : ''}${formatStatValue(statKey, last)}`
}

export function towerDescription(
  def: TowerDef,
  effects: Pick<RewardStats, 'secondBellShare' | 'iceAndFire'>,
): string {
  let hint = def.interactionHint
  if (def.id === 'bell' && effects.secondBellShare > 0) {
    hint = `«Два колокола» добавляют ${formatPercent(effects.secondBellShare)} бонуса второго по силе Звонаря.`
  } else if (effects.iceAndFire && (def.id === 'mage' || def.id === 'frost')) {
    hint = 'С благословением «Лёд и пламя» горение и замедление действуют одновременно.'
  }
  return hint ? `${def.description} ${hint}` : def.description
}
