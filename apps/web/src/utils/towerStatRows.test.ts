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
    aspectId?: string
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
      aspectId: options.aspectId,
      fireRateBonus: bellBonus,
      fireRateSources: bells,
      bellCells: 0,
      bellNextCells: 0,
      treasuryNeighbors: neighbors,
      treasuryBonus: Math.min(neighbors, 3) * 0.1,
    },
    statSources(summarizeRewards(selectedRewards), rewardSetCounts(selectedRewards)),
  )
  return Object.fromEntries(stats.map((stat) => [stat.key, stat]))
}

describe('характеристики выбранного стража', () => {
  it('показывает длительность и полный урон выбранного огня с учётом благословений', () => {
    expect(rows('mage', { tier: 2, aspectId: 'boiling-oil' })['burnDamage']).toMatchObject({
      label: 'Урон от горения (за 5 сек)',
      current: '61,2',
    })
    expect(rows('mage', { tier: 2, aspectId: 'wildfire' })['burnDamage']).toMatchObject({
      label: 'Урон от горения (за 2 сек)',
      current: '70,38',
    })
    expect(
      rows('mage', { tier: 2, aspectId: 'wildfire', rewards: ['wildfire'] })['burnDamage'],
    ).toMatchObject({ current: '91,49', details: ['Благословение «Испепеление» +30%'] })
  })

  it('показывает скорость атаки у стреляющих стражей и время перезарядки у Ловчего', () => {
    const showsAttackRate = ['archer', 'ballista', 'cannon', 'mage']
    for (const def of TOWER_LIST) {
      expect(Boolean(rows(def.id)['attackRate']), def.name).toBe(showsAttackRate.includes(def.id))
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
    expect(rows('warlock', { rewards: ['rapid-orders'] })['attackRate']).toBeUndefined()
    expect(rows('trapper', { rewards: ['rapid-orders'] })['cooldown'].details).toEqual([
      'Быстрые приказы +15%',
    ])
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
    const rewards: RewardId[] = ['sharpened-steel', 'last-stand', 'wildfire']
    expect(rows('archer', { rewards, row: 3 })['damage']).toMatchObject({
      current: '11,17',
      next: '19,15',
      details: ['Заточенные клинки +18%', 'Последний рубеж +20%', 'Гнев стражи +15%'],
    })
    expect(rows('archer', { rewards, row: 4 })['damage']).toMatchObject({
      current: '9,31',
      next: '15,96',
      details: ['Заточенные клинки +18%', 'Гнев стражи +15%'],
    })
    const max = rows('archer', { rewards, row: 3, tier: 2 })
    expect(max['damage']).toMatchObject({ label: 'Урон', current: '30,32', next: null })
    expect(max['damage'].details).toContain('Гнев стражи +15%')
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
      details: ['Благословение «Испепеление» +30%'],
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
