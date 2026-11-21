// node tools/balance/cannon-final-waves.ts — диагностический повтор без подмены партии.
import { PLAYABLE_LEVELS, TOWERS, type Game } from '@throne/game'
import { playBot, type Strategy } from './bot.ts'

const cannon = TOWERS['cannon']
const saved = {
  cost: cannon.cost,
  upgradeCosts: cannon.upgradeCosts,
  tiers: cannon.tiers.map(({ damage, cooldown }) => ({ damage, cooldown })),
}
const candidates = [
  { name: 'Текущий v17', cost: saved.cost, upgrades: saved.upgradeCosts, tiers: saved.tiers },
  {
    name: 'A',
    cost: 180,
    upgrades: [120, 180],
    tiers: [100, 160, 240].map((damage, i) => ({ damage, cooldown: [4, 3.8, 3.6][i] })),
  },
  {
    name: 'Слабее A',
    cost: 180,
    upgrades: [120, 180],
    tiers: [85, 145, 220].map((damage, i) => ({ damage, cooldown: [4, 3.8, 3.6][i] })),
  },
]
const strategy: Strategy = {
  name: 'Выигравшая Светлицу',
  opening: ['archer', 'archer', 'treasury', 'treasury', 'ballista'],
  loop: ['upgrade', 'treasury', 'ballista', 'upgrade', 'cannon', 'upgrade', 'frost', 'warlock'],
}

try {
  for (const candidate of candidates) {
    Object.assign(cannon, { cost: candidate.cost, upgradeCosts: candidate.upgrades })
    cannon.tiers.forEach((tier, index) => Object.assign(tier, candidate.tiers[index]))
    console.log(`\n${candidate.name}`)
    for (const id of ['throne-hall', 'svetlitsa', 'anubis-temple']) {
      const level = PLAYABLE_LEVELS.find((entry) => entry.id === id)!
      const finalWaves = [level.waves.length - 1, level.waves.length]
      const leaks = new Map<number, string[]>()
      const states = new Map<number, string>()
      let listening = false
      const observe = (game: Game) => {
        if (!listening) {
          game.on('leak', (enemy) => {
            const wave = game.state.wave
            const list = leaks.get(wave) ?? []
            list.push(`${enemy.def.id} (${enemy.def.throneDamage} жизней)`)
            leaks.set(wave, list)
          })
          listening = true
        }
        const wave = game.state.wave
        if (finalWaves.includes(wave)) {
          const towers = game.state.towers
            .map((tower) => `${tower.def.id} ${tower.tier + 1}@${tower.col},${tower.row}`)
            .join('; ')
          states.set(wave, `жизни ${game.state.lives}, золото ${game.state.gold}; ${towers}`)
        }
      }
      const result = playBot(level, strategy, Infinity, observe)
      if (result.outcome === 'stuck') throw new Error(`${level.id}: зависшая волна`)
      console.log(`  ${level.name}: ${result.wavesCleared} отбитых, ${result.outcome}`)
      for (const wave of finalWaves) {
        console.log(`    ${wave}: ${states.get(wave) ?? 'не дошёл'}`)
        if (states.has(wave))
          console.log(`    прорывы: ${(leaks.get(wave) ?? []).join(', ') || 'нет'}`)
      }
    }
  }
} finally {
  Object.assign(cannon, { cost: saved.cost, upgradeCosts: saved.upgradeCosts })
  cannon.tiers.forEach((tier, index) => Object.assign(tier, saved.tiers[index]))
}
