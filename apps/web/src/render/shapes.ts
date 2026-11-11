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
