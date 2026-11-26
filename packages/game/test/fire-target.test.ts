import { expect, it } from 'vitest'
import { updateTowers } from '../src/systems/towers.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

it('Огневик выбирает первого негорящего; если все горят — первого по пути', () => {
  const game = newGame()
  const tower = game.build('mage', 5, 11)!
  const first = placeEnemy(game, 'rebel', 2)
  const second = placeEnemy(game, 'rebel', 1)
  const third = placeEnemy(game, 'rebel', 0.5)
  for (const [index, enemy] of [first, second, third].entries()) {
    enemy.x = tower.x + 0.5
    enemy.y = tower.y
    enemy.pathDistance = 3 - index
  }
  first.burnTimeLeft = 2
  const shoot = () => {
    tower.cooldownLeft = 0
    updateTowers(worldOf(game), 0)
    const shot = game.state.shots.at(-1)!
    expect(shot.kind).toBe('homing')
    return shot.kind === 'homing' ? shot.target : null
  }
  expect(shoot()).toBe(second)
  second.burnTimeLeft = 2
  expect(shoot()).toBe(third)
  third.burnTimeLeft = 2
  expect(shoot()).toBe(first)
  first.burnTimeLeft = 0
  expect(shoot()).toBe(first)
})

it.each(['boiling-oil', 'wildfire'] as const)(
  'Огневик с аспектом %s предпочитает цель, на которой горит только другой аспект',
  (aspect) => {
    const game = newGame()
    game.state.gold = 450
    const mage = game.build('mage', 5, 11)!
    game.upgrade(5, 11)
    game.upgrade(5, 11)
    game.specialize(5, 11, aspect)
    const first = placeEnemy(game, 'ogre', 2)
    const second = placeEnemy(game, 'ogre', 1.5)
    const [blueTarget, oilTarget] = aspect === 'wildfire' ? [first, second] : [second, first]
    Object.assign(blueTarget, { wildfire: true, burnTimeLeft: 2, burnDamageLeft: 88 })
    oilTarget.oilBurn = { burnTimeLeft: 5, burnDamageLeft: 73 }
    mage.cooldownLeft = 0
    updateTowers(worldOf(game), 0)
    const shot = game.state.shots.at(-1)
    expect(shot?.kind === 'homing' && shot.target).toBe(second)
  },
)
