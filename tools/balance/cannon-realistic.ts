// node tools/balance/cannon-realistic.ts — стенд волн с бюджетом из честной партии бота.
import { PLAYABLE_LEVELS, SIMULATION_STEP, TOWERS, createGame } from '@throne/game'
import { findCellFor, playBot, type Strategy } from './bot.ts'

const reference: Strategy = {
  name: 'Казна и баллисты',
  opening: ['archer', 'archer', 'treasury', 'ballista', 'frost'],
  loop: ['upgrade', 'ballista', 'upgrade', 'treasury', 'upgrade', 'ballista', 'warlock', 'bell'],
}
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
const patterns = [
  { name: 'Пушкари + Ловчий', support: 'trapper' },
  { name: 'Пушкари + Лучник', support: 'archer' },
]

function experiment(
  level: (typeof PLAYABLE_LEVELS)[number],
  wave: number,
  budget: number,
  support: string,
) {
  const game = createGame(level)
  game.reset()
  game.state.gold = budget
  game.state.lives = 10000
  game.state.wave = wave
  // Одинаковая последовательность, чтобы разница возникала от выбранной поддержки и параметров.
  const lineup = [
    ['archer', 1],
    ['ballista', 1],
    ['cannon', 1],
    [support, 0],
    ['cannon', 1],
    ['ballista', 1],
    ['archer', 1],
    ['frost', 0],
    ['warlock', 0],
    ['cannon', 1],
    ['ballista', 1],
    ['archer', 1],
  ] as const
  for (const [id, tier] of lineup) {
    const def = TOWERS[id]
    const cell = findCellFor(game, def)
    if (!cell || !game.build(id, cell.col, cell.row)) continue
    for (let i = 0; i < tier; i++) if (!game.upgrade(cell.col, cell.row)) break
  }
  // Потратить остаток на улучшения уже построенных башен, затем на дополнительных лучников.
  // Не учитываем стоимость денег, полученных в ходе волны.
  for (const tower of game.state.towers) {
    while (tower.tier < tower.def.tiers.length - 1) {
      if (!game.upgrade(tower.col, tower.row)) break
    }
  }
  while (game.state.gold >= TOWERS['archer'].cost) {
    const cell = findCellFor(game, TOWERS['archer'])
    if (!cell || !game.build('archer', cell.col, cell.row)) break
  }
  const spent = budget - game.state.gold
  game.startWave()
  let steps = 0
  while (game.state.phase === 'wave' && steps++ < 600 / SIMULATION_STEP) game.step(SIMULATION_STEP)
  if (game.state.phase === 'wave') throw new Error(`Зависла волна ${wave} в ${level.id}`)
  return { spent, kills: game.state.kills, lost: 10000 - game.state.lives }
}

try {
  Object.assign(cannon, { cost: 180, upgradeCosts: [120, 180] })
  for (const variant of variants) {
    cannon.tiers.forEach((tier, index) =>
      Object.assign(tier, { damage: variant.damage[index], cooldown: [4, 3.8, 3.6][index] }),
    )
    console.log(`\n${variant.name}`)
    for (const level of PLAYABLE_LEVELS) {
      const run = playBot(level, reference)
      if (run.outcome === 'stuck') throw new Error(`Зависла партия в ${level.id}`)
      console.log(level.name)
      for (const wave of [10, 15, 19]) {
        const previous = run.waves.find((entry) => entry.wave === wave - 1)
        if (!previous || previous.lives <= 0) {
          console.log(`  ${wave}: бот не отбил предыдущую волну`)
          continue
        }
        // Это верхняя оценка: стоимость прежних башен учтена целиком, а не по цене продажи.
        const budget = previous.wealth
        const outcomes = patterns.map((pattern) => {
          const result = experiment(level, wave, budget, pattern.support)
          return `${pattern.name}: вложено ${result.spent}, убито ${result.kills}, потеряно ${result.lost}`
        })
        console.log(`  ${wave}: оценка бюджета ${budget}; ${outcomes.join('; ')}`)
      }
    }
  }
} finally {
  Object.assign(cannon, { cost: original.cost, upgradeCosts: original.upgradeCosts })
  cannon.tiers.forEach((tier, index) => Object.assign(tier, original.tiers[index]))
}
