import { expect, it } from 'vitest'
import { ENEMIES, TOWERS, hpMultiplier } from '../src/index.ts'
import { newGame, placeEnemy } from './helpers.ts'

it('здоровье врагов учитывает изменения v25–v30', () => {
  const original: Record<string, number> = {
    rebel: 37,
    scout: 22,
    armor: 110,
    ogre: 390,
    healer: 50,
    gorynych: 380,
    snakelet: 45,
  }
  const game = newGame()
  game.state.wave = 5
  for (const [id, hp] of Object.entries(original)) {
    const adjustment = id === 'healer' ? 0.9 : ['ogre', 'gorynych'].includes(id) ? 0.95 : 1
    expect(ENEMIES[id].hp).toBeCloseTo(hp * 1.15 * adjustment * 0.9)
    expect(placeEnemy(game, id).maxHp).toBe(
      Math.round(hp * 1.15 * adjustment * 0.9 * hpMultiplier(5, game.level.waveCount)),
    )
  }
  expect(ENEMIES['boss'].hp).toBe(1275)
  for (const wave of [20, 30]) {
    game.state.wave = wave
    expect(placeEnemy(game, 'boss').maxHp).toBe(
      Math.round(1275 * hpMultiplier(wave, game.level.waveCount)),
    )
  }
})

it('Баллиста дороже, бьёт слабее и медленнее', () => {
  const ballista = TOWERS['ballista']
  expect(ballista.cost).toBe(160)
  expect(ballista.upgradeCosts).toEqual([140, 210])
  expect(ballista.tiers.map((tier) => tier.damage)).toEqual([75, 125, 195])
  expect(ballista.tiers.map((tier) => tier.cooldown)).toEqual([3.2, 3, 2.8])
})

it('согласованная сила Звонаря и Колдуна — 20/30/40%, не прежние значения v8', () => {
  expect(TOWERS['bell'].tiers.map((tier) => tier.fireRateBonus)).toEqual([0.2, 0.3, 0.4])
  expect(TOWERS['warlock'].tiers.map((tier) => tier.curseAmount)).toEqual([0.2, 0.3, 0.4])
})

it('Пушкарь сохраняет согласованные цену и тяжёлый редкий выстрел', () => {
  const cannon = TOWERS['cannon']
  expect(cannon.cost).toBe(340)
  expect(cannon.upgradeCosts).toEqual([160, 220])
  expect(cannon.tiers.map((tier) => tier.damage)).toEqual([100, 160, 240])
  expect(cannon.tiers.map((tier) => tier.cooldown)).toEqual([4.8, 4.6, 4.4])
})
