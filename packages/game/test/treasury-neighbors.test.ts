import { describe, expect, it } from 'vitest'
import { treasuryBonusOf, treasuryIncomeOf, treasuryNeighbors } from '../src/index.ts'
import { payTowerIncome } from '../src/systems/treasury.ts'
import { newGame, worldOf } from './helpers.ts'

describe('соседство Казён', () => {
  it('учитывает соседей по стороне и диагонали, округляет вниз и ограничивает бонус', () => {
    const game = newGame()
    game.state.gold = 2000
    const center = game.build('treasury', 1, 1)!
    const towers = game.state.towers
    expect(treasuryIncomeOf(towers, center)).toBe(12)
    const side = game.build('treasury', 0, 1)!
    expect(treasuryNeighbors(towers, center)).toEqual([side])
    expect(treasuryIncomeOf(towers, center)).toBe(13)
    game.build('treasury', 0, 0)
    expect(treasuryIncomeOf(towers, center)).toBe(14)
    game.build('treasury', 1, 0)
    expect(treasuryBonusOf(towers, center)).toBeCloseTo(0.3)
    expect(treasuryIncomeOf(towers, center)).toBe(15)
    game.build('treasury', 2, 0)
    expect(treasuryNeighbors(towers, center)).toHaveLength(4)
    expect(treasuryBonusOf(towers, center)).toBeCloseTo(0.3)
    expect(treasuryIncomeOf(towers, center)).toBe(15)
    expect(game.upgrade(1, 1)).toBe(true)
    expect(treasuryIncomeOf(towers, center)).toBe(29)
    expect(game.upgrade(1, 1)).toBe(true)
    expect(treasuryIncomeOf(towers, center)).toBe(49)
    game.sell(0, 0)
    game.sell(1, 0)
    expect(treasuryIncomeOf(towers, center)).toBe(45)
  })

  it('каждая Казна получает свой бонус, другие башни не считаются и при продаже доход меняется', () => {
    const game = newGame()
    game.state.gold = 1000
    const first = game.build('treasury', 0, 0)!
    const second = game.build('treasury', 1, 1)!
    const distant = game.build('treasury', 6, 0)!
    game.build('archer', 1, 0)
    const towers = game.state.towers
    expect(treasuryIncomeOf(towers, first)).toBe(13)
    expect(treasuryIncomeOf(towers, second)).toBe(13)
    expect(treasuryIncomeOf(towers, distant)).toBe(12)
    const before = game.state.gold
    payTowerIncome(worldOf(game))
    expect(game.state.gold - before).toBe(38)
    game.sell(1, 1)
    const afterSale = game.state.gold
    payTowerIncome(worldOf(game))
    expect(game.state.gold - afterSale).toBe(24)
  })
})
