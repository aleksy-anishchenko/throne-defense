// Зал: пол, ковёр, помост, дверь, препятствия, трон и факелы.
// Всё неподвижное рисуется один раз в отдельный canvas («слой»), а потом просто копируется.
// Залы отличаются оформлением (HALL_THEMES — цвета пола и ковра) и препятствиями (PROP_ART).
// Правило оформления: приглушённые цвета, без оранжевого, голубого, фиолетового и яркого
// золота — ими рисуются эффекты (огонь, лёд, проклятие, баффы), с ними не должно путаться

import type { Level, LevelProp, Point, PropKind } from '@throne/game'
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

/** Оформление зала: цвета плит пола (оттенок, насыщенность, яркость) и ковра */
interface HallTheme {
  floorHue: number
  floorSaturation: number
  floorLightness: number
  /** Ковёр: основной цвет и тёмная середина */
  carpet: string
  carpetInner: string
}

/** Оформления по id из LevelDef.theme. Нет или неизвестное — тронное */
const HALL_THEMES: Record<string, HallTheme> = {
  // Синий камень, красный ковёр — «Тронный зал»
  throne: {
    floorHue: 231,
    floorSaturation: 24,
    floorLightness: 22,
    carpet: CRIMSON,
    carpetInner: '#8c1826',
  },
  // Холодный серо-голубой камень, тёмно-синий ковёр
  ice: {
    floorHue: 208,
    floorSaturation: 16,
    floorLightness: 27,
    carpet: '#27507c',
    carpetInner: '#1b3b5e',
  },
  // Тёплое тёмное дерево, винный ковёр
  terem: {
    floorHue: 26,
    floorSaturation: 24,
    floorLightness: 21,
    carpet: '#74213d',
    carpetInner: '#55162b',
  },
  // Серо-зелёный старый камень, тёмно-красный ковёр
  crypt: {
    floorHue: 140,
    floorSaturation: 7,
    floorLightness: 21,
    carpet: '#7c1f2a',
    carpetInner: '#5a141d',
  },
}

const themeOf = (level: Level): HallTheme =>
  HALL_THEMES[level.def.theme ?? 'throne'] ?? HALL_THEMES['throne']

/** Обводки ковра от широкой к узкой: одна и та же линия разной толщины (в клетках) */
const carpetStrokes = (theme: HallTheme): { color: string; lineWidth: number }[] => [
  { color: 'rgba(8,9,18,.5)', lineWidth: 0.9 },
  { color: GOLD, lineWidth: 0.8 },
  { color: theme.carpet, lineWidth: 0.69 },
  { color: theme.carpetInner, lineWidth: 0.34 },
]

/** Пол: плиты чуть разной яркости */
function drawFloor(ctx: Canvas2D, cols: number, rows: number, theme: HallTheme): void {
  ctx.fillStyle = FLOOR_COLOR
  ctx.fillRect(0, 0, cols, rows)
  const { floorHue, floorSaturation, floorLightness } = theme
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lightness = floorLightness + ((col + row) & 1) * 2.4 + (cellNoise(col, row) - 0.5) * 2.6
      ctx.fillStyle = `hsl(${floorHue},${floorSaturation}%,${lightness}%)`
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
function drawCarpet(ctx: Canvas2D, path: Level['path'], theme: HallTheme): void {
  const trace = () => {
    ctx.beginPath()
    ctx.moveTo(path.points[0][0], path.points[0][1])
    for (const [x, y] of path.points.slice(1)) ctx.lineTo(x, y)
  }
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const { color, lineWidth } of carpetStrokes(theme)) {
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

// ——— Препятствия ———

/** Тень под препятствием — как у башен и врагов: эллипс внизу клетки */
function drawPropShadow(ctx: Canvas2D) {
  ctx.fillStyle = 'rgba(8,9,18,.4)'
  ctx.beginPath()
  ctx.ellipse(0, 0.26, 0.34, 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Как выглядит каждое препятствие. (0, 0) — центр клетки, размеры в клетках */
const PROP_ART: Record<PropKind, (ctx: Canvas2D) => void> = {
  // Колонна сверху: широкая база, ствол с бликом, кольцо капители
  column(ctx) {
    drawPropShadow(ctx)
    ctx.fillStyle = '#5c6075'
    circle(ctx, 0, 0.04, 0.36)
    ctx.fill()
    ctx.fillStyle = '#8d92a8'
    ctx.strokeStyle = '#4a4e60'
    ctx.lineWidth = 0.03
    circle(ctx, 0, 0, 0.26)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,.25)'
    ctx.lineWidth = 0.025
    circle(ctx, 0, 0, 0.17)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,.22)'
    circle(ctx, -0.08, -0.08, 0.06)
    ctx.fill()
  },
  // Статуя на квадратном постаменте: силуэт витязя с щитом
  statue(ctx) {
    drawPropShadow(ctx)
    ctx.fillStyle = '#585c70'
    roundedRect(ctx, -0.32, -0.08, 0.64, 0.42, 0.05)
    ctx.fill()
    ctx.fillStyle = '#6c7085'
    roundedRect(ctx, -0.32, -0.08, 0.64, 0.08, 0.03)
    ctx.fill()
    ctx.fillStyle = '#9a9eb0'
    ctx.strokeStyle = '#4a4e60'
    ctx.lineWidth = 0.025
    // тело и голова
    ctx.beginPath()
    ctx.moveTo(-0.13, 0.02)
    ctx.lineTo(-0.1, -0.24)
    ctx.lineTo(0.1, -0.24)
    ctx.lineTo(0.13, 0.02)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    circle(ctx, 0, -0.32, 0.08)
    ctx.fill()
    ctx.stroke()
    // щит
    ctx.fillStyle = '#80849a'
    circle(ctx, -0.14, -0.12, 0.07)
    ctx.fill()
    ctx.stroke()
  },
  // Погасшая жаровня: железная чаша на треноге, внутри тлеющие угли (без пламени и свечения —
  // огонь на поле — только эффект Огневика)
  brazier(ctx) {
    drawPropShadow(ctx)
    ctx.strokeStyle = '#3a3c48'
    ctx.lineWidth = 0.04
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const legX of [-0.2, 0, 0.2]) {
      ctx.moveTo(legX * 0.6, 0.05)
      ctx.lineTo(legX, 0.3)
    }
    ctx.stroke()
    ctx.fillStyle = '#4a4d5c'
    ctx.strokeStyle = '#2c2e38'
    ctx.lineWidth = 0.03
    ctx.beginPath()
    ctx.ellipse(0, -0.02, 0.3, 0.17, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#2a1f1f'
    ctx.beginPath()
    ctx.ellipse(0, -0.04, 0.22, 0.11, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6b2b22'
    for (const [emberX, emberY] of [
      [-0.08, -0.05],
      [0.05, -0.02],
      [0.1, -0.07],
    ]) {
      circle(ctx, emberX, emberY, 0.035)
      ctx.fill()
    }
  },
  // Бочка сверху: доски и два железных обруча
  barrel(ctx) {
    drawPropShadow(ctx)
    ctx.fillStyle = '#5e4128'
    ctx.strokeStyle = '#33220f'
    ctx.lineWidth = 0.03
    circle(ctx, 0, 0, 0.3)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(30,18,6,.55)'
    ctx.lineWidth = 0.02
    ctx.beginPath()
    for (const plankX of [-0.15, 0, 0.15]) {
      ctx.moveTo(plankX, -0.27)
      ctx.lineTo(plankX, 0.27)
    }
    ctx.stroke()
    ctx.strokeStyle = '#6f7383'
    ctx.lineWidth = 0.035
    circle(ctx, 0, 0, 0.27)
    ctx.stroke()
    circle(ctx, 0, 0, 0.16)
    ctx.stroke()
  },
}

function drawProps(ctx: Canvas2D, props: readonly LevelProp[]): void {
  for (const { kind, cell } of props) {
    ctx.save()
    ctx.translate(cell[0] + 0.5, cell[1] + 0.5)
    PROP_ART[kind](ctx)
    ctx.restore()
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

  const theme = themeOf(level)
  drawFloor(ctx, cols, rows, theme)
  drawTorchGlow(ctx, throne, cols, rows)
  drawDais(ctx, throne)
  drawCarpet(ctx, path, theme)
  drawDoor(ctx, path, rows)
  drawProps(ctx, level.def.props ?? [])
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
