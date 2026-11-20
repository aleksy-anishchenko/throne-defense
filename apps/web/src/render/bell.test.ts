import { describe, expect, it, vi } from 'vitest'
import { PLAYABLE_LEVELS, TOWER_LIST, createGame, fireRateBonusOf } from '@throne/game'
import {
  bellBuffs,
  bellPlacementPreview,
  focusedBellBuffs,
  towerPlacementBellPreview,
} from '../utils/bellSupport'
import {
  drawBellConnections,
  drawBellIndicators,
  drawBellPreview,
  drawTowerBellPreview,
} from './bell'
import type { Canvas2D } from './shapes'

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

function drawingContext() {
  const calls = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 0.12 })),
    fillText: vi.fn(),
  }
  return { ctx: calls as unknown as Canvas2D, calls }
}

function battery() {
  const game = newGame()
  const first = game.build('archer', 0, 0)!
  const second = game.build('ballista', 2, 1)!
  const bell = game.build('bell', 1, 1)!
  const frost = game.build('frost', 0, 1)!
  const treasury = game.build('treasury', 0, 2)!
  return { game, first, second, bell, frost, treasury }
}

describe('показ бонусов Звонаря', () => {
  it('каждый получатель имеет только один фактический источник и процент', () => {
    const { game, first, second } = battery()
    const strong = game.build('bell', 2, 0)!
    game.upgrade(2, 0)
    game.upgrade(2, 0)
    const buffs = bellBuffs(game.state.towers)
    expect(buffs.map(({ tower, source, bonus }) => [tower.id, source.id, bonus])).toEqual([
      [first.id, strong.id, 0.4],
      [second.id, strong.id, 0.4],
    ])
  })

  it('при выборе источника показывает его получателей, при выборе получателя — одну связь', () => {
    const { game, first, bell, frost, treasury } = battery()
    const buffs = bellBuffs(game.state.towers)
    expect(focusedBellBuffs(buffs, bell)).toHaveLength(2)
    expect(focusedBellBuffs(buffs, first)).toEqual([buffs[0]])
    expect(focusedBellBuffs(buffs, null)).toEqual([])
    expect(focusedBellBuffs(buffs, frost)).toEqual([])
    expect(focusedBellBuffs(buffs, treasury)).toEqual([])
  })

  it('без выбора рисует колокольчики в нижних левых углах клеток', () => {
    const { game, first, second } = battery()
    const { ctx, calls } = drawingContext()
    drawBellIndicators(ctx, bellBuffs(game.state.towers), null, 40)
    expect(calls.translate).toHaveBeenCalledTimes(2)
    expect(calls.fillText).not.toHaveBeenCalled()
    expect(calls.arc.mock.calls.filter(([, , radius]) => radius === 0.1)).toEqual(
      [first, second].map(({ x, y }) => [x - 0.39, y + 0.39, 0.1, 0, Math.PI * 2]),
    )
  })

  it('при выборе Звонаря проценты показаны у каждого действительного получателя', () => {
    const { game, bell } = battery()
    const { ctx, calls } = drawingContext()
    const buffs = bellBuffs(game.state.towers)
    drawBellIndicators(ctx, buffs, bell, 40)
    expect(calls.fillText.mock.calls.map(([text]) => text)).toEqual(['+20%', '+20%'])
    calls.stroke.mockClear()
    drawBellConnections(ctx, focusedBellBuffs(buffs, bell))
    expect(calls.stroke).toHaveBeenCalledTimes(4)
  })

  it('при выборе получателя процент только один, остальные башни остаются со значками', () => {
    const { game, first } = battery()
    const { ctx, calls } = drawingContext()
    drawBellIndicators(ctx, bellBuffs(game.state.towers), first, 40)
    expect(calls.fillText.mock.calls.map(([text]) => text)).toEqual(['+20%'])
  })

  it('слабый или равный второй Звонарь не показывает фиктивный вклад', () => {
    const { game, bell } = battery()
    const other = game.build('bell', 2, 0)!
    expect(focusedBellBuffs(bellBuffs(game.state.towers), other)).toEqual([])
    game.upgrade(other.col, other.row)
    game.upgrade(other.col, other.row)
    const { ctx, calls } = drawingContext()
    drawBellIndicators(ctx, bellBuffs(game.state.towers), bell, 40)
    expect(calls.fillText).not.toHaveBeenCalled()
    expect(focusedBellBuffs(bellBuffs(game.state.towers), bell)).toEqual([])
  })

  it('после продажи связь и значки исчезают; новые башни и улучшения учитываются сразу', () => {
    const game = newGame()
    const bell = game.build('bell', 1, 1)!
    expect(bellBuffs(game.state.towers)).toEqual([])
    const archer = game.build('archer', 3, 1)!
    expect(bellBuffs(game.state.towers)).toEqual([])
    game.upgrade(1, 1)
    expect(bellBuffs(game.state.towers)).toEqual([{ source: bell, tower: archer, bonus: 0.3 }])
    game.sell(1, 1)
    expect(bellBuffs(game.state.towers)).toEqual([])
    const { ctx, calls } = drawingContext()
    drawBellIndicators(ctx, bellBuffs(game.state.towers), null, 40)
    expect(calls.arc).not.toHaveBeenCalled()
  })

  it('превью показывает только подходящих получателей, ничего не меняя в игре', () => {
    const game = newGame()
    const archer = game.build('archer', 0, 0)!
    game.build('frost', 0, 1)
    game.build('warlock', 1, 0)
    const gold = game.state.gold
    const towers = [...game.state.towers]
    const preview = bellPlacementPreview(towers, 1, 1)
    expect(preview.covered).toEqual([archer])
    expect(preview.improved).toEqual([archer])
    expect(preview.bonus).toBe(0.2)
    expect(fireRateBonusOf(game.state.towers, archer)).toBe(0)
    expect(game.state.gold).toBe(gold)
    expect(game.state.towers).toEqual(towers)
  })

  it.each([0, 1, 2])('превью не обещает усиление уже ускоренным Звонарём ступени %i', (tier) => {
    const { game, bell } = battery()
    for (let i = 0; i < tier; i++) game.upgrade(bell.col, bell.row)
    const preview = bellPlacementPreview(game.state.towers, 1, 0)
    expect(preview.covered).toHaveLength(2)
    expect(preview.improved).toEqual([])
    const { ctx, calls } = drawingContext()
    drawBellPreview(ctx, preview, 40, true)
    expect(calls.fillText).not.toHaveBeenCalled()
    expect(calls.stroke).not.toHaveBeenCalled()
  })

  it('частичное перекрытие: пунктир и стрелка только у башни, которая станет сильнее', () => {
    const game = newGame()
    const supported = game.build('archer', 1, 0)!
    const fresh = game.build('archer', 3, 0)!
    game.build('bell', 0, 0)
    game.upgrade(0, 0)
    game.upgrade(0, 0)
    const preview = bellPlacementPreview(game.state.towers, 2, 0)
    expect(preview.covered).toEqual([supported, fresh])
    expect(preview.improved).toEqual([fresh])
    const { ctx, calls } = drawingContext()
    drawBellPreview(ctx, preview, 40, true)
    expect(calls.fillText.mock.calls.map(([text]) => text)).toEqual(['→ +20%'])
    expect(calls.setLineDash).toHaveBeenCalledWith([0.07, 0.07])
    expect(calls.setLineDash).toHaveBeenCalledWith([0.05, 0.045])
  })

  it('плашка на маленькой клетке у верхнего края остаётся внутри поля', () => {
    const { game, first } = battery()
    const { ctx, calls } = drawingContext()
    drawBellIndicators(ctx, bellBuffs(game.state.towers), first, 32)
    const [text, x, y] = calls.fillText.mock.calls[0]
    expect(text).toBe('+20%')
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
    expect(ctx.font).toContain('0.28px')
  })
})

describe('предпросмотр башни-получателя', () => {
  it.each(TOWER_LIST)('$name: будущий бонус совпадает с бонусом после постройки', (def) => {
    const game = newGame()
    const bell = game.build('bell', 1, 1)!
    const gold = game.state.gold
    const preview = towerPlacementBellPreview(game.state.towers, def.id, 0, 0)
    expect(game.state.gold).toBe(gold)
    expect(game.state.towers).toEqual([bell])
    if (def.takesFireRateBonus) {
      expect(preview?.source).toBe(bell)
      expect(preview?.tower).toEqual({ def, x: 0.5, y: 0.5 })
      expect(preview?.bonus).toBe(0.2)
    } else {
      expect(preview).toBeNull()
    }
    const built = game.build(def.id, 0, 0)!
    expect(fireRateBonusOf(game.state.towers, built)).toBe(preview?.bonus ?? 0)
  })

  it('нет Звонаря, башня вне зоны или неизвестный вид — бонус не обещается', () => {
    const game = newGame()
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 0, 0)).toBeNull()
    game.build('bell', 1, 1)
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 5, 5)).toBeNull()
    for (const id of ['missing', '__proto__', 'constructor']) {
      expect(towerPlacementBellPreview(game.state.towers, id, 0, 0)).toBeNull()
    }
  })

  it('дальность и сила предпросмотра сразу обновляются после улучшения Звонаря', () => {
    const game = newGame()
    game.build('bell', 1, 1)
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 3, 1)).toBeNull()
    game.upgrade(1, 1)
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 3, 1)?.bonus).toBe(0.3)
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 3, 2)).toBeNull()
    game.upgrade(1, 1)
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 3, 2)?.bonus).toBe(0.4)
  })

  it('в пересечении аур рисуется один источник и только сильнейший процент со стрелкой', () => {
    const game = newGame()
    const weak = game.build('bell', 0, 0)!
    const strong = game.build('bell', 2, 0)!
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 1, 1)?.source).toBe(weak)
    game.upgrade(2, 0)
    game.upgrade(2, 0)
    const preview = towerPlacementBellPreview(game.state.towers, 'archer', 1, 1)!
    expect(preview.source).toBe(strong)
    expect(bellBuffs(game.state.towers)).toEqual([]) // Получатель ещё не существует.
    const { ctx, calls } = drawingContext()
    drawTowerBellPreview(ctx, preview, 40, true)
    expect(calls.fillText.mock.calls.map(([text]) => text)).toEqual(['→ +40%'])
    expect(
      calls.setLineDash.mock.calls.filter(([dash]) => JSON.stringify(dash) === '[0.07,0.07]'),
    ).toHaveLength(1)
    expect(calls.setLineDash).toHaveBeenCalledWith([0.05, 0.045])
    game.sell(strong.col, strong.row)
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 1, 1)?.bonus).toBe(0.2)
    game.sell(weak.col, weak.row)
    expect(towerPlacementBellPreview(game.state.towers, 'archer', 1, 1)).toBeNull()
  })

  it('нехватка золота не начисляет бонус и отмечается цветом недоступного предпросмотра', () => {
    const game = newGame()
    game.build('bell', 1, 1)
    game.state.gold = 0
    const preview = towerPlacementBellPreview(game.state.towers, 'archer', 0, 0)!
    const { ctx, calls } = drawingContext()
    const textColors: (string | CanvasGradient | CanvasPattern)[] = []
    calls.fillText.mockImplementation(() => textColors.push(ctx.fillStyle))
    drawTowerBellPreview(ctx, preview, 40, false)
    expect(calls.fillText.mock.calls.map(([text]) => text)).toEqual(['→ +20%'])
    expect(textColors).toEqual(['#f0866a'])
    expect(game.state.gold).toBe(0)
    expect(game.state.towers).toHaveLength(1)
  })
})
