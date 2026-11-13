import type { LevelDef } from '../types.ts'
import { HALL_BASE } from './hall-base.ts'

/** Первый, «классический» зал. На нём проверки в браузере (e2e) и тесты */
export const throneHall: LevelDef = {
  ...HALL_BASE,
  id: 'throne-hall',
  name: 'Тронный зал',
  pathPoints: [
    [4.5, 13.5],
    [4.5, 10.5],
    [1.5, 10.5],
    [1.5, 7.5],
    [7.5, 7.5],
    [7.5, 4.5],
    [2.5, 4.5],
    [2.5, 2.5],
    [4.5, 2.5],
    [4.5, 0.8],
  ],
}
