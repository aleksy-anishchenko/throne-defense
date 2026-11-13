// Все уровни игры. Новый уровень: создай файл рядом (по образцу throne-hall.ts) и добавь сюда.
// Партия начинается в случайном зале из этого списка (см. apps/web/src/stores/game.ts).
// У всех залов одно поле 9×13 и трон в одном месте (hall-base.ts) — на это рассчитана отрисовка

import type { LevelDef } from '../types.ts'
import { HALLS } from './halls.ts'
import { throneHall } from './throne-hall.ts'

export const LEVELS: readonly LevelDef[] = [throneHall, ...HALLS]
