import {
  TOWERS,
  TOWER_LIST,
  rewardSetCounts,
  rewardStats,
  summarizeRewards,
  type RewardId,
} from '@throne/game'
import { describe, expect, it } from 'vitest'
import { statSources, towerStatRows } from './towerStatRows'

function rows(
  id: string,
  options: {
    rewards?: RewardId[]
    tier?: number
    row?: number
    bellBonus?: number
    bells?: number
    neighbors?: number
  } = {},
) {
  const { rewards = [], tier = 0, row = 5, bellBonus = 0, bells = 0, neighbors = 0 } = options
  const selectedRewards = rewards.map((rewardId, i) => ({ rewardId, wave: 5 * (i + 1) }))
  const stats = towerStatRows(
    TOWERS[id],
    tier,
    row,
    rewardStats({ selectedRewards }),
    { fireRateBonus: bellBonus, fireRateSources: bells, treasuryNeighbors: neighbors },
    statSources(summarizeRewards(selectedRewards), rewardSetCounts(selectedRewards)),
  )
  return Object.fromEntries(stats.map((stat) => [stat.key, stat]))
}

describe('характеристики выбранного стража', () => {
  it('только атакующие стражи показывают число атак в секунду', () => {
    for (const def of TOWER_LIST) {
      expect(Boolean(rows(def.id)['attackRate']), def.name).toBe(Boolean(def.fire))
    }
    expect(rows('archer')['attackRate']).toMatchObject({
      text: 'Скорость атаки — 2,5 → 2,78 атак/с',
      details: [],
    })
    expect(rows('warlock', { rewards: ['rapid-orders'] })['attackRate']).toMatchObject({
      text: 'Скорость атаки — 0,77 атак/с',
      details: ['Без усилений — 0,67 атак/с', 'Быстрые приказы +15%'],
    })
  })

  it('Звонарь и благословение ускоряют стрельбу на обеих ступенях', () => {
    expect(rows('archer', { rewards: ['rapid-orders'] })['attackRate'].text).toBe(
      'Скорость атаки — 2,88 → 3,19 атак/с',
    )
    expect(
      rows('archer', { bellBonus: 0.2, bells: 1, rewards: ['rapid-orders'] })['attackRate'],
    ).toMatchObject({
      text: 'Скорость атаки — 3,45 → 3,83 атак/с',
      details: ['Без усилений — 2,5 атак/с', 'Звонарь +20%', 'Быстрые приказы +15%'],
    })
    const twoBells = rows('archer', { bellBonus: 0.5, bells: 2, rewards: ['two-bells'] })
    expect(twoBells['attackRate']).toMatchObject({
      text: 'Скорость атаки — 3,75 → 4,17 атак/с',
      details: ['Без усилений — 2,5 атак/с', 'Звонари («Два колокола») +50%'],
    })
    expect(twoBells['damage'].details).toEqual([])
    expect(rows('archer', { rewards: ['double-shot'] })['attackRate']).toEqual(
      rows('archer')['attackRate'],
    )
  })

  it('учитывает собранный набор и положение башни, в том числе на высшей ступени', () => {
    const rewards: RewardId[] = ['sharpened-steel', 'last-stand']
    expect(rows('archer', { rewards, row: 3 })['damage']).toMatchObject({
      text: 'Урон — 10,75 → 18,43',
      details: [
        'Без усилений — 7',
        'Заточенные клинки +18%',
        'Последний рубеж +20%',
        'Гнев стражи +10%',
      ],
    })
    expect(rows('archer', { rewards, row: 4 })['damage']).toMatchObject({
      text: 'Урон — 8,96 → 15,36',
      details: ['Без усилений — 7', 'Заточенные клинки +18%', 'Гнев стражи +10%'],
    })
    const max = rows('archer', { rewards, row: 3, tier: 2 })
    expect(max['damage'].text).toBe('Урон — 29,18')
    expect(max['damage'].details).toContain('Без усилений — 19')
    expect(max['range'].details).toEqual([])
  })

  it('различает силу замедления, длительность сети и урон огня', () => {
    expect(rows('frost', { rewards: ['control-master'] })['slowAmount']).toMatchObject({
      text: 'Замедление — 55% → 65%',
      details: ['Без усилений — 45%', 'Мастер контроля +10 процентных пунктов'],
    })
    const trapper = rows('trapper', { rewards: ['control-master'], bellBonus: 0.2, bells: 1 })
    expect(trapper['rootDuration']).toMatchObject({
      text: 'Время в сети — 2,16 → 2,76 с',
      details: ['Без усилений — 1,8 с', 'Мастер контроля +20%'],
    })
    expect(trapper['cooldown'].text).toBe('Перезарядка — 5 → 4,17 с')
    expect(rows('mage', { rewards: ['wildfire'] })['burnDamage']).toMatchObject({
      text: 'Урон от горения за 5 с — 19,89 → 48,62',
      details: ['Без усилений — 15,3', 'Дикий огонь +30%'],
    })
  })

  it('округляет доход обеих ступеней Казны и ограничивает прибавку тремя соседями', () => {
    expect(rows('treasury', { rewards: ['royal-tax'] })['goldPerWave']).toMatchObject({
      text: 'Доход за волну — 12 → 23',
      details: [],
    })
    expect(rows('treasury', { neighbors: 1 })['goldPerWave']).toMatchObject({
      text: 'Доход за волну — 13 → 25',
      details: ['Без усилений — 12'],
    })
    expect(rows('treasury', { neighbors: 4 })['goldPerWave'].text).toBe('Доход за волну — 15 → 29')
  })
})
