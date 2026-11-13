// Зал: пол, ковёр, помост, дверь, препятствия, трон и факелы.
// Всё неподвижное рисуется один раз в отдельный canvas («слой»), а потом просто копируется.
// Залы отличаются оформлением (themes.ts — плитка, ковёр, помост, трон) и препятствиями (props.ts).
// Правило оформления: приглушённые цвета, без оранжевого, голубого, фиолетового и яркого
// золота — ими рисуются эффекты (огонь, лёд, проклятие, баффы), с ними не должно путаться

import type { Level, Point } from '@throne/game'
import { drawProps } from './props'
import { FLOOR_COLOR, GOLD, circle, prefersReducedMotion, roundedRect } from './shapes'
import type { Canvas2D } from './shapes'
import { hallTheme, type HallTheme } from './themes'

/** Узор ковра не доходит до конца отрезка на столько клеток — у трона и на поворотах не налезает */
const CARPET_PATTERN_END_GAP = 0.05

/** Пол: плиты по теме зала (themes.ts) */
function drawFloor(ctx: Canvas2D, cols: number, rows: number, theme: HallTheme): void {
  ctx.fillStyle = FLOOR_COLOR
  ctx.fillRect(0, 0, cols, rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) theme.drawTile(ctx, col, row)
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

/** Помост под троном — цвета по теме */
function drawDais(ctx: Canvas2D, throne: Point, theme: HallTheme): void {
  const [throneX, throneY] = throne
  ctx.fillStyle = theme.dais.base
  roundedRect(ctx, throneX - 1.45, throneY - 0.41, 2.9, 0.92, 0.08)
  ctx.fill()
  ctx.fillStyle = theme.dais.top
  roundedRect(ctx, throneX - 1.32, throneY - 0.41, 2.64, 0.76, 0.06)
  ctx.fill()
  ctx.fillStyle = theme.dais.band
  ctx.fillRect(throneX - 1.32, throneY + 0.34, 2.64, 0.03)
}

/**
 * Ковёр вдоль дороги: несколько обводок одной и той же линии разной толщины, потом узор темы.
 * Узор рисуется по каждому прямому отрезку в его координатах: x — вдоль ковра, y — поперёк
 */
function drawCarpet(ctx: Canvas2D, path: Level['path'], theme: HallTheme): void {
  const { points } = path
  const trace = () => {
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
  }
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const [color, lineWidth] of [
    ['rgba(8,9,18,.5)', 0.9],
    [GOLD, 0.8],
    [theme.carpet, 0.69],
    [theme.carpetInner, 0.34],
  ] as const) {
    trace()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
  for (let i = 0; i < points.length - 1; i++) {
    const [startX, startY] = points[i]
    const [endX, endY] = points[i + 1]
    const length = Math.hypot(endX - startX, endY - startY)
    ctx.save()
    ctx.translate(startX, startY)
    ctx.rotate(Math.atan2(endY - startY, endX - startX))
    for (const { step, draw } of theme.carpetPattern) {
      for (let along = step / 2; along < length - CARPET_PATTERN_END_GAP; along += step) {
        draw(ctx, along)
      }
    }
    ctx.restore()
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

  const theme = hallTheme(level.def.theme)
  drawFloor(ctx, cols, rows, theme)
  drawTorchGlow(ctx, throne, cols, rows)
  drawDais(ctx, throne, theme)
  drawCarpet(ctx, path, theme)
  drawDoor(ctx, path, rows)
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
  for (const x of [throneX - 1.08, throneX + 1.08]) {
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
