// Волны: кто и когда выходит, что дают за отбитую волну.

import { SCORE, waveBonus } from '../data/balance.ts'
import type { Level, World, WaveGroup } from '../types.ts'
import { spawn } from './enemies.ts'

/** Состав волны n (после последней — бесконечный режим) */
export function waveGroups(level: Level, n: number): readonly WaveGroup[] {
  return n <= level.maxWave ? level.def.waves[n - 1] : level.def.endless(n)
}

/** Расписание волны: кто в какую секунду выходит. Ближайший — в конце массива */
export function buildQueue(level: Level, n: number): { t: number; enemy: string }[] {
  const q: { t: number; enemy: string }[] = []
  for (const [enemy, count, gap, delay] of waveGroups(level, n)) {
    for (let i = 0; i < count; i++) q.push({ t: delay + i * gap, enemy })
  }
  q.sort((a, b) => b.t - a.t)
  return q
}

/** Выпустить тех, чьё время пришло */
export function spawnDue(w: World, dt: number): void {
  const s = w.state
  s.waveT += dt
  while (s.queue.length && s.queue[s.queue.length - 1].t <= s.waveT) {
    spawn(w, s.queue.pop()!.enemy)
  }
}

/** Волна отбита: бонус, очки и либо следующая волна, либо победа */
export function waveCleared(w: World): void {
  const s = w.state
  const bonus = waveBonus(s.wave)
  s.gold += bonus
  s.score += SCORE.perWave * s.wave
  s.cleared = s.wave
  w.emit('waveCleared', { wave: s.wave, bonus })

  if (s.wave === w.level.maxWave && !s.endless) {
    s.score += s.lives * SCORE.perLife
    s.phase = 'won'
    w.emit('victory', undefined)
  } else {
    s.phase = 'build'
    s.wave++
  }
}
