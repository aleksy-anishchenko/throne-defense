// Фоновая музыка — тоже синтез WebAudio, без файлов.
//
// Одна мелодия в народном духе (ля минор, «гусли») и слои поверх неё по настроению:
//   calm   — меню и строительство: гусли, аккорд-перебор, тихий гул баса;
//   battle — идёт волна: добавляются барабаны и бас восьмыми;
//   danger — в волне Горыныч или узурпатор: ещё и тревожный «пульс» и бубен на каждую восьмую;
//   silent — победа или поражение: музыка затихает, звучит мелодия итога из sfx.ts.
// Настроение меняется на начале такта, поэтому переходы не рвут мелодию.
//
// Как играют ноты. setTimeout неточен (опаздывает на десятки мс) — музыка «плыла» бы.
// Поэтому таймер лишь раз в 25 мс смотрит вперёд и заранее ставит ноты на точное время
// звуковых часов (context.currentTime): WebAudio сыграет их сам, ровно в срок.

import { audioEngine, type AudioOutputs } from './engine'

export type MusicMood = 'calm' | 'battle' | 'danger' | 'silent'

/** Темп, долей в минуту. Шаг музыки — восьмая, две на долю */
const BEATS_PER_MINUTE = 96
const STEP_SECONDS = 60 / BEATS_PER_MINUTE / 2
const STEPS_PER_BAR = 8

/** Как часто таймер ставит ноты и на сколько секунд вперёд */
const SCHEDULER_INTERVAL_MS = 25
const SCHEDULE_AHEAD_SECONDS = 0.15
/** Через сколько секунд после запуска звучит первая нота */
const START_DELAY_SECONDS = 0.05
/** Таймер отстал сильнее (вкладка «спала») — не догоняем пачкой нот, а начинаем с «сейчас» */
const MAX_LAG_SECONDS = 0.1

/** Плавное появление и затихание музыки, с */
const FADE_IN_SECONDS = 1.2
const FADE_OUT_SECONDS = 0.8
/** Музыку выключили в настройках — гаснет быстро, но без щелчка */
const MUTE_FADE_SECONDS = 0.08

/** Пауза: музыка будто из-за стены — фильтр срезает высокие частоты, и чуть тише */
const OPEN_CUTOFF_HZ = 18000
const MUFFLED_CUTOFF_HZ = 650
const MUFFLED_VOLUME = 0.6
/** Насколько плавно (постоянная времени, с) музыка глохнет и возвращается */
const MUFFLE_SMOOTHING_SECONDS = 0.15

/** Громкость «почти тишина»: плавный спад в WebAudio не умеет идти к нулю */
const NEAR_SILENCE = 0.0001
/** Запас после затухания перед остановкой генератора, с */
const STOP_MARGIN = 0.05

// ---------------------------------------------------------------- Ноты

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** «A4» → 440 Гц. Номер ноты как в MIDI: ля первой октавы — 69 */
function noteFrequency(note: string): number {
  const name = note[0]
  const octave = Number(note.slice(1))
  const midiNumber = 12 * (octave + 1) + SEMITONES[name]
  return 440 * 2 ** ((midiNumber - 69) / 12)
}

/**
 * Мелодия по тактам, восемь восьмых в такте: нота, «-» — тянуть предыдущую, «.» — тишина.
 * Восемь тактов, потом по кругу
 */
const MELODY_BARS = [
  'E4 - A4 - B4 - C5 -',
  'B4 A4 G4 - A4 - - -',
  'C5 - D5 - E5 - D5 C5',
  'B4 - G4 - E4 - - -',
  'A4 - C5 - B4 A4 G4 -',
  'F4 - G4 A4 E4 - - -',
  'D4 - E4 - G4 - B4 -',
  'A4 - - - - - . .',
]

/** Аккорд каждого такта: басовая нота и три ноты перебора */
const CHORDS = [
  { bass: 'A2', strum: ['A3', 'C4', 'E4'] },
  { bass: 'A2', strum: ['A3', 'C4', 'E4'] },
  { bass: 'C3', strum: ['C4', 'E4', 'G4'] },
  { bass: 'E2', strum: ['E3', 'G3', 'B3'] },
  { bass: 'A2', strum: ['A3', 'C4', 'E4'] },
  { bass: 'F2', strum: ['F3', 'A3', 'C4'] },
  { bass: 'G2', strum: ['G3', 'B3', 'D4'] },
  { bass: 'A2', strum: ['A3', 'C4', 'E4'] },
].map((chord) => ({
  bass: noteFrequency(chord.bass),
  strum: chord.strum.map(noteFrequency),
}))

interface MelodyNote {
  frequency: number
  /** Сколько восьмых тянется */
  lengthSteps: number
}

/** Мелодия, разложенная по шагам: на шаге либо начинается нота, либо null */
const MELODY: Array<MelodyNote | null> = MELODY_BARS.flatMap((bar) => bar.split(' ')).map(
  (token, step, tokens) => {
    if (token === '-' || token === '.') return null
    let lengthSteps = 1
    while (tokens[step + lengthSteps] === '-') lengthSteps++
    return { frequency: noteFrequency(token), lengthSteps }
  },
)
const LOOP_STEPS = MELODY.length

/** Барабаны по шагам такта: большой барабан и бубен */
const DRUMS: Record<'battle' | 'danger', { kick: number[]; tambourine: number[] }> = {
  battle: { kick: [0, 3, 4], tambourine: [2, 6] },
  danger: { kick: [0, 2, 3, 4, 6], tambourine: [0, 1, 2, 3, 4, 5, 6, 7] },
}
/** Тревожный пульс: ступени аккорда по восьмым (1 — основной тон, 1.5 — квинта, 2 — октава) */
const PULSE_PATTERN = [1, 1.5, 2, 1.5]

/** Отдельный «звуковой кабель» музыки внутри одного AudioContext */
interface MusicChain {
  context: AudioContext
  /** Сюда подключаются все ноты */
  input: GainNode
  /** Плавное появление и затихание */
  fade: GainNode
  /** Глушение на паузе: фильтр и громкость */
  muffleFilter: BiquadFilterNode
  muffleGain: GainNode
  /** Секунда белого шума — из неё делаются барабаны */
  noise: AudioBuffer
}

function createChain({ context, musicOutput }: AudioOutputs): MusicChain {
  const input = context.createGain()
  const muffleFilter = context.createBiquadFilter()
  muffleFilter.type = 'lowpass'
  muffleFilter.frequency.value = OPEN_CUTOFF_HZ
  const muffleGain = context.createGain()
  const fade = context.createGain()
  fade.gain.value = 0
  input.connect(muffleFilter)
  muffleFilter.connect(muffleGain)
  muffleGain.connect(fade)
  fade.connect(musicOutput)

  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const samples = noise.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1

  return { context, input, fade, muffleFilter, muffleGain, noise }
}

// ---------------------------------------------------------------- Инструменты

/**
 * Генератор с огибающей: быстро нарастает за attack секунд и затухает к time + duration.
 * Возвращает регулятор громкости, если звук нужно куда-то ещё провести
 */
function playVoice(
  chain: MusicChain,
  time: number,
  frequency: number,
  waveform: OscillatorType,
  volume: number,
  attack: number,
  duration: number,
  destination: AudioNode = chain.input,
) {
  const { context } = chain
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = waveform
  oscillator.frequency.setValueAtTime(frequency, time)
  gain.gain.setValueAtTime(NEAR_SILENCE, time)
  gain.gain.exponentialRampToValueAtTime(volume, time + attack)
  gain.gain.exponentialRampToValueAtTime(NEAR_SILENCE, time + duration)
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start(time)
  oscillator.stop(time + duration + STOP_MARGIN)
}

/** Защипнутая струна: основной тон и тихая октава выше, звенит и гаснет */
function pluck(chain: MusicChain, time: number, frequency: number, volume: number, ring: number) {
  playVoice(chain, time, frequency, 'triangle', volume, 0.005, ring)
  playVoice(chain, time, frequency * 2, 'sine', volume * 0.35, 0.005, ring * 0.6)
}

/** Большой барабан: низкий тон, который быстро падает вниз */
function kick(chain: MusicChain, time: number) {
  const { context } = chain
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.setValueAtTime(130, time)
  oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.16)
  gain.gain.setValueAtTime(0.3, time)
  gain.gain.exponentialRampToValueAtTime(NEAR_SILENCE, time + 0.2)
  oscillator.connect(gain)
  gain.connect(chain.input)
  oscillator.start(time)
  oscillator.stop(time + 0.2 + STOP_MARGIN)
}

/** Бубен: короткий шорох высоких частот */
function tambourine(chain: MusicChain, time: number, volume: number) {
  const { context } = chain
  const source = context.createBufferSource()
  source.buffer = chain.noise
  const filter = context.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 5000
  const gain = context.createGain()
  gain.gain.setValueAtTime(volume, time)
  gain.gain.exponentialRampToValueAtTime(NEAR_SILENCE, time + 0.07)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(chain.input)
  // Каждый раз — другой кусок шума, чтобы удары не звучали одинаково
  source.start(time, Math.random() * 0.8, 0.1)
}

/** Тревожный пульс: «пила» за фильтром, глухо и настойчиво */
function pulse(chain: MusicChain, time: number, frequency: number) {
  const filter = chain.context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900
  filter.connect(chain.input)
  playVoice(chain, time, frequency, 'sawtooth', 0.05, 0.01, STEP_SECONDS * 0.9, filter)
}

/** Всё, что звучит на одном шаге (восьмой) при данном настроении */
function playStep(chain: MusicChain, step: number, time: number, mood: MusicMood) {
  const stepInBar = step % STEPS_PER_BAR
  const chord = CHORDS[Math.floor(step / STEPS_PER_BAR)]
  const barSeconds = STEP_SECONDS * STEPS_PER_BAR

  const note = MELODY[step]
  if (note) pluck(chain, time, note.frequency, 0.13, 0.3 + note.lengthSteps * STEP_SECONDS)

  if (stepInBar === 0) {
    // Перебор аккорда, как по струнам гуслей: ноты чуть врозь
    for (const [i, frequency] of chord.strum.entries()) {
      pluck(chain, time + i * 0.04, frequency, 0.045, barSeconds * 0.8)
    }
  }

  if (mood === 'calm') {
    if (stepInBar === 0) playVoice(chain, time, chord.bass, 'sine', 0.12, 0.15, barSeconds)
    return
  }

  // Волна: бас восьмыми, кроме слабых долей, и барабаны
  if (stepInBar % 2 === 0 || stepInBar === 7) {
    playVoice(chain, time, chord.bass, 'triangle', 0.16, 0.01, STEP_SECONDS * 1.6)
  }
  const drums = DRUMS[mood === 'danger' ? 'danger' : 'battle']
  if (drums.kick.includes(stepInBar)) kick(chain, time)
  if (drums.tambourine.includes(stepInBar)) {
    tambourine(chain, time, stepInBar % 2 === 0 ? 0.06 : 0.03)
  }
  if (mood === 'danger') {
    const degree = PULSE_PATTERN[stepInBar % PULSE_PATTERN.length]
    pulse(chain, time, chord.bass * 2 * degree)
  }
}

// ---------------------------------------------------------------- Проигрыватель

function createMusic() {
  let chain: MusicChain | null = null
  /** Какое настроение просит игра и какое сейчас звучит (меняется на начале такта) */
  let requestedMood: MusicMood = 'calm'
  let playingMood: MusicMood = 'calm'
  let isMuffled = false
  let isHidden = false
  let timerId: number | null = null
  let step = 0
  let nextStepTime = 0

  function scheduleAhead() {
    if (!chain) return
    const now = chain.context.currentTime
    if (nextStepTime < now - MAX_LAG_SECONDS) nextStepTime = now + START_DELAY_SECONDS
    while (nextStepTime < now + SCHEDULE_AHEAD_SECONDS) {
      if (step % STEPS_PER_BAR === 0) playingMood = requestedMood
      try {
        playStep(chain, step, nextStepTime, playingMood)
      } catch {
        /* браузер без части WebAudio — просто без музыки */
      }
      nextStepTime += STEP_SECONDS
      step = (step + 1) % LOOP_STEPS
    }
  }

  function fadeTo(volume: number, seconds: number) {
    if (!chain) return
    const now = chain.context.currentTime
    const gain = chain.fade.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(volume, now + seconds)
  }

  function applyMuffle() {
    if (!chain) return
    const now = chain.context.currentTime
    const cutoff = isMuffled ? MUFFLED_CUTOFF_HZ : OPEN_CUTOFF_HZ
    chain.muffleFilter.frequency.setTargetAtTime(cutoff, now, MUFFLE_SMOOTHING_SECONDS)
    chain.muffleGain.gain.setTargetAtTime(
      isMuffled ? MUFFLED_VOLUME : 1,
      now,
      MUFFLE_SMOOTHING_SECONDS,
    )
  }

  /** Играть или молчать — решается здесь, по всем условиям сразу */
  function sync() {
    const outputs = audioEngine.peek()
    const shouldPlay =
      outputs !== null && audioEngine.isMusicAudible() && !isHidden && requestedMood !== 'silent'

    if (shouldPlay && timerId === null) {
      if (chain?.context !== outputs.context) chain = createChain(outputs)
      applyMuffle()
      // Каждый раз — с начала мелодии: после тишины так естественнее
      step = 0
      playingMood = requestedMood
      nextStepTime = chain.context.currentTime + START_DELAY_SECONDS
      fadeTo(1, FADE_IN_SECONDS)
      scheduleAhead()
      timerId = window.setInterval(scheduleAhead, SCHEDULER_INTERVAL_MS)
    } else if (!shouldPlay && timerId !== null) {
      clearInterval(timerId)
      timerId = null
      fadeTo(0, audioEngine.isMusicAudible() ? FADE_OUT_SECONDS : MUTE_FADE_SECONDS)
    }
  }

  audioEngine.onChange(sync)

  return {
    setMood(mood: MusicMood) {
      requestedMood = mood
      sync()
    },
    /** Пауза: музыка глохнет, но не останавливается */
    setMuffled(value: boolean) {
      isMuffled = value
      applyMuffle()
    },
    /** Вкладка свёрнута — молчим (таймер там всё равно засыпает) */
    setHidden(value: boolean) {
      isHidden = value
      sync()
    },
    /** Для проверок в браузере (window.__throne.music) */
    debugState: () => ({
      isPlaying: timerId !== null,
      /** Какое настроение просит игра; звучать оно начнёт с ближайшего такта */
      mood: requestedMood,
      isMuffled,
    }),
  }
}

export const music = createMusic()
