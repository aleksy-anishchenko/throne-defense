// node tools/balance/cannon-waves.ts — стенд реальных составов волн, не полная партия.
import { PLAYABLE_LEVELS, SIMULATION_STEP, TOWERS, createGame } from '@throne/game'
import { findCellFor } from './bot.ts'

const cannon = TOWERS['cannon']
const original = {
  cost: cannon.cost,
  upgradeCosts: cannon.upgradeCosts,
  tiers: cannon.tiers.map(({ damage, cooldown }) => ({ damage, cooldown })),
}
const variants = [
  { name: 'A', damage: [100, 160, 240] },
  { name: 'Слабее A', damage: [85, 145, 220] },
]
const defenses = [
  { name: '2 Пушкаря II + Ловчий', ids: ['cannon', 'cannon', 'trapper'], tier: 1, budget: 680 },
  { name: '2 Пушкаря II + Лучник', ids: ['cannon', 'cannon', 'archer'], tier: 1, budget: 680 },
  {
    name: 'Пушкарь III + Ловчий + Лучник',
    ids: ['cannon', 'trapper', 'archer'],
    tier: 2,
    budget: 610,
  },
  { name: 'Пушкарь III + 2 Лучника', ids: ['cannon', 'archer', 'archer'], tier: 2, budget: 610 },
]

function measure(
  level: (typeof PLAYABLE_LEVELS)[number],
  wave: number,
  defense: (typeof defenses)[number],
) {
  const game = createGame(level)
  game.reset()
  game.state.gold = defense.budget
  game.state.lives = 10000 // Учитываем все прорывы даже после обычного поражения.
  game.state.wave = wave
  for (const id of defense.ids) {
    const cell = findCellFor(game, TOWERS[id])
    if (!cell || !game.build(id, cell.col, cell.row)) throw new Error(`Нет места или золота: ${id}`)
    if (id === 'cannon') {
      for (let tier = 0; tier < defense.tier; tier++) {
        if (!game.upgrade(cell.col, cell.row)) throw new Error('Недостаточно золота для улучшения')
      }
    }
  }
  const spent = defense.budget - game.state.gold
  const initialLives = game.state.lives
  game.startWave()
  let steps = 0
  while (game.state.phase === 'wave' && steps++ < 600 / SIMULATION_STEP) game.step(SIMULATION_STEP)
  if (game.state.phase === 'wave') throw new Error(`Зависшая волна ${wave} в ${level.id}`)
  return { spent, kills: game.state.kills, livesLost: initialLives - game.state.lives }
}

try {
  Object.assign(cannon, { cost: 180, upgradeCosts: [120, 180] })
  for (const variant of variants) {
    cannon.tiers.forEach((tier, index) =>
      Object.assign(tier, { damage: variant.damage[index], cooldown: [4, 3.8, 3.6][index] }),
    )
    console.log(`\n${variant.name}: ${variant.damage.join('/')}`)
    for (const wave of [10, 15, 19]) {
      console.log(`Волна ${wave} (реальный состав, искусственные бюджет и здоровье трона)`)
      for (const defense of defenses) {
        const reports = PLAYABLE_LEVELS.map((level) => measure(level, wave, defense))
        const average = (key: 'kills' | 'livesLost') =>
          (reports.reduce((sum, report) => sum + report[key], 0) / reports.length).toFixed(1)
        console.log(
          `  ${defense.name}: бюджет ${defense.budget}, вложено ${reports[0].spent}; ` +
            `убито ${average('kills')}, потеряно жизней ${average('livesLost')} в среднем`,
        )
      }
    }
  }
} finally {
  Object.assign(cannon, { cost: original.cost, upgradeCosts: original.upgradeCosts })
  cannon.tiers.forEach((tier, index) => Object.assign(tier, original.tiers[index]))
}
