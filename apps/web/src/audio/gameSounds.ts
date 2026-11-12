// Что в игре как звучит: подписки звуков на события игры и выбор настроения музыки.
// Стор только подключает это к игре (правило: audio/ не импортирует стор).

import type { Game } from '@throne/game'
import type { MusicMood } from './music'
import { sfx } from './sfx'

/** Враги, при которых музыка становится тревожной: Змей Горыныч и узурпатор */
const DANGER_ENEMY_IDS = new Set(['gorynych', 'boss'])

export function connectGameSounds(game: Game) {
  game.on('build', () => sfx.build())
  game.on('upgrade', () => sfx.upgrade())
  game.on('sell', () => sfx.sell())
  game.on('waveStart', () => sfx.waveStart())
  game.on('kill', () => sfx.kill())
  game.on('leak', () => sfx.leak())
  game.on('victory', () => sfx.victory())
  game.on('defeat', () => sfx.defeat())
}

/** Какая музыка подходит тому, что сейчас в игре */
export function musicMoodFor(game: Game): MusicMood {
  const { phase, wave } = game.state
  if (phase === 'won' || phase === 'lost') return 'silent'
  if (phase !== 'wave') return 'calm'
  const hasDangerEnemy = game.waveGroups(wave).some(([enemyId]) => DANGER_ENEMY_IDS.has(enemyId))
  return hasDangerEnemy ? 'danger' : 'battle'
}
