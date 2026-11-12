// Звуки синтезируются на лету через WebAudio — аудиофайлов нет.
// Общий контекст и настройки звука — в engine.ts, музыка — в music.ts.

import { audioEngine } from './engine'

/** Не пищим о гибели врагов чаще, чем раз в столько миллисекунд */
const KILL_SOUND_MIN_GAP_MS = 70

/** Самая низкая частота, Гц: плавный спад в WebAudio не умеет идти к нулю */
const MIN_FREQUENCY = 20
/** Громкость «почти тишина»: по той же причине, что и выше, не ноль */
const NEAR_SILENCE = 0.0001
/** Запас после затухания перед остановкой генератора, с */
const STOP_MARGIN = 0.02

/** Ноты победной мелодии, Гц */
const VICTORY_NOTES = [392, 494, 587, 784]
/** Ноты мелодии поражения, Гц (идут вниз) */
const DEFEAT_NOTES = [330, 262, 196, 131]

function createSfx() {
  let lastKillSoundTime = 0

  /**
   * Один «писк»: частота плавно идёт от startFrequency к endFrequency (Гц)
   * и затухает за duration секунд. delay — через сколько секунд начать.
   */
  function playTone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    waveform: OscillatorType,
    volume: number,
    delay = 0,
  ) {
    if (!audioEngine.isSfxAudible()) return
    const outputs = audioEngine.wake()
    if (!outputs) return
    const { context, sfxOutput } = outputs
    try {
      const startTime = context.currentTime + delay
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = waveform
      oscillator.frequency.setValueAtTime(startFrequency, startTime)
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(MIN_FREQUENCY, endFrequency),
        startTime + duration,
      )
      gain.gain.setValueAtTime(volume, startTime)
      gain.gain.exponentialRampToValueAtTime(NEAR_SILENCE, startTime + duration)
      oscillator.connect(gain)
      gain.connect(sfxOutput)
      oscillator.start(startTime)
      oscillator.stop(startTime + duration + STOP_MARGIN)
    } catch {
      /* браузер без WebAudio — играем без звука */
    }
  }

  return {
    build: () => playTone(380, 620, 0.09, 'triangle', 0.13),
    upgrade() {
      playTone(440, 660, 0.09, 'triangle', 0.13)
      playTone(660, 990, 0.12, 'triangle', 0.11, 0.08)
    },
    sell: () => playTone(520, 300, 0.12, 'triangle', 0.1),
    deny: () => playTone(160, 120, 0.12, 'square', 0.05),
    kill() {
      // Когда гибнет толпа, не пищим слишком часто
      const now = performance.now()
      if (now - lastKillSoundTime < KILL_SOUND_MIN_GAP_MS) return
      lastKillSoundTime = now
      playTone(300, 140, 0.06, 'triangle', 0.07)
    },
    leak: () => playTone(120, 50, 0.3, 'sawtooth', 0.13),
    waveStart() {
      playTone(196, 196, 0.16, 'sawtooth', 0.06)
      playTone(262, 262, 0.28, 'sawtooth', 0.06, 0.16)
    },
    victory() {
      for (const [i, frequency] of VICTORY_NOTES.entries()) {
        playTone(frequency, frequency, 0.22, 'triangle', 0.12, i * 0.13)
      }
    },
    defeat() {
      for (const [i, frequency] of DEFEAT_NOTES.entries()) {
        playTone(frequency, frequency * 0.97, 0.3, 'sawtooth', 0.07, i * 0.2)
      }
    },
  }
}

export const sfx = createSfx()
