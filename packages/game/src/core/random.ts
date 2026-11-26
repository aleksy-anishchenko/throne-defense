import type { GameState } from '../types.ts'

export const RANDOM_RANGE = 2 ** 32

/** Следующее псевдослучайное целое от 0 до 2³² − 1. */
export function nextRandom(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0
}

export function rollCombatChance(state: GameState, chance: number): boolean {
  state.combatSeed = nextRandom(state.combatSeed)
  return state.combatSeed / RANDOM_RANGE < chance
}
