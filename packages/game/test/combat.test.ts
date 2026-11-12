import { describe, expect, it } from 'vitest'
import { SIMULATION_STEP } from '../src/index.ts'
import { damageEnemy } from '../src/systems/combat.ts'
import type { World } from '../src/types.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

describe('урон и броня', () => {
  it('физический урон режется бронёй', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'armor') // броня 5
    damageEnemy(worldOf(game), enemy, 9, 'physical')
    expect(enemy.maxHp - enemy.hp).toBe(4)
  })

  it('физический урон не бывает меньше 1', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'armor')
    damageEnemy(worldOf(game), enemy, 3, 'physical')
    expect(enemy.maxHp - enemy.hp).toBe(1)
  })

  it('пронзающий урон режется только половиной брони', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'armor')
    damageEnemy(worldOf(game), enemy, 55, 'piercing')
    expect(enemy.maxHp - enemy.hp).toBe(52.5)
  })

  it('магический урон броню игнорирует', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'armor')
    damageEnemy(worldOf(game), enemy, 16, 'magic')
    expect(enemy.maxHp - enemy.hp).toBe(16)
  })

  it('за убийство дают золото, очки и события hit и kill', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'rebel')
    const gold = game.state.gold
    const events: string[] = []
    const world: World = { ...worldOf(game), emit: (type) => events.push(type) }

    damageEnemy(world, enemy, 999, 'magic')

    expect(enemy.isDead).toBe(true)
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
    const enemy = placeEnemy(game, 'rebel', 1.5) // у двери, рядом с башней
    game.step(SIMULATION_STEP)
    expect(enemy.slowFactor).toBeCloseTo(0.4)
    expect(enemy.slowTimeLeft).toBeGreaterThan(0)
  })

  it('узурпатора замедляет вдвое слабее', () => {
    const game = newGame()
    game.build('frost', 5, 11)
    const boss = placeEnemy(game, 'boss', 1.5)
    game.step(SIMULATION_STEP)
    expect(boss.slowFactor).toBeCloseTo(0.2)
  })
})
