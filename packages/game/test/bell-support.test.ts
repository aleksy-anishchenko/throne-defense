import { describe, expect, it } from 'vitest'
import {
  PLAYABLE_LEVELS,
  SIMULATION_STEP,
  TOWER_LIST,
  bellCoverage,
  createGame,
  fireRateBonusOf,
  fireRateSourceOf,
} from '../src/index.ts'

function newGame() {
  const game = createGame({
    ...PLAYABLE_LEVELS[0],
    props: [],
    blockedCells: [],
    pathPoints: [
      [6.5, 11.5],
      [6.5, 0.8],
    ],
  })
  game.reset()
  game.state.gold = 10_000
  return game
}

describe('источник ускорения Звонаря', () => {
  it.each(TOWER_LIST)('$name: источник и покрытие соответствуют takesFireRateBonus', (def) => {
    const game = newGame()
    const bell = game.build('bell', 1, 1)!
    const tower = game.build(def.id, 0, 0)!
    expect(fireRateSourceOf(game.state.towers, tower)).toBe(def.takesFireRateBonus ? bell : null)
    expect(fireRateBonusOf(game.state.towers, tower)).toBe(def.takesFireRateBonus ? 0.2 : 0)
    expect(bellCoverage(game.state.towers, bell)).toEqual(def.takesFireRateBonus ? [tower] : [])
  })

  it('из нескольких источников выбирает сильнейший, скорострельность не складывается', () => {
    const game = newGame()
    const archer = game.build('archer', 1, 0)!
    game.build('bell', 0, 0)
    const strong = game.build('bell', 1, 1)!
    for (const bonus of [0.3, 0.4]) {
      expect(game.upgrade(strong.col, strong.row)).toBe(true)
      expect(fireRateSourceOf(game.state.towers, archer)).toBe(strong)
      expect(fireRateBonusOf(game.state.towers, archer)).toBe(bonus)
      archer.cooldownLeft = 1
      game.step(SIMULATION_STEP)
      expect(archer.cooldownLeft).toBeCloseTo(1 - SIMULATION_STEP * (1 + bonus))
    }
  })

  it('равные ауры дают одну устойчивую связь независимо от порядка массива', () => {
    const game = newGame()
    const archer = game.build('archer', 1, 0)!
    const first = game.build('bell', 0, 0)!
    game.build('bell', 1, 1)
    expect(fireRateSourceOf(game.state.towers, archer)).toBe(first)
    expect(fireRateSourceOf([...game.state.towers].reverse(), archer)).toBe(first)
    expect(fireRateBonusOf(game.state.towers, archer)).toBe(0.2)
  })

  it('продажа сильного источника возвращает слабый, последнего — снимает бонус', () => {
    const game = newGame()
    const archer = game.build('archer', 1, 0)!
    const weak = game.build('bell', 0, 0)!
    const strong = game.build('bell', 1, 1)!
    game.upgrade(strong.col, strong.row)
    expect(fireRateSourceOf(game.state.towers, archer)).toBe(strong)
    game.sell(strong.col, strong.row)
    expect(fireRateSourceOf(game.state.towers, archer)).toBe(weak)
    expect(fireRateBonusOf(game.state.towers, archer)).toBe(0.2)
    game.sell(weak.col, weak.row)
    expect(fireRateSourceOf(game.state.towers, archer)).toBeNull()
    expect(fireRateBonusOf(game.state.towers, archer)).toBe(0)
  })

  it('каждое улучшение обновляет и дальность, и фактический источник', () => {
    const game = newGame()
    const bell = game.build('bell', 1, 1)!
    const straight = game.build('archer', 3, 1)!
    const knight = game.build('archer', 3, 2)!
    expect(bellCoverage(game.state.towers, bell)).toEqual([])
    expect(fireRateSourceOf(game.state.towers, straight)).toBeNull()
    game.upgrade(1, 1)
    expect(bellCoverage(game.state.towers, bell)).toEqual([straight])
    expect(fireRateSourceOf(game.state.towers, straight)).toBe(bell)
    expect(fireRateSourceOf(game.state.towers, knight)).toBeNull()
    game.upgrade(1, 1)
    expect(bellCoverage(game.state.towers, bell)).toEqual([straight, knight])
    expect(fireRateBonusOf(game.state.towers, knight)).toBe(0.4)
  })

  it('обычная атакующая башня не считается источником ауры', () => {
    const game = newGame()
    const archer = game.build('archer', 0, 0)!
    expect(bellCoverage(game.state.towers, archer)).toEqual([])
  })
})
