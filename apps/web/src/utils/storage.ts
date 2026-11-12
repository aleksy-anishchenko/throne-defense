// Всё, что хранится в браузере игрока. Ключи прежние — рекорды старой версии не потеряются.
// try/catch: в приватном режиме некоторых браузеров localStorage недоступен — тогда играем без сохранения.

import { isValidPlayerName } from '@throne/contracts'

/** Рекорд. Хранится в localStorage как JSON именно в такой форме */
export interface BestResult {
  score: number
  /** Сколько волн отбито */
  wave: number
}

const BEST_STORAGE_KEY = 'throne-best'
/** Настройки звука и музыки (AudioSettings) */
const AUDIO_STORAGE_KEY = 'throne-audio'
/**
 * Выключатель звука из версий без музыки ('1' — выключен). Больше не пишем, только читаем,
 * пока нет throne-audio: у кого звук был выключен, тот и после обновления играет в тишине
 */
const LEGACY_MUTED_STORAGE_KEY = 'throne-muted'
/** Имя для общего топа — вводится один раз после первой партии */
const PLAYER_NAME_STORAGE_KEY = 'throne-name'

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

/** Настройки звука. Громкости — в процентах, 0–100 (100% — самая громкая, что задумана) */
export interface AudioSettings {
  isSfxOn: boolean
  isMusicOn: boolean
  sfxVolume: number
  musicVolume: number
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  isSfxOn: true,
  isMusicOn: true,
  sfxVolume: 100,
  musicVolume: 70,
}

/** Громкость из хранилища: число 0–100, иначе — значение по умолчанию */
const parseVolume = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : fallback

/**
 * Разобрать настройки звука. Нет новых настроек — смотрим старый выключатель throne-muted
 * (до появления музыки он выключал все звуки): выключен — выключаем и звуки, и музыку.
 * Мусор и неизвестные поля не роняют игру — берём значения по умолчанию
 */
export function parseAudioSettings(raw: string | null, legacyMuted: string | null): AudioSettings {
  if (!raw) {
    const isOn = legacyMuted !== '1'
    return { ...DEFAULT_AUDIO_SETTINGS, isSfxOn: isOn, isMusicOn: isOn }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_AUDIO_SETTINGS }
    const { isSfxOn, isMusicOn, sfxVolume, musicVolume } = parsed as Record<string, unknown>
    return {
      isSfxOn: typeof isSfxOn === 'boolean' ? isSfxOn : DEFAULT_AUDIO_SETTINGS.isSfxOn,
      isMusicOn: typeof isMusicOn === 'boolean' ? isMusicOn : DEFAULT_AUDIO_SETTINGS.isMusicOn,
      sfxVolume: parseVolume(sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
      musicVolume: parseVolume(musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
    }
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS }
  }
}

export function loadAudioSettings(): AudioSettings {
  try {
    return parseAudioSettings(
      localStorage.getItem(AUDIO_STORAGE_KEY),
      localStorage.getItem(LEGACY_MUTED_STORAGE_KEY),
    )
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS }
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* localStorage недоступен — играем без сохранения */
  }
}

/** Имя для общего топа или null, если ещё не вводили (или в хранилище мусор) */
export function loadPlayerName(): string | null {
  try {
    const name = localStorage.getItem(PLAYER_NAME_STORAGE_KEY)
    return name !== null && isValidPlayerName(name) ? name : null
  } catch {
    return null
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name)
  } catch {
    /* localStorage недоступен — имя спросим снова после следующей партии */
  }
}
