// Всё, что пакет @throne/game показывает наружу (в браузер, тесты, будущий сервер).

export { createGame, type Game } from './core/game.ts'
export { cellKey, createLevel } from './core/level.ts'
export type { Emitter, Listener } from './core/events.ts'
export type { Path } from './core/path.ts'

export {
  BALANCE_VERSION,
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
export { TOWERS, TOWER_LIST } from './data/towers.ts'
export { LEVELS } from './levels/index.ts'
export {
  TARGET_MODES,
  investedGold,
  isFullRefund,
  refundFor,
  towerStats,
  upgradeCost,
} from './systems/towers.ts'
// Для замеров баланса (tools/balance): выпустить врага в обход волн
export { spawnEnemy } from './systems/enemies.ts'

export type * from './types.ts'
