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
