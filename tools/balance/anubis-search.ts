// node tools/balance/anubis-search.ts — ограниченный поиск честного прохождения.
import { PLAYABLE_LEVELS, TOWERS, type Game } from '@throne/game'
import { findCellFor, playBot, type Strategy } from './bot.ts'

const level = PLAYABLE_LEVELS.find((entry) => entry.id === 'anubis-temple')!
const openings = [
  ['archer', 'archer', 'treasury', 'ballista', 'frost'],
  ['archer', 'archer', 'ballista', 'treasury', 'warlock'],
  ['archer', 'archer', 'treasury', 'treasury', 'ballista'],
  ['archer', 'ballista', 'archer', 'treasury', 'frost'],
  ['archer', 'archer', 'archer', 'ballista', 'treasury'],
]
const loops = [
  ['upgrade', 'treasury', 'ballista', 'upgrade', 'cannon', 'upgrade', 'frost', 'warlock'],
  ['upgrade', 'ballista', 'upgrade', 'cannon', 'upgrade', 'trapper', 'warlock', 'bell'],
  ['upgrade', 'ballista', 'upgrade', 'treasury', 'upgrade', 'ballista', 'warlock', 'bell'],
  ['upgrade', 'ballista', 'archer', 'upgrade', 'cannon', 'frost', 'upgrade', 'warlock'],
  ['upgrade', 'ballista', 'upgrade', 'cannon', 'upgrade', 'ballista', 'frost', 'warlock'],
  ['upgrade', 'treasury', 'ballista', 'upgrade', 'cannon', 'upgrade', 'trapper', 'bell'],
  ['upgrade', 'ballista', 'upgrade', 'archer', 'upgrade', 'ballista', 'warlock', 'frost'],
  ['upgrade', 'ballista', 'upgrade', 'cannon', 'upgrade', 'warlock', 'ballista', 'bell'],
]

function prepareFinal(game: Game) {
  if (game.state.wave !== game.level.waveCount) return
  for (const tower of [...game.state.towers]) {
    if (tower.def.id === 'treasury') game.sell(tower.col, tower.row)
    if (tower.def.id === 'ballista') game.setTargetMode(tower.col, tower.row, 'strongest')
  }
  while (game.state.gold >= TOWERS['ballista'].cost) {
    const cell = findCellFor(game, TOWERS['ballista'])
    if (!cell || !game.build('ballista', cell.col, cell.row)) break
    game.setTargetMode(cell.col, cell.row, 'strongest')
  }
}

const results = openings.flatMap((opening, i) =>
  loops.flatMap((loop, j) =>
    (['compatible', 'coverage'] as const).map((placement) => {
      const strategy: Strategy = {
        name: `${i + 1}/${j + 1}/${placement}`,
        opening,
        loop,
        placement,
      }
      const result = playBot(level, strategy, Infinity, prepareFinal)
      if (result.outcome === 'stuck') throw new Error(`${strategy.name}: зависла волна`)
      return { strategy, result }
    }),
  ),
)
results.sort(
  (a, b) => b.result.wavesCleared - a.result.wavesCleared || b.result.score - a.result.score,
)
console.log(`Храм Анубиса: ${results.length} честных партий`)
for (const { strategy, result } of results.slice(0, 8)) {
  console.log(`${strategy.name}: ${result.wavesCleared}, ${result.outcome}, счёт ${result.score}`)
  console.log(`  старт ${strategy.opening.join(', ')}; цикл ${strategy.loop.join(', ')}`)
  console.log(
    `  последние волны: ${result.waves
      .slice(-5)
      .map((wave) => `${wave.wave}: ${wave.lives} жизней, ${wave.gold} золота`)
      .join('; ')}`,
  )
}
