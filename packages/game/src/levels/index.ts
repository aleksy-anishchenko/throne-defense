// Все уровни игры. Новый уровень: создай файл рядом (по образцу throne-hall.ts) и добавь сюда.
// Полный список сохраняет старые залы для рейтинга и ранее открытых партий.

import type { LevelDef } from '../types.ts'
import { compactThroneHall } from './compact-throne-hall.ts'
import { compactHall } from './compact-halls.ts'
import { HALLS } from './halls.ts'
import { throneHall } from './throne-hall.ts'

export const LEVELS: readonly LevelDef[] = [throneHall, ...HALLS, compactThroneHall]

/** Залы, доступные для новых партий. Старые результаты сохраняют названия и проверку. */
const RETIRED_LEVEL_IDS = new Set(['granovitaya', 'embassy-hall', 'library', 'compact-throne-hall'])
export const PLAYABLE_LEVELS: readonly LevelDef[] = LEVELS.filter(
  (level) => !RETIRED_LEVEL_IDS.has(level.id),
).map(compactHall)
