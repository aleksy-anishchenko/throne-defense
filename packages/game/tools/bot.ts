// Бот, который играет сам — без экрана и в тысячи раз быстрее человека.
// Нужен, чтобы проверять баланс: «с такой стратегией на какой волне падает трон?»

import {
  STEP,
  TOWERS,
  createGame,
  upgradeCost,
  type Game,
  type LevelDef,
  type Tower,
} from '../src/index.ts'

/**
 * Стратегия — список шагов: id башни («поставить такую») или 'up' («улучшить слабейшую»).
 * Сначала выполняется `opening`, потом бесконечно по кругу `loop`.
 */
export interface Strategy {
  name: string
  opening: string[]
  loop: string[]
}

export interface WaveReport {
  wave: number
  lives: number
  lost: number
  gold: number
  towers: number
  score: number
}

export interface BotResult {
  strategy: string
  result: 'won' | 'lost' | 'stuck'
  waves: WaveReport[]
  score: number
}

/** Сколько клеток ковра простреливается с клетки (c, r) при дальности range */
export function coverage(game: Game, c: number, r: number, range: number): number {
  const { path } = game.level
  const step = 0.25
  let n = 0
  for (let d = 0; d <= path.length; d += step) {
    const [x, y] = path.posAt(d)
    if ((x - c - 0.5) ** 2 + (y - r - 0.5) ** 2 <= range * range) n++
  }
  return n * step
}

/** Свободная клетка, откуда башня с такой дальностью накроет больше всего ковра */
export function bestCell(game: Game, range: number): { c: number; r: number } | null {
  const { cols, rows } = game.level.def
  let best: { c: number; r: number } | null = null
  let bestCov = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!game.isFree(c, r)) continue
      const cov = coverage(game, c, r, range)
      if (cov > bestCov) {
        bestCov = cov
        best = { c, r }
      }
    }
  }
  return best
}

/** Башня, которую стоит улучшить: с самым низким уровнем, при равенстве — первая поставленная */
function weakestTower(game: Game): Tower | null {
  let best: Tower | null = null
  for (const t of game.state.towers) {
    if (upgradeCost(t) === null) continue
    if (!best || t.lv < best.lv) best = t
  }
  return best
}

/** Тратит золото по стратегии, пока хватает. Возвращает новый номер шага */
function spend(game: Game, s: Strategy, stepNo: number): number {
  for (let guard = 0; guard < 100; guard++) {
    const item =
      stepNo < s.opening.length
        ? s.opening[stepNo]
        : s.loop[(stepNo - s.opening.length) % s.loop.length]

    if (item === 'up') {
      const t = weakestTower(game)
      const cost = t && upgradeCost(t)
      if (!t || cost === null) {
        stepNo++ // нечего улучшать — пропускаем шаг
        continue
      }
      if (game.state.gold < cost) return stepNo // копим
      game.upgrade(t.c, t.r)
      stepNo++
      continue
    }

    const def = TOWERS[item]
    if (!def) throw new Error(`Стратегия «${s.name}»: неизвестная башня «${item}»`)
    const cell = bestCell(game, def.levels[0].range)
    if (!cell) {
      stepNo++ // некуда ставить
      continue
    }
    if (game.state.gold < def.cost) return stepNo // копим
    game.build(item, cell.c, cell.r)
    stepNo++
  }
  return stepNo
}

/** Сыграть партию ботом */
export function playBot(level: LevelDef, s: Strategy, maxWaves = Infinity): BotResult {
  const game = createGame(level)
  game.reset()
  const waves: WaveReport[] = []
  let stepNo = 0

  while (game.state.wave <= maxWaves) {
    stepNo = spend(game, s, stepNo)
    const wave = game.state.wave
    const livesBefore = game.state.lives
    game.startWave()

    // Волна не может длиться дольше 10 минут игрового времени
    for (let i = 0; i < 36_000 && game.state.phase === 'wave'; i++) game.step(STEP)
    if (game.state.phase === 'wave') {
      return { strategy: s.name, result: 'stuck', waves, score: game.state.score }
    }

    const st = game.state
    waves.push({
      wave,
      lives: st.lives,
      lost: livesBefore - st.lives,
      gold: st.gold,
      towers: st.towers.length,
      score: st.score,
    })
    if (st.phase === 'over' || st.phase === 'won') {
      return {
        strategy: s.name,
        result: st.phase === 'won' ? 'won' : 'lost',
        waves,
        score: st.score,
      }
    }
  }
  return { strategy: s.name, result: 'stuck', waves, score: game.state.score }
}

export const STRATEGIES: Strategy[] = [
  {
    name: 'Только лучники',
    opening: ['archer', 'archer', 'archer'],
    loop: ['up', 'archer'],
  },
  {
    name: 'Смешанная',
    opening: ['archer', 'archer', 'mage', 'frost', 'ballista'],
    loop: ['up', 'mage', 'up', 'ballista', 'up', 'archer', 'frost'],
  },
  {
    name: 'Смешанная без баллист',
    opening: ['archer', 'archer', 'mage', 'frost'],
    loop: ['up', 'mage', 'up', 'archer', 'up', 'frost'],
  },
  {
    name: 'Огонь и баллисты',
    opening: ['mage', 'mage'],
    loop: ['ballista', 'up', 'mage', 'up'],
  },
  {
    // Если эта стратегия вдруг станет лучшей — какая-то башня слишком сильная
    name: 'Только баллисты',
    opening: ['ballista'],
    loop: ['ballista', 'up'],
  },
]
