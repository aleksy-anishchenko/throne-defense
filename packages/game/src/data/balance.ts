// Общие числа баланса. Поменял что-то здесь — запусти `npm run towers`, `npm run balance` и `npm test`.

/**
 * Версия баланса. Увеличивай при ЛЮБОМ изменении чисел (здесь, в башнях, врагах, волнах).
 * Понадобится для рейтинга: рекорды разных версий нечестно сравнивать.
 *
 * История:
 * 1 — исходный баланс.
 * 2 — баллиста ослаблена: урон 55/95/160 → 50/80/125, дальность 3,6/4/4,5 → 3,4/3,6/3,9.
 */
export const BALANCE_VERSION = 2

/** Шаг симуляции: мир всегда считается кусочками по 1/60 секунды */
export const STEP = 1 / 60

/** Какую долю вложенного золота возвращает продажа башни */
export const REFUND_RATE = 0.6

/** Очки: за каждую монету награды, за отбитую волну (× номер волны), за каждую жизнь при победе */
export const SCORE = { perGold: 10, perWave: 100, perLife: 100 }

export const TUNE = {
  /** До «колена» здоровье врагов растёт на 24% за волну */
  hpGrow: 1.24,
  knee: 10,
  /** После «колена» — ровная прибавка */
  hpStep: 2.2,
  /** После последней волны (бесконечный режим) — снова проценты */
  lateGrow: 1.08,
  /** Бонус золота за волну: bonusBase + bonusPer × номер волны */
  bonusBase: 25,
  bonusPer: 5,
}

/**
 * Во сколько раз здоровье врагов на волне `wave` больше, чем на первой.
 * maxWave — сколько волн в уровне; после неё начинается бесконечный режим.
 */
export function hpMul(wave: number, maxWave: number): number {
  const { hpGrow, knee, hpStep, lateGrow } = TUNE
  // Бесконечный режим: от здоровья на последней волне уровня, +8% за каждую следующую.
  // Важно считать именно от последней волны: если в уровне меньше волн, чем «колено»,
  // формула «колено + прибавка» дала бы меньше, и враги после победы вдруг ослабли бы.
  if (wave > maxWave) return hpMul(maxWave, maxWave) * Math.pow(lateGrow, wave - maxWave)
  if (wave <= knee) return Math.pow(hpGrow, wave - 1)
  return Math.pow(hpGrow, knee - 1) + hpStep * (wave - knee)
}

export const waveBonus = (wave: number): number => TUNE.bonusBase + TUNE.bonusPer * wave
