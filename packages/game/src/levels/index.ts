// Все уровни игры. Новый уровень: создай файл рядом (по образцу throne-hall.ts) и добавь сюда.

import type { LevelDef } from '../types.ts'
import { throneHall } from './throne-hall.ts'

export const LEVELS: readonly LevelDef[] = [throneHall]
