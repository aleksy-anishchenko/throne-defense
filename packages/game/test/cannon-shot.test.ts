import { expect, it } from 'vitest'
import { TOWERS } from '../src/index.ts'
import { shootHoming, updateShots } from '../src/systems/combat.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

it('ядро летит в точку выстрела, а урон убывает к краю взрыва', () => {
  const game = newGame()
  const world = worldOf(game)
  game.state.gold = TOWERS['cannon'].cost
  const tower = game.build('cannon', 5, 11)!
  const target = placeEnemy(game, 'rebel', 2)
  const center = placeEnemy(game, 'rebel', 2)
  const edge = placeEnemy(game, 'rebel', 2)
  target.x = center.x = edge.x = 5
  target.y = center.y = edge.y = 5
  shootHoming(world, tower, target, {
    look: 'cannonball',
    speed: 100,
    damage: 20,
    damageKind: 'physical',
    splashRadius: 1,
    tracksTarget: false,
    splashEdgeDamageShare: 0.5,
  })
  target.x = 7 // цель успела уйти за пределы взрыва
  edge.x = 6
  const hp = target.hp
  updateShots(world, 1)
  expect(target.hp).toBe(hp)
  expect(center.hp).toBe(hp - 20)
  expect(edge.hp).toBe(hp - 10)
})

it('обычный снаряд продолжает следовать за целью и наносит полный урон', () => {
  const game = newGame()
  const world = worldOf(game)
  const tower = game.build('archer', 5, 11)!
  const enemy = placeEnemy(game, 'rebel', 2)
  shootHoming(world, tower, enemy, {
    look: 'arrow',
    speed: 100,
    damage: 7,
    damageKind: 'physical',
  })
  enemy.x += 2
  const hp = enemy.hp
  updateShots(world, 1)
  expect(enemy.hp).toBe(hp - 7)
})
