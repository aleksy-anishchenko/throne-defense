import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Canvas2D } from './shapes'
import { drawTower } from './towers'
import { loadUnitSprites } from './unitSprites'
import atlasSvg from './units-vector.svg?raw'

// Сопоставляем координаты вырезаемого квадрата с именем рисунка в SVG.
const spriteAt = new Map(
  Array.from(
    atlasSvg.matchAll(
      /^ {2}<g id="([^"]+)" transform="(?:translate\((\d+) (\d+)\) )?scale\(1\.5\)">/gm,
    ),
    ([, id, x = '0', y = '0']) => [`${x},${y}`, id],
  ),
)

function drawnSprites(id: string, tier: number, aspectId: string | null = null, isReady = true) {
  const drawImage = vi.fn((_image: unknown, x: number, y: number) => spriteAt.get(`${x},${y}`))
  const ctx = {
    drawImage,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as Canvas2D
  drawTower(ctx, id, tier, 0, 0, isReady, aspectId)
  return drawImage.mock.results.map(({ value }) => value)
}

beforeAll(async () => {
  vi.stubGlobal(
    'Image',
    class {
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
    expect(expected.map((_sprites, tier) => drawnSprites(id, tier))).toEqual(expected)
  })

  it.each([
    ['archer', 'hunter-mark'],
    ['archer', 'ricochet'],
    ['ballista', 'giant-slayer'],
    ['ballista', 'armor-breaker'],
  ])('%s выбирает облик специализации %s на IV ступени', (id, aspectId) => {
    expect(drawnSprites(id, 2, aspectId)).toEqual([`${id}-${aspectId}`])
    expect(drawnSprites(id, 2)).toEqual([`${id}-iii`])
  })

  it('сохраняет облик Ловчего при перезарядке сети', () => {
    expect([0, 1, 2].map((tier) => drawnSprites('trapper', tier, null, false))).toEqual([
      ['trapper-reloading'],
      ['trapper-reloading-ii'],
      ['trapper-reloading-iii'],
    ])
  })
})
