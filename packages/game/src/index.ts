// Всё, что пакет @throne/game показывает наружу (в браузер, тесты, будущий сервер).

export { createGame, type Game } from './core/game.ts'
export { cellKey, createLevel } from './core/level.ts'
export type { Emitter, Listener } from './core/events.ts'
export type { Path } from './core/path.ts'

export {
  BALANCE_VERSION,
  BOILING_OIL,
  MAGE_BURN,
  REFUND_RATE,
  SCORE,
  MAX_SPEED,
  MIN_SPEED,
  SIMULATION_STEP,
  TUNING,
  hpMultiplier,
  waveBonus,
} from './data/balance.ts'
export { ENEMIES } from './data/enemies.ts'
export { bannerArmorOf } from './systems/enemies.ts'
export { pendingBurnDamage } from './systems/combat.ts'
export { forecastBurnDamage } from './systems/burn-forecast.ts'
export {
  REWARDS,
  REWARD_LIST,
  REWARD_RARITIES,
  REWARD_SETS,
  REWARD_SET_SIZE,
  REWARD_WAVES,
  doubleShotDescription,
  ICE_NEEDLES,
  type RewardDef,
  type RewardRarity,
  type RewardSetId,
} from './data/rewards.ts'
export { TOWERS, TOWER_LIST } from './data/towers.ts'
export { LEVELS, PLAYABLE_LEVELS } from './levels/index.ts'
export {
  TARGET_MODES,
  investedGold,
  isFullRefund,
  fireRateBonusOf,
  fireRateContributionsOf,
  fireRateSourceOf,
  bellCoverage,
  refundFor,
  towerInvestedGold,
  towerStats,
  towerAspect,
  paidAspectCost,
  discountedUpgradePrice,
  displayStatValue,
  reloadProgress,
  upgradeCost,
} from './systems/towers.ts'
export {
  TREASURY_NEIGHBOR_REACH,
  treasuryNeighbors,
  treasuryBonusOf,
  treasuryIncomeOf,
  treasuryIncomeWithNeighbors,
} from './systems/treasury.ts'
// Для сервера: проверка правдоподобия присланного счёта
export { maxPossibleScore } from './systems/waves.ts'
export {
  isRewardWave,
  offerReward,
  rewardDescriptionForWave,
  rewardRerollCost,
  rewardSetCounts,
  rewardStats,
  rollRewardOptions,
  summarizeRewards,
  effectiveTowerStats,
  applyTowerRewards,
  type RewardSummary,
} from './systems/rewards.ts'
// Для замеров баланса (tools/balance): выпустить врага в обход волн
export { spawnEnemy } from './systems/enemies.ts'

export type * from './types.ts'
