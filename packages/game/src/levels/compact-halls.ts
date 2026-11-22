import { createLevel } from '../core/level.ts'
import type { LevelDef, LevelProp, Point } from '../types.ts'

/** В компактных залах освобождаем клетки у поворотов, где стражи накрывают больше ковра. */
const COMPACT_PROP_MOVES: Record<string, LevelProp | undefined> = {
  'marble-hall': { kind: 'column', cell: [1, 1] },
  svetlitsa: { kind: 'vase', cell: [1, 1] },
  'anubis-temple': { kind: 'ankh', cell: [1, 2] },
}

/**
 * Перевод классического зала на сетку 7×11. Сохраняем ортогональные повороты и оформление,
 * а препятствия переносим на ближайшие свободные внутренние клетки с учётом ручных переносов.
 */
export function compactHall(original: LevelDef): LevelDef {
  const col = (x: number) => Math.min(6, Math.floor((x * 7) / original.cols)) + 0.5
  const row = (y: number) => Math.min(10, Math.floor((y * 11) / original.rows)) + 0.5
  const points: Point[] = []
  for (const [index, [x, y]] of original.pathPoints.entries()) {
    const point: Point =
      index === 0
        ? [col(x), 11.5]
        : index === original.pathPoints.length - 1
          ? [3.5, 0.8]
          : [col(x), row(y)]
    const previous = points[points.length - 1]
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point)
  }
  const def: LevelDef = {
    ...original,
    cols: 7,
    rows: 11,
    throne: [3.5, 0.46],
    blockedCells: [
      [2, 0],
      [3, 0],
      [4, 0],
    ],
    pathPoints: points,
    props: [],
  }
  const blocked = createLevel(def).blockedCellKeys
  const used = new Set(blocked)
  const props: LevelProp[] = []
  const move = COMPACT_PROP_MOVES[original.id]
  for (const prop of original.props ?? []) {
    const [targetCol, targetRow] =
      move?.kind === prop.kind
        ? move.cell
        : [col(prop.cell[0] + 0.5) - 0.5, row(prop.cell[1] + 0.5) - 0.5]
    const candidates: { col: number; row: number; distance: number }[] = []
    for (let y = 1; y < def.rows - 1; y++) {
      for (let x = 1; x < def.cols - 1; x++) {
        if (!used.has(`${x},${y}`))
          candidates.push({
            col: x,
            row: y,
            distance: Math.abs(x - targetCol) + Math.abs(y - targetRow),
          })
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col)
    const cell = candidates[0]
    if (!cell) throw new Error(`Нет места для препятствия в зале ${original.id}`)
    used.add(`${cell.col},${cell.row}`)
    props.push({ ...prop, cell: [cell.col, cell.row] })
  }
  if (original.id === 'throne-hall') {
    // Украшения из Грановитой палаты и Посольской палаты занимают клетки как обычные препятствия.
    props.push(
      { kind: 'banner', cell: [1, 4] },
      { kind: 'orb', cell: [5, 2] },
      { kind: 'candelabrum', cell: [5, 8] },
    )
  }
  return { ...def, props }
}
