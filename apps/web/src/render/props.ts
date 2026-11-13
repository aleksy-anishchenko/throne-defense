// Препятствия в залах: колонны, фонтаны, светцы… Строить на них нельзя (см. LevelDef.props).
//
// Вид 3/4, как у башен: «высота» — вверх по экрану, снизу тень. (0, 0) — центр клетки, размеры
// в клетках. Правило для телефона: крупный простой силуэт на 80–90% клетки — мелкие детали
// в клетке 42 px пропадают. Цвета приглушённые; огонь — только маленький, в чаше светца
// и на свечах канделябра (живое пламя рисует drawPropFlames каждый кадр, остальное — один раз в фон)

import type { LevelProp, PropKind } from '@throne/game'
import { GOLD, circle, prefersReducedMotion, roundedRect } from './shapes'
import type { Canvas2D } from './shapes'

/** Мрамор: светлый, в тени, тёмный край и линии */
const MARBLE = '#d9d4c7'
const MARBLE_SHADE = '#a8a294'
const MARBLE_DARK = '#6e6a60'
const MARBLE_LINE = '#3d3a34'
/** Дерево: светлое, обычное, тёмное, линии */
const WOOD_LIGHT = '#7d5530'
const WOOD = '#6b4626'
const WOOD_DARK = '#5e4128'
const WOOD_LINE = '#33220f'
/** Терракота (амфора, кадка пальмы) */
const CLAY = '#b5683c'
const CLAY_LINE = '#4a2412'
/** Тёмное золото (подставки канделябра, клетка, меридиан глобуса) */
const BRASS = '#c99a3a'
/** Вода — тёмная бирюза, чтобы не путать с голубым льдом Морозко */
const WATER = '#2f7f86'
/** Зелень */
const LEAVES = '#3d5a34'
const LEAVES_LIGHT = '#527a45'
/** Железо обручей и наконечников */
const IRON = '#8a8e9c'
/** Египет: песчаник, гранит, ляпис-лазурь, бирюза, золото */
const SAND = '#d8c08a'
const SAND_SHADE = '#b39a62'
const SAND_LINE = '#5a4626'
const GRANITE_LIGHT = '#6a6572'
const GRANITE_LINE = '#2a2830'
const LAPIS = '#2b4f8f'
const TURQUOISE = '#3a8f86'
const EGYPT_GOLD = '#e0b040'
const EGYPT_GOLD_LINE = '#7a5a12'
const BASALT = '#1e1c24'

/** Где горит пламя на препятствии: [x, y — низ язычка, размер]. Рисуется каждый кадр */
const FLAMES: Partial<Record<PropKind, readonly (readonly [number, number, number])[]>> = {
  brazier: [[0, -0.2, 0.2]],
  candelabrum: [
    [-0.22, -0.28, 0.1],
    [0, -0.28, 0.1],
    [0.22, -0.28, 0.1],
  ],
}

function stroke(ctx: Canvas2D, color: string, width: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

/** Тень на полу — эллипс под предметом */
function drawShadow(ctx: Canvas2D, halfWidth = 0.34, y = 0.3) {
  ctx.fillStyle = 'rgba(8,9,18,.45)'
  ctx.beginPath()
  ctx.ellipse(0, y, halfWidth, halfWidth * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Тёплый свет на полу от огня */
function drawFloorGlow(ctx: Canvas2D, y: number, radius: number) {
  const glow = ctx.createRadialGradient(0, y, 0, 0, y, radius)
  glow.addColorStop(0, 'rgba(240,160,80,.35)')
  glow.addColorStop(1, 'rgba(240,160,80,0)')
  ctx.fillStyle = glow
  ctx.fillRect(-0.5, -0.5, 1, 1)
}

/** Эллипс-путь (для fill/stroke) */
function ellipse(ctx: Canvas2D, x: number, y: number, radiusX: number, radiusY: number) {
  ctx.beginPath()
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2)
}

/** Как выглядит каждое препятствие (без пламени — оно в drawPropFlames) */
const PROP_ART: Record<PropKind, (ctx: Canvas2D) => void> = {
  // ——— Античность ———
  column(ctx) {
    drawShadow(ctx, 0.3, 0.33)
    ctx.fillStyle = MARBLE_SHADE
    roundedRect(ctx, -0.27, 0.18, 0.54, 0.14, 0.02)
    ctx.fill()
    stroke(ctx, MARBLE_LINE, 0.02)
    // ствол с каннелюрами: свет слева, тень справа
    const shaft = ctx.createLinearGradient(-0.18, 0, 0.18, 0)
    shaft.addColorStop(0, MARBLE_SHADE)
    shaft.addColorStop(0.45, MARBLE)
    shaft.addColorStop(1, MARBLE_DARK)
    ctx.fillStyle = shaft
    ctx.fillRect(-0.17, -0.34, 0.34, 0.53)
    ctx.strokeStyle = MARBLE_LINE
    ctx.lineWidth = 0.02
    ctx.strokeRect(-0.17, -0.34, 0.34, 0.53)
    ctx.strokeStyle = 'rgba(61,58,52,.45)'
    ctx.lineWidth = 0.015
    ctx.beginPath()
    for (const x of [-0.09, 0, 0.09]) {
      ctx.moveTo(x, -0.32)
      ctx.lineTo(x, 0.17)
    }
    ctx.stroke()
    ctx.fillStyle = MARBLE
    roundedRect(ctx, -0.26, -0.44, 0.52, 0.11, 0.02)
    ctx.fill()
    stroke(ctx, MARBLE_LINE, 0.02)
  },

  fountain(ctx) {
    drawShadow(ctx, 0.42, 0.3)
    ctx.fillStyle = MARBLE_SHADE
    ellipse(ctx, 0, 0.12, 0.4, 0.2)
    ctx.fill()
    stroke(ctx, MARBLE_LINE, 0.02)
    ctx.fillStyle = MARBLE
    ellipse(ctx, 0, 0.06, 0.4, 0.2)
    ctx.fill()
    stroke(ctx, MARBLE_LINE, 0.02)
    ctx.fillStyle = WATER
    ellipse(ctx, 0, 0.06, 0.32, 0.14)
    ctx.fill()
    ctx.strokeStyle = 'rgba(220,240,235,.5)'
    ctx.lineWidth = 0.015
    ellipse(ctx, 0, 0.07, 0.18, 0.07)
    ctx.stroke()
    // столбик и верхняя чаша
    ctx.fillStyle = MARBLE_SHADE
    ctx.fillRect(-0.04, -0.24, 0.08, 0.3)
    ctx.strokeStyle = MARBLE_LINE
    ctx.lineWidth = 0.015
    ctx.strokeRect(-0.04, -0.24, 0.08, 0.3)
    ctx.fillStyle = MARBLE
    ellipse(ctx, 0, -0.25, 0.14, 0.06)
    ctx.fill()
    stroke(ctx, MARBLE_LINE, 0.015)
    // струйки
    ctx.strokeStyle = 'rgba(200,235,230,.8)'
    ctx.lineWidth = 0.02
    ctx.beginPath()
    ctx.moveTo(-0.1, -0.24)
    ctx.quadraticCurveTo(-0.2, -0.2, -0.22, 0)
    ctx.moveTo(0.1, -0.24)
    ctx.quadraticCurveTo(0.2, -0.2, 0.22, 0)
    ctx.stroke()
  },

  amphora(ctx) {
    drawShadow(ctx, 0.2, 0.33)
    ctx.fillStyle = CLAY
    ctx.beginPath()
    ctx.moveTo(-0.07, -0.34)
    ctx.lineTo(0.07, -0.34)
    ctx.lineTo(0.06, -0.24)
    ctx.bezierCurveTo(0.26, -0.16, 0.24, 0.18, 0.04, 0.3)
    ctx.lineTo(-0.04, 0.3)
    ctx.bezierCurveTo(-0.24, 0.18, -0.26, -0.16, -0.06, -0.24)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, CLAY_LINE, 0.02)
    ctx.fillStyle = '#2b1a12'
    ctx.fillRect(-0.18, -0.02, 0.36, 0.06)
    ctx.strokeStyle = CLAY_LINE
    ctx.lineWidth = 0.025
    ctx.beginPath()
    ctx.moveTo(-0.06, -0.3)
    ctx.quadraticCurveTo(-0.2, -0.3, -0.16, -0.14)
    ctx.moveTo(0.06, -0.3)
    ctx.quadraticCurveTo(0.2, -0.3, 0.16, -0.14)
    ctx.stroke()
  },

  pool(ctx) {
    drawShadow(ctx, 0.42, 0.3)
    ctx.fillStyle = MARBLE_SHADE
    roundedRect(ctx, -0.42, -0.2, 0.84, 0.46, 0.04)
    ctx.fill()
    stroke(ctx, MARBLE_LINE, 0.02)
    ctx.fillStyle = WATER
    roundedRect(ctx, -0.34, -0.13, 0.68, 0.32, 0.03)
    ctx.fill()
    // кувшинки
    ctx.fillStyle = '#3e9b8a'
    for (const [x, y] of [
      [-0.18, -0.02],
      [0.14, 0.06],
    ]) {
      ellipse(ctx, x, y, 0.08, 0.05)
      ctx.fill()
    }
    ctx.fillStyle = '#e8d27a'
    circle(ctx, -0.18, -0.04, 0.025)
    ctx.fill()
  },

  // ——— Тронный зал ———
  brazier(ctx) {
    drawFloorGlow(ctx, 0.1, 0.5)
    drawShadow(ctx, 0.24, 0.33)
    ctx.strokeStyle = '#8a6420'
    ctx.lineWidth = 0.045
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, -0.12)
    ctx.lineTo(0, 0.26)
    ctx.moveTo(-0.16, 0.3)
    ctx.lineTo(0, 0.18)
    ctx.lineTo(0.16, 0.3)
    ctx.stroke()
    ctx.fillStyle = BRASS
    ctx.beginPath()
    ctx.moveTo(-0.2, -0.2)
    ctx.lineTo(0.2, -0.2)
    ctx.lineTo(0.1, -0.08)
    ctx.lineTo(-0.1, -0.08)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, '#5a3e10', 0.02)
  },

  banner(ctx) {
    drawShadow(ctx, 0.22, 0.33)
    ctx.fillStyle = '#5c6075'
    roundedRect(ctx, -0.14, 0.2, 0.28, 0.1, 0.02)
    ctx.fill()
    stroke(ctx, '#2c2e38', 0.02)
    ctx.strokeStyle = '#8a5d30'
    ctx.lineWidth = 0.035
    ctx.beginPath()
    ctx.moveTo(-0.14, 0.22)
    ctx.lineTo(-0.14, -0.44)
    ctx.stroke()
    ctx.fillStyle = GOLD
    circle(ctx, -0.14, -0.45, 0.035)
    ctx.fill()
    // полотнище с «ласточкиным хвостом» и золотой каймой
    ctx.fillStyle = '#a8212f'
    ctx.beginPath()
    ctx.moveTo(-0.12, -0.4)
    ctx.lineTo(0.28, -0.4)
    ctx.lineTo(0.28, 0.02)
    ctx.lineTo(0.08, -0.08)
    ctx.lineTo(-0.12, 0.02)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, GOLD, 0.025)
    ctx.fillStyle = GOLD
    circle(ctx, 0.08, -0.22, 0.06)
    ctx.fill()
  },

  orb(ctx) {
    drawShadow(ctx, 0.26, 0.33)
    ctx.fillStyle = '#5c6075'
    roundedRect(ctx, -0.18, -0.06, 0.36, 0.36, 0.03)
    ctx.fill()
    stroke(ctx, '#2c2e38', 0.02)
    ctx.fillStyle = '#6f7389'
    roundedRect(ctx, -0.22, -0.12, 0.44, 0.08, 0.02)
    ctx.fill()
    stroke(ctx, '#2c2e38', 0.02)
    ctx.fillStyle = '#a8212f'
    roundedRect(ctx, -0.16, -0.18, 0.32, 0.07, 0.03)
    ctx.fill()
    ctx.fillStyle = GOLD
    circle(ctx, 0, -0.28, 0.12)
    ctx.fill()
    stroke(ctx, '#8a6420', 0.02)
    ctx.strokeStyle = '#8a6420'
    ctx.lineWidth = 0.02
    ctx.beginPath()
    ctx.moveTo(-0.12, -0.28)
    ctx.lineTo(0.12, -0.28)
    ctx.moveTo(0, -0.4)
    ctx.lineTo(0, -0.47)
    ctx.moveTo(-0.035, -0.44)
    ctx.lineTo(0.035, -0.44)
    ctx.stroke()
  },

  candelabrum(ctx) {
    drawFloorGlow(ctx, 0, 0.45)
    drawShadow(ctx, 0.26, 0.33)
    ctx.strokeStyle = BRASS
    ctx.lineWidth = 0.04
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, -0.14)
    ctx.lineTo(0, 0.28)
    ctx.moveTo(-0.14, 0.3)
    ctx.lineTo(0.14, 0.3)
    ctx.moveTo(-0.22, -0.16)
    ctx.quadraticCurveTo(-0.22, 0.02, 0, 0.02)
    ctx.quadraticCurveTo(0.22, 0.02, 0.22, -0.16)
    ctx.stroke()
    ctx.fillStyle = '#f1ead8'
    for (const x of [-0.22, 0, 0.22]) ctx.fillRect(x - 0.035, -0.28, 0.07, 0.13)
  },

  weaponRack(ctx) {
    drawShadow(ctx, 0.36, 0.32)
    ctx.fillStyle = WOOD
    ctx.fillRect(-0.34, 0.16, 0.68, 0.08)
    ctx.fillRect(-0.34, -0.22, 0.68, 0.06)
    ctx.strokeStyle = WOOD_LINE
    ctx.lineWidth = 0.02
    ctx.strokeRect(-0.34, 0.16, 0.68, 0.08)
    ctx.strokeRect(-0.34, -0.22, 0.68, 0.06)
    ctx.strokeStyle = '#8a5d30'
    ctx.lineWidth = 0.03
    ctx.beginPath()
    for (const x of [-0.22, -0.08, 0.06]) {
      ctx.moveTo(x, 0.22)
      ctx.lineTo(x, -0.36)
    }
    ctx.stroke()
    ctx.fillStyle = '#c3cbd9'
    for (const x of [-0.22, -0.08, 0.06]) {
      ctx.beginPath()
      ctx.moveTo(x - 0.035, -0.36)
      ctx.lineTo(x, -0.46)
      ctx.lineTo(x + 0.035, -0.36)
      ctx.closePath()
      ctx.fill()
    }
    // щит
    ctx.fillStyle = '#a8212f'
    ctx.beginPath()
    ctx.moveTo(0.14, -0.14)
    ctx.lineTo(0.34, -0.14)
    ctx.lineTo(0.34, 0)
    ctx.quadraticCurveTo(0.33, 0.12, 0.24, 0.16)
    ctx.quadraticCurveTo(0.15, 0.12, 0.14, 0)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, GOLD, 0.02)
  },

  // ——— Покои ———
  vase(ctx) {
    drawShadow(ctx, 0.24, 0.33)
    ctx.fillStyle = MARBLE
    ctx.beginPath()
    ctx.moveTo(-0.14, -0.02)
    ctx.lineTo(0.14, -0.02)
    ctx.lineTo(0.18, 0.12)
    ctx.quadraticCurveTo(0.16, 0.3, 0, 0.3)
    ctx.quadraticCurveTo(-0.16, 0.3, -0.18, 0.12)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, MARBLE_LINE, 0.02)
    ctx.fillStyle = '#4f6f8f'
    ctx.fillRect(-0.17, 0.08, 0.34, 0.04)
    ctx.fillStyle = LEAVES
    for (const [x, y, radius] of [
      [-0.12, -0.1, 0.1],
      [0.12, -0.1, 0.1],
      [0, -0.2, 0.12],
    ]) {
      circle(ctx, x, y, radius)
      ctx.fill()
    }
    for (const [x, y, color] of [
      [-0.14, -0.2, '#c23b4a'],
      [0.1, -0.28, '#e8d27a'],
      [0.16, -0.12, '#c23b4a'],
      [-0.04, -0.32, '#e8e1cf'],
    ] as const) {
      ctx.fillStyle = color
      circle(ctx, x, y, 0.055)
      ctx.fill()
    }
  },

  birdcage(ctx) {
    drawShadow(ctx, 0.24, 0.33)
    ctx.strokeStyle = '#5c6075'
    ctx.lineWidth = 0.035
    ctx.beginPath()
    ctx.moveTo(0, 0.3)
    ctx.lineTo(0, 0.12)
    ctx.moveTo(-0.12, 0.3)
    ctx.lineTo(0.12, 0.3)
    ctx.stroke()
    // купол клетки
    ctx.fillStyle = 'rgba(227,178,74,.12)'
    ctx.beginPath()
    ctx.moveTo(-0.2, 0.12)
    ctx.lineTo(-0.2, -0.16)
    ctx.quadraticCurveTo(-0.2, -0.38, 0, -0.38)
    ctx.quadraticCurveTo(0.2, -0.38, 0.2, -0.16)
    ctx.lineTo(0.2, 0.12)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, BRASS, 0.022)
    ctx.beginPath()
    for (const x of [-0.1, 0, 0.1]) {
      ctx.moveTo(x, 0.12)
      ctx.lineTo(x, -0.33)
    }
    ctx.stroke()
    // птичка
    ctx.fillStyle = '#e8d27a'
    ellipse(ctx, 0.02, -0.04, 0.07, 0.05)
    ctx.fill()
    circle(ctx, -0.05, -0.08, 0.035)
    ctx.fill()
    ctx.fillStyle = BRASS
    circle(ctx, 0, -0.42, 0.035)
    ctx.fill()
  },

  globe(ctx) {
    drawShadow(ctx, 0.24, 0.33)
    ctx.strokeStyle = WOOD
    ctx.lineWidth = 0.04
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0.28)
    ctx.lineTo(0, 0.12)
    ctx.moveTo(-0.16, 0.3)
    ctx.lineTo(0.16, 0.3)
    ctx.stroke()
    ctx.fillStyle = '#3e6b7a'
    circle(ctx, 0, -0.1, 0.22)
    ctx.fill()
    stroke(ctx, '#1f3640', 0.02)
    // материки
    ctx.fillStyle = '#b9a46a'
    ctx.beginPath()
    ctx.ellipse(-0.06, -0.16, 0.09, 0.06, 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(0.08, -0.02, 0.07, 0.05, -0.3, 0, Math.PI * 2)
    ctx.fill()
    // меридиан
    ctx.strokeStyle = BRASS
    ctx.lineWidth = 0.025
    ctx.beginPath()
    ctx.arc(0, -0.1, 0.27, Math.PI * 0.6, Math.PI * 2.4)
    ctx.stroke()
  },

  // Пюпитр и шахматный столик на телефоне читались слабо — рисуем их на 15% крупнее
  lectern(ctx) {
    ctx.scale(1.15, 1.15)
    drawShadow(ctx, 0.26, 0.3)
    ctx.strokeStyle = WOOD_DARK
    ctx.lineWidth = 0.05
    ctx.beginPath()
    ctx.moveTo(0, 0.28)
    ctx.lineTo(0, -0.04)
    ctx.moveTo(-0.16, 0.3)
    ctx.lineTo(0.16, 0.3)
    ctx.stroke()
    ctx.fillStyle = WOOD_LIGHT
    ctx.beginPath()
    ctx.moveTo(-0.28, -0.02)
    ctx.lineTo(0.28, -0.02)
    ctx.lineTo(0.22, -0.2)
    ctx.lineTo(-0.22, -0.2)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, WOOD_LINE, 0.02)
    // раскрытая книга
    ctx.fillStyle = '#efe6d2'
    ctx.beginPath()
    ctx.moveTo(-0.24, -0.05)
    ctx.lineTo(0, -0.08)
    ctx.lineTo(0.24, -0.05)
    ctx.lineTo(0.2, -0.24)
    ctx.lineTo(0, -0.21)
    ctx.lineTo(-0.2, -0.24)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, '#7d765f', 0.015)
    ctx.strokeStyle = '#a8212f'
    ctx.lineWidth = 0.025
    ctx.beginPath()
    ctx.moveTo(0.06, -0.08)
    ctx.lineTo(0.08, 0.02)
    ctx.stroke()
  },

  chessTable(ctx) {
    ctx.scale(1.15, 1.15)
    drawShadow(ctx, 0.32, 0.3)
    ctx.fillStyle = WOOD_DARK
    ctx.fillRect(-0.04, 0, 0.08, 0.28)
    ctx.fillRect(-0.16, 0.26, 0.32, 0.05)
    ctx.fillStyle = WOOD_LIGHT
    ellipse(ctx, 0, -0.02, 0.34, 0.16)
    ctx.fill()
    stroke(ctx, WOOD_LINE, 0.02)
    // доска ромбом (вид сверху под углом) — клетки через одну
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(0, -0.14)
    ctx.lineTo(0.24, -0.02)
    ctx.lineTo(0, 0.1)
    ctx.lineTo(-0.24, -0.02)
    ctx.closePath()
    ctx.clip()
    for (let i = -4; i < 4; i++) {
      for (let j = -4; j < 4; j++) {
        ctx.fillStyle = (i + j) & 1 ? '#e8e1cf' : '#3a2812'
        const x = (i - j) * 0.03
        const y = -0.02 + (i + j) * 0.015
        ctx.beginPath()
        ctx.moveTo(x, y - 0.015)
        ctx.lineTo(x + 0.03, y)
        ctx.lineTo(x, y + 0.015)
        ctx.lineTo(x - 0.03, y)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.restore()
    // две фигуры
    ctx.fillStyle = '#e8e1cf'
    circle(ctx, -0.06, -0.08, 0.035)
    ctx.fill()
    ctx.fillStyle = '#1c1a22'
    circle(ctx, 0.08, 0, 0.035)
    ctx.fill()
  },

  palm(ctx) {
    drawShadow(ctx, 0.3, 0.33)
    ctx.fillStyle = CLAY
    ctx.beginPath()
    ctx.moveTo(-0.16, 0.08)
    ctx.lineTo(0.16, 0.08)
    ctx.lineTo(0.12, 0.3)
    ctx.lineTo(-0.12, 0.3)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, CLAY_LINE, 0.02)
    ctx.strokeStyle = '#7a5a34'
    ctx.lineWidth = 0.04
    ctx.beginPath()
    ctx.moveTo(0, 0.08)
    ctx.quadraticCurveTo(0.04, -0.12, 0, -0.24)
    ctx.stroke()
    ctx.fillStyle = '#4a7a3e'
    for (const angle of [-2.6, -2, -1.2, -0.5, 0.1]) {
      ctx.save()
      ctx.translate(0, -0.24)
      ctx.rotate(angle)
      ellipse(ctx, 0.17, 0, 0.18, 0.05)
      ctx.fill()
      ctx.restore()
    }
  },

  tree(ctx) {
    drawShadow(ctx, 0.3, 0.33)
    ctx.fillStyle = WOOD
    ctx.beginPath()
    ctx.moveTo(-0.2, 0.02)
    ctx.lineTo(0.2, 0.02)
    ctx.lineTo(0.16, 0.3)
    ctx.lineTo(-0.16, 0.3)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, WOOD_LINE, 0.02)
    ctx.strokeStyle = IRON
    ctx.lineWidth = 0.025
    ctx.beginPath()
    ctx.moveTo(-0.19, 0.1)
    ctx.lineTo(0.19, 0.1)
    ctx.moveTo(-0.17, 0.24)
    ctx.lineTo(0.17, 0.24)
    ctx.stroke()
    ctx.fillStyle = LEAVES
    for (const [x, y, radius] of [
      [0, -0.22, 0.2],
      [-0.15, -0.08, 0.14],
      [0.15, -0.08, 0.14],
    ]) {
      circle(ctx, x, y, radius)
      ctx.fill()
    }
    ctx.fillStyle = LEAVES_LIGHT
    circle(ctx, -0.05, -0.27, 0.09)
    ctx.fill()
  },

  barrel(ctx) {
    drawShadow(ctx, 0.26, 0.33)
    ctx.fillStyle = WOOD
    ctx.beginPath()
    ctx.moveTo(-0.2, -0.24)
    ctx.quadraticCurveTo(-0.28, 0.03, -0.2, 0.3)
    ctx.lineTo(0.2, 0.3)
    ctx.quadraticCurveTo(0.28, 0.03, 0.2, -0.24)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, WOOD_LINE, 0.02)
    ctx.strokeStyle = IRON
    ctx.lineWidth = 0.03
    ctx.beginPath()
    ctx.moveTo(-0.24, -0.12)
    ctx.lineTo(0.24, -0.12)
    ctx.moveTo(-0.24, 0.18)
    ctx.lineTo(0.24, 0.18)
    ctx.stroke()
    ctx.fillStyle = WOOD_LIGHT
    ellipse(ctx, 0, -0.24, 0.2, 0.07)
    ctx.fill()
    stroke(ctx, WOOD_LINE, 0.02)
  },

  // ——— Египет ———
  papyrusColumn(ctx) {
    drawShadow(ctx, 0.3, 0.33)
    ctx.fillStyle = SAND_SHADE
    roundedRect(ctx, -0.26, 0.2, 0.52, 0.12, 0.03)
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.02)
    ctx.fillStyle = SAND
    ctx.fillRect(-0.15, -0.22, 0.3, 0.43)
    ctx.strokeStyle = SAND_LINE
    ctx.lineWidth = 0.02
    ctx.strokeRect(-0.15, -0.22, 0.3, 0.43)
    // расписные пояса
    for (const [y, color] of [
      [-0.16, LAPIS],
      [-0.1, '#a8402f'],
      [0.12, TURQUOISE],
    ] as const) {
      ctx.fillStyle = color
      ctx.fillRect(-0.15, y, 0.3, 0.04)
    }
    // капитель — раскрытый цветок папируса
    ctx.fillStyle = SAND
    ctx.beginPath()
    ctx.moveTo(-0.15, -0.22)
    ctx.quadraticCurveTo(-0.32, -0.32, -0.3, -0.44)
    ctx.lineTo(0.3, -0.44)
    ctx.quadraticCurveTo(0.32, -0.32, 0.15, -0.22)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.02)
    ctx.strokeStyle = TURQUOISE
    ctx.lineWidth = 0.02
    ctx.beginPath()
    for (const x of [-0.18, -0.06, 0.06, 0.18]) {
      ctx.moveTo(x * 0.5, -0.23)
      ctx.lineTo(x, -0.42)
    }
    ctx.stroke()
  },

  egyptObelisk(ctx) {
    drawShadow(ctx, 0.26, 0.33)
    ctx.fillStyle = SAND_SHADE
    roundedRect(ctx, -0.22, 0.17, 0.44, 0.14, 0.02)
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.02)
    ctx.fillStyle = GRANITE_LIGHT
    ctx.beginPath()
    ctx.moveTo(-0.13, 0.18)
    ctx.lineTo(-0.08, -0.34)
    ctx.lineTo(0.08, -0.34)
    ctx.lineTo(0.13, 0.18)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, GRANITE_LINE, 0.02)
    // золотая верхушка и «иероглифы»
    ctx.fillStyle = EGYPT_GOLD
    ctx.beginPath()
    ctx.moveTo(-0.08, -0.34)
    ctx.lineTo(0, -0.46)
    ctx.lineTo(0.08, -0.34)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, EGYPT_GOLD_LINE, 0.015)
    ctx.fillStyle = EGYPT_GOLD
    for (const y of [-0.24, -0.14, -0.04, 0.06]) ctx.fillRect(-0.035, y, 0.07, 0.035)
  },

  // Сфинкс низкий и вытянутый — рисуем на 10% крупнее, чтобы на телефоне не мельчил
  sphinx(ctx) {
    ctx.scale(1.1, 1.1)
    drawShadow(ctx, 0.42, 0.28)
    ctx.fillStyle = SAND_SHADE
    roundedRect(ctx, -0.42, 0.14, 0.84, 0.16, 0.03)
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.02)
    // тело льва и лапы
    ctx.fillStyle = SAND
    ctx.beginPath()
    ctx.moveTo(-0.38, 0.15)
    ctx.quadraticCurveTo(-0.38, -0.02, -0.16, -0.02)
    ctx.lineTo(0.1, -0.02)
    ctx.lineTo(0.2, 0.15)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.02)
    ctx.fillRect(0.1, 0.08, 0.3, 0.07)
    ctx.strokeStyle = SAND_LINE
    ctx.lineWidth = 0.02
    ctx.strokeRect(0.1, 0.08, 0.3, 0.07)
    // голова в полосатом платке
    ctx.fillStyle = LAPIS
    ctx.beginPath()
    ctx.moveTo(0.02, 0.06)
    ctx.lineTo(0.06, -0.3)
    ctx.lineTo(0.28, -0.3)
    ctx.lineTo(0.32, 0.06)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.02)
    ctx.strokeStyle = EGYPT_GOLD
    ctx.lineWidth = 0.025
    ctx.beginPath()
    for (const y of [-0.2, -0.1, 0]) {
      ctx.moveTo(0.04, y)
      ctx.lineTo(0.3, y)
    }
    ctx.stroke()
    ctx.fillStyle = SAND
    roundedRect(ctx, 0.1, -0.26, 0.14, 0.2, 0.04)
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.015)
    ctx.fillStyle = '#2a1a0c'
    circle(ctx, 0.14, -0.18, 0.015)
    ctx.fill()
    circle(ctx, 0.2, -0.18, 0.015)
    ctx.fill()
  },

  anubis(ctx) {
    drawShadow(ctx, 0.3, 0.33)
    ctx.fillStyle = SAND_SHADE
    roundedRect(ctx, -0.3, 0.12, 0.6, 0.2, 0.03)
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.02)
    // лежащий шакал из чёрного базальта
    ctx.fillStyle = BASALT
    ctx.beginPath()
    ctx.moveTo(-0.24, 0.13)
    ctx.quadraticCurveTo(-0.26, -0.04, -0.06, -0.04)
    ctx.lineTo(0.18, 0.13)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-0.02, 0)
    ctx.lineTo(0.02, -0.24)
    ctx.lineTo(0.12, -0.24)
    ctx.lineTo(0.14, 0.04)
    ctx.closePath()
    ctx.fill()
    // голова: два острых уха и вытянутая морда
    ctx.beginPath()
    ctx.moveTo(0.02, -0.22)
    ctx.lineTo(0.04, -0.42)
    ctx.lineTo(0.09, -0.3)
    ctx.lineTo(0.13, -0.42)
    ctx.lineTo(0.15, -0.24)
    ctx.lineTo(0.26, -0.2)
    ctx.lineTo(0.14, -0.16)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = EGYPT_GOLD
    ctx.fillRect(0, -0.12, 0.15, 0.03)
    circle(ctx, 0.1, -0.27, 0.012)
    ctx.fill()
  },

  ankh(ctx) {
    drawShadow(ctx, 0.22, 0.33)
    ctx.fillStyle = SAND_SHADE
    roundedRect(ctx, -0.18, 0.14, 0.36, 0.17, 0.03)
    ctx.fill()
    stroke(ctx, SAND_LINE, 0.02)
    // знак — дважды: тёмная обводка потолще, потом золото
    ctx.lineCap = 'round'
    for (const [color, width] of [
      [EGYPT_GOLD_LINE, 0.09],
      [EGYPT_GOLD, 0.06],
    ] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(0, 0.14)
      ctx.lineTo(0, -0.12)
      ctx.moveTo(-0.16, -0.12)
      ctx.lineTo(0.16, -0.12)
      ctx.stroke()
      ellipse(ctx, 0, -0.26, 0.09, 0.12)
      ctx.stroke()
    }
  },
}

/** Нарисовать препятствия зала — один раз, в неподвижный фон */
export function drawProps(ctx: Canvas2D, props: readonly LevelProp[]): void {
  for (const { kind, cell } of props) {
    ctx.save()
    ctx.translate(cell[0] + 0.5, cell[1] + 0.5)
    PROP_ART[kind](ctx)
    ctx.restore()
  }
}

/** Маленький язычок пламени: x, y — низ, size — высота */
function drawSmallFlame(ctx: Canvas2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#f0863a'
  ctx.beginPath()
  ctx.moveTo(x - size * 0.5, y)
  ctx.quadraticCurveTo(x - size * 0.45, y - size * 0.7, x, y - size * 1.3)
  ctx.quadraticCurveTo(x + size * 0.45, y - size * 0.7, x + size * 0.5, y)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffd36a'
  ctx.beginPath()
  ctx.moveTo(x - size * 0.25, y)
  ctx.quadraticCurveTo(x, y - size * 0.9, x + size * 0.25, y)
  ctx.closePath()
  ctx.fill()
}

/**
 * Живое пламя светцев и канделябров — каждый кадр, поверх фона: мерцает, как факелы у трона.
 * Только мерцание, без искр и колец — чтобы не путалось с горящими врагами
 */
export function drawPropFlames(ctx: Canvas2D, props: readonly LevelProp[], time: number): void {
  props.forEach(({ kind, cell }, propIndex) => {
    const flames = FLAMES[kind]
    if (!flames) return
    flames.forEach(([x, y, size], flameIndex) => {
      const flicker = prefersReducedMotion
        ? 1
        : 0.85 + 0.15 * Math.sin(time * 11 + propIndex * 1.7 + flameIndex * 2.3)
      drawSmallFlame(ctx, cell[0] + 0.5 + x, cell[1] + 0.5 + y, size * flicker)
    })
  })
}
