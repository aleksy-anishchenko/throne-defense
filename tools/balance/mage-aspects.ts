import { PLAYABLE_LEVELS, type LevelDef, type MageAspectId, type Point } from '@throne/game'
import { measureWaveDefense, type Placement } from './towers.ts'

// Порядок вдоль ковра закреплён. Изменение эвристики расстановки бота не сдвинет стражей.
interface Layout {
  firstMage: Point
  secondMage: Point
  archer: Point
  ballista: Point
  extraMage: Point
  extraBallista: Point
}

const layouts: Record<string, Layout> = {
  'throne-hall': {
    firstMage: [4, 5],
    secondMage: [4, 4],
    archer: [3, 4],
    ballista: [3, 5],
    extraMage: [2, 7],
    extraBallista: [2, 4],
  },
  'marble-hall': {
    firstMage: [2, 5],
    secondMage: [2, 4],
    archer: [3, 4],
    ballista: [3, 5],
    extraMage: [4, 7],
    extraBallista: [4, 4],
  },
  svetlitsa: {
    firstMage: [2, 5],
    secondMage: [2, 4],
    archer: [3, 7],
    ballista: [3, 4],
    extraMage: [4, 7],
    extraBallista: [3, 5],
  },
  'anubis-temple': {
    firstMage: [4, 5],
    secondMage: [4, 4],
    archer: [3, 7],
    ballista: [3, 5],
    extraMage: [2, 7],
    extraBallista: [4, 7],
  },
}

interface Purchase {
  name: string
  first?: MageAspectId
  second?: MageAspectId
  extra?: 'ballista' | 'mage'
}

const purchases: readonly Purchase[] = [
  { name: 'Масло → синий', first: 'boiling-oil', second: 'wildfire' },
  { name: 'Два синих', first: 'wildfire', second: 'wildfire' },
  { name: 'Два масла', first: 'boiling-oil', second: 'boiling-oil' },
  { name: 'Ещё Баллиста II', extra: 'ballista' },
  { name: 'Ещё Огневик III', extra: 'mage' },
]

function place(towerId: string, [col, row]: Point, tier: number, aspectId?: string): Placement {
  return { towerId, col, row, tier, aspectId }
}

const firstWave = 8
const lastWave = 15

export function measureMageAspects(level: LevelDef) {
  const layout = layouts[level.id]
  if (!layout) throw new Error(`Для зала «${level.name}» нужны контрольные позиции Огневиков`)
  const results = purchases.map(({ name, first, second, extra }) => {
    const placements = [
      place('mage', layout.firstMage, 2, first),
      place('mage', layout.secondMage, 2, second),
      place('archer', layout.archer, 2, 'ricochet'),
      place('ballista', layout.ballista, 1),
    ]
    if (extra === 'ballista') placements.push(place(extra, layout.extraBallista, 1))
    if (extra === 'mage') placements.push(place(extra, layout.extraMage, 2))

    const result = { name, spentGold: 0, kills: 0, leaks: 0, livesLost: 0 }
    for (let wave = firstWave; wave <= lastWave; wave++) {
      const report = measureWaveDefense(level, placements, wave)
      result.spentGold = report.spentGold
      result.kills += report.kills
      result.leaks += report.leaks
      result.livesLost += report.livesLost
    }
    return result
  })
  if (results.some((result) => result.spentGold !== results[0].spentGold)) {
    throw new Error(
      `Разные затраты в зале «${level.name}»: ${results.map((r) => `${r.name} — ${r.spentGold}`).join(', ')}`,
    )
  }
  return results
}

if (import.meta.main) {
  console.log(
    `\nОгневик. Отдельные волны ${firstWave}–${lastWave}, Лучник с Рикошетом и Баллиста II в каждой расстановке.`,
  )
  const rows = PLAYABLE_LEVELS.flatMap((level) =>
    measureMageAspects(level).map((row) => ({ hall: level.name, ...row })),
  )
  const totals = purchases.map(({ name }) => {
    const matching = rows.filter((row) => row.name === name)
    const total = {
      hall: 'Все залы',
      name,
      spentGold: matching[0].spentGold,
      kills: 0,
      leaks: 0,
      livesLost: 0,
    }
    for (const result of matching) {
      total.kills += result.kills
      total.leaks += result.leaks
      total.livesLost += result.livesLost
    }
    return total
  })
  console.table(
    [...rows, ...totals].map((result) => ({
      зал: result.hall,
      покупка: result.name,
      золото: result.spentGold,
      убито: result.kills,
      прошло: result.leaks,
      'урон трону': result.livesLost,
    })),
  )
}
