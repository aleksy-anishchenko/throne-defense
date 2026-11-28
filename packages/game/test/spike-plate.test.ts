import { expect, it } from 'vitest'
import { createGame, PLAYABLE_LEVELS } from '../src/index.ts'
import { updateSpikePlates } from '../src/systems/combat.ts'
import { placeEnemy, worldOf } from './helpers.ts'

function setup(aspect?: string) {
  const game = createGame(PLAYABLE_LEVELS[0])
  game.reset()
  game.state.selectedRewards.push(
    { rewardId: 'outpost', wave: 5 },
    { rewardId: 'spike-plate', wave: 10 },
  )
  game.state.gold = 1000
  const tower = game.build('spike-plate', 2, 8)!
  game.upgrade(2, 8)
  game.upgrade(2, 8)
  if (aspect) expect(game.specialize(2, 8, aspect)).toBe(true)
  function enter(id: string) {
    const enemy = placeEnemy(game, id)
    Object.assign(enemy, { x: tower.x, y: tower.y, hp: 2000, maxHp: 2000 })
    return enemy
  }
  function step(dt: number) {
    game.state.time += dt
    updateSpikePlates(worldOf(game), dt)
  }
  return { game, tower, enter, step }
}

it('продажа освобождает единственное место укрепления в обоих направлениях', () => {
  const { game } = setup()
  expect(game.build('outpost', 3, 9)).toBeNull()
  game.sell(2, 8)
  expect(game.build('outpost', 3, 9)).toBeTruthy()
  expect(game.build('spike-plate', 2, 8)).toBeNull()
})

it('кровотечение за три секунды следует за врагом и зависит от полного здоровья', () => {
  const { enter, step } = setup()
  const rebel = enter('rebel')
  const boss = enter('boss')
  step(0.05)
  expect(rebel.hp).toBe(1900)
  const bossAfterHit = boss.hp
  rebel.x = boss.x = 0
  step(1)
  expect(rebel.hp).toBeCloseTo(1800)
  step(2)
  expect(rebel.hp).toBeCloseTo(1600)
  expect(bossAfterHit - boss.hp).toBeCloseTo(160)
  expect(boss.bleeding).toBeUndefined()
})

it('настил бьёт вновь вошедшего один раз и опускается через секунду', () => {
  const { enter, step } = setup('spiked-floor')
  const first = enter('rebel')
  step(0.01)
  const second = enter('rebel')
  step(0.5)
  expect(first.hp).toBeCloseTo(1850)
  expect(second.hp).toBe(1900)
  const late = enter('rebel')
  step(0.51)
  expect(late.hp).toBe(2000)
  step(2)
  expect(late.hp).toBe(1900)
})

it('колья ждут великана и бьют также стоящих рядом обычных врагов', () => {
  const { enter, step } = setup('giant-stakes')
  const rebel = enter('rebel')
  step(3)
  expect(rebel.hp).toBe(2000)
  const ogre = enter('ogre')
  step(0.05)
  expect(rebel.hp).toBe(1800)
  expect(ogre.hp).toBe(1800)
  expect(ogre.bleeding?.damagePerSecond).toBe(100)
})

it('на обоих поворотах шипы закрыты, между ними и на вертикальной прямой разрешены', () => {
  const game = createGame(PLAYABLE_LEVELS[0])
  game.reset()
  game.state.selectedRewards.push(
    { rewardId: 'outpost', wave: 5 },
    { rewardId: 'spike-plate', wave: 10 },
  )
  expect(game.isCellFree(3, 8, 'spike-plate')).toBe(false)
  expect(game.isCellFree(1, 8, 'spike-plate')).toBe(false)
  expect(game.isCellFree(2, 8, 'spike-plate')).toBe(true)
  expect(game.isCellFree(3, 9, 'spike-plate')).toBe(true)
})
