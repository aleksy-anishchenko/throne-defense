import { REWARD_LIST, REWARD_WAVES, REWARDS } from '../data/rewards.ts'
import type {
  GameState,
  PendingReward,
  RewardEffect,
  RewardId,
  RewardPick,
  RewardStats,
  Tower,
  TowerStats,
} from '../types.ts'

export interface RewardSummary {
  rewardId: RewardId
  name: string
  description: string
  count: number
}

/** Сколько наград предлагать за один рубеж */
const REWARD_OPTION_COUNT = 3

/** Детерминированный хеш строки: одинаковое состояние партии даёт одинаковый выбор */
function hashString(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function nextRandom(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0
}

export function isRewardWave(wave: number): boolean {
  return (REWARD_WAVES as readonly number[]).includes(wave)
}

function isRewardAvailable(rewardId: RewardId, wave: number): boolean {
  const availableWaves = REWARDS[rewardId].availableWaves
  return !availableWaves || availableWaves.includes(wave)
}

/**
 * Три разные награды. Ключ включает результат партии, поэтому другой зал, лишняя потеря жизни
 * или иное время волны естественно дают другой набор, но повтор того же состояния — тот же.
 */
export function rollRewardOptions(state: GameState, wave: number, levelId: string): RewardId[] {
  const key = [
    levelId,
    wave,
    state.score,
    state.kills,
    state.lives,
    state.gold,
    state.time.toFixed(3),
    state.towers.length,
    ...state.selectedRewards.map((reward) => reward.rewardId),
  ].join(':')
  let seed = hashString(key)
  const pool = REWARD_LIST.map((reward) => reward.id).filter((rewardId) =>
    isRewardAvailable(rewardId, wave),
  )
  const options: RewardId[] = []
  while (options.length < REWARD_OPTION_COUNT) {
    seed = nextRandom(seed)
    const index = seed % pool.length
    options.push(pool[index])
    pool[index] = pool[pool.length - 1]
    pool.pop()
  }
  return options
}

function applyEffect(state: GameState, effect: RewardEffect): void {
  switch (effect.kind) {
    case 'gold':
      state.gold += effect.amount
      return
    case 'healToFull':
      state.lives = Math.max(state.lives, state.maxLives)
      return
    // Остальные эффекты сохраняются в selectedRewards и считаются через rewardStats
    case 'damage':
    case 'fireRate':
    case 'killGold':
    case 'waveGold':
    case 'upgradeDiscount':
    case 'mageBurn':
    case 'control':
    case 'lastStand':
    case 'enemySlow':
    case 'miniBossHp':
      return
  }
}

/** Принять выбранную награду и вернуть партию к строительству перед следующей волной. */
export function applyReward(state: GameState, rewardId: RewardId): RewardPick | null {
  if (state.phase !== 'reward' || !state.pendingReward) return null
  if (!state.pendingReward.options.includes(rewardId)) return null
  const reward = REWARDS[rewardId]
  if (!reward) return null
  const pick: RewardPick = { wave: state.pendingReward.wave, rewardId }
  applyEffect(state, reward.effect)
  state.selectedRewards.push(pick)
  state.pendingReward = null
  state.phase = 'build'
  return pick
}

/** Постоянные бонусы выбранных благословений. */
export function rewardStats(state: GameState): RewardStats {
  const stats: RewardStats = {
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    killGoldBonus: 0,
    waveGoldMultiplier: 1,
    upgradeCostMultiplier: 1,
    mageBurnMultiplier: 1,
    frostSlowBonus: 0,
    trapperRootMultiplier: 1,
    lastStandDamageMultiplier: 1,
    lastStandRows: 4,
    enemySpeedMultiplier: 1,
    miniBossHpMultiplier: 1,
  }
  for (const { rewardId } of state.selectedRewards) {
    const effect = REWARDS[rewardId]?.effect
    if (!effect) continue
    if (effect.kind === 'damage') stats.damageMultiplier += effect.amount
    else if (effect.kind === 'fireRate') stats.fireRateMultiplier += effect.amount
    else if (effect.kind === 'killGold') stats.killGoldBonus += effect.amount
    else if (effect.kind === 'waveGold') stats.waveGoldMultiplier += effect.amount
    else if (effect.kind === 'upgradeDiscount') stats.upgradeCostMultiplier *= 1 - effect.amount
    else if (effect.kind === 'mageBurn') stats.mageBurnMultiplier += effect.amount
    else if (effect.kind === 'control') {
      stats.frostSlowBonus += effect.slowBonus
      stats.trapperRootMultiplier += effect.rootBonus
    } else if (effect.kind === 'lastStand') {
      stats.lastStandDamageMultiplier += effect.damageBonus
      stats.lastStandRows = Math.max(stats.lastStandRows, effect.rows)
    } else if (effect.kind === 'enemySlow') stats.enemySpeedMultiplier *= 1 - effect.amount
    else if (effect.kind === 'miniBossHp') stats.miniBossHpMultiplier *= 1 - effect.amount
  }
  return stats
}

/** Характеристики башни с учётом её положения и наград конкретных стражей. */
export function effectiveTowerStats(state: GameState, tower: Tower, base: TowerStats): TowerStats {
  const rewards = rewardStats(state)
  const lastStand = tower.row < rewards.lastStandRows ? rewards.lastStandDamageMultiplier : 1
  const damage = base.damage * lastStand
  return {
    ...base,
    damage,
    burnDamage:
      (base.burnDamage ?? 0) *
      (tower.def.id === 'mage' ? rewards.mageBurnMultiplier * lastStand : lastStand),
    slowAmount:
      base.slowAmount === undefined
        ? undefined
        : Math.min(1, base.slowAmount + rewards.frostSlowBonus),
    rootDuration:
      base.rootDuration === undefined
        ? undefined
        : base.rootDuration * rewards.trapperRootMultiplier,
  }
}

/** Группирует выбранные награды и показывает их суммарный действующий эффект. */
export function summarizeRewards(rewards: readonly RewardPick[]): RewardSummary[] {
  const counts = new Map<RewardId, number>()
  for (const { rewardId } of rewards) {
    counts.set(rewardId, (counts.get(rewardId) ?? 0) + 1)
  }
  return [...counts].map(([rewardId, count]) => {
    const reward = REWARDS[rewardId]
    let description = reward.description
    switch (reward.effect.kind) {
      case 'gold':
        description = `Получено ${reward.effect.amount * count} золота`
        break
      case 'healToFull':
        description = 'Трон был полностью восстановлен'
        break
      case 'damage':
        description = `+${Math.round(reward.effect.amount * count * 100)}% ко всему урону стражей`
        break
      case 'fireRate':
        description = `+${Math.round(reward.effect.amount * count * 100)}% к скорости стрельбы`
        break
      case 'killGold':
        description = `+${reward.effect.amount * count} золота за каждого убитого врага`
        break
      case 'waveGold':
        description = `+${Math.round(reward.effect.amount * count * 100)}% золота за отбитую волну`
        break
      case 'upgradeDiscount':
        description = `−${Math.round((1 - (1 - reward.effect.amount) ** count) * 100)}% к цене улучшений`
        break
      case 'mageBurn':
        description = `+${Math.round(reward.effect.amount * count * 100)}% к горению Огневика`
        break
      case 'control':
        description =
          `+${Math.round(reward.effect.slowBonus * count * 100)} п.п. замедления Морозко; ` +
          `+${Math.round(reward.effect.rootBonus * count * 100)}% к сети Ловчего`
        break
      case 'lastStand':
        description =
          `+${Math.round(reward.effect.damageBonus * count * 100)}% урона башням ` +
          `в верхних ${reward.effect.rows} рядах`
        break
      case 'enemySlow':
        description = `Враги идут на ${Math.round((1 - (1 - reward.effect.amount) ** count) * 100)}% медленнее`
        break
      case 'miniBossHp':
        description = `Огры и Горынычи появляются с −${Math.round((1 - (1 - reward.effect.amount) ** count) * 100)}% здоровья`
        break
    }
    return { rewardId, name: reward.name, description, count }
  })
}

export function offerReward(state: GameState, wave: number, levelId: string): PendingReward {
  const pendingReward = {
    wave,
    options: rollRewardOptions(state, wave, levelId),
  }
  state.phase = 'reward'
  state.pendingReward = pendingReward
  return pendingReward
}
