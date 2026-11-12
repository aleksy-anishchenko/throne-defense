// Имя игрока в таблице лучших. Одни и те же правила в браузере (поле ввода)
// и на сервере (проверка присланного) — поэтому они здесь, в договоре.

/** Длиннее не помещается в строку таблицы на телефоне */
export const PLAYER_NAME_MAX_LENGTH = 20

/** Невидимые и управляющие символы (перевод строки, «нулевой пробел» и т.п.) */
const CONTROL_CHARACTERS = /\p{C}/u
/**
 * Пустые на вид символы, которые Unicode числит буквами или знаками: корейские «заполнители»,
 * пустая клетка Брайля и т.п. Из них одних получилось бы имя, невидимое в таблице
 */
// Через «или», а не [набор]: \u1160 — соединительная корейская буква, и в наборе линтер
// принимает её за часть составного символа
const BLANK_LOOKING_CHARACTERS = /\u115F|\u1160|\u17B4|\u17B5|\u2800|\u3164|\uFFA0/u
/** Хоть один видимый символ: буква, цифра, знак препинания или значок (эмодзи) */
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}]/u
/**
 * Три и больше надстрочных знака подряд — «залго»-текст: буквы обрастают столбами
 * знаков и наползают на соседние строки таблицы. Обычным языкам хватает одного-двух
 */
const STACKED_MARKS = /\p{M}{3,}/u

/** Сколько символов видит человек: «🙂» — один, хотя в JavaScript у него length 2 */
export function countCharacters(text: string): number {
  return [...text].length
}

/**
 * Убрать пробелы по краям, а несколько пробелов подряд внутри заменить одним.
 * NFC — одна запись для одинаковых на вид букв: «й» бывает одним символом, а бывает
 * «и» + значок краткости; без этого одно имя заняло бы в таблице две строки
 */
export function normalizePlayerName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ')
}

/** Годится ли имя (уже нормализованное): 1–20 символов, видимое, без невидимых символов */
export function isValidPlayerName(name: string): boolean {
  const length = countCharacters(name)
  return (
    length >= 1 &&
    length <= PLAYER_NAME_MAX_LENGTH &&
    name === normalizePlayerName(name) &&
    !CONTROL_CHARACTERS.test(name) &&
    !BLANK_LOOKING_CHARACTERS.test(name) &&
    !STACKED_MARKS.test(name) &&
    VISIBLE_CHARACTER.test(name)
  )
}
