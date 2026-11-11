// Мелкие помощники для рисования на canvas

type Ctx = CanvasRenderingContext2D

export const GOLD = '#e3b24a'
export const CRIMSON = '#a8212f'
export const PARCH = '#f3e9d2'

/** Начать путь-круг (потом нужно вызвать fill или stroke) */
export function circle(c: Ctx, x: number, y: number, r: number): void {
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
}

/** Начать путь-прямоугольник со скруглёнными углами */
export function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath()
  c.moveTo(x + r, y)
  c.lineTo(x + w - r, y)
  c.quadraticCurveTo(x + w, y, x + w, y + r)
  c.lineTo(x + w, y + h - r)
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  c.lineTo(x + r, y + h)
  c.quadraticCurveTo(x, y + h, x, y + h - r)
  c.lineTo(x, y + r)
  c.quadraticCurveTo(x, y, x + r, y)
  c.closePath()
}

/** Псевдослучайное число 0..1, всегда одинаковое для одной клетки — для узора пола */
export function hash(c: number, r: number): number {
  const v = Math.sin(c * 127.1 + r * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** Игрок попросил систему поменьше анимаций — убираем тряску, искры и покачивание */
export const reduceMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
