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
    {
      fireRateBonus: bellBonus,
      fireRateSources: bells,
      treasuryNeighbors: neighbors,
      treasuryBonus: Math.min(neighbors, 3) * 0.1,
    },
    statSources(summarizeRewards(selectedRewards), rewardSetCounts(selectedRewards)),
  )
  return Object.fromEntries(stats.map((stat) => [stat.key, stat]))
}

describe('характеристики выбранного стража', () => {
  it('показывает скорость стрельбы и скрывает частоту волн Морозко на всех ступенях', () => {
    for (const def of TOWER_LIST) {
      expect(Boolean(rows(def.id)['attackRate']), def.name).toBe(
        Boolean(def.fire) && def.id !== 'frost',
      )
    }
    for (const tier of [0, 1, 2]) {
      const frost = rows('frost', { tier, rewards: ['rapid-orders'] })
      expect(frost['attackRate']).toBeUndefined()
      expect(frost['range'].label).toBe('Дальность')
    }
    expect(rows('archer')['attackRate']).toMatchObject({
      label: 'Скорость атаки',
      current: '2,5 атак/с',
      next: '2,78 атак/с',
      details: [],
    })
    expect(rows('warlock', { rewards: ['rapid-orders'] })['attackRate']).toMatchObject({
      current: '0,77 атак/с',
      next: null,
      details: ['Быстрые приказы +15%'],
    })
  })

  it('Звонарь и благословение ускоряют стрельбу на обеих ступенях', () => {
    expect(rows('archer', { rewards: ['rapid-orders'] })['attackRate']).toMatchObject({
      current: '2,88 атак/с',
      next: '3,19 атак/с',
    })
    expect(
      rows('archer', { bellBonus: 0.2, bells: 1, rewards: ['rapid-orders'] })['attackRate'],
    ).toMatchObject({
      current: '3,45 атак/с',
      next: '3,83 атак/с',
      details: ['Звонарь +20%', 'Быстрые приказы +15%'],
    })
    const twoBells = rows('archer', { bellBonus: 0.5, bells: 2, rewards: ['two-bells'] })
    expect(twoBells['attackRate']).toMatchObject({
      current: '3,75 атак/с',
      next: '4,17 атак/с',
      details: ['Звонари («Два колокола») +50%'],
    })
    expect(twoBells['damage'].details).toEqual([])
    expect(rows('archer', { rewards: ['double-shot'] })['attackRate']).toEqual(
      rows('archer')['attackRate'],
    )
  })

  it('учитывает собранный набор и положение башни, в том числе на высшей ступени', () => {
    const rewards: RewardId[] = ['sharpened-steel', 'last-stand']
    expect(rows('archer', { rewards, row: 3 })['damage']).toMatchObject({
      current: '10,75',
      next: '18,43',
      details: ['Заточенные клинки +18%', 'Последний рубеж +20%', 'Гнев стражи +10%'],
    })
    expect(rows('archer', { rewards, row: 4 })['damage']).toMatchObject({
      current: '8,96',
      next: '15,36',
      details: ['Заточенные клинки +18%', 'Гнев стражи +10%'],
    })
    const max = rows('archer', { rewards, row: 3, tier: 2 })
    expect(max['damage']).toMatchObject({ label: 'Урон', current: '29,18', next: null })
    expect(max['damage'].details).toContain('Гнев стражи +10%')
    expect(max['range'].details).toEqual([])
  })

  it('различает силу замедления, длительность сети и урон огня', () => {
    expect(rows('frost', { rewards: ['control-master'] })['slowAmount']).toMatchObject({
      current: '55%',
      next: '65%',
      details: ['Мастер контроля +10 процентных пунктов'],
    })
    const trapper = rows('trapper', { rewards: ['control-master'], bellBonus: 0.2, bells: 1 })
    expect(trapper['rootDuration']).toMatchObject({
      current: '2,16 с',
      next: '2,76 с',
      details: ['Мастер контроля +20%'],
    })
    expect(trapper['cooldown']).toMatchObject({
      current: '5 с',
      next: '4,17 с',
      details: ['Звонарь +20%'],
    })
    expect(rows('mage', { rewards: ['wildfire'] })['burnDamage']).toMatchObject({
      label: 'Урон от горения (за 5 сек)',
      current: '19,89',
      next: '48,62',
      details: ['Дикий огонь +30%'],
    })
  })

  it('округляет доход обеих ступеней Казны и ограничивает прибавку тремя соседями', () => {
    expect(rows('treasury', { rewards: ['royal-tax'] })['goldPerWave']).toMatchObject({
      current: '12',
      next: '23',
      details: [],
    })
    expect(rows('treasury', { neighbors: 1 })['goldPerWave']).toMatchObject({
      current: '13',
      next: '25',
      details: ['Соседние Казны +10%'],
    })
    expect(rows('treasury', { neighbors: 4 })['goldPerWave']).toMatchObject({
      current: '15',
      next: '29',
    })
  })
})
