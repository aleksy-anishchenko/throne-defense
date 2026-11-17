// node tools/balance/cannon-search.ts — ограниченный поиск полных честных партий.
import { PLAYABLE_LEVELS, TOWERS } from '@throne/game'
import { playBot, type Strategy } from './bot.ts'

const cannon = TOWERS['cannon']
const saved = {
  cost: cannon.cost,
  upgradeCosts: cannon.upgradeCosts,
  tiers: cannon.tiers.map(({ damage, cooldown }) => ({ damage, cooldown })),
}
const openings = [
  ['archer', 'archer', 'treasury', 'ballista', 'frost'],
  ['archer', 'archer', 'treasury', 'treasury', 'ballista'],
  ['archer', 'archer', 'ballista', 'treasury', 'warlock'],
]
const loops = [
  ['upgrade', 'ballista', 'upgrade', 'treasury', 'upgrade', 'cannon', 'trapper', 'bell'],
  ['upgrade', 'ballista', 'upgrade', 'treasury', 'upgrade', 'ballista', 'warlock', 'bell'],
  ['upgrade', 'treasury', 'upgrade', 'ballista', 'upgrade', 'cannon', 'warlock', 'bell'],
  ['upgrade', 'treasury', 'ballista', 'upgrade', 'cannon', 'upgrade', 'frost', 'warlock'],
  ['treasury', 'upgrade', 'ballista', 'upgrade', 'cannon', 'upgrade', 'trapper', 'bell'],
  ['upgrade', 'ballista', 'upgrade', 'cannon', 'upgrade', 'trapper', 'warlock', 'bell'],
  ['upgrade', 'treasury', 'upgrade', 'ballista', 'upgrade', 'ballista', 'warlock', 'bell'],
  ['treasury', 'upgrade', 'ballista', 'upgrade', 'treasury', 'upgrade', 'warlock', 'bell'],
]
const candidates = [
  { name: 'A', damage: [100, 160, 240] },
  { name: 'Слабее A', damage: [85, 145, 220] },
]
const throne = PLAYABLE_LEVELS.find((level) => level.id === 'throne-hall')!

try {
  Object.assign(cannon, { cost: 180, upgradeCosts: [120, 180] })
  for (const candidate of candidates) {
    cannon.tiers.forEach((tier, index) =>
      Object.assign(tier, { damage: candidate.damage[index], cooldown: [4, 3.8, 3.6][index] }),
    )
    const strategies: Strategy[] = openings.flatMap((opening, openIndex) =>
      loops.map((loop, loopIndex) => ({
        name: `старт ${openIndex + 1}, цикл ${loopIndex + 1}`,
        opening,
        loop,
      })),
    )
    const ranked = strategies
      .map((strategy) => {
        const result = playBot(throne, strategy)
        if (result.outcome === 'stuck')
          throw new Error(`${candidate.name}: ${strategy.name}: зависание`)
        return { strategy, result }
      })
      .sort(
        (a, b) => b.result.wavesCleared - a.result.wavesCleared || b.result.score - a.result.score,
      )
    console.log(`\n${candidate.name}: поиск ${ranked.length} стратегий в Тронном зале`)
    for (const { strategy, result } of ranked.slice(0, 4)) {
      console.log(
        `  ${strategy.name}: ${result.wavesCleared} отбитых, ${result.outcome}, счёт ${result.score}`,
      )
      console.log(`    старт ${strategy.opening.join(', ')}; цикл ${strategy.loop.join(', ')}`)
      for (const level of PLAYABLE_LEVELS) {
        const run = level.id === throne.id ? result : playBot(level, strategy)
        if (run.outcome === 'stuck') throw new Error(`${level.name}: зависание`)
        const checkpoints = [15, 18, 19, 20].map((wave) => {
          const report = run.waves.find((entry) => entry.wave === wave)
          return report ? `${wave}: ${report.lives} жизней` : `${wave}: не дошёл`
        })
        console.log(
          `    ${level.name}: ${run.wavesCleared} / ${run.outcome}; ${checkpoints.join(', ')}`,
        )
      }
    }
  }
} finally {
  Object.assign(cannon, { cost: saved.cost, upgradeCosts: saved.upgradeCosts })
  cannon.tiers.forEach((tier, index) => Object.assign(tier, saved.tiers[index]))
}
