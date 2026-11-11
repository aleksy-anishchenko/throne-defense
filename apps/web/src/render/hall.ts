// Тронный зал: пол, ковёр, помост, дверь, трон и факелы.
// Всё неподвижное рисуется один раз в отдельный canvas («слой»), а потом просто копируется.

import type { Level, Point } from '@throne/game'
import { CRIMSON, GOLD, circle, hash, reduceMotion, rr } from './shapes'

type Ctx = CanvasRenderingContext2D

/** Нарисовать неподвижный фон уровня. S — сколько пикселей в одной клетке */
export function buildHall(
  level: Level,
  width: number,
  height: number,
  S: number,
): HTMLCanvasElement {
  const { cols, rows, throne } = level.def
  const [tx, ty] = throne
  const { path } = level

  const layer = document.createElement('canvas')
  layer.width = width
  layer.height = height
  const g = layer.getContext('2d')!
  g.scale(S, S)

  // Пол: плиты чуть разной яркости
  g.fillStyle = '#171a28'
  g.fillRect(0, 0, cols, rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const l = 22 + ((c + r) & 1) * 2.4 + (hash(c, r) - 0.5) * 2.6
      g.fillStyle = `hsl(231,24%,${l}%)`
      g.fillRect(c + 0.025, r + 0.025, 0.95, 0.95)
      g.fillStyle = 'rgba(255,255,255,.04)'
      g.fillRect(c + 0.025, r + 0.025, 0.95, 0.04)
      g.fillStyle = 'rgba(0,0,0,.18)'
      g.fillRect(c + 0.025, r + 0.935, 0.95, 0.04)
    }
  }

  // Тёплый свет от факелов у трона
  let gr = g.createRadialGradient(tx, ty + 0.14, 0.2, tx, ty + 0.14, 6)
  gr.addColorStop(0, 'rgba(240,150,70,.3)')
  gr.addColorStop(1, 'rgba(240,150,70,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, cols, rows)

  // Помост
  g.fillStyle = '#4c5378'
  rr(g, tx - 1.45, ty - 0.41, 2.9, 0.92, 0.08)
  g.fill()
  g.fillStyle = '#5f6790'
  rr(g, tx - 1.32, ty - 0.41, 2.64, 0.76, 0.06)
  g.fill()
  g.fillStyle = GOLD
  g.fillRect(tx - 1.32, ty + 0.34, 2.64, 0.03)

  // Ковёр: несколько обводок одной и той же линии разной толщины
  const trace = () => {
    g.beginPath()
    g.moveTo(path.points[0][0], path.points[0][1])
    for (const [x, y] of path.points.slice(1)) g.lineTo(x, y)
  }
  g.lineJoin = 'miter'
  g.lineCap = 'butt'
  const strokes: [string, number][] = [
    ['rgba(8,9,18,.5)', 0.9],
    [GOLD, 0.8],
    [CRIMSON, 0.69],
    ['#8c1826', 0.34],
  ]
  for (const [color, width] of strokes) {
    trace()
    g.strokeStyle = color
    g.lineWidth = width
    g.stroke()
  }
  // Ромбики узора
  g.fillStyle = 'rgba(227,178,74,.6)'
  for (let d = 0.25; d < path.length - 0.3; d += 0.5) {
    const [x, y] = path.posAt(d)
    g.beginPath()
    g.moveTo(x, y - 0.075)
    g.lineTo(x + 0.075, y)
    g.lineTo(x, y + 0.075)
    g.lineTo(x - 0.075, y)
    g.closePath()
    g.fill()
  }

  // Дверь — там, где начинается ковёр (у нижнего края)
  const dx = path.points[0][0]
  const dg = g.createLinearGradient(0, rows - 0.75, 0, rows)
  dg.addColorStop(0, 'rgba(6,6,14,0)')
  dg.addColorStop(1, 'rgba(6,6,14,.9)')
  g.fillStyle = dg
  g.fillRect(dx - 0.48, rows - 0.75, 0.96, 0.75)
  g.fillStyle = '#565d85'
  g.fillRect(dx - 0.62, rows - 0.5, 0.16, 0.5)
  g.fillRect(dx + 0.46, rows - 0.5, 0.16, 0.5)
  g.fillStyle = '#7880ab'
  g.fillRect(dx - 0.62, rows - 0.5, 0.16, 0.05)
  g.fillRect(dx + 0.46, rows - 0.5, 0.16, 0.05)

  // Затемнение по краям
  gr = g.createRadialGradient(
    cols / 2,
    rows / 2 - 0.5,
    (cols * 4) / 9,
    cols / 2,
    rows / 2,
    (rows * 9.5) / 13,
  )
  gr.addColorStop(0, 'rgba(8,9,18,0)')
  gr.addColorStop(1, 'rgba(8,9,18,.55)')
  g.fillStyle = gr
  g.fillRect(0, 0, cols, rows)

  return layer
}

/** Трон и два факела. hurt > 0 — трон только что ранили, он вспыхивает красным */
export function drawThrone(c: Ctx, throne: Point, time: number, hurt: number): void {
  const [tx, ty] = throne
  c.save()
  c.translate(tx, ty)
  c.fillStyle = '#a87a1f'
  c.beginPath()
  c.moveTo(-0.29, 0.3)
  c.lineTo(-0.29, -0.16)
  c.quadraticCurveTo(0, -0.56, 0.29, -0.16)
  c.lineTo(0.29, 0.3)
  c.closePath()
  c.fill()
  c.fillStyle = GOLD
  c.beginPath()
  c.moveTo(-0.24, 0.3)
  c.lineTo(-0.24, -0.14)
  c.quadraticCurveTo(0, -0.48, 0.24, -0.14)
  c.lineTo(0.24, 0.3)
  c.closePath()
  c.fill()
  c.fillStyle = CRIMSON
  c.beginPath()
  c.moveTo(-0.17, 0.14)
  c.lineTo(-0.17, -0.1)
  c.quadraticCurveTo(0, -0.34, 0.17, -0.1)
  c.lineTo(0.17, 0.14)
  c.closePath()
  c.fill()
  c.fillStyle = GOLD
  rr(c, -0.36, 0.1, 0.72, 0.17, 0.04)
  c.fill()
  c.fillStyle = '#a87a1f'
  c.fillRect(-0.36, 0.23, 0.72, 0.05)
  c.fillStyle = GOLD
  rr(c, -0.4, -0.06, 0.11, 0.3, 0.04)
  c.fill()
  rr(c, 0.29, -0.06, 0.11, 0.3, 0.04)
  c.fill()
  circle(c, -0.345, -0.08, 0.06)
  c.fill()
  circle(c, 0.345, -0.08, 0.06)
  c.fill()
  circle(c, 0, -0.37, 0.055)
  c.fill()
  if (hurt > 0) {
    c.fillStyle = `rgba(255,70,60,${Math.min(0.6, hurt)})`
    circle(c, 0, 0, 0.5)
    c.fill()
  }
  c.restore()

  // Факелы
  for (const x of [tx - 1.08, tx + 1.08]) {
    const f = reduceMotion
      ? 1
      : 0.92 + Math.sin(time * 11 + x) * 0.08 + Math.sin(time * 17 + x * 3) * 0.05
    const y = ty + 0.04
    c.fillStyle = '#20233a'
    rr(c, x - 0.13, y + 0.04, 0.26, 0.16, 0.05)
    c.fill()
    c.fillStyle = 'rgba(240,134,58,.95)'
    c.beginPath()
    c.moveTo(x - 0.1, y + 0.08)
    c.quadraticCurveTo(x - 0.14, y - 0.1 * f, x, y - 0.3 * f)
    c.quadraticCurveTo(x + 0.14, y - 0.1 * f, x + 0.1, y + 0.08)
    c.closePath()
    c.fill()
    c.fillStyle = 'rgba(255,224,130,.95)'
    c.beginPath()
    c.moveTo(x - 0.05, y + 0.08)
    c.quadraticCurveTo(x - 0.07, y - 0.04 * f, x, y - 0.16 * f)
    c.quadraticCurveTo(x + 0.07, y - 0.04 * f, x + 0.05, y + 0.08)
    c.closePath()
    c.fill()
  }
}
