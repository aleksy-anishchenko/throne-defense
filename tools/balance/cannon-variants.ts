// node tools/balance/cannon-variants.ts — сравнение вариантов в отдельном процессе.
import { PLAYABLE_LEVELS, TOWERS } from '@throne/game'
import { STRATEGIES, playBot } from './bot.ts'
import { STREAMS, effectiveDamagePerGold } from './towers.ts'

const cannon = TOWERS['cannon']
const original = {
  cost: cannon.cost,
  upgradeCosts: cannon.upgradeCosts,
  tiers: cannon.tiers.map(({ damage, cooldown }) => ({ damage, cooldown })),
}
const variants = [
  { name: 'v17', cost: 140, upgrades: [100, 140], damage: [30, 50, 80], cooldown: [3.2, 3, 2.8] },
  { name: 'A', cost: 180, upgrades: [120, 180], damage: [100, 160, 240], cooldown: [4, 3.8, 3.6] },
  { name: 'B', cost: 180, upgrades: [120, 180], damage: [130, 210, 320], cooldown: [4.5, 4.2, 4] },
  { name: 'C', cost: 200, upgrades: [140, 200], damage: [160, 260, 400], cooldown: [5, 4.7, 4.4] },
]

try {
  for (const variant of variants) {
    Object.assign(cannon, { cost: variant.cost, upgradeCosts: variant.upgrades })
    cannon.tiers.forEach((tier, index) =>
      Object.assign(tier, { damage: variant.damage[index], cooldown: variant.cooldown[index] }),
    )
    console.log(`\n${variant.name}: ${variant.cost} золота, удар ${variant.damage.join('/')}`)
    for (const level of PLAYABLE_LEVELS) {
      const strategies = STRATEGIES.filter((candidate) =>
        [
          'Экономика и поддержка',
          'Смешанная с Пушкарями',
          'Только пушкари',
          'Только баллисты',
        ].includes(candidate.name),
      )
      const outcomes = strategies.map((strategy) => {
        const result = playBot(level, strategy)
        if (result.outcome === 'stuck') throw new Error(`${level.id}: зависла волна`)
        return `${strategy.name}: ${result.wavesCleared}`
      })
      console.log(`${level.name}: ${outcomes.join('; ')}`)
    }
    for (let tier = 0; tier < cannon.tiers.length; tier++) {
      const measurements = STREAMS.map((stream) => {
        const average =
          PLAYABLE_LEVELS.reduce(
            (sum, level) => sum + effectiveDamagePerGold(level, cannon, tier, stream),
            0,
          ) / PLAYABLE_LEVELS.length
        return `${stream.name}: ${average.toFixed(2)}`
      })
      console.log(`Ступень ${tier + 1}, полезный урон на монету: ${measurements.join('; ')}`)
    }
  }
} finally {
  Object.assign(cannon, { cost: original.cost, upgradeCosts: original.upgradeCosts })
  cannon.tiers.forEach((tier, index) => Object.assign(tier, original.tiers[index]))
}
