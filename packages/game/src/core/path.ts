// Путь врагов (ковёр): ломаная линия из точек.
// posAt(d) отвечает на вопрос «где окажется враг, пройдя d клеток от двери».

import type { Point } from '../types.ts'

export interface Path {
  readonly points: readonly Point[]
  /** Полная длина, клеток */
  readonly length: number
  posAt(d: number): [number, number]
}

export function createPath(points: readonly Point[]): Path {
  if (points.length < 2) throw new Error('В пути должно быть хотя бы две точки')

  const seg: number[] = [] // длины отрезков
  const cum: number[] = [0] // сколько пройдено к началу каждого отрезка
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    seg.push(Math.hypot(x1 - x0, y1 - y0))
    cum.push(cum[i] + seg[i])
  }
  const length = cum[cum.length - 1]

  function posAt(d: number): [number, number] {
    if (d <= 0) return [points[0][0], points[0][1]]
    for (let i = 0; i < seg.length; i++) {
      if (d <= cum[i + 1]) {
        const f = (d - cum[i]) / seg[i]
        const [x0, y0] = points[i]
        const [x1, y1] = points[i + 1]
        return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]
      }
    }
    const last = points[points.length - 1]
    return [last[0], last[1]]
  }

  return { points, length, posAt }
}
