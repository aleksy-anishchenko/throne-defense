// Партия целиком: состояние + действия игрока + ход времени.
// Здесь нет ни DOM, ни звука, ни рисования — только правила.
// Наружу игра сообщает о происходящем событиями (game.on('kill', ...)).

import { MAX_SPEED, MIN_SPEED, SIMULATION_STEP } from '../data/balance.ts'
import { TOWERS } from '../data/towers.ts'
import { moveEnemies, spawnSplits, updateHealers } from '../systems/enemies.ts'
import { TARGET_MODES, refundFor, updateTowers, upgradeCost } from '../systems/towers.ts'
import { buildSpawnQueue, finishWave, getWaveGroups, spawnDueEnemies } from '../systems/waves.ts'
import { updateBurning, updateShots } from '../systems/combat.ts'
import type {
  GameEvents,
  GameState,
  Level,
  LevelDef,
  TargetMode,
  Tower,
  WaveGroup,
  World,
} from '../types.ts'
import { createEmitter, type Emitter } from './events.ts'
import { cellKey, createLevel, isLevelCell } from './level.ts'

export interface Game {
  readonly state: GameState
  readonly level: Level
  /** Подписаться на событие игры */
  readonly on: Emitter<GameEvents>['on']

  /** Начать новую партию */
  reset(): void
  /** Идёт ли партия: между волнами (build) или во время волны (wave) */
  isPlaying(): boolean
  /** Лежит ли клетка (столбец, строка) внутри поля. Дробные столбец и строка — не клетка */
  isInsideField(col: number, row: number): boolean
  /** Можно ли поставить башню на клетку (без учёта золота) */
  isCellFree(col: number, row: number): boolean
  /** Башня на клетке или undefined, если там пусто */
  towerAt(col: number, row: number): Tower | undefined
  /** Поставить башню. null — если нельзя (клетка занята, не хватает золота, партия не идёт) */
  build(towerId: string, col: number, row: number): Tower | null
  /** Улучшить башню на клетке. false — если нельзя (нет башни, не хватает золота, последняя ступень) */
  upgrade(col: number, row: number): boolean
  /** Продать башню. Возвращает, сколько золота вернули, или null */
  sell(col: number, row: number): number | null
  /** Кого башня на клетке выбирает целью. false — если нельзя (нет башни, ей нечего выбирать) */
  setTargetMode(col: number, row: number, mode: TargetMode): boolean
  startWave(): boolean
  /** После победы — играть дальше, в бесконечном режиме */
  continueEndless(): void
  setPaused(paused: boolean): void
  setSpeed(speed: number): void

  /** Прошло realDt секунд реального времени: сделать нужное число шагов симуляции */
  advance(realDt: number): void
  /** Один шаг симуляции на dt секунд (для тестов и бота) */
  step(dt: number): void

  /** Группы врагов указанной волны */
  waveGroups(waveNumber: number): readonly WaveGroup[]
  /** Сколько врагов ещё осталось в текущей волне (идут + ещё не вышли) */
  enemiesLeft(): number
}

/** Куда башня смотрит сразу после постройки: вверх, радианы */
const INITIAL_AIM_ANGLE = -Math.PI / 2
/** Смещение от угла клетки к её центру, клеток */
const CELL_CENTER_OFFSET = 0.5
/**
 * Больше стольких секунд игрового времени advance за один вызов не считает (60 шагов).
 * Браузер присылает не больше 0,1 с × скорость 3 = 0,3 с, так что запас втрое
 */
const MAX_PENDING_TIME = 1

function initialState(level: Level): GameState {
  return {
    phase: 'idle',
    wave: 1,
    wavesCleared: 0,
    gold: level.def.startGold,
    lives: level.def.startLives,
    score: 0,
    kills: 0,
    isEndless: false,
    isPaused: false,
    speed: 1,
    time: 0,
    towers: [],
    towersByCell: new Map(),
    enemies: [],
    shots: [],
    spawnQueue: [],
    splitQueue: [],
    waveTime: 0,
    nextId: 1,
  }
}

export function createGame(levelDef: LevelDef): Game {
  const level = createLevel(levelDef)
  const events = createEmitter<GameEvents>()
  const state = initialState(level)
  const world: World = { state, level, emit: events.emit }
  // Накопитель реального времени, секунд: из него «откусываем» шаги по SIMULATION_STEP
  let pendingTime = 0

  const isPlaying = () => state.phase === 'build' || state.phase === 'wave'
  const isInsideField = (col: number, row: number) => isLevelCell(level.def, col, row)

  const isCellFree = (col: number, row: number) =>
    isInsideField(col, row) &&
    !level.blockedCellKeys.has(cellKey(col, row)) &&
    !state.towersByCell.has(cellKey(col, row))

  const towerAt = (col: number, row: number) => state.towersByCell.get(cellKey(col, row))

  function step(dt: number) {
    // Партия не идёт (меню, поражение, победа) — мир стоит
    if (!isPlaying()) return
    state.time += dt
    if (state.phase === 'wave') spawnDueEnemies(world, dt)
    if (!moveEnemies(world, dt)) {
      // Трон пал. Дошедшего врага убираем из списка, иначе он остался бы на поле «мёртвым»
      state.enemies = state.enemies.filter((enemy) => !enemy.isDead)
      return
    }
    updateHealers(world, dt)
    updateBurning(world, dt)
    updateTowers(world, dt)
    updateShots(world, dt)
    spawnSplits(world)

    if (state.shots.some((shot) => shot.isDone)) {
      state.shots = state.shots.filter((shot) => !shot.isDone)
    }
    if (state.enemies.some((enemy) => enemy.isDead)) {
      state.enemies = state.enemies.filter((enemy) => !enemy.isDead)
    }

    if (state.phase === 'wave' && !state.spawnQueue.length && !state.enemies.length) {
      finishWave(world)
    }
  }

  return {
    state,
    level,
    on: events.on,
    isPlaying,
    isInsideField,
    isCellFree,
    towerAt,
    step,

    reset() {
      // Скорость — настройка игрока, а не часть партии: сохраняем её
      const { speed } = state
      // Object.assign, а не новый объект: кто держит ссылку на state, увидит новую партию
      Object.assign(state, initialState(level))
      state.phase = 'build'
      state.speed = speed
      pendingTime = 0
      events.emit('reset', undefined)
    },

    build(towerId, col, row) {
      // Object.hasOwn, а не просто TOWERS[towerId]: иначе id 'constructor' найдёт
      // встроенную функцию объекта вместо башни (см. «прототип» в словарике PLAN.md)
      if (!Object.hasOwn(TOWERS, towerId)) return null
      const def = TOWERS[towerId]
      if (!isPlaying() || !isCellFree(col, row) || state.gold < def.cost) return null
      state.gold -= def.cost
      const tower: Tower = {
        id: state.nextId++,
        def,
        col,
        row,
        x: col + CELL_CENTER_OFFSET,
        y: row + CELL_CENTER_OFFSET,
        tier: 0,
        cooldownLeft: 0,
        aimAngle: INITIAL_AIM_ANGLE,
        targetMode: def.defaultTargetMode,
        // Построена во время волны — сразу в бою, полного возврата нет
        goldSinceLastWave: state.phase === 'build' ? def.cost : 0,
      }
      state.towers.push(tower)
      state.towersByCell.set(cellKey(col, row), tower)
      events.emit('build', tower)
      return tower
    },

    upgrade(col, row) {
      const tower = towerAt(col, row)
      if (!tower || !isPlaying()) return false
      const cost = upgradeCost(tower)
      if (cost === null || state.gold < cost) return false
      state.gold -= cost
      if (state.phase === 'build') tower.goldSinceLastWave += cost
      tower.tier++
      events.emit('upgrade', tower)
      return true
    },

    sell(col, row) {
      const tower = towerAt(col, row)
      if (!tower || !isPlaying()) return null
      const refund = refundFor(tower)
      state.gold += refund
      state.towers.splice(state.towers.indexOf(tower), 1)
      state.towersByCell.delete(cellKey(col, row))
      events.emit('sell', { tower, refund })
      return refund
    },

    setTargetMode(col, row, mode) {
      const tower = towerAt(col, row)
      // includes, а не просто «строка»: метод не верит аргументам (может прийти что угодно)
      if (!tower || !isPlaying() || !tower.def.canChooseTarget || !TARGET_MODES.includes(mode)) {
        return false
      }
      tower.targetMode = mode
      return true
    },

    startWave() {
      if (state.phase !== 'build') return false
      // Всё, что стоит на поле, идёт в бой: полный возврат при продаже кончается
      for (const tower of state.towers) tower.goldSinceLastWave = 0
      state.spawnQueue = buildSpawnQueue(level, state.wave)
      state.waveTime = 0
      state.phase = 'wave'
      state.isPaused = false
      events.emit('waveStart', state.wave)
      return true
    },

    continueEndless() {
      if (state.phase !== 'won') return
      state.isEndless = true
      state.phase = 'build'
      state.wave++
    },

    setPaused(paused) {
      if (isPlaying()) state.isPaused = paused
    },

    setSpeed(speed) {
      // NaN и бесконечность пропускаем: Math.round(NaN) — это NaN, и партия замерла бы навсегда
      if (!Number.isFinite(speed)) return
      state.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.round(speed)))
    },

    advance(realDt) {
      if (!isPlaying() || state.isPaused) return
      // NaN навсегда испортил бы накопитель, а отрицательное время не бывает
      if (!Number.isFinite(realDt) || realDt <= 0) return
      // Один вызов не делает больше MAX_PENDING_TIME секунд игры (тысячи шагов разом
      // повесили бы вкладку). Браузер и сам режет кадр до 0,1 с, так что игрок разницы не видит
      pendingTime = Math.min(pendingTime + realDt * state.speed, MAX_PENDING_TIME)
      while (pendingTime >= SIMULATION_STEP) {
        pendingTime -= SIMULATION_STEP
        step(SIMULATION_STEP)
        // Партия закончилась прямо посреди кадра (трон пал или отбита последняя волна):
        // остаток времени не копим, иначе он «выстрелит» лишними шагами в следующей партии
        if (!isPlaying()) {
          pendingTime = 0
          break
        }
      }
    },

    waveGroups: (waveNumber) => getWaveGroups(level, waveNumber),
    enemiesLeft: () => state.spawnQueue.length + state.enemies.length,
  }
}
