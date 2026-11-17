// node tools/balance/boss-sensitivity.ts — временно меняет HP босса только в этом процессе.
import { ENEMIES, PLAYABLE_LEVELS, TOWERS, type Game } from '@throne/game'
import { findCellFor, playBot, type Strategy } from './bot.ts'

const strategies: Record<string, Strategy> = {
  anubis: {
    name: 'Храм Анубиса',
    opening: ['archer', 'archer', 'treasury', 'ballista', 'frost'],
    loop: ['upgrade', 'ballista', 'upgrade', 'cannon', 'upgrade', 'trapper', 'warlock', 'bell'],
  },
  other: {
    name: 'Две Казны',
    opening: ['archer', 'archer', 'treasury', 'treasury', 'ballista'],
    loop: ['upgrade', 'treasury', 'ballista', 'upgrade', 'cannon', 'upgrade', 'frost', 'warlock'],
  },
}
const boss = ENEMIES['boss']
const originalHp = boss.hp

function prepare(game: Game) {
  if (game.state.wave !== 20) return
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

try {
  for (const hp of [1500, 1350, 1200, 1050, 900]) {
    Object.assign(boss, { hp })
    console.log(`\nБазовое здоровье Узурпатора: ${hp}`)
    for (const level of PLAYABLE_LEVELS) {
      const strategy = level.id === 'anubis-temple' ? strategies['anubis'] : strategies['other']
      const result = playBot(level, strategy, Infinity, prepare)
      if (result.outcome === 'stuck') throw new Error(`${level.id}: зависшая волна`)
      console.log(
        `${level.name}: ${result.wavesCleared} отбитых, ${result.outcome}, ` +
          `жизни в конце ${result.waves.at(-1)?.lives}`,
      )
    }
  }
} finally {
  Object.assign(boss, { hp: originalHp })
}
