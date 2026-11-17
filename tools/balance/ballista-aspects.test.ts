import { describe, expect, it } from 'vitest'
import { PLAYABLE_LEVELS, createGame } from '@throne/game'
import { findBestCell } from './bot.ts'
import { measureDefense } from './towers.ts'

describe('стенд специализаций', () => {
  const level = PLAYABLE_LEVELS[0]
  const game = createGame(level)
  const cell = findBestCell(game, 3.1)!
  const placement = { towerId: 'ballista', ...cell, tier: 2 }
  const stream = { name: 'огр', enemyId: 'ogre', count: 1, gap: 0 }

  it('учитывает стоимость аспекта и увеличение урона по исполину', () => {
    const base = measureDefense(level, [placement], stream, 20)
    const specialized = measureDefense(
      level,
      [{ ...placement, aspectId: 'giant-slayer' }],
      stream,
      20,
    )
    expect(base.spentGold).toBe(510)
    expect(specialized.spentGold).toBe(690)
    expect(specialized.damage / base.damage).toBeCloseTo(1.6)
    expect(specialized.leaks).toBe(base.leaks)
  })

  it('не молча игнорирует неверную специализацию', () => {
    expect(() =>
      measureDefense(level, [{ ...placement, aspectId: 'missing' }], stream, 20),
    ).toThrow('специализацию')
  })
})
