// Мелкие помощники для рисования на canvas

export type Canvas2D = CanvasRenderingContext2D

export const GOLD = '#e3b24a'
export const CRIMSON = '#a8212f'
export const PARCHMENT = '#f3e9d2'
/** Цвет пола (он же фон поля) */
export const FLOOR_COLOR = '#171a28'
/** Смещение от угла клетки к её центру, клеток */
export const CELL_CENTER = 0.5
/** Куда «смотрит» башня, пока не целится: вверх, радианы */
export const TOWER_IDLE_AIM_ANGLE = -Math.PI / 2

/** Начать путь-круг (потом нужно вызвать fill или stroke) */
export function circle(ctx: Canvas2D, x: number, y: number, radius: number): void {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
}

/** Начать путь-прямоугольник со скруглёнными углами */
export function roundedRect(
  ctx: Canvas2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/** Псевдослучайное число 0..1, всегда одинаковое для одной клетки — для узора пола */
export function cellNoise(col: number, row: number): number {
  const value = Math.sin(col * 127.1 + row * 311.7) * 43758.5453
  return value - Math.floor(value)
}

/** Игрок попросил систему поменьше анимаций — убираем тряску, искры и покачивание */
export const prefersReducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Сеть: круг из верёвок с ячейками. x, y — центр, radius — радиус, rotation — поворот,
 * weightColor — цвет грузил по краю (пустая строка — без грузил)
 */
export function drawNet(
  ctx: Canvas2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  weightColor: string,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  // ячейки: сетка линий, обрезанная кругом
  ctx.save()
  circle(ctx, 0, 0, radius)
  ctx.clip()
  // тёмная подложка под верёвками: сеть видна и на светлом враге, и на красном ковре
  ctx.strokeStyle = 'rgba(30,22,10,.55)'
  ctx.lineWidth = radius * 0.16
  ctx.beginPath()
  const cellSize = radius / 2.2
  for (let offset = -radius; offset <= radius; offset += cellSize) {
    ctx.moveTo(offset, -radius)
    ctx.lineTo(offset, radius)
    ctx.moveTo(-radius, offset)
    ctx.lineTo(radius, offset)
  }
  ctx.stroke()
  ctx.strokeStyle = '#f0dca6'
  ctx.lineWidth = radius * 0.08
  ctx.beginPath()
  for (let offset = -radius; offset <= radius; offset += cellSize) {
    ctx.moveTo(offset, -radius)
    ctx.lineTo(offset, radius)
    ctx.moveTo(-radius, offset)
    ctx.lineTo(radius, offset)
  }
  ctx.stroke()
  ctx.restore()
  // край сети — толстая верёвка
  ctx.strokeStyle = '#a8864a'
  ctx.lineWidth = radius * 0.16
  circle(ctx, 0, 0, radius)
  ctx.stroke()
  if (weightColor) {
    ctx.fillStyle = weightColor
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3
      circle(ctx, Math.cos(angle) * radius, Math.sin(angle) * radius, radius * 0.17)
      ctx.fill()
    }
  }
  ctx.restore()
}
