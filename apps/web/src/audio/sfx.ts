// Звуки синтезируются на лету через WebAudio — аудиофайлов нет.

import { loadMuted, saveMuted } from '@/utils/storage'

type AudioCtor = typeof AudioContext

function createSfx() {
  let ac: AudioContext | null = null
  let muted = loadMuted()
  let lastKill = 0

  /** Звук в браузере можно включить только после действия игрока — поэтому создаём лениво */
  function context(): AudioContext | null {
    try {
      const Ctor: AudioCtor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
      if (!Ctor) return null
      ac ??= new Ctor()
      if (ac.state === 'suspended') void ac.resume()
      return ac
    } catch {
      return null
    }
  }

  /** Один «писк»: частота плавно идёт от f0 к f1 и затухает за dur секунд */
  function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (muted) return
    const ctx = context()
    if (!ctx) return
    try {
      const t = ctx.currentTime + delay
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g)
      g.connect(ctx.destination)
      o.start(t)
      o.stop(t + dur + 0.02)
    } catch {
      /* браузер без WebAudio — играем без звука */
    }
  }

  const build = () => tone(380, 620, 0.09, 'triangle', 0.13)

  return {
    get muted() {
      return muted
    },
    unlock() {
      if (!muted) context()
    },
    toggle() {
      muted = !muted
      saveMuted(muted)
      if (!muted) build()
    },
    build,
    upgrade() {
      tone(440, 660, 0.09, 'triangle', 0.13)
      tone(660, 990, 0.12, 'triangle', 0.11, 0.08)
    },
    sell: () => tone(520, 300, 0.12, 'triangle', 0.1),
    deny: () => tone(160, 120, 0.12, 'square', 0.05),
    kill() {
      // Когда гибнет толпа, не пищим чаще, чем раз в 70 мс
      const now = performance.now()
      if (now - lastKill < 70) return
      lastKill = now
      tone(300, 140, 0.06, 'triangle', 0.07)
    },
    leak: () => tone(120, 50, 0.3, 'sawtooth', 0.13),
    wave() {
      tone(196, 196, 0.16, 'sawtooth', 0.06)
      tone(262, 262, 0.28, 'sawtooth', 0.06, 0.16)
    },
    win() {
      ;[392, 494, 587, 784].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.12, i * 0.13))
    },
    lose() {
      ;[330, 262, 196, 131].forEach((f, i) => tone(f, f * 0.97, 0.3, 'sawtooth', 0.07, i * 0.2))
    },
  }
}

export const sfx = createSfx()
