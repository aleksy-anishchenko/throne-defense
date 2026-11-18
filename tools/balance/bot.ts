// Бот, который играет сам — без экрана и в тысячи раз быстрее человека.
// Нужен, чтобы проверять баланс: «с такой стратегией на какой волне падает трон?»

import {
  SIMULATION_STEP,
  TOWERS,
  createGame,
  investedGold,
  rewardStats,
  upgradeCost,
  type Game,
  type LevelDef,
  type Tower,
  type TowerDef,
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
  /** coverage — старый бот, compatible — разводит огонь с холодом и сетями */
  placement?: 'coverage' | 'compatible'
}

export interface WaveReport {
  wave: number
  lives: number
  livesLost: number
  gold: number
  towers: number
  score: number
  /** Деньги плюс стоимость башен: позволяет увидеть отдачу Казны без зависимости от покупок */
  wealth: number
}

export interface BotResult {
  strategy: string
  outcome: 'won' | 'lost' | 'stuck'
  waves: WaveReport[]
  score: number
  wavesCleared: number
}

/** Шаг, с которым проверяем путь врагов при подсчёте покрытия, в клетках */
const COVERAGE_SAMPLE_STEP = 0.25

/** Предохранитель: сколько шагов стратегии бот делает подряд за один заход, чтобы не зациклиться */
const MAX_SPEND_STEPS = 100

/** Волна не может длиться дольше 10 минут игрового времени: 10 × 60 с × 60 шагов в секунду */
export const MAX_WAVE_STEPS = 36_000

/** Между волнами игрок может дождаться готовности башен; бот получает те же шесть секунд. */
const INTERMISSION_STEPS = Math.ceil(6 / SIMULATION_STEP)

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

type Cell = { col: number; row: number }

/** Свободная клетка, у которой больше всего башен, которые ускоряет Звонарь, в радиусе range */
function findCellNearTowers(game: Game, range: number): Cell | null {
  const { cols, rows } = game.level.def
  let bestCell: Cell | null = null
  let bestCount = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!game.isCellFree(col, row)) continue
      const count = game.state.towers.filter(
        (tower) =>
          tower.def.takesFireRateBonus &&
          (tower.x - col - 0.5) ** 2 + (tower.y - row - 0.5) ** 2 <= range ** 2,
      ).length
      if (count > bestCount) {
        bestCount = count
        bestCell = { col, row }
      }
    }
  }
  return bestCell
}

/** Свободная клетка, откуда меньше всего видно ковёр: для Казны, чтобы не занимать хорошие места */
function findCellAwayFromPath(game: Game): Cell | null {
  const { cols, rows } = game.level.def
  let bestCell: Cell | null = null
  let bestCoverage = Infinity
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!game.isCellFree(col, row)) continue
      // Насколько клетка хороша для лучника: чем меньше, тем меньше жалко отдать её Казне
      const coverage = pathCoverage(game, col, row, TOWERS['archer'].tiers[0].range)
      if (coverage < bestCoverage) {
        bestCoverage = coverage
        bestCell = { col, row }
      }
    }
  }
  return bestCell
}

/**
 * Огонь, холод и сети разводим по участкам дороги. Колдуну полезно накрывать тот же
 * участок, что и союзникам. Это только выбор клетки ботом, правила игры не меняются.
 */
export function findCompatibleCell(game: Game, def: TowerDef): Cell | null {
  const range = def.tiers[0].range
  const isControl = (id: string) => id === 'frost' || id === 'trapper'
  const conflicts = game.state.towers.filter((tower) =>
    def.id === 'mage' ? isControl(tower.def.id) : isControl(def.id) && tower.def.id === 'mage',
  )
  const allies =
    def.id === 'warlock'
      ? game.state.towers.filter((tower) => {
          const stats = tower.def.tiers[tower.tier]
          return stats.damage > 0 || (stats.burnDamage ?? 0) > 0
        })
      : []
  if (!conflicts.length && !allies.length) return findBestCell(game, range)
  const samples: { x: number; y: number; weight: number }[] = []
  for (let distance = 0; distance <= game.level.path.length; distance += COVERAGE_SAMPLE_STEP) {
    const [x, y] = game.level.path.positionAt(distance)
    const covers = (tower: Tower) =>
      (tower.x - x) ** 2 + (tower.y - y) ** 2 <= tower.def.tiers[tower.tier].range ** 2
    const weight = conflicts.some(covers)
      ? 0.2
      : 1 + Math.min(2, allies.filter(covers).length) * 0.5
    samples.push({ x, y, weight })
  }
  let best: Cell | null = null
  let bestScore = 0
  for (let row = 0; row < game.level.def.rows; row++) {
    for (let col = 0; col < game.level.def.cols; col++) {
      if (!game.isCellFree(col, row)) continue
      let score = 0
      for (const sample of samples) {
        if ((sample.x - col - 0.5) ** 2 + (sample.y - row - 0.5) ** 2 <= range ** 2)
          score += sample.weight
      }
      if (score > bestScore) {
        best = { col, row }
        bestScore = score
      }
    }
  }
  return best
}

/** Куда бот ставит башню: стреляющую — к ковру, Звонаря — к башням, Казну — подальше от ковра */
export function findCellFor(
  game: Game,
  def: TowerDef,
  strategy: Pick<Strategy, 'placement'> = {},
): Cell | null {
  const stats = def.tiers[0]
  if (def.fire)
    return strategy.placement === 'coverage'
      ? findBestCell(game, stats.range)
      : findCompatibleCell(game, def)
  if (stats.fireRateBonus) return findCellNearTowers(game, stats.range)
  return findCellAwayFromPath(game)
}

/** Башня, которую стоит улучшить: с самой низкой ступенью, при равенстве — первая поставленная */
function weakestTower(game: Game): Tower | null {
  let weakest: Tower | null = null
  for (const tower of game.state.towers) {
    if (upgradeCost(tower, rewardStats(game.state).upgradeCostMultiplier) === null) continue
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
      const cost = tower ? upgradeCost(tower, rewardStats(game.state).upgradeCostMultiplier) : null
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
    const cell = findCellFor(game, def, strategy)
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
export function playBot(
  level: LevelDef,
  strategy: Strategy,
  maxWaves = Infinity,
  onWaveStart?: (game: Game) => void,
): BotResult {
  const game = createGame(level)
  game.reset()
  const waves: WaveReport[] = []
  let stepIndex = 0

  const makeResult = (outcome: BotResult['outcome']): BotResult => ({
    strategy: strategy.name,
    outcome,
    waves,
    score: game.state.score,
    wavesCleared: game.state.wavesCleared,
  })

  while (game.state.wave <= maxWaves) {
    stepIndex = spendGold(game, strategy, stepIndex)
    for (let i = 0; i < INTERMISSION_STEPS; i++) game.step(SIMULATION_STEP)
    const wave = game.state.wave
    const livesBefore = game.state.lives
    onWaveStart?.(game)
    game.startWave()

    for (let i = 0; i < MAX_WAVE_STEPS && game.state.phase === 'wave'; i++) {
      game.step(SIMULATION_STEP)
    }
    if (game.state.phase === 'wave') return makeResult('stuck')
    if (game.state.phase === 'reward') {
      const rewardId = game.state.pendingReward?.options[0]
      if (!rewardId || !game.chooseReward(rewardId)) return makeResult('stuck')
    }

    const state = game.state
    waves.push({
      wave,
      lives: state.lives,
      livesLost: livesBefore - state.lives,
      gold: state.gold,
      towers: state.towers.length,
      score: state.score,
      wealth:
        state.gold +
        state.towers.reduce(
          (sum, tower) => sum + investedGold(tower.def, tower.tier, tower.aspectId),
          0,
        ),
    })
    if (state.phase === 'lost' || state.phase === 'won') {
      return makeResult(state.phase === 'won' ? 'won' : 'lost')
    }
  }
  return makeResult('stuck')
}

export const STRATEGIES: Strategy[] = [
  {
    name: 'Экономика и поддержка',
    opening: ['archer', 'archer', 'treasury', 'ballista', 'frost'],
    loop: ['upgrade', 'mage', 'upgrade', 'treasury', 'upgrade', 'ballista', 'warlock', 'bell'],
  },
  {
    name: 'Только лучники',
    opening: ['archer', 'archer', 'archer'],
    loop: ['upgrade', 'archer'],
  },
  { name: 'Только огневики', opening: ['mage', 'mage'], loop: ['upgrade', 'mage'] },
  { name: 'Только пушкари', opening: ['cannon'], loop: ['upgrade', 'cannon'] },
  {
    name: 'Смешанная (старый бот)',
    opening: ['archer', 'archer', 'mage', 'frost', 'ballista'],
    loop: ['upgrade', 'mage', 'upgrade', 'ballista', 'upgrade', 'archer', 'frost'],
    placement: 'coverage',
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
    name: 'Смешанная со Звонарями',
    opening: ['archer', 'archer', 'mage', 'frost', 'ballista'],
    loop: ['upgrade', 'mage', 'bell', 'upgrade', 'ballista', 'upgrade', 'archer', 'frost'],
  },
  {
    name: 'Смешанная с Казной',
    opening: ['archer', 'archer', 'treasury', 'mage', 'frost'],
    loop: ['upgrade', 'mage', 'upgrade', 'ballista', 'treasury', 'upgrade', 'archer', 'frost'],
  },
  {
    name: 'Смешанная с Пушкарями',
    opening: ['archer', 'archer', 'mage', 'frost', 'cannon'],
    loop: ['upgrade', 'mage', 'upgrade', 'ballista', 'cannon', 'upgrade', 'archer', 'frost'],
  },
  {
    name: 'Смешанная с Ловчими',
    opening: ['archer', 'archer', 'mage', 'frost', 'trapper'],
    loop: ['upgrade', 'mage', 'upgrade', 'ballista', 'trapper', 'upgrade', 'archer', 'frost'],
  },
  {
    name: 'Смешанная с Колдунами',
    opening: ['archer', 'archer', 'mage', 'frost', 'warlock'],
    loop: ['upgrade', 'mage', 'upgrade', 'ballista', 'warlock', 'upgrade', 'archer', 'frost'],
  },
  {
    name: 'Смешанная со всеми новыми',
    opening: ['archer', 'archer', 'mage', 'trapper', 'warlock'],
    loop: ['upgrade', 'mage', 'upgrade', 'ballista', 'cannon', 'upgrade', 'trapper', 'warlock'],
  },
  {
    // Если эта стратегия вдруг станет лучшей — какая-то башня слишком сильная
    name: 'Только баллисты',
    opening: ['ballista'],
    loop: ['ballista', 'upgrade'],
  },
]
