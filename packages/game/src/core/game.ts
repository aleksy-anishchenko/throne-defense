// Партия целиком: состояние + действия игрока + ход времени.
// Здесь нет ни DOM, ни звука, ни рисования — только правила.
// Наружу игра сообщает о происходящем событиями (game.on('kill', ...)).

import { STEP } from '../data/balance.ts'
import { TOWERS } from '../data/towers.ts'
import { moveEnemies } from '../systems/enemies.ts'
import { refundFor, updateTowers, upgradeCost } from '../systems/towers.ts'
import { buildQueue, spawnDue, waveCleared, waveGroups } from '../systems/waves.ts'
import { updateShots } from '../systems/combat.ts'
import type { GameEvents, GameState, Level, LevelDef, Tower, WaveGroup, World } from '../types.ts'
import { createEmitter, type Emitter } from './events.ts'
import { cellKey, createLevel } from './level.ts'

export interface Game {
  readonly state: GameState
  readonly level: Level
  /** Подписаться на событие игры */
  readonly on: Emitter<GameEvents>['on']

  /** Начать новую партию */
  reset(): void
  /** Можно ли поставить башню на клетку (без учёта золота) */
  isFree(c: number, r: number): boolean
  towerAt(c: number, r: number): Tower | undefined
  /** Поставить башню. null — если нельзя (клетка занята, не хватает золота, партия не идёт) */
  build(towerId: string, c: number, r: number): Tower | null
  upgrade(c: number, r: number): boolean
  /** Продать башню. Возвращает, сколько золота вернули, или null */
  sell(c: number, r: number): number | null
  startWave(): boolean
  /** После победы — играть дальше, в бесконечном режиме */
  continueEndless(): void
  setPaused(paused: boolean): void
  setSpeed(speed: number): void

  /** Прошло realDt секунд реального времени: сделать нужное число шагов симуляции */
  advance(realDt: number): void
  /** Один шаг симуляции на dt секунд (для тестов и бота) */
  step(dt: number): void

  waveGroups(n: number): readonly WaveGroup[]
  /** Сколько врагов ещё осталось в текущей волне (идут + ещё не вышли) */
  enemiesLeft(): number
}

function initialState(level: Level): GameState {
  return {
    phase: 'idle',
    wave: 1,
    cleared: 0,
    gold: level.def.startGold,
    lives: level.def.startLives,
    score: 0,
    kills: 0,
    endless: false,
    paused: false,
    speed: 1,
    time: 0,
    towers: [],
    grid: new Map(),
    enemies: [],
    shots: [],
    queue: [],
    waveT: 0,
    nextId: 1,
  }
}

export function createGame(levelDef: LevelDef): Game {
  const level = createLevel(levelDef)
  const events = createEmitter<GameEvents>()
  const state = initialState(level)
  const world: World = { state, level, emit: events.emit }
  // Накопитель реального времени: из него «откусываем» шаги по STEP
  let acc = 0

  const playing = () => state.phase === 'build' || state.phase === 'wave'
  const inGrid = (c: number, r: number) =>
    c >= 0 && c < level.def.cols && r >= 0 && r < level.def.rows

  const isFree = (c: number, r: number) =>
    inGrid(c, r) && !level.blocked.has(cellKey(c, r)) && !state.grid.has(cellKey(c, r))

  const towerAt = (c: number, r: number) => state.grid.get(cellKey(c, r))

  function step(dt: number) {
    // Партия не идёт (меню, поражение, победа) — мир стоит
    if (!playing()) return
    state.time += dt
    if (state.phase === 'wave') spawnDue(world, dt)
    if (!moveEnemies(world, dt)) return // трон пал
    updateTowers(world, dt)
    updateShots(world, dt)

    if (state.shots.some((s) => s.done)) state.shots = state.shots.filter((s) => !s.done)
    if (state.enemies.some((e) => e.dead)) state.enemies = state.enemies.filter((e) => !e.dead)

    if (state.phase === 'wave' && !state.queue.length && !state.enemies.length) {
      waveCleared(world)
    }
  }

  return {
    state,
    level,
    on: events.on,
    isFree,
    towerAt,
    step,

    reset() {
      // Скорость — настройка игрока, а не часть партии: сохраняем её
      const { speed } = state
      // Object.assign, а не новый объект: кто держит ссылку на state, увидит новую партию
      Object.assign(state, initialState(level))
      state.phase = 'build'
      state.speed = speed
      acc = 0
      events.emit('reset', undefined)
    },

    build(towerId, c, r) {
      const def = TOWERS[towerId]
      if (!def || !playing() || !isFree(c, r) || state.gold < def.cost) return null
      state.gold -= def.cost
      const tower: Tower = {
        id: state.nextId++,
        def,
        c,
        r,
        x: c + 0.5,
        y: r + 0.5,
        lv: 0,
        cd: 0,
        aim: -Math.PI / 2,
      }
      state.towers.push(tower)
      state.grid.set(cellKey(c, r), tower)
      events.emit('build', tower)
      return tower
    },

    upgrade(c, r) {
      const t = towerAt(c, r)
      if (!t || !playing()) return false
      const cost = upgradeCost(t)
      if (cost === null || state.gold < cost) return false
      state.gold -= cost
      t.lv++
      events.emit('upgrade', t)
      return true
    },

    sell(c, r) {
      const t = towerAt(c, r)
      if (!t || !playing()) return null
      const refund = refundFor(t.def, t.lv)
      state.gold += refund
      state.towers.splice(state.towers.indexOf(t), 1)
      state.grid.delete(cellKey(c, r))
      events.emit('sell', { tower: t, refund })
      return refund
    },

    startWave() {
      if (state.phase !== 'build') return false
      state.queue = buildQueue(level, state.wave)
      state.waveT = 0
      state.phase = 'wave'
      state.paused = false
      events.emit('waveStart', state.wave)
      return true
    },

    continueEndless() {
      if (state.phase !== 'won') return
      state.endless = true
      state.phase = 'build'
      state.wave++
    },

    setPaused(paused) {
      if (playing()) state.paused = paused
    },

    setSpeed(speed) {
      state.speed = Math.max(1, Math.min(3, Math.round(speed)))
    },

    advance(realDt) {
      if (!playing() || state.paused) return
      acc += realDt * state.speed
      while (acc >= STEP) {
        acc -= STEP
        step(STEP)
        if (!playing()) {
          acc = 0
          break
        }
      }
    },

    waveGroups: (n) => waveGroups(level, n),
    enemiesLeft: () => state.queue.length + state.enemies.length,
  }
}
