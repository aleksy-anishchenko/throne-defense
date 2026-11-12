// Общие числа баланса. Поменял что-то здесь — запусти `npm run towers`, `npm run balance` и `npm test`.

/**
 * Версия баланса. Увеличивай при ЛЮБОМ изменении чисел (здесь, в башнях, врагах, волнах).
 * Понадобится для рейтинга: рекорды разных версий нечестно сравнивать.
 *
 * История:
 * 1 — исходный баланс.
 * 2 — баллиста ослаблена: урон 55/95/160 → 50/80/125, дальность 3,6/4/4,5 → 3,4/3,6/3,9.
 * 3 — волны сильнее, узурпатор медленнее (по итогам живой игры: волны лёгкие, босс — стена):
 *     здоровье бунтовщика 30 → 37, лазутчика 18 → 22, латника 90 → 110, огра 320 → 390 (≈ +22%);
 *     скорость узурпатора 0,4 → 0,36 (−10%).
 */
export const BALANCE_VERSION = 3

/** Шаг симуляции: мир всегда считается кусочками по 1/60 секунды */
export const SIMULATION_STEP = 1 / 60

/** Какую долю вложенного золота возвращает продажа башни */
export const REFUND_RATE = 0.6

/** Очки: за каждую монету награды, за отбитую волну (× номер волны), за каждую жизнь при победе */
export const SCORE = { perGold: 10, perWave: 100, perLife: 100 }

/** Скорость игры: от ×1 до ×3 */
export const MIN_SPEED = 1
export const MAX_SPEED = 3

export const TUNING = {
  /** До «колена» здоровье врагов растёт на 24% за волну */
  hpGrowthPerWave: 1.24,
  /** Номер волны-«колена», после неё рост меняется с процентов на ровную прибавку */
  kneeWave: 10,
  /** После «колена» — ровная прибавка (в долях здоровья первой волны за каждую волну) */
  hpStepAfterKnee: 2.2,
  /** После последней волны (бесконечный режим) — снова проценты */
  endlessHpGrowth: 1.08,
  /** Бонус золота за волну: waveBonusBase + waveBonusPerWave × номер волны */
  waveBonusBase: 25,
  waveBonusPerWave: 5,
}

/**
 * Во сколько раз здоровье врагов на волне `waveNumber` больше, чем на первой.
 * waveCount — сколько волн в уровне; после неё начинается бесконечный режим.
 */
export function hpMultiplier(waveNumber: number, waveCount: number): number {
  const { hpGrowthPerWave, kneeWave, hpStepAfterKnee, endlessHpGrowth } = TUNING
  // Бесконечный режим: от здоровья на последней волне уровня, +8% за каждую следующую.
  // Важно считать именно от последней волны: если в уровне меньше волн, чем «колено»,
  // формула «колено + прибавка» дала бы меньше, и враги после победы вдруг ослабли бы.
  if (waveNumber > waveCount)
    return hpMultiplier(waveCount, waveCount) * Math.pow(endlessHpGrowth, waveNumber - waveCount)
  if (waveNumber <= kneeWave) return Math.pow(hpGrowthPerWave, waveNumber - 1)
  return Math.pow(hpGrowthPerWave, kneeWave - 1) + hpStepAfterKnee * (waveNumber - kneeWave)
}

export const waveBonus = (waveNumber: number): number =>
  TUNING.waveBonusBase + TUNING.waveBonusPerWave * waveNumber
