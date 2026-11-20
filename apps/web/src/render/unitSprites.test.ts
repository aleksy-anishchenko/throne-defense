import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Canvas2D } from './shapes'
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
) {
  const drawImage = vi.fn((source: unknown, x: number, y: number) =>
    source === bitmap ? spriteAt.get(`${x},${y}`) : undefined,
  )
  const rotate = vi.fn()
  const ctx = {
    drawImage,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate,
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as Canvas2D
  drawTower(ctx, id, tier, aimAngle, 0, isReady, aspectId)
  return { frames: drawImage.mock.results.map(({ value }) => value), drawImage, rotate }
}

beforeAll(async () => {
  vi.stubGlobal('document', { createElement: () => bitmap })
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 768
      naturalHeight = 2688
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
  it('переводит атлас в пиксели один раз перед отрисовкой повёрнутых спрайтов', async () => {
    expect(await loadUnitSprites()).toBe(true)
    expect(atlasPaints).toEqual([[expect.any(Image), 0, 0]])
    expect([bitmap.width, bitmap.height]).toEqual([768, 2688])
  })

  const stages = {
    archer: [['archer'], ['archer-ii'], ['archer-iii']],
    ballista: [
      ['ballista-i-stand', 'ballista'],
      ['ballista-ii-stand', 'ballista-ii'],
      ['ballista-iii-stand', 'ballista-iii'],
    ],
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
  ])('%s выбирает облик специализации %s на IV ступени', (id, aspectId) => {
    const aspectFrame = `${id}-${aspectId}`
    expect(drawSprites(id, 2, aspectId).frames).toEqual(
      id === 'ballista' ? [`${aspectFrame}-stand`, aspectFrame] : [aspectFrame],
    )
    expect(drawSprites(id, 2).frames).toEqual(
      id === 'ballista' ? stages.ballista[2] : stages.archer[2],
    )
  })

  it.each([Math.PI / 2, Math.PI / 4, Math.PI, -Math.PI / 2])(
    'Баллиста поворачивает направляющую на угол выстрела %f, станок стоит на месте',
    (angle) => {
      const { drawImage, rotate } = drawSprites('ballista', 0, null, true, angle)
      const [stand, launcher] = drawImage.mock.invocationCallOrder
      const [turn] = rotate.mock.invocationCallOrder
      expect(rotate).toHaveBeenCalledExactlyOnceWith(angle)
      expect(stand).toBeLessThan(turn)
      expect(turn).toBeLessThan(launcher)
    },
  )

  it('сохраняет облик Ловчего при перезарядке сети', () => {
    expect([0, 1, 2].map((tier) => drawSprites('trapper', tier, null, false).frames)).toEqual([
      ['trapper-reloading'],
      ['trapper-reloading-ii'],
      ['trapper-reloading-iii'],
    ])
  })
})
