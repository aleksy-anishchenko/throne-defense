import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TOWER_IDLE_AIM_ANGLE, type Canvas2D } from './shapes'
import { drawTower } from './towers'
import { loadUnitSprites } from './unitSprites'
import atlasSvg from './units-vector.svg?raw'

const atlasPaints: [unknown, number, number][] = []
const bitmap = {
  width: 0,
  height: 0,
  getContext: () => ({
    drawImage: (source: unknown, x: number, y: number) => atlasPaints.push([source, x, y]),
  }),
}

// Сопоставляем координаты вырезаемого квадрата с именем рисунка в SVG.
const spriteAt = new Map(
  Array.from(
    atlasSvg.matchAll(
      /^ {2}<g id="([^"]+)" transform="(?:translate\((\d+) (\d+)\) )?scale\(1\.5\)">/gm,
    ),
    ([, id, x = '0', y = '0']) => [`${x},${y}`, id],
  ),
)

function drawSprites(
  id: string,
  tier: number,
  aspectId: string | null = null,
  isReady = true,
  aimAngle = 0,
  recoil = 0,
  wallAngle = 0,
) {
  const drawImage = vi.fn((source: unknown, x: number, y: number) =>
    source === bitmap ? spriteAt.get(`${x},${y}`) : undefined,
  )
  const transforms = { translate: vi.fn(), rotate: vi.fn(), scale: vi.fn() }
  const ctx = {
    drawImage,
    save: vi.fn(),
    restore: vi.fn(),
    ...transforms,
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as Canvas2D
  drawTower(ctx, id, tier, aimAngle, 0, isReady, aspectId, recoil, 1, wallAngle)
  return { frames: drawImage.mock.results.map(({ value }) => value), ...transforms }
}

beforeAll(async () => {
  vi.stubGlobal('document', { createElement: () => bitmap })
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 768
      naturalHeight = 3264
      onload?: () => void
      set src(_value: string) {
        this.onload?.()
      }
    },
  )
  expect(await loadUnitSprites()).toBe(true)
})
afterAll(() => vi.unstubAllGlobals())

describe('SVG-облики стражей', () => {
  it('рисует каждую ступень Заставы своим кадром', () => {
    expect([0, 1, 2].map((tier) => drawSprites('outpost', tier).frames[0])).toEqual([
      'outpost',
      'outpost-stone',
      'outpost-royal',
    ])
    for (const aspect of ['reinforced-wall', 'machicolations']) {
      expect(drawSprites('outpost', 2, aspect).frames).toEqual([aspect])
    }
  })

  it.each([-Math.PI / 2, Math.PI / 2])(
    'на повороте использует боковую фигуру без наклона лучников (%s)',
    (angle) => {
      const drawing = drawSprites('outpost', 0, null, true, 0, 0, angle)
      expect(drawing.frames).toEqual(['flank-outpost'])
      expect(drawing.rotate).not.toHaveBeenCalled()
      for (const aspect of ['reinforced-wall', 'machicolations']) {
        expect(drawSprites('outpost', 2, aspect, true, 0, 0, angle).frames).toEqual([
          'flank-' + aspect,
        ])
      }
    },
  )

  it('переводит атлас в пиксели один раз перед отрисовкой повёрнутых спрайтов', async () => {
    expect(await loadUnitSprites()).toBe(true)
    expect(atlasPaints).toEqual([[expect.any(Image), 0, 0]])
    expect([bitmap.width, bitmap.height]).toEqual([768, 3264])
  })

  const stages = {
    archer: [['archer'], ['archer-ii'], ['archer-iii']],
    ballista: [['ballista'], ['ballista-ii'], ['ballista-iii']],
    mage: [['mage'], ['mage-ii'], ['mage-iii']],
    frost: [['frost'], ['frost-ii'], ['frost-iii']],
    cannon: [
      ['cannon', 'cannon-barrel'],
      ['cannon-ii', 'cannon-barrel-ii'],
      ['cannon-iii', 'cannon-barrel-iii'],
    ],
    trapper: [['trapper'], ['trapper-ii'], ['trapper-iii']],
    warlock: [['warlock'], ['warlock-ii'], ['warlock-iii']],
    bell: [
      ['bell-mount', 'bell'],
      ['bell-mount-ii', 'bell-ii'],
      ['bell-mount-iii', 'bell-iii', 'bell-iii', 'bell-iii'],
    ],
    treasury: [['treasury'], ['treasury-ii'], ['treasury-iii']],
  }

  it.each(Object.entries(stages))('%s использует рисунки своей ступени', (id, expected) => {
    expect(expected.map((_sprites, tier) => drawSprites(id, tier).frames)).toEqual(expected)
  })

  it.each([
    ['archer', 'hunter-mark'],
    ['archer', 'ricochet'],
    ['ballista', 'giant-slayer'],
    ['ballista', 'armor-breaker'],
    ['mage', 'boiling-oil'],
    ['mage', 'wildfire'],
  ])('%s выбирает облик специализации %s на IV ступени', (id, aspectId) => {
    expect(drawSprites(id, 2, aspectId).frames).toEqual([`${id}-${aspectId}`])
    expect(drawSprites(id, 2).frames).toEqual([`${id}-iii`])
  })

  it('Баллиста после постройки сохраняет диагональную посадку на постаменте', () => {
    const art = drawSprites('ballista', 0, null, true, TOWER_IDLE_AIM_ANGLE)
    expect(art.frames).toEqual(['ballista'])
    expect(art.translate).toHaveBeenCalledExactlyOnceWith(expect.closeTo(0), 0.23)
    expect(art.rotate).toHaveBeenCalledExactlyOnceWith(expect.closeTo(0))
    expect(art.scale).toHaveBeenCalledExactlyOnceWith(1, 1)
  })

  it('Баллиста отражается в сторону цели и отскакивает назад при выстреле', () => {
    const art = drawSprites('ballista', 2, 'armor-breaker', false, Math.PI, 1)
    expect(art.frames).toEqual(['ballista-armor-breaker'])
    expect(art.translate).toHaveBeenCalledExactlyOnceWith(0.12, expect.closeTo(0.23))
    expect(art.rotate).toHaveBeenCalledExactlyOnceWith(0.16)
    expect(art.scale).toHaveBeenCalledExactlyOnceWith(-1, 0.955)
  })

  it('сохраняет облик Ловчего при перезарядке сети', () => {
    expect([0, 1, 2].map((tier) => drawSprites('trapper', tier, null, false).frames)).toEqual([
      ['trapper-reloading'],
      ['trapper-reloading-ii'],
      ['trapper-reloading-iii'],
    ])
  })
})
