// Простая проверка правдоподобия присланного результата.
// Счёт считается в браузере, и подделать его можно. Честная защита — повтор партии
// на сервере (этап 5 в PLAN.md). Пока отбрасываем то, чего в игре не бывает.

import { isValidPlayerName, type SubmitRunRequest } from '@throne/contracts'
import { BALANCE_VERSION, LEVELS, createLevel, maxPossibleScore, type Level } from '@throne/game'

/**
 * Сколько волн можно отбить. Бесконечный режим не кончается, но здоровье врагов растёт
 * так, что 20-я волна — уже стена (см. «Баланс» в PLAN.md). 100 — с огромным запасом
 */
export const MAX_WAVES_CLEARED = 100

/** Уровни по id. createLevel проверяет описание уровня — делаем это один раз при запуске */
const LEVELS_BY_ID = new Map<string, Level>(LEVELS.map((def) => [def.id, createLevel(def)]))

/** null — результат правдоподобен, иначе — почему нет (уходит в ответ 422 и в журнал) */
export function implausibilityReason(run: SubmitRunRequest): string | null {
  if (!isValidPlayerName(run.playerName)) {
    return 'Имя: от 1 до 20 символов, без пробелов по краям и невидимых символов'
  }
  const level = LEVELS_BY_ID.get(run.levelId)
  if (!level) return `Нет уровня «${run.levelId}»`
  // Старая вкладка после обновления баланса присылает результат прошлой версии.
  // Таблицы прошлых версий закрыты: в них уже не играют
  if (run.balanceVersion !== BALANCE_VERSION) {
    return `Версия баланса ${run.balanceVersion} устарела, сейчас ${BALANCE_VERSION} — обновите страницу`
  }
  // Браузер партии без очков не присылает; такие строки только раздували бы «из N игроков»
  if (run.score < 1) return 'Партия без очков — не результат'
  if (run.wavesCleared > MAX_WAVES_CLEARED) return 'Столько волн не бывает'
  if (run.score > maxPossibleScore(level, run.wavesCleared)) {
    return 'Столько очков за эти волны не бывает'
  }
  return null
}
