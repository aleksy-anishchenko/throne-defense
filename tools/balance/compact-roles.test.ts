import { describe, expect, it } from 'vitest'
import { ENEMIES, PLAYABLE_LEVELS, TOWERS } from '@throne/game'
import { playBot, type Strategy } from './bot.ts'
import { STREAMS, effectiveDamagePerGold } from './towers.ts'

const stream = (id: string) => STREAMS.find((entry) => entry.enemyId === id)!
const average = (towerId: string, tier: number, enemyId: string) =>
  PLAYABLE_LEVELS.reduce(
    (sum, level) => sum + effectiveDamagePerGold(level, TOWERS[towerId], tier, stream(enemyId)),
    0,
  ) / PLAYABLE_LEVELS.length

describe('согласованные роли на компактных картах', () => {
  for (let tier = 0; tier < 3; tier++) {
    it(`ступень ${tier + 1}: лучник против быстрых, баллиста против брони`, () => {
      expect(average('archer', tier, 'scout')).toBeGreaterThan(average('ballista', tier, 'scout'))
      expect(average('ballista', tier, 'armor')).toBeGreaterThan(average('archer', tier, 'armor'))
    })
    it(`ступень ${tier + 1}: Пушкарь дороже, медленнее и сильнее за удар Баллисты`, () => {
      const cannon = TOWERS['cannon']
      const ballista = TOWERS['ballista']
      expect(cannon.tiers[tier].damage).toBeGreaterThan(ballista.tiers[tier].damage)
      expect(cannon.tiers[tier].cooldown).toBeGreaterThan(ballista.tiers[tier].cooldown)
      expect(
        cannon.cost + cannon.upgradeCosts.slice(0, tier).reduce((a, b) => a + b, 0),
      ).toBeGreaterThan(
        ballista.cost + ballista.upgradeCosts.slice(0, tier).reduce((a, b) => a + b, 0),
      )
    })
  }
  it('один поджог Огневика I не убивает начального лазутчика или бунтовщика', () => {
    const burn = TOWERS['mage'].tiers[0].burnDamage!
    expect(TOWERS['mage'].tiers[0].damage).toBe(0)
    expect(burn).toBeLessThan(ENEMIES['scout'].hp)
    expect(burn).toBeLessThan(ENEMIES['rebel'].hp)
  })
})

describe('проверка начала партии на компактных картах', () => {
  const opening: Strategy = {
    name: 'Три Лучника и поддержка',
    opening: ['archer', 'archer', 'archer'],
    loop: ['upgrade', 'ballista', 'upgrade', 'archer', 'frost', 'warlock', 'upgrade'],
  }
  for (const level of PLAYABLE_LEVELS) {
    it(`${level.name}: первые пять волн без потерь с обычным бюджетом`, () => {
      const result = playBot(level, opening, 5)
      expect(result.wavesCleared).toBeGreaterThanOrEqual(5)
      expect(result.waves.find((wave) => wave.wave === 5)?.lives).toBe(level.startLives)
    })
  }
})
