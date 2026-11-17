import { describe, expect, it, vi } from 'vitest'
import { PLAYABLE_LEVELS, createGame, treasuryIncomeOf } from '@throne/game'
import {
  drawTreasuryBonuses,
  drawTreasuryBonus,
  drawTreasuryNetwork,
  drawTreasuryPreviewLinks,
  focusedTreasuryBonuses,
  focusedTreasuryLinks,
  treasuryPlacementPreview,
  treasurySynergy,
} from './treasury'
import type { Canvas2D } from './shapes'

function newGame() {
  const game = createGame({
    ...PLAYABLE_LEVELS[0],
    props: [],
    pathPoints: [
      [3.5, 11.5],
      [3.5, 0.8],
    ],
  })
  game.reset()
  game.state.gold = 5000
  return game
}

function drawingContext() {
  const calls = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 0.12 })),
    fillText: vi.fn(),
  }
  return { ctx: calls as unknown as Canvas2D, calls }
}

describe('отображение соседства Казён', () => {
  it('у соседей по диагонали одна общая связь и отдельный бонус у каждого', () => {
    const game = newGame()
    const first = game.build('treasury', 0, 0)!
    const second = game.build('treasury', 1, 1)!
    const result = treasurySynergy(game.state.towers)
    expect(result.links).toEqual([{ from: first, to: second }])
    expect(result.bonuses).toEqual([
      { tower: first, bonus: 0.1 },
      { tower: second, bonus: 0.1 },
    ])
    expect(treasurySynergy([second, first]).links).toEqual(result.links)
  })

  it('через клетку связи нет; другая башня не создаёт синергию', () => {
    const game = newGame()
    game.build('treasury', 0, 0)
    game.build('treasury', 0, 2)
    game.build('archer', 1, 1)
    const result = treasurySynergy(game.state.towers)
    expect(result.links).toEqual([])
    expect(result.bonuses.map(({ bonus }) => bonus)).toEqual([0, 0])
  })

  it('у каждой Казны свой процент, а максимум в плашке совпадает с правилами игры', () => {
    const game = newGame()
    const center = game.build('treasury', 1, 1)!
    for (const [col, row] of [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ]) {
      game.build('treasury', col, row)
    }
    const result = treasurySynergy(game.state.towers)
    expect(result.bonuses.find(({ tower }) => tower === center)?.bonus).toBeCloseTo(0.3)
    expect(result.bonuses.some(({ bonus }) => bonus === 0.2)).toBe(true)
    expect(result.links).toHaveLength(
      new Set(result.links.map(({ from, to }) => `${from.id}:${to.id}`)).size,
    )
  })

  it('превью не начисляет доход и не меняет существующую оборону', () => {
    const game = newGame()
    const treasury = game.build('treasury', 0, 0)!
    const gold = game.state.gold
    const towers = [...game.state.towers]
    expect(treasuryPlacementPreview(towers, 1, 1)).toEqual({
      neighbors: [treasury],
      bonus: 0.1,
    })
    expect(treasuryPlacementPreview(towers, 0, 2)).toEqual({ neighbors: [], bonus: 0 })
    expect(treasuryPlacementPreview(towers, 0, 0)).toEqual({ neighbors: [], bonus: 0 })
    expect(game.state.gold).toBe(gold)
    expect(game.state.towers).toEqual(towers)
    expect(treasuryIncomeOf(towers, treasury)).toBe(12)
  })

  it('после продажи соседа связь и бонус сразу исчезают', () => {
    const game = newGame()
    const first = game.build('treasury', 0, 0)!
    game.build('treasury', 1, 1)
    game.sell(1, 1)
    expect(treasurySynergy(game.state.towers)).toEqual({
      links: [],
      bonuses: [{ tower: first, bonus: 0 }],
    })
  })

  it('без выбора вместо процентов рисует монетки, нулевой бонус скрыт', () => {
    const game = newGame()
    const isolated = game.build('treasury', 0, 3)!
    game.build('treasury', 0, 0)
    game.build('treasury', 1, 1)
    const { bonuses } = treasurySynergy(game.state.towers)
    const { ctx, calls } = drawingContext()
    drawTreasuryBonuses(ctx, bonuses, null, 40)
    expect(calls.fillText).not.toHaveBeenCalled()
    expect(calls.arc).toHaveBeenCalledTimes(2) // Два круглых фона значков.
    expect(calls.ellipse).toHaveBeenCalledTimes(6) // Три монеты в каждой стопке.
    drawTreasuryBonuses(ctx, bonuses, isolated, 40)
    expect(calls.fillText.mock.calls.map(([text]) => text)).toEqual(['+0%'])
  })

  it('проценты и связи только у выбранной Казны и непосредственных соседей, не всей цепочки', () => {
    const game = newGame()
    const first = game.build('treasury', 0, 0)!
    const neighbor = game.build('treasury', 1, 1)!
    const indirect = game.build('treasury', 2, 2)!
    const distant = game.build('treasury', 0, 4)!
    game.build('treasury', 1, 5)
    const { bonuses, links } = treasurySynergy(game.state.towers)
    expect(focusedTreasuryLinks(links, first)).toEqual([{ from: first, to: neighbor }])
    expect(focusedTreasuryBonuses(bonuses, first).map(({ tower }) => tower)).toEqual([
      first,
      neighbor,
    ])
    const { ctx, calls } = drawingContext()
    drawTreasuryBonuses(ctx, bonuses, first, 40)
    // У соседа собственный итоговый бонус +20%, даже если выбранная Казна даёт ему только +10%.
    expect(calls.fillText.mock.calls.map(([text]) => text)).toEqual(['+10%', '+20%'])
    expect(focusedTreasuryBonuses(bonuses, indirect).some(({ tower }) => tower === first)).toBe(
      false,
    )
    expect(focusedTreasuryBonuses(bonuses, first).some(({ tower }) => tower === distant)).toBe(
      false,
    )
  })

  it('выбор другой башни не раскрывает проценты и связи Казён', () => {
    const game = newGame()
    game.build('treasury', 0, 0)
    game.build('treasury', 1, 1)
    const bell = game.build('bell', 0, 2)!
    const { bonuses, links } = treasurySynergy(game.state.towers)
    const { ctx, calls } = drawingContext()
    drawTreasuryBonuses(ctx, bonuses, bell, 40)
    expect(calls.fillText).not.toHaveBeenCalled()
    expect(focusedTreasuryLinks(links, bell)).toEqual([])
    expect(focusedTreasuryBonuses(bonuses, bell)).toEqual([])
    expect(calls.arc).toHaveBeenCalledTimes(2)
    expect(calls.ellipse).toHaveBeenCalledTimes(6)
  })

  it('без выбора аура остаётся, но соединительные линии не рисуются', () => {
    const game = newGame()
    const first = game.build('treasury', 0, 0)!
    game.build('treasury', 1, 1)
    const { bonuses, links } = treasurySynergy(game.state.towers)
    const { ctx, calls } = drawingContext()
    drawTreasuryNetwork(ctx, bonuses, links)
    expect(calls.arc).toHaveBeenCalledTimes(2) // Две ауры, без монетки-соединителя.
    expect(calls.lineTo).not.toHaveBeenCalled()
    calls.arc.mockClear()
    drawTreasuryNetwork(ctx, bonuses, links, first)
    expect(calls.arc).toHaveBeenCalledTimes(3)
    expect(calls.lineTo).toHaveBeenCalled()
  })

  it('превью отличается стрелкой и пунктиром, сплошная связь — монеткой', () => {
    const game = newGame()
    const treasury = game.build('treasury', 0, 0)!
    const neighbor = game.build('treasury', 1, 1)!
    const { ctx, calls } = drawingContext()
    drawTreasuryBonus(ctx, { x: 2.5, y: 1.5 }, 0.1, 40, true)
    expect(calls.fillText.mock.calls[0][0]).toBe('→ +10%')
    expect(calls.setLineDash).toHaveBeenCalledWith([0.05, 0.045])
    calls.arc.mockClear()
    drawTreasuryPreviewLinks(ctx, { x: 2.5, y: 1.5 }, [neighbor], true)
    expect(calls.setLineDash).toHaveBeenCalledWith([0.06, 0.07])
    expect(calls.arc).not.toHaveBeenCalled()
    drawTreasuryNetwork(ctx, [], [{ from: treasury, to: neighbor }], treasury)
    expect(calls.arc).toHaveBeenCalled()
  })

  it('плашка у верхней границы не обрезается и остаётся читаемой на маленькой клетке', () => {
    const { ctx, calls } = drawingContext()
    drawTreasuryBonus(ctx, { x: 0.5, y: 0.5 }, 0.3, 32)
    expect(calls.fillText.mock.calls[0][0]).toBe('+30%')
    expect(calls.fillText.mock.calls[0][2]).toBeGreaterThan(0)
    expect(ctx.font).toContain('0.3px')
    expect(calls.moveTo.mock.calls.every(([, y]) => y >= 0)).toBe(true)
  })

  it('вертикальная связь проходит сбоку от плашки, а не под ней', () => {
    const game = newGame()
    const first = game.build('treasury', 0, 0)!
    const second = game.build('treasury', 0, 1)!
    const { ctx, calls } = drawingContext()
    drawTreasuryNetwork(ctx, [], [{ from: first, to: second }], first)
    const [x, y] = calls.arc.mock.calls[0]
    expect(x).toBeCloseTo(first.x + 0.445)
    expect(y).toBeCloseTo(1)
    expect(x).toBeGreaterThan(second.x + 0.82 / 2)
  })

  it('стопка монет сохраняет прежний размер и место значка без символа «0»', () => {
    const game = newGame()
    const treasury = game.build('treasury', 0, 0)!
    game.build('treasury', 1, 1)
    const { ctx, calls } = drawingContext()
    drawTreasuryBonuses(ctx, treasurySynergy(game.state.towers).bonuses, null, 40)
    const [x, y, radius] = calls.arc.mock.calls[0]
    expect(x).toBeCloseTo(treasury.x - 0.28)
    expect(y).toBeCloseTo(treasury.y - 0.27)
    expect(radius).toBe(0.12)
    expect(calls.fillText).not.toHaveBeenCalled()
    const coins = calls.ellipse.mock.calls.slice(0, 3)
    expect(coins).toHaveLength(3)
    expect(new Set(coins.map(([, coinY]) => coinY)).size).toBe(3)
    expect(coins.every(([coinX, , radiusX, radiusY]) => coinX === x && radiusX > radiusY)).toBe(
      true,
    )
  })
})
