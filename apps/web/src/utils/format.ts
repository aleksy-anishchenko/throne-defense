/** Форма слова по числу: plural(5, ['волна', 'волны', 'волн']) → 'волн' */
export function plural(count: number, forms: readonly [string, string, string]): string {
  const lastTwoDigits = Math.abs(count) % 100
  const lastDigit = lastTwoDigits % 10
  if (lastTwoDigits > 10 && lastTwoDigits < 20) return forms[2]
  if (lastDigit === 1) return forms[0]
  if (lastDigit > 1 && lastDigit < 5) return forms[1]
  return forms[2]
}

/** 12345 → «12 345» */
export const formatNumber = (value: number): string => value.toLocaleString('ru-RU')

/** 2.5 → «2,5» */
const decimalFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  useGrouping: false,
})
// После применения бонусов 2,875 может получиться как 2,8749999999999996.
export const formatDecimal = (value: number): string =>
  decimalFormat.format(Number(value.toPrecision(15)))

/** 0.35 → «35%» */
export const formatPercent = (fraction: number): string => Math.round(fraction * 100) + '%'

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** Ступень улучшения башни с нуля → римская цифра: 0 → «I» */
export const toRoman = (tier: number): string => ROMAN_NUMERALS[tier] ?? String(tier + 1)
