// node tools/balance/cannon-budget.ts — одинаковый доступный бюджет и поддержка.
import { PLAYABLE_LEVELS, TOWERS, createGame } from '@throne/game'
import { findCellFor } from './bot.ts'
import { STREAMS, measureDefense, type Placement } from './towers.ts'

const cannon = TOWERS['cannon']
const original = {
  cost: cannon.cost,
  upgradeCosts: cannon.upgradeCosts,
  tiers: cannon.tiers.map(({ damage, cooldown }) => ({ damage, cooldown })),
}
const candidates = [
  { name: 'A', damage: [100, 160, 240] },
  { name: 'Слабее A', damage: [85, 145, 220] },
]
const defenses = [
  { name: '2 Пушкаря + Ловчий', towers: ['cannon', 'cannon', 'trapper'] },
  { name: '2 Пушкаря + Лучник', towers: ['cannon', 'cannon', 'archer'] },
  { name: '2 Пушкаря', towers: ['cannon', 'cannon'] },
]
const budget = 440

function place(level: (typeof PLAYABLE_LEVELS)[number], ids: string[]): Placement[] {
  const game = createGame(level)
  game.reset()
  game.state.gold = budget
  return ids.map((id) => {
    const def = TOWERS[id]
    const cell = findCellFor(game, def)
    if (!cell || !game.build(id, cell.col, cell.row)) {
      throw new Error(`Не удалось построить ${id} за бюджет ${budget} в ${level.id}`)
    }
    return { towerId: id, ...cell }
  })
}

try {
  Object.assign(cannon, { cost: 180, upgradeCosts: [120, 180] })
  for (const candidate of candidates) {
    cannon.tiers.forEach((tier, index) =>
      Object.assign(tier, { damage: candidate.damage[index], cooldown: [4, 3.8, 3.6][index] }),
    )
    console.log(`\n${candidate.name}: удар ${candidate.damage.join('/')}, бюджет ${budget}`)
    for (const streamName of ['плотная толпа', 'лазутчики', 'огры']) {
      const stream = STREAMS.find((entry) => entry.name === streamName)!
      for (const wave of [5, 10]) {
        console.log(`  ${streamName}, здоровье волны ${wave}`)
        for (const defense of defenses) {
          const reports = PLAYABLE_LEVELS.map((level) =>
            measureDefense(level, place(level, defense.towers), stream, wave),
          )
          const average = (key: 'kills' | 'leaks' | 'livesLost') =>
            (reports.reduce((sum, report) => sum + report[key], 0) / reports.length).toFixed(1)
          console.log(
            `    ${defense.name}: вложено ${reports[0].spentGold}; ` +
              `убито ${average('kills')}, пропущено ${average('leaks')}, ` +
              `потеряно жизней ${average('livesLost')} (среднее шести залов)`,
          )
        }
      }
    }
  }
} finally {
  Object.assign(cannon, { cost: original.cost, upgradeCosts: original.upgradeCosts })
  cannon.tiers.forEach((tier, index) => Object.assign(tier, original.tiers[index]))
}
