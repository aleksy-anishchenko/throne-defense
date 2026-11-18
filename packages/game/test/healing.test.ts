import { describe, expect, it } from 'vitest'
import { ENEMIES, SIMULATION_STEP } from '../src/index.ts'
import { updateHealers } from '../src/systems/enemies.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

/** Проклятие накладывает настоящая башня; первый импульс лечения откладываем до её выстрела. */
function cursedOgre(tier: number) {
  const game = newGame()
  game.state.gold = 1000
  game.build('warlock', 5, 11)
  for (let i = 0; i < tier; i++) game.upgrade(5, 11)
  const healer = placeEnemy(game, 'healer', 1.5)
  const ogre = placeEnemy(game, 'ogre', 1.7)
  ogre.hp = 1
  game.step(SIMULATION_STEP)
  return { game, healer, ogre }
}

describe('проклятие и лечение', () => {
  it('Узурпатор не получает лечение от знахаря', () => {
    const game = newGame()
    const healer = placeEnemy(game, 'healer', 1.5)
    const boss = placeEnemy(game, 'boss', 1.7)
    boss.hp = 1
    healer.healCooldownLeft = 0
    game.step(SIMULATION_STEP)
    expect(boss.hp).toBe(1)
  })

  for (const [tier, share] of [0.8, 0.7, 0.6].entries()) {
    it(`Колдун ${tier + 1}: получатель сохраняет ${share * 100}% лечения`, () => {
      const { game, healer, ogre } = cursedOgre(tier)
      expect(ogre.curseTimeLeft).toBeGreaterThan(0)
      healer.healCooldownLeft = 0
      game.step(SIMULATION_STEP)
      expect(ogre.hp).toBeCloseTo(1 + healer.maxHp * ENEMIES['healer'].heal!.amount * share)
    })
  }

  it('проклятый знахарь полностью лечит непроклятого получателя', () => {
    const game = newGame()
    const healer = placeEnemy(game, 'healer', 1.5)
    const ogre = placeEnemy(game, 'ogre', 1.7)
    healer.curseTimeLeft = 10
    healer.curseAmount = 0.65
    healer.healCooldownLeft = 0
    ogre.hp = 1
    game.step(SIMULATION_STEP)
    expect(ogre.hp).toBeCloseTo(1 + healer.maxHp * ENEMIES['healer'].heal!.amount)
  })

  it('лечение ослаблено и от непроклятого знахаря, если проклят получатель', () => {
    const { game, healer, ogre } = cursedOgre(2)
    healer.curseTimeLeft = 0
    healer.healCooldownLeft = 0
    game.step(SIMULATION_STEP)
    expect(ogre.hp).toBeCloseTo(1 + healer.maxHp * ENEMIES['healer'].heal!.amount * 0.6)
  })

  it('два Колдуна дают сильнейшее снижение, без сложения до запрета лечения', () => {
    const { game, healer, ogre } = cursedOgre(2)
    game.build('warlock', 3, 11)
    game.upgrade(3, 11)
    game.step(SIMULATION_STEP)
    healer.healCooldownLeft = 0
    game.step(SIMULATION_STEP)
    expect(ogre.curseAmount).toBeCloseTo(0.4)
    expect(ogre.hp).toBeCloseTo(1 + healer.maxHp * ENEMIES['healer'].heal!.amount * 0.6)
  })

  it('в кадр окончания проклятия возвращается полное лечение, даже если сила ещё записана', () => {
    const { game, healer, ogre } = cursedOgre(2)
    game.sell(5, 11)
    ogre.curseTimeLeft = SIMULATION_STEP
    healer.healCooldownLeft = 0
    game.step(SIMULATION_STEP)
    expect(ogre.curseTimeLeft).toBe(0)
    expect(ogre.curseAmount).toBeCloseTo(0.4)
    expect(ogre.hp).toBeCloseTo(1 + healer.maxHp * ENEMIES['healer'].heal!.amount)
  })

  it('знахари могут лечить друг друга; снижение зависит от каждого получателя', () => {
    const game = newGame()
    const cursed = placeEnemy(game, 'healer', 1.5)
    const normal = placeEnemy(game, 'healer', 1.7)
    cursed.hp = normal.hp = 1
    cursed.healCooldownLeft = normal.healCooldownLeft = 0
    cursed.curseTimeLeft = 10
    cursed.curseAmount = 0.65
    game.step(SIMULATION_STEP)
    const amount = normal.maxHp * ENEMIES['healer'].heal!.amount
    expect(cursed.hp).toBeCloseTo(1 + amount * 0.35)
    expect(normal.hp).toBeCloseTo(1 + amount)
  })

  for (const wave of [30, 34, 35]) {
    it(`волна ${wave}: несколько знахарей лечат проклятого огра на 65% слабее`, () => {
      const game = newGame()
      game.state.wave = wave
      const count = game
        .waveGroups(wave)
        .filter(([id]) => id === 'healer')
        .reduce((sum, [, count]) => sum + count, 0)
      const healers = Array.from({ length: count }, () => placeEnemy(game, 'healer', 1.5))
      const ogre = placeEnemy(game, 'ogre', 1.7)
      const initialHp = ogre.maxHp * 0.1
      ogre.hp = initialHp
      for (const healer of healers) healer.healCooldownLeft = 0
      updateHealers(worldOf(game), SIMULATION_STEP)
      const normalHealing = ogre.hp - initialHp

      ogre.hp = initialHp
      ogre.curseTimeLeft = 10
      ogre.curseAmount = 0.65
      for (const healer of healers) healer.healCooldownLeft = 0
      updateHealers(worldOf(game), SIMULATION_STEP)
      const cursedHealing = ogre.hp - initialHp
      expect(normalHealing).toBeCloseTo(count * healers[0].maxHp * ENEMIES['healer'].heal!.amount)
      expect(cursedHealing / normalHealing).toBeCloseTo(0.35)
      expect(cursedHealing).toBeGreaterThan(0)
    })
  }
})
