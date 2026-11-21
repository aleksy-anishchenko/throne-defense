import {
  PANIC_IN_FORMATION,
  REWARD_CHECKPOINTS,
  REWARD_LIST,
  REWARD_RARITIES,
  REWARD_SETS,
  REWARD_SET_SIZE,
  REWARD_WAVES,
  REWARDS,
  doubleShotDescription,
  panicDescription,
  twoBellsDescription,
  type RewardSetId,
} from '../data/rewards.ts'
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
const CROWN_GIFT_OPTION_COUNT = 2
const REROLL_COST_INCREMENT = 20
const RANDOM_RANGE = 2 ** 32
const TOTAL_RARITY_WEIGHT = Object.values(REWARD_RARITIES).reduce(
  (sum, { weight }) => sum + weight,
  0,
)
const REWARD_SET_IDS = Object.keys(REWARD_SETS) as RewardSetId[]

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

function takeReward(pool: RewardId[], seed: number): RewardId {
  const index = Math.floor((seed / RANDOM_RANGE) * pool.length)
  return pool.splice(index, 1)[0]
}

export function isRewardWave(wave: number): boolean {
  return REWARD_WAVES.includes(wave)
}

/**
 * Каждому месту в тройке соответствует 15% общего розыгрыша легендарки.
 * В одном предложении максимум одна легендарка, поэтому другая доступна при реролле.
 */
export function rollRewardOptions(
  state: GameState,
  wave: number,
  levelId: string,
  previous?: Extract<PendingReward, { kind: 'wave' }>,
): RewardId[] {
  const roll = previous ? previous.rerolls + 1 : 0
  // Номер обновления в начале строки уменьшает связь с предыдущим броском.
  let seed = hashString(`${roll}:${levelId}:${wave}:${state.rewardSeed}`)
  const available = REWARD_LIST.filter(({ id }) => !previous?.options.includes(id))
  const legendaries = available.filter(({ rarity }) => rarity === 'legendary').map(({ id }) => id)
  const pools = Object.entries(REWARD_RARITIES)
    .filter(([rarity]) => rarity !== 'legendary')
    .map(([rarity, { weight }]) => ({
      weight,
      options: available.filter((reward) => reward.rarity === rarity).map((reward) => reward.id),
    }))
  seed = nextRandom(seed)
  const rarityDraw = (seed / RANDOM_RANGE) * TOTAL_RARITY_WEIGHT
  // 0–15, 15–30 и 30–45 выделяют по одному месту. За пределами 45 легендарка не выпадает.
  const legendarySlot = Math.floor(rarityDraw / REWARD_RARITIES.legendary.weight)
  const options: RewardId[] = []
  while (options.length < REWARD_OPTION_COUNT) {
    if (options.length === legendarySlot && legendaries.length > 0) {
      seed = nextRandom(seed)
      options.push(takeReward(legendaries, seed))
      continue
    }
    const totalWeight = pools.reduce(
      (total, pool) => total + (pool.options.length ? pool.weight : 0),
      0,
    )
    if (!totalWeight) break
    seed = nextRandom(seed)
    let draw = (seed / RANDOM_RANGE) * totalWeight
    for (const pool of pools) {
      if (!pool.options.length) continue
      draw -= pool.weight
      if (draw >= 0) continue
      seed = nextRandom(seed)
      options.push(takeReward(pool.options, seed))
      break
    }
  }
  return options
}

function rewardCheckpoint(wave: number) {
  const checkpoint = REWARD_CHECKPOINTS.find((entry) => entry.wave === wave)
  if (!checkpoint) throw new RangeError(`После волны ${wave} нет рубежа благословений`)
  return checkpoint
}

export function rewardDescriptionForWave(rewardId: RewardId, wave: number): string {
  const reward = REWARDS[rewardId]
  return reward.effect.kind === 'gold'
    ? `+${rewardCheckpoint(wave).warChestGold} золота сразу`
    : reward.description
}

export function rewardRerollCost(wave: number, rerolls: number): number {
  return rewardCheckpoint(wave).rerollCost + rerolls * REROLL_COST_INCREMENT
}

export function rerollReward(state: GameState, levelId: string): PendingReward | null {
  const pending = state.pendingReward
  if (state.phase !== 'reward' || pending?.kind !== 'wave') return null
  const cost = rewardRerollCost(pending.wave, pending.rerolls)
  if (state.gold < cost) return null
  const options = rollRewardOptions(state, pending.wave, levelId, pending)
  if (options.length < REWARD_OPTION_COUNT) return null

  const next = { ...pending, options, rerolls: pending.rerolls + 1 }
  state.gold -= cost
  state.pendingReward = next
  return next
}

export function rewardSetCounts(picks: readonly RewardPick[]): Record<RewardSetId, number> {
  const counts = { arsenal: 0, supplies: 0, watch: 0 }
  for (const { rewardId } of picks) {
    const reward = REWARDS[rewardId]
    if (reward) counts[reward.setId]++
  }
  return counts
}

function offerCrownGift(
  state: GameState,
  previous: PendingReward,
  chosenId: RewardId,
  levelId: string,
): PendingReward {
  const { wave } = previous
  const common = REWARD_LIST.filter(({ id, rarity }) => rarity === 'common' && id !== chosenId).map(
    ({ id }) => id,
  )
  const fresh = common.filter((id) => !previous.options.includes(id))
  // Если три обычные карты уже показали, второй вариант берём среди ранее пропущенных.
  const unchosen = common.filter((id) => previous.options.includes(id))
  let seed = hashString(`${levelId}:${wave}:${state.rewardSeed}:crown-gift`)
  const options = Array.from({ length: CROWN_GIFT_OPTION_COUNT }, () => {
    seed = nextRandom(seed)
    return takeReward(fresh.length ? fresh : unchosen, seed)
  })
  return { kind: 'crown-gift', wave, options }
}

/** Принять награду. Собранный «Дар короны» сразу открывает следующий выбор. */
export function applyReward(
  state: GameState,
  rewardId: RewardId,
  levelId: string,
): RewardPick | null {
  const pending = state.pendingReward
  if (state.phase !== 'reward' || !pending?.options.includes(rewardId)) return null
  const reward = REWARDS[rewardId]
  if (!reward) return null
  const pick: RewardPick = { wave: pending.wave, rewardId }
  if (reward.effect.kind === 'gold') {
    pick.goldGranted = rewardCheckpoint(pending.wave).warChestGold
    state.gold += pick.goldGranted
  } else if (reward.effect.kind === 'healToFull') {
    state.lives = Math.max(state.lives, state.maxLives)
  }
  state.selectedRewards.push(pick)
  const set = REWARD_SETS[reward.setId]
  const completesSet = rewardSetCounts(state.selectedRewards)[reward.setId] === REWARD_SET_SIZE
  state.pendingReward =
    completesSet && set.effect.kind === 'crown-gift'
      ? offerCrownGift(state, pending, rewardId, levelId)
      : null
  if (!state.pendingReward) state.phase = 'build'
  return pick
}

function addStatEffect(stats: RewardStats, effect: RewardEffect): void {
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
  else if (effect.kind === 'giantHealth') stats.giantHealthMultiplier *= 1 - effect.amount
  else if (effect.kind === 'moatSlow') stats.moatSpeedMultiplier *= 1 - effect.amount
  else if (effect.kind === 'enemyHealing') stats.enemyHealingMultiplier *= 1 - effect.amount
  else if (effect.kind === 'panic')
    stats.panicTargets = Math.max(PANIC_IN_FORMATION.targets, stats.panicTargets + 1)
  else if (effect.kind === 'doubleShot') stats.doubleShotArrows++
  else if (effect.kind === 'twoBells')
    stats.secondBellShare += (1 - stats.secondBellShare) * effect.amount
  else if (effect.kind === 'iceAndFire') stats.iceAndFire = true
}

/** Постоянные бонусы выбранных благословений и собранных наборов. */
export function rewardStats(state: Pick<GameState, 'selectedRewards'>): RewardStats {
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
    giantHealthMultiplier: 1,
    moatSpeedMultiplier: 1,
    enemyHealingMultiplier: 1,
    panicTargets: 0,
    doubleShotArrows: 0,
    secondBellShare: 0,
    iceAndFire: false,
  }
  for (const { rewardId } of state.selectedRewards) {
    const effect = REWARDS[rewardId]?.effect
    if (effect) addStatEffect(stats, effect)
  }
  if (state.selectedRewards.length >= REWARD_SET_SIZE) {
    const counts = rewardSetCounts(state.selectedRewards)
    for (const id of REWARD_SET_IDS) {
      const effect = REWARD_SETS[id].effect
      if (counts[id] >= REWARD_SET_SIZE && effect.kind !== 'crown-gift')
        addStatEffect(stats, effect)
    }
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
      case 'gold': {
        const total = rewards
          .filter((pick) => pick.rewardId === rewardId)
          // До появления шкалы «Военная казна» всегда выдавала 140 золота.
          .reduce((sum, pick) => sum + (pick.goldGranted ?? 140), 0)
        description = `Получено ${total} золота`
        break
      }
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
          `Морозко замедляет ещё на ${Math.round(reward.effect.slowBonus * count * 100)} процентных пунктов, ` +
          `сеть Ловчего длится на ${Math.round(reward.effect.rootBonus * count * 100)}% дольше`
        break
      case 'lastStand':
        description =
          `+${Math.round(reward.effect.damageBonus * count * 100)}% урона башням ` +
          `в верхних ${reward.effect.rows} рядах`
        break
      case 'enemySlow':
        description = `Враги идут на ${Math.round((1 - (1 - reward.effect.amount) ** count) * 100)}% медленнее`
        break
      case 'giantHealth':
        description = `У боссов и полубоссов на ${Math.round((1 - (1 - reward.effect.amount) ** count) * 100)}% меньше здоровья`
        break
      case 'moatSlow':
        description = `На последней четверти пути враги идут на ${Math.round((1 - (1 - reward.effect.amount) ** count) * 100)}% медленнее`
        break
      case 'enemyHealing':
        description = `Знахари восстанавливают врагам на ${Math.round((1 - (1 - reward.effect.amount) ** count) * 100)}% меньше здоровья`
        break
      case 'panic':
        description = panicDescription(PANIC_IN_FORMATION.targets + count - 1)
        break
      case 'doubleShot':
        description = doubleShotDescription(count)
        break
      case 'twoBells':
        description = twoBellsDescription(1 - (1 - reward.effect.amount) ** count)
        break
    }
    return { rewardId, name: reward.name, description, count }
  })
}

export function offerReward(state: GameState, wave: number, levelId: string): PendingReward {
  const pendingReward: PendingReward = {
    kind: 'wave',
    wave,
    options: rollRewardOptions(state, wave, levelId),
    rerolls: 0,
  }
  state.phase = 'reward'
  state.pendingReward = pendingReward
  return pendingReward
}
