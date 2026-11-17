// node tools/balance/cannon-full-runs.ts — полные партии без подмены состояния.
import { PLAYABLE_LEVELS, TOWERS } from '@throne/game'
import { playBot, type Strategy } from './bot.ts'

const cannon = TOWERS['cannon']
const saved = {
  cost: cannon.cost,
  upgradeCosts: cannon.upgradeCosts,
  tiers: cannon.tiers.map(({ damage, cooldown }) => ({ damage, cooldown })),
}
const candidates = [
  { name: 'A', damage: [100, 160, 240] },
  { name: 'Слабее A', damage: [85, 145, 220] },
]
const opening = ['archer', 'archer', 'treasury', 'ballista', 'frost']
const strategies: Strategy[] = [
  {
    name: 'Пушкарь + Ловчий',
    opening,
    loop: ['upgrade', 'ballista', 'upgrade', 'treasury', 'upgrade', 'cannon', 'trapper', 'bell'],
  },
  {
    name: 'Пушкарь + Лучник',
    opening,
    loop: ['upgrade', 'ballista', 'upgrade', 'treasury', 'upgrade', 'cannon', 'archer', 'bell'],
  },
  {
    name: 'Без Пушкаря, с Ловчим',
    opening,
    loop: ['upgrade', 'ballista', 'upgrade', 'treasury', 'upgrade', 'ballista', 'trapper', 'bell'],
  },
]

try {
  Object.assign(cannon, { cost: 180, upgradeCosts: [120, 180] })
  for (const candidate of candidates) {
    cannon.tiers.forEach((tier, index) =>
      Object.assign(tier, { damage: candidate.damage[index], cooldown: [4, 3.8, 3.6][index] }),
    )
    console.log(`\n${candidate.name}: удар ${candidate.damage.join('/')}, цена 180`)
    for (const level of PLAYABLE_LEVELS) {
      console.log(`  ${level.name}`)
      for (const strategy of strategies) {
        const run = playBot(level, strategy)
        if (run.outcome === 'stuck') throw new Error(`Зависла волна: ${level.id}, ${strategy.name}`)
        const checkpoints = [10, 15, 19].map((wave) => {
          const report = run.waves.find((entry) => entry.wave === wave)
          if (!report) return `${wave}: не дошёл`
          return `${wave}: жизни ${report.lives}, золото ${report.gold}`
        })
        console.log(`    ${strategy.name}: ${run.wavesCleared} отбитых; ${checkpoints.join('; ')}`)
      }
    }
  }
} finally {
  Object.assign(cannon, { cost: saved.cost, upgradeCosts: saved.upgradeCosts })
  cannon.tiers.forEach((tier, index) => Object.assign(tier, saved.tiers[index]))
}
