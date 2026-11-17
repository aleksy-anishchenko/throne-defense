// node tools/balance/final-defense.ts — полные партии с подготовкой к последним волнам.
import { PLAYABLE_LEVELS, TOWERS, type Game } from '@throne/game'
import { findCellFor, playBot, type Strategy } from './bot.ts'

const strategies: Strategy[] = [
  {
    name: 'Две Казны',
    opening: ['archer', 'archer', 'treasury', 'treasury', 'ballista'],
    loop: ['upgrade', 'treasury', 'ballista', 'upgrade', 'cannon', 'upgrade', 'frost', 'warlock'],
  },
  {
    name: 'Ранняя Баллиста',
    opening: ['archer', 'archer', 'ballista', 'treasury', 'warlock'],
    loop: ['upgrade', 'ballista', 'upgrade', 'cannon', 'upgrade', 'trapper', 'warlock', 'bell'],
  },
]
const policies = ['без подготовки', 'сильная цель', 'продажа Казён'] as const

export function prepare(game: Game, policy: (typeof policies)[number]): void {
  if (game.state.wave !== 20 || policy === 'без подготовки') return
  for (const tower of game.state.towers) {
    if (tower.def.id === 'ballista') game.setTargetMode(tower.col, tower.row, 'strongest')
  }
  if (policy !== 'продажа Казён') return
  for (const tower of [...game.state.towers]) {
    if (tower.def.id === 'treasury') game.sell(tower.col, tower.row)
  }
  while (game.state.gold >= TOWERS['ballista'].cost) {
    const cell = findCellFor(game, TOWERS['ballista'])
    if (!cell || !game.build('ballista', cell.col, cell.row)) break
    game.setTargetMode(cell.col, cell.row, 'strongest')
  }
}

if (import.meta.main) {
  for (const level of PLAYABLE_LEVELS) {
    console.log(`\n${level.name}`)
    for (const strategy of strategies) {
      for (const policy of policies) {
        let bossLeaks = 0
        let listening = false
        const result = playBot(level, strategy, Infinity, (game) => {
          if (!listening) {
            game.on('leak', (enemy) => {
              if (enemy.def.id === 'boss') bossLeaks++
            })
            listening = true
          }
          prepare(game, policy)
        })
        if (result.outcome === 'stuck') throw new Error(`${level.id}: зависшая волна`)
        const wave19 = result.waves.find((wave) => wave.wave === 19)
        console.log(
          `  ${strategy.name}, ${policy}: ${result.wavesCleared}/${result.outcome}; ` +
            `после 19-й ${wave19?.lives ?? 'не дошёл'} жизней; босс прошёл ${bossLeaks}`,
        )
      }
    }
  }
}
