import {
  applyTowerRewards,
  reloadProgress,
  REWARDS,
  REWARD_SETS,
  REWARD_SET_SIZE,
  treasuryIncomeWithNeighbors,
  type RewardEffect,
  type RewardId,
  type RewardSetId,
  type RewardStats,
  type StatKey,
  type TowerDef,
  type TowerStats,
} from '@throne/game'
import { formatPercent, plural } from './format'
import { formatStatLine, formatStatValue } from './towerStats'

interface StatSource {
  name: string
  effect: RewardEffect
  count: number
}

/** Какие числовые бонусы действуют в этой партии, включая завершённые наборы. */
export function statSources(
  blessings: readonly { rewardId: RewardId; count: number }[],
  setCounts: Record<RewardSetId, number>,
): StatSource[] {
  const active: StatSource[] = blessings.map(({ rewardId, count }) => {
    const { name, effect } = REWARDS[rewardId]
    return { name, effect, count }
  })
  for (const id of Object.keys(setCounts) as RewardSetId[]) {
    const { name, effect } = REWARD_SETS[id]
    if (setCounts[id] >= REWARD_SET_SIZE && effect.kind !== 'crown-gift') {
      active.push({ name, effect, count: 1 })
    }
  }
  return active
}

interface LocalBonuses {
  fireRateBonus: number
  fireRateSources: number
  treasuryNeighbors: number
}

export interface TowerStatRow {
  key: StatKey
  text: string
  details: string[]
}

function sourceBonus(effect: RewardEffect, key: StatKey, row: number): number {
  const damage = key === 'damage' || key === 'burnDamage'
  if (damage && effect.kind === 'damage') return effect.amount
  if (damage && effect.kind === 'lastStand' && row < effect.rows) return effect.damageBonus
  if (key === 'burnDamage' && effect.kind === 'mageBurn') return effect.amount
  if (key === 'attackRate' && effect.kind === 'fireRate') return effect.amount
  if (effect.kind === 'control') {
    if (key === 'slowAmount') return effect.slowBonus
    if (key === 'rootDuration') return effect.rootBonus
  }
  return 0
}

export function towerStatRows(
  def: TowerDef,
  tier: number,
  row: number,
  effects: RewardStats,
  local: LocalBonuses,
  sources: readonly StatSource[],
): TowerStatRow[] {
  function effective(base: TowerStats): TowerStats {
    const stats = applyTowerRewards(base, { def, row }, effects)
    // В бою общий бонус урона применяется при попадании. В карточке показываем урон по цели без брони.
    return {
      ...stats,
      damage: stats.damage * effects.damageMultiplier,
      burnDamage: (stats.burnDamage ?? 0) * effects.damageMultiplier,
      cooldown: stats.cooldown / reloadProgress(1, local.fireRateBonus, effects.fireRateMultiplier),
      goldPerWave:
        base.goldPerWave === undefined
          ? undefined
          : treasuryIncomeWithNeighbors(base.goldPerWave, local.treasuryNeighbors),
    }
  }

  const base = def.tiers[tier]
  const current = effective(base)
  const next = def.tiers[tier + 1]
  const upgraded = next && effective(next)
  return def.displayStats.map((key) => {
    const text = formatStatLine(key, current, upgraded)
    const unboosted = formatStatValue(key, base)
    // Перезарядка Ловчего и скорость атаки меняются вместе. Источники подписаны у скорости.
    if (key === 'cooldown' || unboosted === formatStatValue(key, current))
      return { key, text, details: [] }

    const bonuses: string[] = []
    if (key === 'attackRate' && local.fireRateBonus > 0) {
      const source = local.fireRateSources > 1 ? 'Звонари («Два колокола»)' : 'Звонарь'
      bonuses.push(`${source} +${formatPercent(local.fireRateBonus)}`)
    }
    for (const { name, effect, count } of sources) {
      const amount = sourceBonus(effect, key, row) * count
      if (!amount) continue
      const points = Math.round(amount * 100)
      const increase =
        key === 'slowAmount'
          ? `${points} ${plural(points, ['процентный пункт', 'процентных пункта', 'процентных пунктов'])}`
          : formatPercent(amount)
      bonuses.push(`${name} +${increase}`)
    }
    return { key, text, details: [`Без усилений — ${unboosted}`, ...bonuses] }
  })
}
