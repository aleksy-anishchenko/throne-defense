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

  for (const [index, [x, y]] of points.entries()) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(
        `Координаты точки пути ${index + 1} (${x}, ${y}) должны быть конечными числами`,
      )
    }
  }

  const segmentLengths: number[] = [] // длина каждого отрезка, клеток
  const distanceAtSegmentStart: number[] = [0] // сколько клеток пройдено к началу каждого отрезка
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const segmentLength = Math.hypot(x1 - x0, y1 - y0)
    if (!Number.isFinite(segmentLength) || segmentLength <= 0) {
      throw new Error(`Длина отрезка пути ${i + 1}–${i + 2} должна быть конечной и больше нуля`)
    }
    segmentLengths.push(segmentLength)
    distanceAtSegmentStart.push(distanceAtSegmentStart[i] + segmentLength)
  }
  const length = distanceAtSegmentStart[distanceAtSegmentStart.length - 1]
  if (!Number.isFinite(length)) throw new Error('Полная длина пути должна быть конечной')

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
