import type { LevelDef, WaveGroup } from '../types.ts'

// Каждая волна — список групп: [id врага, сколько, пауза между врагами (с), задержка начала (с)]
const waves: WaveGroup[][] = [
  [['rebel', 8, 1.1, 0]],
  [['rebel', 12, 0.9, 0]],
  [
    ['rebel', 8, 1, 0],
    ['scout', 6, 0.6, 5],
  ],
  [['scout', 14, 0.5, 0]],
  [
    ['rebel', 10, 0.9, 0],
    ['armor', 3, 2, 4],
  ],
  [
    ['rebel', 12, 0.7, 0],
    ['scout', 8, 0.5, 6],
    ['armor', 2, 2, 10],
  ],
  [
    ['armor', 6, 1.6, 0],
    ['scout', 10, 0.45, 5],
  ],
  [
    ['ogre', 1, 0, 0],
    ['rebel', 14, 0.6, 2],
  ],
  [
    ['scout', 20, 0.35, 0],
    ['armor', 4, 1.5, 4],
  ],
  [
    ['ogre', 2, 5, 0],
    ['armor', 8, 1.3, 2],
  ],
  [
    ['rebel', 24, 0.4, 0],
    ['scout', 10, 0.4, 6],
  ],
  [
    ['armor', 12, 1, 0],
    ['ogre', 1, 0, 8],
  ],
  [
    ['scout', 30, 0.28, 0],
    ['ogre', 2, 4, 3],
  ],
  [
    ['armor', 10, 0.9, 0],
    ['rebel', 20, 0.4, 3],
    ['ogre', 2, 5, 10],
  ],
  [
    ['ogre', 5, 2.5, 0],
    ['scout', 16, 0.35, 4],
  ],
  [
    ['armor', 18, 0.75, 0],
    ['scout', 20, 0.3, 6],
  ],
  [
    ['ogre', 6, 2.2, 0],
    ['armor', 12, 0.8, 3],
  ],
  [
    ['rebel', 40, 0.25, 0],
    ['scout', 30, 0.25, 5],
    ['ogre', 3, 3, 10],
  ],
  [
    ['ogre', 8, 1.8, 0],
    ['armor', 20, 0.6, 4],
  ],
  [
    ['boss', 1, 0, 0],
    ['armor', 14, 0.9, 3],
    ['ogre', 4, 3, 8],
    ['scout', 24, 0.3, 14],
  ],
]

/** В бесконечном режиме босс выходит на каждой 5-й волне (номер волны кратен 5) */
const ENDLESS_BOSS_EVERY = 5

/** Каждые столько волн бесконечного режима боссов в волне становится на одного больше */
const ENDLESS_EXTRA_BOSS_EVERY = 10

export const throneHall: LevelDef = {
  id: 'throne-hall',
  name: 'Тронный зал',
  cols: 9,
  rows: 13,
  pathPoints: [
    [4.5, 13.5],
    [4.5, 10.5],
    [1.5, 10.5],
    [1.5, 7.5],
    [7.5, 7.5],
    [7.5, 4.5],
    [2.5, 4.5],
    [2.5, 2.5],
    [4.5, 2.5],
    [4.5, 0.8],
  ],
  throne: [4.5, 0.46],
  // Помост с троном
  blockedCells: [
    [3, 0],
    [4, 0],
    [5, 0],
  ],
  startGold: 150,
  startLives: 20,
  waves,

  endlessWaveGroups(waveNumber) {
    // Сколько волн прошло после последней волны из таблицы
    const wavesPastEnd = waveNumber - waves.length
    const groups: WaveGroup[] = [
      ['armor', 14 + 2 * wavesPastEnd, 0.6, 0],
      ['ogre', 6 + wavesPastEnd, 1.8, 3],
      ['scout', 24 + 3 * wavesPastEnd, 0.25, 8],
    ]
    if (waveNumber % ENDLESS_BOSS_EVERY === 0)
      groups.push(['boss', 1 + Math.floor(wavesPastEnd / ENDLESS_EXTRA_BOSS_EVERY), 6, 0])
    return groups
  },
}
