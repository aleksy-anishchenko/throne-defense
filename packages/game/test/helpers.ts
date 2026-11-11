import { STEP, createGame, type Game, type GameEvents } from '../src/index.ts'
import { spawn } from '../src/systems/enemies.ts'
import { throneHall } from '../src/levels/throne-hall.ts'
import type { Enemy, World } from '../src/types.ts'

/** Новая партия на «Тронном зале», уже начатая (фаза build) */
export function newGame(): Game {
  const game = createGame(throneHall)
  game.reset()
  return game
}

/** Мир для прямого вызова систем (hurt, spawn и т.п.) */
export function worldOf(game: Game): World {
  return { state: game.state, level: game.level, emit: () => {} }
}

/** Выпустить врага и поставить его в точку пути d */
export function placeEnemy(game: Game, id: string, d = 0): Enemy {
  spawn(worldOf(game), id)
  const e = game.state.enemies[game.state.enemies.length - 1]
  e.d = d
  ;[e.x, e.y] = game.level.path.posAt(d)
  return e
}

/** Шагать, пока не выполнится условие (или не кончится лимит) */
export function stepUntil(game: Game, done: () => boolean, maxSeconds = 600): void {
  for (let i = 0; i < maxSeconds / STEP && !done(); i++) game.step(STEP)
}

/** Записывать события игры */
export function recordEvents(game: Game): (keyof GameEvents)[] {
  const log: (keyof GameEvents)[] = []
  const types: (keyof GameEvents)[] = [
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
  for (const t of types) game.on(t, () => log.push(t))
  return log
}
