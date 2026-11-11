// Путь врагов (ковёр): ломаная линия из точек.
// positionAt(distance) отвечает на вопрос «где окажется враг, пройдя distance клеток от двери».

import type { Point } from '../types.ts'

export interface Path {
  readonly points: readonly Point[]
  /** Полная длина, клеток */
  readonly length: number
  /** Точка ковра, до которой враг дошёл, пройдя distance клеток от двери */
  positionAt(distance: number): [number, number]
}

export function createPath(points: readonly Point[]): Path {
  if (points.length < 2) throw new Error('В пути должно быть хотя бы две точки')

  const segmentLengths: number[] = [] // длина каждого отрезка, клеток
  const distanceAtSegmentStart: number[] = [0] // сколько клеток пройдено к началу каждого отрезка
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    segmentLengths.push(Math.hypot(x1 - x0, y1 - y0))
    distanceAtSegmentStart.push(distanceAtSegmentStart[i] + segmentLengths[i])
  }
  const length = distanceAtSegmentStart[distanceAtSegmentStart.length - 1]

  function positionAt(distance: number): [number, number] {
    if (distance <= 0) return [points[0][0], points[0][1]]
    for (let i = 0; i < segmentLengths.length; i++) {
      if (distance <= distanceAtSegmentStart[i + 1]) {
        const segmentProgress = (distance - distanceAtSegmentStart[i]) / segmentLengths[i]
        const [x0, y0] = points[i]
        const [x1, y1] = points[i + 1]
        return [x0 + (x1 - x0) * segmentProgress, y0 + (y1 - y0) * segmentProgress]
      }
    }
    const last = points[points.length - 1]
    return [last[0], last[1]]
  }

  return { points, length, positionAt }
}
