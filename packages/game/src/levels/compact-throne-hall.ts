import type { LevelDef } from '../types.ts'
import { HALL_BASE } from './hall-base.ts'

/** Опытный компактный зал: те же волны и оформление, меньше места для построек. */
export const compactThroneHall: LevelDef = {
  ...HALL_BASE,
  id: 'compact-throne-hall',
  name: 'Малый тронный зал',
  cols: 7,
  rows: 11,
  throne: [3.5, 0.46],
  blockedCells: [
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  pathPoints: [
    [3.5, 11.5],
    [3.5, 9.5],
    [1.5, 9.5],
    [1.5, 7.5],
    [5.5, 7.5],
    [5.5, 5.5],
    [1.5, 5.5],
    [1.5, 3.5],
    [3.5, 3.5],
    [3.5, 0.8],
  ],
}
