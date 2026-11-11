import { SIMULATION_STEP, createGame, type Game, type GameEvents } from '../src/index.ts'
import { spawnEnemy } from '../src/systems/enemies.ts'
import { throneHall } from '../src/levels/throne-hall.ts'
import type { Enemy, World } from '../src/types.ts'

/** Новая партия на «Тронном зале», уже начатая (фаза build) */
export function newGame(): Game {
  const game = createGame(throneHall)
  game.reset()
  return game
}

/** Мир для прямого вызова систем (damageEnemy, spawnEnemy и т.п.) */
export function worldOf(game: Game): World {
  return { state: game.state, level: game.level, emit: () => {} }
}

/** Выпустить врага и поставить его в точку пути pathDistance */
export function placeEnemy(game: Game, enemyId: string, pathDistance = 0): Enemy {
  spawnEnemy(worldOf(game), enemyId)
  const enemy = game.state.enemies[game.state.enemies.length - 1]
  enemy.pathDistance = pathDistance
  const [x, y] = game.level.path.positionAt(pathDistance)
  enemy.x = x
  enemy.y = y
  return enemy
}

/**
 * Шагать, пока не выполнится условие. Не дождались за maxSeconds игрового времени — ошибка:
 * иначе зависшая волна молча считалась бы «дошагали»
 */
export function stepUntil(game: Game, isDone: () => boolean, maxSeconds = 600): void {
  for (let i = 0; i < maxSeconds / SIMULATION_STEP; i++) {
    if (isDone()) return
    game.step(SIMULATION_STEP)
  }
  if (!isDone()) throw new Error(`stepUntil: условие не выполнилось за ${maxSeconds} с игры`)
}

/**
 * Подписывается на основные события и возвращает массив, в который по порядку добавляются их названия.
 * Частые события (fire, hit, splash) не пишем — иначе в тестах слишком много шума.
 */
export function recordEvents(game: Game): (keyof GameEvents)[] {
  const recordedEvents: (keyof GameEvents)[] = []
  const eventTypes: (keyof GameEvents)[] = [
    'build',
    'upgrade',
    'sell',
    'waveStart',
    'waveCleared',
    'kill',
    'leak',
    'victory',
    'defeat',
  ]
  for (const eventType of eventTypes) game.on(eventType, () => recordedEvents.push(eventType))
  return recordedEvents
}
