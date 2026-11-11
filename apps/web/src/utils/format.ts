/** Форма слова по числу: plural(5, ['волна', 'волны', 'волн']) → 'волн' */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b === 1) return forms[0]
  if (b > 1 && b < 5) return forms[1]
  return forms[2]
}

/** 12345 → «12 345» */
export const fmt = (n: number): string => n.toLocaleString('ru-RU')

/** 2.5 → «2,5» */
export const num = (v: number): string => String(v).replace('.', ',')

/** 0.35 → «35%» */
export const pct = (v: number): string => Math.round(v * 100) + '%'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** Уровень башни с нуля → римская цифра: 0 → «I» */
export const roman = (lv: number): string => ROMAN[lv] ?? String(lv + 1)
