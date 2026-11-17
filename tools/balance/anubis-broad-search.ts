// node tools/balance/anubis-broad-search.ts — воспроизводимый ограниченный поиск партий.
import { PLAYABLE_LEVELS, type Game } from '@throne/game'
import { playBot, type Strategy } from './bot.ts'
import { prepare } from './final-defense.ts'

const level = PLAYABLE_LEVELS.find((entry) => entry.id === 'anubis-temple')!
const openings = [
  ['archer', 'archer', 'treasury', 'ballista', 'frost'],
  ['archer', 'archer', 'ballista', 'treasury', 'warlock'],
  ['archer', 'archer', 'treasury', 'treasury', 'ballista'],
  ['archer', 'ballista', 'archer', 'treasury', 'frost'],
]
const types = ['ballista', 'cannon', 'trapper', 'frost', 'warlock', 'bell', 'treasury', 'archer']
let seed = 731
function next(max: number) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return Math.floor((seed / 0x100000000) * max)
}

const strategies: Strategy[] = []
for (let i = 0; i < 300; i++) {
  const loop: string[] = []
  for (let j = 0; j < 4; j++) {
    loop.push('upgrade', types[next(types.length)])
  }
  strategies.push({
    name: `кандидат ${i + 1}`,
    opening: openings[Math.floor(i / 2) % openings.length],
    loop,
    placement: i % 2 ? 'coverage' : 'compatible',
  })
}
const results = strategies.map((strategy) => {
  const observer = (game: Game) => prepare(game, 'продажа Казён')
  const result = playBot(level, strategy, Infinity, observer)
  if (result.outcome === 'stuck') throw new Error(`${strategy.name}: зависшая волна`)
  return { strategy, result }
})
results.sort(
  (a, b) => b.result.wavesCleared - a.result.wavesCleared || b.result.score - a.result.score,
)
console.log(`${results.length} честных партий, seed 731`)
for (const { strategy, result } of results.slice(0, 10)) {
  console.log(`${strategy.name}: ${result.wavesCleared}, ${result.outcome}, ${result.score}`)
  console.log(
    `  ${strategy.placement}; старт ${strategy.opening.join(', ')}; цикл ${strategy.loop.join(', ')}`,
  )
  console.log(
    `  последние волны: ${result.waves
      .slice(-4)
      .map((wave) => `${wave.wave}: ${wave.lives} жизней`)
      .join('; ')}`,
  )
}
