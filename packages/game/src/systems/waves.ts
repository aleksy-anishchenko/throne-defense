// Волны: кто и когда выходит, что дают за отбитую волну.

import { SCORE, waveBonus } from '../data/balance.ts'
import { ENEMIES } from '../data/enemies.ts'
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

/** Очки за врага, если убить и его, и всех, на кого он распадается (Горыныч → змеёныши) */
function maxScoreForEnemy(enemyId: string): number {
  const def = ENEMIES[enemyId]
  const own = def.reward * SCORE.perGold
  if (!def.splitInto) return own
  return own + def.splitInto.count * maxScoreForEnemy(def.splitInto.enemyId)
}

/**
 * Больше этого счёта за партию, где отбито wavesCleared волн, получить нельзя:
 * убиты все враги этих волн и следующей (на ней партия и кончилась), очки за каждую отбитую
 * волну и, если пройдены все волны уровня, бонус за все жизни. По нему сервер отбрасывает
 * явно подделанные результаты (честная проверка — повтор партии на сервере, этап 5).
 * Точнее «до очка» не нужно: важно, что настоящий счёт никогда не больше
 */
export function maxPossibleScore(level: Level, wavesCleared: number): number {
  let score = 0
  for (let waveNumber = 1; waveNumber <= wavesCleared + 1; waveNumber++) {
    for (const [enemyId, count] of getWaveGroups(level, waveNumber)) {
      score += count * maxScoreForEnemy(enemyId)
    }
  }
  // Очки за волны: 1-я — perWave × 1, 2-я — perWave × 2 и так далее
  score += (SCORE.perWave * wavesCleared * (wavesCleared + 1)) / 2
  if (wavesCleared >= level.waveCount) score += level.def.startLives * SCORE.perLife
  return score
}
