import { TOWERS, TOWER_LIST } from '@throne/game'
import { describe, expect, it } from 'vitest'
import { cellsInReach, formatStatLine } from './towerStats'

describe('formatStatLine', () => {
  it('показывает стрелку, только если значение меняется', () => {
    const archer = TOWERS['archer']
    expect(formatStatLine('damage', archer.tiers[0], archer.tiers[1])).toMatch(/^урон \d+ → \d+$/)
    expect(formatStatLine('damage', archer.tiers[0], undefined)).toMatch(/^урон \d+$/)
    expect(formatStatLine('damage', archer.tiers[0], archer.tiers[0])).toMatch(/^урон \d+$/)
  })

  it('Колдун показывает ослабление лечения и его изменение при улучшении', () => {
    const warlock = TOWERS['warlock']
    expect(formatStatLine('healingReduction', warlock.tiers[0], undefined)).toBe(
      'получаемое лечение −20%',
    )
    expect(formatStatLine('healingReduction', warlock.tiers[0], warlock.tiers[1])).toBe(
      'получаемое лечение −20% → −30%',
    )
    expect(formatStatLine('healingReduction', warlock.tiers[2], undefined)).toBe(
      'получаемое лечение −40%',
    )
  })

  it('у каждой башни есть характеристики с корректными значениями', () => {
    for (const def of TOWER_LIST) {
      expect(def.displayStats, def.id).not.toHaveLength(0)
      for (const statKey of def.displayStats) {
        const text = formatStatLine(statKey, def.tiers[0], def.tiers[1])
        expect(text, `${def.id} ${statKey}`).not.toMatch(/NaN|undefined/)
      }
    }
  })
})

describe('Звонарь: дальность — числом клеток', () => {
  it('каждая ступень добавляет клетки: 8 → 12 → 20', () => {
    expect(TOWERS['bell'].tiers.map((stats) => cellsInReach(stats.range))).toEqual([8, 12, 20])
  })

  it('в характеристиках — «соседних клеток», а не радиус', () => {
    const bell = TOWERS['bell']
    expect(formatStatLine('range', bell.tiers[0], bell.tiers[1])).toBe('соседних клеток 8 → 12')
  })
})
