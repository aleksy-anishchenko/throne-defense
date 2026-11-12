import { describe, expect, it } from 'vitest'
import { SIMULATION_STEP, TOWERS, isFullRefund } from '../src/index.ts'
import { newGame, recordEvents } from './helpers.ts'

describe('постройка', () => {
  it('списывает золото и занимает клетку', () => {
    const game = newGame()
    const tower = game.build('archer', 5, 11)

    expect(tower).not.toBeNull()
    expect(game.state.gold).toBe(150 - TOWERS['archer'].cost)
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
    expect(game.state.gold).toBe(1000 - 50 - 40 - 70)
  })

  it('до начала волны продажа возвращает всё — это «отмена» постройки и улучшений', () => {
    const game = newGame()
    game.build('archer', 5, 11) // 50
    game.upgrade(5, 11) // +40 → вложено 90
    const before = game.state.gold

    expect(isFullRefund(game.towerAt(5, 11)!)).toBe(true)
    expect(game.sell(5, 11)).toBe(90)
    expect(game.state.gold).toBe(before + 90)
    expect(game.isCellFree(5, 11)).toBe(true)
    expect(game.state.towers).toHaveLength(0)
  })

  it('после начала волны — 60% вложенного', () => {
    const game = newGame()
    game.build('archer', 5, 11)
    game.upgrade(5, 11) // вложено 90
    game.startWave()
    expect(isFullRefund(game.towerAt(5, 11)!)).toBe(false)
    expect(game.sell(5, 11)).toBe(54) // floor(90 × 0.6)
  })

  it('улучшение между волнами возвращается целиком, старое вложение — на 60%', () => {
    const game = newGame()
    game.state.gold = 1000
    game.build('archer', 5, 11) // 50
    game.startWave()
    game.state.spawnQueue = []
    game.step(SIMULATION_STEP) // волна отбита, снова между волнами
    game.upgrade(5, 11) // +40 — ещё не было в бою
    expect(game.sell(5, 11)).toBe(30 + 40) // floor(50 × 0.6) + 40
  })

  it('построенная во время волны сразу в бою — полного возврата нет', () => {
    const game = newGame()
    game.startWave()
    game.build('archer', 5, 11)
    expect(game.sell(5, 11)).toBe(30) // floor(50 × 0.6)
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
