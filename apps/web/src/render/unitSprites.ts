import type { Enemy, Level } from '@throne/game'
import { circle, drawTwinkle, prefersReducedMotion, type Canvas2D } from './shapes'
import { BELL_SWING_SPEED } from './statuses'
import atlasUrl from './units-vector.svg'

const CELL = 192
/** Опорная точка у ног, в долях высоты ячейки атласа. */
const FEET = 169 / CELL
const TIER_III = 2

interface SpriteFrame {
  index: number
  size: number
}

type TierFrames = readonly [number, number, number]

interface TowerSpriteFrames {
  size: number
  tiers: TierFrames
  aspects?: ReadonlyMap<string, number>
}

const towerFrames = new Map<string, TowerSpriteFrames>([
  [
    'archer',
    {
      size: 0.88,
      tiers: [0, 22, 23],
      aspects: new Map([
        ['hunter-mark', 24],
        ['ricochet', 25],
      ]),
    },
  ],
  [
    'ballista',
    {
      size: 0.97,
      tiers: [1, 26, 27],
      aspects: new Map([
        ['giant-slayer', 28],
        ['armor-breaker', 29],
      ]),
    },
  ],
  [
    'mage',
    {
      size: 0.81,
      tiers: [2, 30, 31],
      aspects: new Map([
        ['boiling-oil', 49],
        ['wildfire', 50],
      ]),
    },
  ],
  ['frost', { size: 0.77, tiers: [3, 32, 33] }],
  ['cannon', { size: 0.9, tiers: [8, 34, 35] }],
  ['trapper', { size: 0.89, tiers: [9, 37, 38] }],
  ['warlock', { size: 0.86, tiers: [10, 41, 42] }],
  ['bell', { size: 0.89, tiers: [11, 43, 44] }],
  ['treasury', { size: 0.93, tiers: [12, 47, 17] }],
])

const enemyFrames = new Map<string, SpriteFrame>([
  ['rebel', { index: 4, size: 0.7 }],
  ['scout', { index: 5, size: 0.64 }],
  ['armor', { index: 6, size: 0.79 }],
  ['healer', { index: 7, size: 0.75 }],
  ['ogre', { index: 13, size: 0.94 }],
  ['gorynych', { index: 14, size: 1.06 }],
  ['snakelet', { index: 15, size: 0.55 }],
  ['general', { index: 48, size: 0.94 }],
  ['boss', { index: 16, size: 1.08 }],
])

// Координата дула в рисунке 128×128 задаёт положение ядра в заряженном стволе.
const cannonBarrels = [
  { index: 18, muzzleX: 107 },
  { index: 36, muzzleX: 110 },
  { index: 19, muzzleX: 114 },
] as const
const trapperReloading: TierFrames = [20, 39, 40]
const bellMounts: TierFrames = [21, 45, 46]

const frameAtTier = (frames: TierFrames, tier: number) => frames[tier] ?? frames[0]

const TOWER_FOOT_Y = 0.23

let atlas: HTMLCanvasElement | null = null
let loading: Promise<boolean> | null = null

/** Магазин и поле используют одну загрузку атласа. */
export function loadUnitSprites(): Promise<boolean> {
  loading ??= new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      // При повороте вырезки прямо из SVG Chrome может захватить часть соседней ячейки.
      // Рисуем SVG целиком один раз и вырезаем спрайты из готового растра.
      const bitmap = document.createElement('canvas')
      bitmap.width = image.naturalWidth
      bitmap.height = image.naturalHeight
      const ctx = bitmap.getContext('2d')
      if (ctx) {
        ctx.drawImage(image, 0, 0)
        atlas = bitmap
      }
      resolve(atlas !== null)
    }
    image.onerror = () => resolve(false)
    image.src = atlasUrl
  })
  return loading
}

export const unitSpritesLoaded = () => atlas !== null

export function unitSpriteSize(id: string): number | undefined {
  return atlas ? (towerFrames.get(id) ?? enemyFrames.get(id))?.size : undefined
}

function drawFrame(
  ctx: Canvas2D,
  image: HTMLCanvasElement,
  index: number,
  size: number,
  anchor: number,
) {
  ctx.drawImage(
    image,
    (index % 4) * CELL,
    Math.floor(index / 4) * CELL,
    CELL,
    CELL,
    -size / 2,
    -size * anchor,
    size,
    size,
  )
}

const outpostFrames: TierFrames = [52, 53, 54]
const outpostRuins: TierFrames = [55, 51, 51]

export function drawOutpostSprite(
  ctx: Canvas2D,
  tier: number,
  ruined: boolean,
  aspectId: string | null,
): boolean {
  if (!atlas) return false
  const frames = ruined ? outpostRuins : outpostFrames
  let frame = frameAtTier(frames, tier)
  if (!ruined && aspectId === 'reinforced-wall') frame = 56
  if (!ruined && aspectId === 'machicolations') frame = 57
  drawFrame(ctx, atlas, frame, 1.03, 0.5)
  return true
}

function drawCannon(
  ctx: Canvas2D,
  image: HTMLCanvasElement,
  index: number,
  size: number,
  tier: number,
  aimAngle: number,
  isReady: boolean,
  recoil: number,
) {
  ctx.rotate(aimAngle)
  drawFrame(ctx, image, index, size, 0.5)
  ctx.translate(-recoil * 0.1, 0)

  const barrel = cannonBarrels[tier] ?? cannonBarrels[0]
  drawFrame(ctx, image, barrel.index, size, 0.5)
  if (isReady) {
    ctx.fillStyle = '#657181'
    circle(ctx, ((barrel.muzzleX - 64) / 128) * size, 0, size * 0.023)
    ctx.fill()
  }
}

function drawBell(
  ctx: Canvas2D,
  image: HTMLCanvasElement,
  index: number,
  size: number,
  tier: number,
  time: number,
) {
  ctx.translate(0, TOWER_FOOT_Y)
  drawFrame(ctx, image, frameAtTier(bellMounts, tier), size, FEET)

  const hinge = 36 / 128
  const sway = prefersReducedMotion ? 0 : Math.sin(time * BELL_SWING_SPEED) * 0.12
  ctx.translate(0, size * (hinge - FEET))
  if (tier >= TIER_III) {
    for (const x of [-0.26, 0.26]) {
      ctx.save()
      ctx.translate(x, 0.014)
      ctx.rotate(-sway)
      drawFrame(ctx, image, index, size * 0.33, hinge)
      ctx.restore()
    }
  }
  ctx.rotate(sway)
  drawFrame(ctx, image, index, size * (1 + 0.025 * tier), hinge)
}

/** Центр клетки уже установлен. Элементали парят над постаментом, фигуры опираются на него. */
export function drawTowerSprite(
  ctx: Canvas2D,
  id: string,
  tier: number,
  aspectId: string | null,
  aimAngle: number,
  time: number,
  isReady: boolean,
  recoil: number,
): boolean {
  const image = atlas
  const frames = towerFrames.get(id)
  if (!image || !frames) return false
  const { size } = frames
  const aspectFrame = tier >= TIER_III && aspectId ? frames.aspects?.get(aspectId) : undefined
  const index = aspectFrame ?? frameAtTier(frames.tiers, tier)
  const motion = prefersReducedMotion ? 0 : recoil
  ctx.save()
  switch (id) {
    case 'mage': {
      const flicker = prefersReducedMotion ? 0 : Math.sin(time * 8)
      ctx.translate(0, -0.055 - flicker * 0.02 - motion * 0.035)
      ctx.rotate(flicker * 0.065)
      ctx.scale(1 - flicker * 0.045 + motion * 0.06, 1 + flicker * 0.055 + motion * 0.14)
      drawFrame(ctx, image, index, size, 0.5)
      break
    }
    case 'frost': {
      const float = prefersReducedMotion ? 0 : Math.sin(time * 3) * 0.035
      ctx.translate(0, -0.065 + float)
      ctx.rotate(prefersReducedMotion ? 0 : time * 0.44)
      drawFrame(ctx, image, index, size * (1 + motion * 0.13), 0.5)
      break
    }
    case 'cannon':
      drawCannon(ctx, image, index, size, tier, aimAngle, isReady, motion)
      break
    case 'bell':
      drawBell(ctx, image, index, size, tier, time)
      break
    case 'warlock': {
      const pulse = prefersReducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3)
      ctx.translate(0, TOWER_FOOT_Y - motion * 0.027)
      ctx.rotate(motion * 0.07)
      ctx.fillStyle = `rgba(183,128,229,${0.08 + pulse * 0.08 + motion * 0.21})`
      circle(ctx, (38 / 128) * size, size * (28 / 128 - FEET), size * 0.145)
      ctx.fill()
      drawFrame(ctx, image, index, size, FEET)
      break
    }
    case 'treasury': {
      ctx.translate(0, TOWER_FOOT_Y)
      drawFrame(ctx, image, index, size, FEET)
      if (tier >= TIER_III) {
        const pulse = prefersReducedMotion ? 1 : 0.6 + 0.4 * Math.sin(time * 4)
        drawTwinkle(ctx, -0.055 * size, -0.47 * size, 0.042 * pulse)
      }
      break
    }
    default: {
      const aimX = Math.cos(aimAngle)
      const aimY = Math.sin(aimAngle)
      const facing = aimX < -0.02 ? -1 : 1
      const kick = id === 'ballista' ? 0.12 : 0.065
      ctx.translate(-aimX * kick * motion, TOWER_FOOT_Y - aimY * kick * motion)
      ctx.rotate(-aimX * motion * 0.16)
      ctx.scale(facing, 1 - motion * 0.045)
      const pose = id === 'trapper' && !isReady ? frameAtTier(trapperReloading, tier) : index
      drawFrame(ctx, image, pose, size, FEET)
    }
  }
  ctx.restore()
  return true
}

/** Тело остаётся вертикальным. Перед поворотом на ковре оно наклоняется в сторону движения. */
export function drawEnemySprite(
  ctx: Canvas2D,
  enemy: Enemy,
  path: Level['path'],
  stride: number,
): boolean {
  const frame = enemyFrames.get(enemy.def.id)
  if (!atlas || !frame) return false
  const distance = enemy.pathDistance
  const [beforeX] = path.positionAt(distance - 0.14)
  const [afterX] = path.positionAt(distance + 0.14)
  const across = afterX - beforeX
  const [turnX] = path.positionAt(distance + 0.44)
  const directionX = Math.abs(across) > 0.025 ? across : turnX - enemy.x
  const facing = directionX < -0.02 ? -1 : 1
  const tilt = prefersReducedMotion ? 0 : stride * 0.075 + across * 0.25
  ctx.save()
  ctx.translate(0, enemy.def.radius * 0.8)
  ctx.rotate(tilt)
  ctx.scale(facing, 1 + stride * 0.027)
  drawFrame(ctx, atlas, frame.index, frame.size, FEET)
  ctx.restore()
  return true
}
