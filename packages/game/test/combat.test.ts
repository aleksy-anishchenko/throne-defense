import { describe, expect, it } from 'vitest'
import { hurt } from '../src/systems/combat.ts'
import type { World } from '../src/types.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

describe('урон и броня', () => {
  it('физический урон режется бронёй', () => {
    const game = newGame()
    const e = placeEnemy(game, 'armor') // броня 5
    hurt(worldOf(game), e, 9, 'phys')
    expect(e.maxHp - e.hp).toBe(4)
  })

  it('физический урон не бывает меньше 1', () => {
    const game = newGame()
    const e = placeEnemy(game, 'armor')
    hurt(worldOf(game), e, 3, 'phys')
    expect(e.maxHp - e.hp).toBe(1)
  })

  it('пронзающий урон режется только половиной брони', () => {
    const game = newGame()
    const e = placeEnemy(game, 'armor')
    hurt(worldOf(game), e, 55, 'pierce')
    expect(e.maxHp - e.hp).toBe(52.5)
  })

  it('магический урон броню игнорирует', () => {
    const game = newGame()
    const e = placeEnemy(game, 'armor')
    hurt(worldOf(game), e, 16, 'magic')
    expect(e.maxHp - e.hp).toBe(16)
  })

  it('за убийство дают золото, очки и события hit и kill', () => {
    const game = newGame()
    const e = placeEnemy(game, 'rebel')
    const gold = game.state.gold
    const events: string[] = []
    const world: World = { ...worldOf(game), emit: (type) => events.push(type) }

    hurt(world, e, 999, 'magic')

    expect(e.dead).toBe(true)
    expect(game.state.gold).toBe(gold + 6)
    expect(game.state.score).toBe(60)
    expect(game.state.kills).toBe(1)
    expect(events).toEqual(['hit', 'kill'])
  })
})

describe('Морозко', () => {
  it('замедляет врагов в радиусе', () => {
    const game = newGame()
    game.build('frost', 5, 11)
    const e = placeEnemy(game, 'rebel', 1.5) // у двери, рядом с башней
    game.step(1 / 60)
    expect(e.slowF).toBeCloseTo(0.35)
    expect(e.slowT).toBeGreaterThan(0)
  })

  it('узурпатора замедляет вдвое слабее', () => {
    const game = newGame()
    game.build('frost', 5, 11)
    const boss = placeEnemy(game, 'boss', 1.5)
    game.step(1 / 60)
    expect(boss.slowF).toBeCloseTo(0.175)
  })
})
