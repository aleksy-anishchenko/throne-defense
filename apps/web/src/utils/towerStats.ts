// Как показывать характеристики выбранной башни.

import type { RewardStats, StatKey, TowerDef, TowerStats } from '@throne/game'
import { displayStatValue } from '@throne/game'
import { formatDecimal, formatPercent, plural } from './format'

function distanceInCells(range: number): string {
  const unit = Number.isInteger(range) ? plural(range, ['клетка', 'клетки', 'клеток']) : 'клетки'
  return `${formatDecimal(range)} ${unit}`
}

/** Как подписывать и показывать каждую характеристику */
export const STAT_DISPLAY: Record<StatKey, { label: string; format: (value: number) => string }> = {
  damage: { label: 'урон', format: String },
  range: { label: 'радиус', format: distanceInCells },
  cooldown: { label: 'перезарядка', format: (value) => `${formatDecimal(value)} с` },
  slowAmount: { label: 'замедление', format: formatPercent },
  splashRadius: { label: 'взрыв', format: formatDecimal },
  pierceCount: { label: 'пронзает', format: String },
  burnDamage: { label: 'горение', format: String },
  fireRateBonus: { label: 'ускоряет соседей на', format: formatPercent },
  goldPerWave: { label: 'базовый доход за волну', format: String },
  rootDuration: { label: 'держит в сети', format: (value) => `${formatDecimal(value)} с` },
  curseAmount: { label: 'урон по проклятым', format: (value) => `+${formatPercent(value)}` },
  healingReduction: { label: 'получаемое лечение', format: (value) => `−${formatPercent(value)}` },
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
  return `Радиус ${distanceInCells(stats.range)}`
}

export function shopPlacementDescription(def: TowerDef): string {
  if (def.id === 'treasury') return 'Казны рядом повышают доход'
  const bonus = def.tiers[0].fireRateBonus
  return bonus ? `Ускоряет стрельбу на ${formatPercent(bonus)}` : def.shortDescription
}

/** Дальность ауры — числом клеток */
const AURA_RANGE_DISPLAY = { label: 'соседних клеток', format: cellsInReach }

/** «урон 9 → 15»: текущее значение и (если есть) значение после улучшения */
export function formatStatLine(
  statKey: StatKey,
  currentStats: TowerStats,
  nextStats: TowerStats | undefined,
): string {
  const { label, format } =
    statKey === 'range' && isAuraTower(currentStats) ? AURA_RANGE_DISPLAY : STAT_DISPLAY[statKey]
  const currentText = format(displayStatValue(currentStats, statKey) ?? 0)
  const nextText = nextStats ? format(displayStatValue(nextStats, statKey) ?? 0) : null
  return nextText === null || nextText === currentText
    ? `${label} ${currentText}`
    : `${label} ${currentText} → ${nextText}`
}

export function towerInteractionHint(
  def: TowerDef,
  effects: Pick<RewardStats, 'secondBellShare' | 'iceAndFire'>,
): string | undefined {
  if (def.id === 'bell' && effects.secondBellShare > 0) {
    return `«Два колокола» дают стражу полный бонус сильнейшего Звонаря и ${formatPercent(effects.secondBellShare)} бонуса второго в зоне.`
  }
  if (effects.iceAndFire && def.id === 'mage') {
    return 'Сначала стреляет по негорящим. «Лёд и пламя» позволяет поджигать замедленных врагов. Горящие враги быстрее сжигают сети.'
  }
  if (effects.iceAndFire && def.id === 'frost') {
    return 'С благословением «Лёд и пламя» Морозко замедляет и горящих врагов. Ставьте его и Огневика рядом.'
  }
  return def.interactionHint
}
