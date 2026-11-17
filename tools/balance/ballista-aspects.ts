// npm run balance:aspects — изолированные потоки на 20-й волне, НЕ полное прохождение.
// Общая расстановка: Баллиста III + четыре Лучника III. Сравниваем аспект за 180
// с ещё одним Лучником III за 160; остаток бюджета не даёт боевого преимущества.
import { PLAYABLE_LEVELS, TOWERS, createGame, type LevelDef } from '@throne/game'
import { findCellFor } from './bot.ts'
import { measureDefense, type EnemyStream, type Placement } from './towers.ts'

function battery(level: LevelDef): { placements: Placement[]; extra: Placement } {
  const game = createGame(level)
  game.reset()
  // Только стенд: не утверждаем, что эти деньги можно заработать в полной партии.
  game.state.gold = 10_000
  const placements: Placement[] = []
  for (const towerId of ['ballista', 'archer', 'archer', 'archer', 'archer', 'archer']) {
    const cell = findCellFor(game, TOWERS[towerId])
    if (!cell || !game.build(towerId, cell.col, cell.row)) {
      throw new Error(`Не удалось собрать стенд в ${level.name}`)
    }
    game.upgrade(cell.col, cell.row)
    game.upgrade(cell.col, cell.row)
    placements.push({ towerId, ...cell, tier: 2 })
  }
  return { placements: placements.slice(0, -1), extra: placements.at(-1)! }
}

const streams: EnemyStream[] = [
  { name: 'мелкие', enemyId: 'rebel', count: 30, gap: 0.7 },
  { name: 'латники', enemyId: 'armor', count: 12, gap: 0.9 },
  { name: 'огры', enemyId: 'ogre', count: 4, gap: 3 },
  { name: 'Узурпатор', enemyId: 'boss', count: 1, gap: 0 },
]

for (const level of PLAYABLE_LEVELS) {
  const { placements, extra } = battery(level)
  const variants = [
    { name: 'Без аспекта', placements },
    ...TOWERS['ballista'].aspects!.map((aspect) => ({
      name: aspect.name,
      placements: placements.map((placement) =>
        placement.towerId === 'ballista' ? { ...placement, aspectId: aspect.id } : placement,
      ),
    })),
    { name: 'Ещё Лучник III', placements: [...placements, extra] },
  ]
  console.log(`\n${level.name}: один и тот же участок обороны, без лечения`)
  console.table(
    streams.flatMap((stream) =>
      variants.map((variant) => {
        const report = measureDefense(level, variant.placements, stream, 20)
        return {
          поток: stream.name,
          вариант: variant.name,
          золото: report.spentGold,
          урон: Math.round(report.damage),
          убито: report.kills,
          прошло: report.leaks,
        }
      }),
    ),
  )
}
