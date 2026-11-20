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

const frames = new Map<string, SpriteFrame>([
  ['archer', { index: 0, size: 0.88 }],
  ['ballista', { index: 1, size: 0.97 }],
  ['mage', { index: 2, size: 0.81 }],
  ['frost', { index: 3, size: 0.77 }],
  ['rebel', { index: 4, size: 0.7 }],
  ['scout', { index: 5, size: 0.64 }],
  ['armor', { index: 6, size: 0.79 }],
  ['healer', { index: 7, size: 0.75 }],
  ['cannon', { index: 8, size: 0.9 }],
  ['trapper', { index: 9, size: 0.89 }],
  ['warlock', { index: 10, size: 0.86 }],
  ['bell', { index: 11, size: 0.89 }],
  ['treasury', { index: 12, size: 0.93 }],
  ['ogre', { index: 13, size: 0.94 }],
  ['gorynych', { index: 14, size: 1.06 }],
  ['snakelet', { index: 15, size: 0.55 }],
  ['boss', { index: 16, size: 1.08 }],
])

const layers = {
  treasuryOpen: 17,
  cannonBarrel: 18,
  cannonBarrelBronze: 19,
  trapperReloading: 20,
  bellMount: 21,
}

const TOWER_FOOT_Y = 0.23

let atlas: HTMLImageElement | null = null
let loading: Promise<boolean> | null = null

/** Магазин и поле используют одну загрузку атласа. */
export function loadUnitSprites(): Promise<boolean> {
  loading ??= new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      atlas = image
      resolve(true)
    }
    image.onerror = () => resolve(false)
    image.src = atlasUrl
  })
  return loading
}

export const unitSpritesLoaded = () => atlas !== null

export function unitSpriteSize(id: string): number | undefined {
  return atlas ? frames.get(id)?.size : undefined
}

function drawFrame(
  ctx: Canvas2D,
  image: HTMLImageElement,
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

function drawCannon(
  ctx: Canvas2D,
  image: HTMLImageElement,
  frame: SpriteFrame,
  tier: number,
  aimAngle: number,
  isReady: boolean,
  recoil: number,
) {
  ctx.rotate(aimAngle)
  drawFrame(ctx, image, frame.index, frame.size, 0.5)
  ctx.translate(-recoil * 0.1, 0)

  const size = frame.size * (1 + 0.067 * tier)
  const barrel = tier >= TIER_III ? layers.cannonBarrelBronze : layers.cannonBarrel
  drawFrame(ctx, image, barrel, size, 0.5)
  if (isReady) {
    ctx.fillStyle = '#657181'
    circle(ctx, (43 / 128) * size, 0, size * 0.023)
    ctx.fill()
  }
}

function drawBell(
  ctx: Canvas2D,
  image: HTMLImageElement,
  frame: SpriteFrame,
  tier: number,
  time: number,
) {
  ctx.translate(0, TOWER_FOOT_Y)
  drawFrame(ctx, image, layers.bellMount, frame.size, FEET)

  const hinge = 36 / 128
  const sway = prefersReducedMotion ? 0 : Math.sin(time * BELL_SWING_SPEED) * 0.12
  ctx.translate(0, frame.size * (hinge - FEET))
  if (tier >= TIER_III) {
    for (const x of [-0.26, 0.26]) {
      ctx.save()
      ctx.translate(x, 0.014)
      ctx.rotate(-sway)
      drawFrame(ctx, image, frame.index, frame.size * 0.33, hinge)
      ctx.restore()
    }
  }
  ctx.rotate(sway)
  drawFrame(ctx, image, frame.index, frame.size * (1 + 0.05 * tier), hinge)
}

/** Центр клетки уже установлен. Элементали парят над постаментом, фигуры опираются на него. */
export function drawTowerSprite(
  ctx: Canvas2D,
  id: string,
  tier: number,
  aimAngle: number,
  time: number,
  isReady: boolean,
  recoil: number,
): boolean {
  const image = atlas
  const frame = frames.get(id)
  if (!image || !frame) return false
  const motion = prefersReducedMotion ? 0 : recoil
  ctx.save()
  switch (id) {
    case 'mage': {
      const flicker = prefersReducedMotion ? 0 : Math.sin(time * 8)
      const size = frame.size * (1 + 0.06 * tier)
      ctx.translate(0, -0.055 - flicker * 0.02 - motion * 0.035)
      ctx.rotate(flicker * 0.065)
      ctx.scale(1 - flicker * 0.045 + motion * 0.06, 1 + flicker * 0.055 + motion * 0.14)
      drawFrame(ctx, image, frame.index, size, 0.5)
      break
    }
    case 'frost': {
      const float = prefersReducedMotion ? 0 : Math.sin(time * 3) * 0.035
      const size = frame.size * (1 + 0.05 * tier + motion * 0.13)
      ctx.translate(0, -0.065 + float)
      ctx.rotate(prefersReducedMotion ? 0 : time * 0.44)
      drawFrame(ctx, image, frame.index, size, 0.5)
      break
    }
    case 'cannon':
      drawCannon(ctx, image, frame, tier, aimAngle, isReady, motion)
      break
    case 'bell':
      drawBell(ctx, image, frame, tier, time)
      break
    case 'warlock': {
      const size = frame.size * (1 + 0.025 * tier)
      const pulse = prefersReducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3)
      ctx.translate(0, TOWER_FOOT_Y - motion * 0.027)
      ctx.rotate(motion * 0.07)
      ctx.fillStyle = `rgba(183,128,229,${0.08 + pulse * 0.08 + motion * 0.21})`
      circle(ctx, (38 / 128) * size, size * (28 / 128 - FEET), size * 0.145)
      ctx.fill()
      drawFrame(ctx, image, frame.index, size, FEET)
      break
    }
    case 'treasury': {
      const isOpen = tier >= TIER_III
      const size = frame.size * (1 + 0.035 * tier)
      ctx.translate(0, TOWER_FOOT_Y)
      drawFrame(ctx, image, isOpen ? layers.treasuryOpen : frame.index, size, FEET)
      if (isOpen) {
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
      const size = id === 'trapper' ? frame.size * (1 + 0.035 * tier) : frame.size
      const index = id === 'trapper' && !isReady ? layers.trapperReloading : frame.index
      drawFrame(ctx, image, index, size, FEET)
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
  const frame = frames.get(enemy.def.id)
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
