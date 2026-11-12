// Общее для звуков и музыки: один AudioContext на всю игру, настройки звука и две «шины» —
// регуляторы громкости, через которые идут звуки (sfx) и музыка.
// Шина — как общий родитель: убавил её громкость — тише стало всё, что в неё подключено.

import { loadAudioSettings, saveAudioSettings, type AudioSettings } from '@/utils/storage'

type AudioContextClass = typeof AudioContext

/** Громкость звуков на 100%: они и раньше были настроены под 1 */
const MAX_SFX_GAIN = 1
/**
 * Громкость музыки на 100%. По умолчанию музыка на 50% — это 0,3: тихий фон под звуками
 * (0,55 владелец счёл громким)
 */
const MAX_MUSIC_GAIN = 0.6
/** Ползунок двигают — громкость меняется плавно, без щелчков (постоянная времени, с) */
const VOLUME_SMOOTHING_SECONDS = 0.03

/** Громкость слуху кажется линейной, если усиление растёт как квадрат положения ползунка */
const gainFor = (volumePercent: number, maxGain: number) => (volumePercent / 100) ** 2 * maxGain

export interface AudioOutputs {
  context: AudioContext
  sfxOutput: GainNode
  musicOutput: GainNode
}

function createAudioEngine() {
  let outputs: AudioOutputs | null = null
  let settings = loadAudioSettings()
  const changeListeners: Array<() => void> = []

  const notifyChange = () => {
    for (const listener of changeListeners) listener()
  }

  const isSfxAudible = () => settings.isSfxOn && settings.sfxVolume > 0
  const isMusicAudible = () => settings.isMusicOn && settings.musicVolume > 0

  function applyVolumes() {
    if (!outputs) return
    const now = outputs.context.currentTime
    outputs.sfxOutput.gain.setTargetAtTime(
      gainFor(settings.sfxVolume, MAX_SFX_GAIN),
      now,
      VOLUME_SMOOTHING_SECONDS,
    )
    outputs.musicOutput.gain.setTargetAtTime(
      gainFor(settings.musicVolume, MAX_MUSIC_GAIN),
      now,
      VOLUME_SMOOTHING_SECONDS,
    )
  }

  /**
   * Звук в браузере можно включить только после действия игрока — поэтому создаём лениво,
   * при первом звуке или клике. Заодно будим «уснувший» контекст (Safari после звонка)
   */
  function wake(): AudioOutputs | null {
    try {
      if (!outputs) {
        const AudioContextClass: AudioContextClass | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext
        if (!AudioContextClass) return null
        const context = new AudioContextClass()
        const sfxOutput = context.createGain()
        sfxOutput.gain.value = gainFor(settings.sfxVolume, MAX_SFX_GAIN)
        sfxOutput.connect(context.destination)
        const musicOutput = context.createGain()
        musicOutput.gain.value = gainFor(settings.musicVolume, MAX_MUSIC_GAIN)
        musicOutput.connect(context.destination)
        outputs = { context, sfxOutput, musicOutput }
        notifyChange()
      }
      if (outputs.context.state === 'suspended') void outputs.context.resume()
      return outputs
    } catch {
      return null
    }
  }

  return {
    /** Копия: менять настройки — только через update, иначе их не сохранить */
    get settings(): AudioSettings {
      return { ...settings }
    },
    isSfxAudible,
    isMusicAudible,
    update(changes: Partial<AudioSettings>) {
      settings = { ...settings, ...changes }
      saveAudioSettings(settings)
      applyVolumes()
      if (isSfxAudible() || isMusicAudible()) wake()
      notifyChange()
    },
    /** Вызывается на каждый клик и нажатие: только так браузер разрешает звук */
    unlock() {
      if (isSfxAudible() || isMusicAudible()) wake()
    },
    wake,
    /** Уже созданный контекст — без создания (до клика игрока его быть не должно) */
    peek: (): AudioOutputs | null => outputs,
    /** Позвать listener, когда поменялись настройки или появился контекст */
    onChange(listener: () => void) {
      changeListeners.push(listener)
    },
  }
}

export const audioEngine = createAudioEngine()
