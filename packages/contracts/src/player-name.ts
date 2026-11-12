// Имя игрока в таблице лучших. Одни и те же правила в браузере (поле ввода)
// и на сервере (проверка присланного) — поэтому они здесь, в договоре.

/** Длиннее не помещается в строку таблицы на телефоне */
export const PLAYER_NAME_MAX_LENGTH = 20

/** Невидимые и управляющие символы (перевод строки, «нулевой пробел» и т.п.) */
const CONTROL_CHARACTERS = /\p{C}/u

/** Сколько символов видит человек: «🙂» — один, хотя в JavaScript у него length 2 */
export function countCharacters(text: string): number {
  return [...text].length
}

/** Убрать пробелы по краям, а несколько пробелов подряд внутри заменить одним */
export function normalizePlayerName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Годится ли имя (уже нормализованное): 1–20 символов, без невидимых символов */
export function isValidPlayerName(name: string): boolean {
  const length = countCharacters(name)
  return (
    length >= 1 &&
    length <= PLAYER_NAME_MAX_LENGTH &&
    name === normalizePlayerName(name) &&
    !CONTROL_CHARACTERS.test(name)
  )
}
