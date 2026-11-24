import { TOWERS, TOWER_LIST } from '@throne/game'
import { describe, expect, it } from 'vitest'
import { cellsInReach, formatTowerStat, towerInteractionHint } from './towerStats'

describe('formatTowerStat', () => {
  it('отделяет подпись от чисел и сравнивает только разные значения', () => {
    const archer = TOWERS['archer']
    expect(formatTowerStat(archer, 'damage', archer.tiers[0], archer.tiers[1])).toEqual({
      label: 'Урон',
      current: '7',
      next: '12',
    })
    expect(formatTowerStat(archer, 'damage', archer.tiers[2]).next).toBeNull()
    expect(formatTowerStat(archer, 'damage', archer.tiers[0], archer.tiers[0]).next).toBeNull()
  })

  it('Колдун показывает ослабление лечения и его изменение при улучшении', () => {
    const warlock = TOWERS['warlock']
    expect(
      formatTowerStat(warlock, 'healingReduction', warlock.tiers[0], warlock.tiers[1]),
    ).toEqual({
      label: 'Получаемое лечение',
      current: '−20%',
      next: '−30%',
    })
    expect(formatTowerStat(warlock, 'healingReduction', warlock.tiers[2])).toMatchObject({
      current: '−40%',
      next: null,
    })
  })

  it('показывает единицы и правильную форму слова для обеих ступеней', () => {
    const cannon = TOWERS['cannon']
    expect(formatTowerStat(cannon, 'splashRadius', cannon.tiers[0], cannon.tiers[1])).toEqual({
      label: 'Радиус взрыва',
      current: '1 клетка',
      next: '1,15 клетки',
    })
  })

  it('у каждой башни есть характеристики с корректными значениями', () => {
    for (const def of TOWER_LIST) {
      expect(def.displayStats, def.id).not.toHaveLength(0)
      for (const statKey of def.displayStats) {
        const stat = formatTowerStat(def, statKey, def.tiers[0], def.tiers[1])
        expect(stat.current, `${def.id} ${statKey}`).not.toMatch(/NaN|undefined/)
        if (stat.next !== null) expect(stat.next).not.toMatch(/NaN|undefined/)
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
    expect(formatTowerStat(bell, 'range', bell.tiers[0], bell.tiers[1])).toEqual({
      label: 'Соседних клеток',
      current: '8',
      next: '12',
    })
  })
})

describe('описание стража с благословением', () => {
  const ordinary = { secondBellShare: 0, iceAndFire: false }

  it('у Огневика и Морозко «Лёд и пламя» показывает совместное действие огня и холода', () => {
    expect(towerInteractionHint(TOWERS['mage'], ordinary)).toBe('')
    expect(towerInteractionHint(TOWERS['frost'], ordinary)).toContain('Холод тушит огонь Огневика.')
    for (const def of [TOWERS['mage'], TOWERS['frost']]) {
      expect(towerInteractionHint(def, { ...ordinary, iceAndFire: true })).toBe(
        'С благословением «Лёд и пламя» горение и замедление действуют одновременно.',
      )
    }
  })

  it('«Два колокола» заменяют обычное правило о сильнейшем бонусе', () => {
    const bell = TOWERS['bell']
    expect(towerInteractionHint(bell, ordinary)).toContain('действует сильнейший бонус')
    expect(towerInteractionHint(bell, { ...ordinary, secondBellShare: 0.5 })).toBe(
      '«Два колокола» добавляют 50% бонуса второго по силе Звонаря.',
    )
  })
})
