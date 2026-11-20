// Зал: пол, ковёр, помост, дверь, препятствия, трон и факелы.
// Всё неподвижное рисуется один раз в отдельный canvas («слой»), а потом просто копируется.
// Залы отличаются оформлением (themes.ts — плитка, ковёр, помост, трон) и препятствиями (props.ts).
// Правило оформления: приглушённые цвета, без оранжевого, голубого, фиолетового и яркого
// золота — ими рисуются эффекты (огонь, лёд, проклятие, баффы), с ними не должно путаться

import type { Level, Point } from '@throne/game'
import { drawProps } from './props'
import { FLOOR_COLOR, circle, prefersReducedMotion, roundedRect } from './shapes'
import type { Canvas2D } from './shapes'
import { hallTheme, type HallTheme } from './themes'

/** Размеры ковра в долях клетки */
const CARPET_WIDTH = 0.92
const CARPET_CORNER_RADIUS = 0.16
const CARPET_PATTERN_END_GAP = 0.22
const TORCH_OFFSET = 1.08
const TEMPLE_STEP_DEPTH = 0.08

/** Пол: плиты по теме зала (themes.ts) */
function drawFloor(ctx: Canvas2D, cols: number, rows: number, theme: HallTheme): void {
  ctx.fillStyle = FLOOR_COLOR
  ctx.fillRect(0, 0, cols, rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) theme.drawTile(ctx, col, row)
  }
}

/** По мягкому пятну света от каждого факела у трона */
function drawTorchGlow(ctx: Canvas2D, throne: Point): void {
  const [throneX, throneY] = throne
  const y = throneY + 0.04
  const radius = 2.7
  for (const x of [throneX - TORCH_OFFSET, throneX + TORCH_OFFSET]) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, 'rgba(246,174,110,.29)')
    glow.addColorStop(0.55, 'rgba(246,174,110,.075)')
    glow.addColorStop(1, 'rgba(246,174,110,0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
}

/** Помост под троном — цвета по теме */
function drawDais(ctx: Canvas2D, throne: Point, theme: HallTheme): void {
  const [throneX, throneY] = throne
  ctx.fillStyle = 'rgba(12,12,20,.35)'
  roundedRect(ctx, throneX - 1.53, throneY - 0.4, 3.06, 0.97, 0.095)
  ctx.fill()
  ctx.fillStyle = theme.dais.base
  roundedRect(ctx, throneX - 1.48, throneY - 0.42, 2.96, 0.92, 0.08)
  ctx.fill()
  ctx.fillStyle = theme.dais.top
  roundedRect(ctx, throneX - 1.4, throneY - 0.39, 2.8, 0.72, 0.06)
  ctx.fill()
  ctx.fillStyle = theme.dais.band
  ctx.fillRect(throneX - 1.4, throneY + 0.34, 2.8, 0.024)
  ctx.fillStyle = 'rgba(234,193,143,.23)'
  ctx.fillRect(throneX - 1.43, throneY + 0.44, 2.86, 0.012)
}

function roundedRoute(points: readonly Point[]): Path2D {
  const route = new Path2D()
  route.moveTo(...points[0])
  for (let index = 1; index < points.length - 1; index++) {
    route.arcTo(...points[index], ...points[index + 1], CARPET_CORNER_RADIUS)
  }
  route.lineTo(...points[points.length - 1])
  return route
}

/** Ковёр идёт по маршруту врагов. Скругление, кант и вышивка рисуются на фоне. */
function drawCarpet(
  ctx: Canvas2D,
  level: Level,
  theme: HallTheme,
  points = level.path.points,
): void {
  const { cols, rows } = level.def
  const route = roundedRoute(points)
  const fabric = ctx.createLinearGradient(0, 0, cols, rows)
  fabric.addColorStop(0, theme.carpet.light)
  fabric.addColorStop(1, theme.carpet.dark)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  for (const [color, lineWidth] of [
    ['rgba(8,9,18,.5)', CARPET_WIDTH + 0.04],
    ['#342a32', CARPET_WIDTH],
    [theme.carpet.trim, CARPET_WIDTH - 0.035],
    [theme.carpet.dark, CARPET_WIDTH - 0.086],
    [fabric, CARPET_WIDTH - 0.134],
    ['rgba(27,11,24,.12)', CARPET_WIDTH - 0.23],
  ] as const) {
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.stroke(route)
  }

  // В координатах отрезка x идёт вдоль ковра, y — поперёк.
  const stitchOffset = CARPET_WIDTH / 2 - 0.106
  for (let i = 0; i < points.length - 1; i++) {
    const [startX, startY] = points[i]
    const [endX, endY] = points[i + 1]
    const length = Math.hypot(endX - startX, endY - startY)
    ctx.save()
    ctx.translate(startX, startY)
    ctx.rotate(Math.atan2(endY - startY, endX - startX))
    for (const { step, draw } of theme.carpetPattern) {
      for (
        let along = Math.max(step / 2, CARPET_PATTERN_END_GAP);
        along < length - CARPET_PATTERN_END_GAP;
        along += step
      ) {
        draw(ctx, along)
      }
    }
    ctx.fillStyle = 'rgba(239,186,137,.24)'
    for (let along = 0.33; along < length - 0.33; along += 0.1) {
      ctx.fillRect(along, -stitchOffset, 0.026, 0.012)
      ctx.fillRect(along, stitchOffset - 0.012, 0.026, 0.012)
    }
    ctx.restore()
  }
  ctx.restore()
}

/** Дверь — там, где начинается ковёр (у нижнего края) */
function drawDoor(ctx: Canvas2D, path: Level['path'], rows: number): void {
  const doorX = path.points[0][0]
  const halfWidth = CARPET_WIDTH / 2
  const doorGradient = ctx.createLinearGradient(0, rows - 0.65, 0, rows)
  doorGradient.addColorStop(0, 'rgba(9,9,16,0)')
  doorGradient.addColorStop(1, 'rgba(9,9,16,.85)')
  ctx.fillStyle = doorGradient
  ctx.fillRect(doorX - halfWidth, rows - 0.65, CARPET_WIDTH, 0.65)
  for (const x of [doorX - halfWidth - 0.13, doorX + halfWidth]) {
    ctx.fillStyle = '#51464d'
    ctx.fillRect(x, rows - 0.4, 0.13, 0.4)
    ctx.fillStyle = '#796b6c'
    ctx.fillRect(x - 0.015, rows - 0.42, 0.16, 0.06)
  }
}

/** Каменный вход повторяет первый изгиб пути и стыкуется с ковром. */
function drawTempleEntrance(ctx: Canvas2D, points: readonly Point[], rows: number): void {
  const [x] = points[0]
  const [endX, endY] = points[points.length - 1]
  const route = roundedRoute(points)
  const stone = ctx.createLinearGradient(0, rows - 0.85, 0, rows)
  stone.addColorStop(0, '#847155')
  stone.addColorStop(1, '#504134')
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  for (const [color, width] of [
    ['rgba(8,9,18,.5)', CARPET_WIDTH + 0.04],
    ['#45392d', CARPET_WIDTH],
    ['#9a825d', CARPET_WIDTH - 0.04],
    [stone, CARPET_WIDTH - 0.087],
  ] as const) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke(route)
  }
  ctx.restore()

  ctx.fillStyle = '#ad936c'
  ctx.fillRect(endX - 0.026, endY - 0.425, 0.026, 0.85)

  const stepColors = ['#7d694e', '#6a5843', '#554637']
  const y = rows - TEMPLE_STEP_DEPTH * stepColors.length
  const stepWidth = CARPET_WIDTH - 0.11
  for (const [index, color] of stepColors.entries()) {
    const stepY = y + TEMPLE_STEP_DEPTH * index
    ctx.fillStyle = color
    ctx.fillRect(x - stepWidth / 2, stepY, stepWidth, TEMPLE_STEP_DEPTH)
    ctx.fillStyle = 'rgba(226,200,149,.3)'
    ctx.fillRect(x - stepWidth / 2, stepY, stepWidth, 0.014)
  }

  for (const left of [x - 0.56, x + 0.43]) {
    ctx.fillStyle = '#4a3b30'
    roundedRect(ctx, left - 0.02, rows - 0.19, 0.17, 0.21, 0.026)
    ctx.fill()
    ctx.fillStyle = '#927b57'
    roundedRect(ctx, left, rows - 0.163, 0.13, 0.18, 0.021)
    ctx.fill()
    ctx.fillStyle = '#b49a71'
    ctx.fillRect(left + 0.02, rows - 0.135, 0.09, 0.02)
  }
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
  edgeShadow.addColorStop(1, 'rgba(8,9,18,.31)')
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

  const theme = hallTheme(level.def.theme)
  drawFloor(ctx, cols, rows, theme)
  if (level.def.id === 'anubis-temple') {
    const [entrance, firstTurn, nextTurn] = path.points
    const join: Point = [firstTurn[0] + (nextTurn[0] - firstTurn[0]) * 0.375, firstTurn[1]]
    drawTempleEntrance(ctx, [entrance, firstTurn, join], rows)
    drawCarpet(ctx, level, theme, [join, ...path.points.slice(2)])
  } else {
    drawCarpet(ctx, level, theme)
    drawDoor(ctx, path, rows)
  }
  drawDais(ctx, throne, theme)
  drawTorchGlow(ctx, throne)
  drawProps(ctx, level.def.props ?? [])
  drawEdgeShadow(ctx, cols, rows)

  return layer
}

/**
 * Трон и два факела — каждый кадр. Трон и чаши факелов — по теме зала.
 * hurtTime > 0 — трон только что ранили, он вспыхивает красным
 */
export function drawThrone(ctx: Canvas2D, level: Level, time: number, hurtTime: number): void {
  const [throneX, throneY] = level.def.throne
  const theme = hallTheme(level.def.theme)
  ctx.save()
  ctx.translate(throneX, throneY)
  theme.drawThrone(ctx)
  if (hurtTime > 0) {
    ctx.fillStyle = `rgba(255,70,60,${Math.min(0.6, hurtTime)})`
    circle(ctx, 0, 0, 0.5)
    ctx.fill()
  }
  ctx.restore()

  // Факелы
  for (const x of [throneX - TORCH_OFFSET, throneX + TORCH_OFFSET]) {
    const flicker = prefersReducedMotion
      ? 1
      : 0.92 + Math.sin(time * 11 + x) * 0.08 + Math.sin(time * 17 + x * 3) * 0.05
    const y = throneY + 0.04
    ctx.fillStyle = theme.torchBowl
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
