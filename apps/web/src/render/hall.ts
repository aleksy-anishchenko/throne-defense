// Тронный зал: пол, ковёр, помост, дверь, трон и факелы.
// Всё неподвижное рисуется один раз в отдельный canvas («слой»), а потом просто копируется.

import type { Level, Point } from '@throne/game'
import {
  CRIMSON,
  FLOOR_COLOR,
  GOLD,
  circle,
  cellNoise,
  prefersReducedMotion,
  roundedRect,
} from './shapes'
import type { Canvas2D } from './shapes'

/** Обводки ковра от широкой к узкой: одна и та же линия разной толщины (в клетках) */
const CARPET_STROKES: { color: string; lineWidth: number }[] = [
  { color: 'rgba(8,9,18,.5)', lineWidth: 0.9 },
  { color: GOLD, lineWidth: 0.8 },
  { color: CRIMSON, lineWidth: 0.69 },
  { color: '#8c1826', lineWidth: 0.34 },
]

/** Пол: плиты чуть разной яркости */
function drawFloor(ctx: Canvas2D, cols: number, rows: number): void {
  ctx.fillStyle = FLOOR_COLOR
  ctx.fillRect(0, 0, cols, rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lightness = 22 + ((col + row) & 1) * 2.4 + (cellNoise(col, row) - 0.5) * 2.6
      ctx.fillStyle = `hsl(231,24%,${lightness}%)`
      ctx.fillRect(col + 0.025, row + 0.025, 0.95, 0.95)
      ctx.fillStyle = 'rgba(255,255,255,.04)'
      ctx.fillRect(col + 0.025, row + 0.025, 0.95, 0.04)
      ctx.fillStyle = 'rgba(0,0,0,.18)'
      ctx.fillRect(col + 0.025, row + 0.935, 0.95, 0.04)
    }
  }
}

/** Тёплый свет от факелов у трона */
function drawTorchGlow(ctx: Canvas2D, throne: Point, cols: number, rows: number): void {
  const [throneX, throneY] = throne
  const torchGlow = ctx.createRadialGradient(
    throneX,
    throneY + 0.14,
    0.2,
    throneX,
    throneY + 0.14,
    6,
  )
  torchGlow.addColorStop(0, 'rgba(240,150,70,.3)')
  torchGlow.addColorStop(1, 'rgba(240,150,70,0)')
  ctx.fillStyle = torchGlow
  ctx.fillRect(0, 0, cols, rows)
}

/** Помост под троном */
function drawDais(ctx: Canvas2D, throne: Point): void {
  const [throneX, throneY] = throne
  ctx.fillStyle = '#4c5378'
  roundedRect(ctx, throneX - 1.45, throneY - 0.41, 2.9, 0.92, 0.08)
  ctx.fill()
  ctx.fillStyle = '#5f6790'
  roundedRect(ctx, throneX - 1.32, throneY - 0.41, 2.64, 0.76, 0.06)
  ctx.fill()
  ctx.fillStyle = GOLD
  ctx.fillRect(throneX - 1.32, throneY + 0.34, 2.64, 0.03)
}

/** Ковёр вдоль дороги: несколько обводок одной и той же линии разной толщины */
function drawCarpet(ctx: Canvas2D, path: Level['path']): void {
  const trace = () => {
    ctx.beginPath()
    ctx.moveTo(path.points[0][0], path.points[0][1])
    for (const [x, y] of path.points.slice(1)) ctx.lineTo(x, y)
  }
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const { color, lineWidth } of CARPET_STROKES) {
    trace()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
  // Ромбики узора
  ctx.fillStyle = 'rgba(227,178,74,.6)'
  for (let distance = 0.25; distance < path.length - 0.3; distance += 0.5) {
    const [x, y] = path.positionAt(distance)
    ctx.beginPath()
    ctx.moveTo(x, y - 0.075)
    ctx.lineTo(x + 0.075, y)
    ctx.lineTo(x, y + 0.075)
    ctx.lineTo(x - 0.075, y)
    ctx.closePath()
    ctx.fill()
  }
}

/** Дверь — там, где начинается ковёр (у нижнего края) */
function drawDoor(ctx: Canvas2D, path: Level['path'], rows: number): void {
  const doorX = path.points[0][0]
  const doorGradient = ctx.createLinearGradient(0, rows - 0.75, 0, rows)
  doorGradient.addColorStop(0, 'rgba(6,6,14,0)')
  doorGradient.addColorStop(1, 'rgba(6,6,14,.9)')
  ctx.fillStyle = doorGradient
  ctx.fillRect(doorX - 0.48, rows - 0.75, 0.96, 0.75)
  ctx.fillStyle = '#565d85'
  ctx.fillRect(doorX - 0.62, rows - 0.5, 0.16, 0.5)
  ctx.fillRect(doorX + 0.46, rows - 0.5, 0.16, 0.5)
  ctx.fillStyle = '#7880ab'
  ctx.fillRect(doorX - 0.62, rows - 0.5, 0.16, 0.05)
  ctx.fillRect(doorX + 0.46, rows - 0.5, 0.16, 0.05)
}

/** Затемнение по краям */
function drawEdgeShadow(ctx: Canvas2D, cols: number, rows: number): void {
  const edgeShadow = ctx.createRadialGradient(
    cols / 2,
    rows / 2 - 0.5,
    (cols * 4) / 9,
    cols / 2,
    rows / 2,
    (rows * 9.5) / 13,
  )
  edgeShadow.addColorStop(0, 'rgba(8,9,18,0)')
  edgeShadow.addColorStop(1, 'rgba(8,9,18,.55)')
  ctx.fillStyle = edgeShadow
  ctx.fillRect(0, 0, cols, rows)
}

/** Нарисовать неподвижный фон уровня. cellPx — сколько пикселей в одной клетке */
export function buildHall(
  level: Level,
  width: number,
  height: number,
  cellPx: number,
): HTMLCanvasElement {
  const { cols, rows, throne } = level.def
  const { path } = level

  const layer = document.createElement('canvas')
  layer.width = width
  layer.height = height
  const ctx = layer.getContext('2d')!
  ctx.scale(cellPx, cellPx)

  drawFloor(ctx, cols, rows)
  drawTorchGlow(ctx, throne, cols, rows)
  drawDais(ctx, throne)
  drawCarpet(ctx, path)
  drawDoor(ctx, path, rows)
  drawEdgeShadow(ctx, cols, rows)

  return layer
}

/** Трон и два факела. hurtTime > 0 — трон только что ранили, он вспыхивает красным */
export function drawThrone(ctx: Canvas2D, throne: Point, time: number, hurtTime: number): void {
  const [throneX, throneY] = throne
  ctx.save()
  ctx.translate(throneX, throneY)
  ctx.fillStyle = '#a87a1f'
  ctx.beginPath()
  ctx.moveTo(-0.29, 0.3)
  ctx.lineTo(-0.29, -0.16)
  ctx.quadraticCurveTo(0, -0.56, 0.29, -0.16)
  ctx.lineTo(0.29, 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(-0.24, 0.3)
  ctx.lineTo(-0.24, -0.14)
  ctx.quadraticCurveTo(0, -0.48, 0.24, -0.14)
  ctx.lineTo(0.24, 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = CRIMSON
  ctx.beginPath()
  ctx.moveTo(-0.17, 0.14)
  ctx.lineTo(-0.17, -0.1)
  ctx.quadraticCurveTo(0, -0.34, 0.17, -0.1)
  ctx.lineTo(0.17, 0.14)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = GOLD
  roundedRect(ctx, -0.36, 0.1, 0.72, 0.17, 0.04)
  ctx.fill()
  ctx.fillStyle = '#a87a1f'
  ctx.fillRect(-0.36, 0.23, 0.72, 0.05)
  ctx.fillStyle = GOLD
  roundedRect(ctx, -0.4, -0.06, 0.11, 0.3, 0.04)
  ctx.fill()
  roundedRect(ctx, 0.29, -0.06, 0.11, 0.3, 0.04)
  ctx.fill()
  circle(ctx, -0.345, -0.08, 0.06)
  ctx.fill()
  circle(ctx, 0.345, -0.08, 0.06)
  ctx.fill()
  circle(ctx, 0, -0.37, 0.055)
  ctx.fill()
  if (hurtTime > 0) {
    ctx.fillStyle = `rgba(255,70,60,${Math.min(0.6, hurtTime)})`
    circle(ctx, 0, 0, 0.5)
    ctx.fill()
  }
  ctx.restore()

  // Факелы
  for (const x of [throneX - 1.08, throneX + 1.08]) {
    const flicker = prefersReducedMotion
      ? 1
      : 0.92 + Math.sin(time * 11 + x) * 0.08 + Math.sin(time * 17 + x * 3) * 0.05
    const y = throneY + 0.04
    ctx.fillStyle = '#20233a'
    roundedRect(ctx, x - 0.13, y + 0.04, 0.26, 0.16, 0.05)
    ctx.fill()
    ctx.fillStyle = 'rgba(240,134,58,.95)'
    ctx.beginPath()
    ctx.moveTo(x - 0.1, y + 0.08)
    ctx.quadraticCurveTo(x - 0.14, y - 0.1 * flicker, x, y - 0.3 * flicker)
    ctx.quadraticCurveTo(x + 0.14, y - 0.1 * flicker, x + 0.1, y + 0.08)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,224,130,.95)'
    ctx.beginPath()
    ctx.moveTo(x - 0.05, y + 0.08)
    ctx.quadraticCurveTo(x - 0.07, y - 0.04 * flicker, x, y - 0.16 * flicker)
    ctx.quadraticCurveTo(x + 0.07, y - 0.04 * flicker, x + 0.05, y + 0.08)
    ctx.closePath()
    ctx.fill()
  }
}
