// Волны: кто и когда выходит, что дают за отбитую волну.

import { SCORE, waveBonus } from '../data/balance.ts'
import type { Level, SpawnEntry, WaveGroup, World } from '../types.ts'
import { spawnEnemy } from './enemies.ts'
import { payTowerIncome } from './towers.ts'

/** Состав волны waveNumber (после последней — бесконечный режим) */
export function getWaveGroups(level: Level, waveNumber: number): readonly WaveGroup[] {
  return waveNumber <= level.waveCount
    ? level.def.waves[waveNumber - 1]
    : level.def.endlessWaveGroups(waveNumber)
}

/** Расписание волны: кто в какую секунду выходит. Ближайший — в конце массива */
export function buildSpawnQueue(level: Level, waveNumber: number): SpawnEntry[] {
  const queue: SpawnEntry[] = []
  for (const [enemyId, count, gap, delay] of getWaveGroups(level, waveNumber)) {
    for (let i = 0; i < count; i++) queue.push({ spawnTime: delay + i * gap, enemyId })
  }
  queue.sort((a, b) => b.spawnTime - a.spawnTime)
  return queue
}

/** Выпустить тех, чьё время пришло */
export function spawnDueEnemies(world: World, dt: number): void {
  const state = world.state
  state.waveTime += dt
  while (
    state.spawnQueue.length &&
    state.spawnQueue[state.spawnQueue.length - 1].spawnTime <= state.waveTime
  ) {
    spawnEnemy(world, state.spawnQueue.pop()!.enemyId)
  }
}

/** Волна отбита: бонус, очки и либо следующая волна, либо победа */
export function finishWave(world: World): void {
  const state = world.state
  const bonus = waveBonus(state.wave)
  state.gold += bonus
  state.score += SCORE.perWave * state.wave
  state.wavesCleared = state.wave
  world.emit('waveCleared', { wave: state.wave, bonus })
  payTowerIncome(world)

  if (state.wave === world.level.waveCount && !state.isEndless) {
    state.score += state.lives * SCORE.perLife
    state.phase = 'won'
    world.emit('victory', undefined)
  } else {
    state.phase = 'build'
    state.wave++
  }
}
