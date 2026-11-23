import { TOWERS, TOWER_LIST } from '@throne/game'
import { describe, expect, it } from 'vitest'
import { cellsInReach, formatStatLine, towerDescription } from './towerStats'

describe('formatStatLine', () => {
  it('показывает стрелку, только если значение меняется', () => {
    const archer = TOWERS['archer']
    expect(formatStatLine('damage', archer.tiers[0], archer.tiers[1])).toMatch(/^Урон — \d+ → \d+$/)
    expect(formatStatLine('damage', archer.tiers[0], undefined)).toMatch(/^Урон — \d+$/)
    expect(formatStatLine('damage', archer.tiers[0], archer.tiers[0])).toMatch(/^Урон — \d+$/)
  })

  it('Колдун показывает ослабление лечения и его изменение при улучшении', () => {
    const warlock = TOWERS['warlock']
    expect(formatStatLine('healingReduction', warlock.tiers[0], undefined)).toBe(
      'Получаемое лечение — −20%',
    )
    expect(formatStatLine('healingReduction', warlock.tiers[0], warlock.tiers[1])).toBe(
      'Получаемое лечение — −20% → −30%',
    )
    expect(formatStatLine('healingReduction', warlock.tiers[2], undefined)).toBe(
      'Получаемое лечение — −40%',
    )
  })

  it('радиус взрыва получает единицу по последнему показанному числу', () => {
    const [first, second] = TOWERS['cannon'].tiers
    expect(formatStatLine('splashRadius', first, undefined)).toBe('Радиус взрыва — 1 клетка')
    expect(formatStatLine('splashRadius', first, second)).toBe('Радиус взрыва — 1 → 1,15 клетки')
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
    expect(formatStatLine('range', bell.tiers[0], bell.tiers[1])).toBe('Соседних клеток — 8 → 12')
  })
})

describe('описание стража с благословением', () => {
  const ordinary = { secondBellShare: 0, iceAndFire: false }

  it('у Огневика и Морозко «Лёд и пламя» показывает совместное действие огня и холода', () => {
    expect(towerDescription(TOWERS['mage'], ordinary)).toBe(TOWERS['mage'].description)
    expect(towerDescription(TOWERS['frost'], ordinary)).toContain('Холод тушит огонь Огневика.')
    for (const def of [TOWERS['mage'], TOWERS['frost']]) {
      expect(towerDescription(def, { ...ordinary, iceAndFire: true })).toBe(
        `${def.description} С благословением «Лёд и пламя» горение и замедление действуют одновременно.`,
      )
    }
  })

  it('«Два колокола» заменяют обычное правило о сильнейшем бонусе', () => {
    const bell = TOWERS['bell']
    expect(towerDescription(bell, ordinary)).toContain('действует сильнейший бонус')
    expect(towerDescription(bell, { ...ordinary, secondBellShare: 0.5 })).toBe(
      `${bell.description} «Два колокола» добавляют 50% бонуса второго по силе Звонаря.`,
    )
  })
})
