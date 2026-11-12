import { TOWERS, TOWER_LIST } from '@throne/game'
import { describe, expect, it } from 'vitest'
import { describeNewTowerStats, formatStatLine } from './towerStats'

describe('formatStatLine', () => {
  it('показывает стрелку, только если значение меняется', () => {
    const archer = TOWERS['archer']
    expect(formatStatLine('damage', archer.tiers[0], archer.tiers[1])).toMatch(/^урон \d+ → \d+$/)
    expect(formatStatLine('damage', archer.tiers[0], undefined)).toMatch(/^урон \d+$/)
    expect(formatStatLine('damage', archer.tiers[0], archer.tiers[0])).toMatch(/^урон \d+$/)
  })
})

describe('describeNewTowerStats', () => {
  it('у каждой башни есть непустая строка характеристик без «NaN» и «undefined»', () => {
    for (const def of TOWER_LIST) {
      const text = describeNewTowerStats(def)
      expect(text, def.id).not.toBe('')
      expect(text, def.id).not.toMatch(/NaN|undefined/)
    }
  })
})
