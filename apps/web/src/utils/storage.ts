// Всё, что хранится в браузере игрока. Ключи прежние — рекорды старой версии не потеряются.
// try/catch: в приватном режиме некоторых браузеров localStorage недоступен — тогда играем без сохранения.

/** Рекорд. Хранится в localStorage как JSON именно в такой форме */
export interface BestResult {
  score: number
  /** Сколько волн отбито */
  wave: number
}

const BEST_STORAGE_KEY = 'throne-best'
const MUTED_STORAGE_KEY = 'throne-muted'

/**
 * Разобрать сохранённый рекорд. В хранилище может оказаться что угодно: мусор после сбоя,
 * данные будущей версии игры. Всё, что не похоже на рекорд, считаем «рекорда нет» —
 * иначе меню упадёт на попытке показать несуществующий счёт.
 */
export function parseBest(raw: string | null): BestResult | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { score, wave } = parsed as Record<string, unknown>
    if (typeof score !== 'number' || typeof wave !== 'number') return null
    if (!Number.isFinite(score) || !Number.isFinite(wave)) return null
    return { score, wave }
  } catch {
    return null
  }
}

export function loadBest(): BestResult | null {
  try {
    return parseBest(localStorage.getItem(BEST_STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveBest(best: BestResult): void {
  try {
    localStorage.setItem(BEST_STORAGE_KEY, JSON.stringify(best))
  } catch {
    /* localStorage недоступен — играем без сохранения */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMuted(isMuted: boolean): void {
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, isMuted ? '1' : '0')
  } catch {
    /* localStorage недоступен — играем без сохранения */
  }
}
