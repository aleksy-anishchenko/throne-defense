// Всё, что хранится в браузере игрока. Ключи прежние — рекорды старой версии не потеряются.
// try/catch: в приватном режиме некоторых браузеров localStorage недоступен — тогда играем без сохранения.

export interface Best {
  score: number
  wave: number
}

const KEY_BEST = 'throne-best'
const KEY_MUTED = 'throne-muted'

/**
 * Разобрать сохранённый рекорд. В хранилище может оказаться что угодно: мусор после сбоя,
 * данные будущей версии игры. Всё, что не похоже на рекорд, считаем «рекорда нет» —
 * иначе меню упадёт на попытке показать несуществующий счёт.
 */
export function parseBest(raw: string | null): Best | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { score, wave } = v as Record<string, unknown>
    if (typeof score !== 'number' || typeof wave !== 'number') return null
    if (!Number.isFinite(score) || !Number.isFinite(wave)) return null
    return { score, wave }
  } catch {
    return null
  }
}

export function loadBest(): Best | null {
  try {
    return parseBest(localStorage.getItem(KEY_BEST))
  } catch {
    return null
  }
}

export function saveBest(best: Best): void {
  try {
    localStorage.setItem(KEY_BEST, JSON.stringify(best))
  } catch {
    /* localStorage недоступен — играем без сохранения */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(KEY_MUTED) === '1'
  } catch {
    return false
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY_MUTED, muted ? '1' : '0')
  } catch {
    /* localStorage недоступен — играем без сохранения */
  }
}
