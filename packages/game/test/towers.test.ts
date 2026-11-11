import { describe, expect, it } from 'vitest'
import { TOWERS } from '../src/index.ts'
import { newGame, recordEvents } from './helpers.ts'

describe('постройка', () => {
  it('списывает золото и занимает клетку', () => {
    const game = newGame()
    const tower = game.build('archer', 5, 11)

    expect(tower).not.toBeNull()
    expect(game.state.gold).toBe(150 - TOWERS.archer.cost)
    expect(game.towerAt(5, 11)).toBe(tower)
    expect(game.isCellFree(5, 11)).toBe(false)
  })

  it('нельзя строить на ковре, на помосте, на занятой клетке и за краем поля', () => {
    const game = newGame()
    game.build('archer', 5, 11)

    expect(game.build('archer', 4, 12)).toBeNull() // ковёр у двери
    expect(game.build('archer', 4, 0)).toBeNull() // помост с троном
    expect(game.build('archer', 5, 11)).toBeNull() // занято
    expect(game.build('archer', -1, 0)).toBeNull()
    expect(game.build('archer', 9, 0)).toBeNull()
    expect(game.state.gold).toBe(100) // золото списали только один раз
  })

  it('нельзя строить без золота', () => {
    const game = newGame()
    game.state.gold = 129
    expect(game.build('ballista', 5, 11)).toBeNull()
    expect(game.state.gold).toBe(129)
  })

  it('нельзя строить, пока партия не начата', () => {
    const game = newGame()
    game.state.phase = 'idle'
    expect(game.build('archer', 5, 11)).toBeNull()
  })
})

describe('улучшение и продажа', () => {
  it('улучшение стоит денег и упирается в максимальный уровень', () => {
    const game = newGame()
    game.state.gold = 1000
    game.build('archer', 5, 11)

    expect(game.upgrade(5, 11)).toBe(true)
    expect(game.upgrade(5, 11)).toBe(true)
    expect(game.upgrade(5, 11)).toBe(false) // уже III
    expect(game.towerAt(5, 11)!.tier).toBe(2)
    expect(game.state.gold).toBe(1000 - 50 - 45 - 85)
  })

  it('продажа возвращает 60% вложенного, включая улучшения', () => {
    const game = newGame()
    game.build('archer', 5, 11) // 50
    game.upgrade(5, 11) // +45 → вложено 95
    const before = game.state.gold

    expect(game.sell(5, 11)).toBe(57) // floor(95 × 0.6)
    expect(game.state.gold).toBe(before + 57)
    expect(game.isCellFree(5, 11)).toBe(true)
    expect(game.state.towers).toHaveLength(0)
  })

  it('сообщает о постройке, улучшении и продаже событиями', () => {
    const game = newGame()
    const recordedEvents = recordEvents(game)
    game.build('archer', 5, 11)
    game.upgrade(5, 11)
    game.sell(5, 11)
    expect(recordedEvents).toEqual(['build', 'upgrade', 'sell'])
  })
})
