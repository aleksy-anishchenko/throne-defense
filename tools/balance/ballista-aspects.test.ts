import { describe, expect, it } from 'vitest'
import { PLAYABLE_LEVELS, createGame } from '@throne/game'
import { findBestCell } from './bot.ts'
import { measureDefense } from './towers.ts'
import { measureMageAspects } from './mage-aspects.ts'

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
    expect(specialized.damage / base.damage).toBeCloseTo(1.4)
    expect(specialized.leaks).toBe(base.leaks)
  })

  it('не молча игнорирует неверную специализацию', () => {
    expect(() =>
      measureDefense(level, [{ ...placement, aspectId: 'missing' }], stream, 20),
    ).toThrow('специализацию')
  })

  it('сравнивает пять покупок Огневика за одинаковое золото в каждом игровом зале', () => {
    for (const hall of PLAYABLE_LEVELS) {
      const results = measureMageAspects(hall)
      expect(new Set(results.map((result) => result.name)).size).toBe(5)
      expect(new Set(results.map((result) => result.spentGold))).toEqual(new Set([1530]))
      for (const result of results) {
        expect(result.kills).toBeGreaterThan(0)
        expect(result.livesLost).toBeGreaterThanOrEqual(result.leaks)
      }
    }
  })
})
