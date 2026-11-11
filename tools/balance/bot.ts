// Бот, который играет сам — без экрана и в тысячи раз быстрее человека.
// Нужен, чтобы проверять баланс: «с такой стратегией на какой волне падает трон?»

import {
  SIMULATION_STEP,
  TOWERS,
  createGame,
  upgradeCost,
  type Game,
  type LevelDef,
  type Tower,
} from '@throne/game'

/** Шаг стратегии: id башни («поставить такую») или 'upgrade' («улучшить слабейшую») */
export type StrategyStep = string

/**
 * Стратегия бота: сначала выполняется `opening`, потом бесконечно по кругу `loop`.
 */
export interface Strategy {
  name: string
  opening: StrategyStep[]
  loop: StrategyStep[]
}

export interface WaveReport {
  wave: number
  lives: number
  livesLost: number
  gold: number
  towers: number
  score: number
}

export interface BotResult {
  strategy: string
  outcome: 'won' | 'lost' | 'stuck'
  waves: WaveReport[]
  score: number
}

/** Шаг, с которым проверяем путь врагов при подсчёте покрытия, в клетках */
const COVERAGE_SAMPLE_STEP = 0.25

/** Предохранитель: сколько шагов стратегии бот делает подряд за один заход, чтобы не зациклиться */
const MAX_SPEND_STEPS = 100

/** Волна не может длиться дольше 10 минут игрового времени: 10 × 60 с × 60 шагов в секунду */
export const MAX_WAVE_STEPS = 36_000

/** Сколько клеток ковра простреливается с клетки (col, row) при дальности range */
export function pathCoverage(game: Game, col: number, row: number, range: number): number {
  const { path } = game.level
  let sampleCount = 0
  for (let distance = 0; distance <= path.length; distance += COVERAGE_SAMPLE_STEP) {
    const [x, y] = path.positionAt(distance)
    if ((x - col - 0.5) ** 2 + (y - row - 0.5) ** 2 <= range * range) sampleCount++
  }
  return sampleCount * COVERAGE_SAMPLE_STEP
}

/** Свободная клетка, откуда башня с такой дальностью накроет больше всего ковра */
export function findBestCell(game: Game, range: number): { col: number; row: number } | null {
  const { cols, rows } = game.level.def
  let bestCell: { col: number; row: number } | null = null
  let bestCoverage = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!game.isCellFree(col, row)) continue
      const coverage = pathCoverage(game, col, row, range)
      if (coverage > bestCoverage) {
        bestCoverage = coverage
        bestCell = { col, row }
      }
    }
  }
  return bestCell
}

/** Башня, которую стоит улучшить: с самой низкой ступенью, при равенстве — первая поставленная */
function weakestTower(game: Game): Tower | null {
  let weakest: Tower | null = null
  for (const tower of game.state.towers) {
    if (upgradeCost(tower) === null) continue
    if (!weakest || tower.tier < weakest.tier) weakest = tower
  }
  return weakest
}

/** Тратит золото по стратегии, пока хватает. Возвращает новый номер шага */
function spendGold(game: Game, strategy: Strategy, stepIndex: number): number {
  for (let attempt = 0; attempt < MAX_SPEND_STEPS; attempt++) {
    const strategyStep =
      stepIndex < strategy.opening.length
        ? strategy.opening[stepIndex]
        : strategy.loop[(stepIndex - strategy.opening.length) % strategy.loop.length]

    if (strategyStep === 'upgrade') {
      const tower = weakestTower(game)
      const cost = tower ? upgradeCost(tower) : null
      if (!tower || cost === null) {
        stepIndex++ // нечего улучшать — пропускаем шаг
        continue
      }
      if (game.state.gold < cost) return stepIndex // копим
      game.upgrade(tower.col, tower.row)
      stepIndex++
      continue
    }

    const def = TOWERS[strategyStep]
    if (!def) throw new Error(`Стратегия «${strategy.name}»: неизвестная башня «${strategyStep}»`)
    const cell = findBestCell(game, def.tiers[0].range)
    if (!cell) {
      stepIndex++ // некуда ставить
      continue
    }
    if (game.state.gold < def.cost) return stepIndex // копим
    game.build(strategyStep, cell.col, cell.row)
    stepIndex++
  }
  return stepIndex
}

/** Сыграть партию ботом */
export function playBot(level: LevelDef, strategy: Strategy, maxWaves = Infinity): BotResult {
  const game = createGame(level)
  game.reset()
  const waves: WaveReport[] = []
  let stepIndex = 0

  const makeResult = (outcome: BotResult['outcome']): BotResult => ({
    strategy: strategy.name,
    outcome,
    waves,
    score: game.state.score,
  })

  while (game.state.wave <= maxWaves) {
    stepIndex = spendGold(game, strategy, stepIndex)
    const wave = game.state.wave
    const livesBefore = game.state.lives
    game.startWave()

    for (let i = 0; i < MAX_WAVE_STEPS && game.state.phase === 'wave'; i++) {
      game.step(SIMULATION_STEP)
    }
    if (game.state.phase === 'wave') return makeResult('stuck')

    const state = game.state
    waves.push({
      wave,
      lives: state.lives,
      livesLost: livesBefore - state.lives,
      gold: state.gold,
      towers: state.towers.length,
      score: state.score,
    })
    if (state.phase === 'lost' || state.phase === 'won') {
      return makeResult(state.phase === 'won' ? 'won' : 'lost')
    }
  }
  return makeResult('stuck')
}

export const STRATEGIES: Strategy[] = [
  {
    name: 'Только лучники',
    opening: ['archer', 'archer', 'archer'],
    loop: ['upgrade', 'archer'],
  },
  {
    name: 'Смешанная',
    opening: ['archer', 'archer', 'mage', 'frost', 'ballista'],
    loop: ['upgrade', 'mage', 'upgrade', 'ballista', 'upgrade', 'archer', 'frost'],
  },
  {
    name: 'Смешанная без баллист',
    opening: ['archer', 'archer', 'mage', 'frost'],
    loop: ['upgrade', 'mage', 'upgrade', 'archer', 'upgrade', 'frost'],
  },
  {
    name: 'Огонь и баллисты',
    opening: ['mage', 'mage'],
    loop: ['ballista', 'upgrade', 'mage', 'upgrade'],
  },
  {
    // Если эта стратегия вдруг станет лучшей — какая-то башня слишком сильная
    name: 'Только баллисты',
    opening: ['ballista'],
    loop: ['ballista', 'upgrade'],
  },
]
