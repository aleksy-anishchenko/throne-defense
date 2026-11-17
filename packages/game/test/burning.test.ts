import { expect, it } from 'vitest'
import { ENEMIES, TOWERS } from '../src/index.ts'
import { frostPulse, shootHoming, updateBurning, updateShots } from '../src/systems/combat.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

it('горение равномерное, повтор не складывает силу, слабый огонь не продлевает сильный', () => {
  const game = newGame()
  const world = worldOf(game)
  const tower = game.build('mage', 5, 11)!
  const enemy = placeEnemy(game, 'ogre', 2)
  const ignite = (damage: number) => {
    shootHoming(world, tower, enemy, {
      look: 'orb',
      speed: 100,
      damage: 0,
      damageKind: 'magic',
      burnDamage: damage,
      burnDuration: 5,
    })
    updateShots(world, 1)
    world.state.shots = world.state.shots.filter((shot) => !shot.isDone)
  }
  const hp = enemy.hp
  ignite(30)
  updateBurning(world, 1)
  expect(hp - enemy.hp).toBeCloseTo(6)
  ignite(30)
  expect(enemy.burnDamageLeft).toBeCloseTo(30)
  expect(enemy.burnTimeLeft).toBe(5)
  ignite(90)
  updateBurning(world, 1)
  expect(hp - enemy.hp).toBeCloseTo(24)
  ignite(30)
  expect(enemy.burnTimeLeft).toBe(4)
  expect(enemy.burnDamageLeft).toBeCloseTo(72)
  updateBurning(world, 4)
  expect(enemy.burnTimeLeft).toBe(0)
  ignite(30)
  expect(enemy.burnDamageLeft).toBe(30)
})

it('башни поддержки и попадание Огневика не наносят прямого урона', () => {
  for (const id of ['mage', 'frost', 'trapper', 'warlock']) {
    expect(
      TOWERS[id].tiers.map((tier) => tier.damage),
      id,
    ).toEqual([0, 0, 0])
  }
  const game = newGame()
  const world = worldOf(game)
  const tower = game.build('frost', 5, 11)!
  const enemy = placeEnemy(game, 'ogre', 2)
  enemy.x = tower.x
  enemy.y = tower.y
  const hp = enemy.hp
  frostPulse(world, tower, TOWERS['frost'].tiers[0])
  expect(enemy.hp).toBe(hp)
  expect(enemy.slowTimeLeft).toBeGreaterThan(0)
})

it('один поджог Огневика I не убивает начальных бунтовщика и лазутчика', () => {
  const damage = TOWERS['mage'].tiers[0].burnDamage!
  for (const id of ['rebel', 'scout']) {
    expect(damage, id).toBeLessThan(ENEMIES[id].hp)
  }
})
