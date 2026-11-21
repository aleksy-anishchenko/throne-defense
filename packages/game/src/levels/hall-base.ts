// Общее у всех залов: поле 9×13, трон с помостом наверху, золото, жизни и волны.
// Залы отличаются только дорожкой, препятствиями и оформлением (см. halls.ts).
// Одно поле и один трон у всех — так рисовальщику не нужно перестраиваться под размер,
// а волны одни и те же — сложность карт выравнивали ботом (tools/balance)

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
    ['rebel', 10, 0.7, 0],
    ['scout', 8, 0.5, 6],
    ['armor', 2, 2, 10],
    ['healer', 2, 3, 3],
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
    ['scout', 18, 0.35, 0],
    ['armor', 4, 1.5, 4],
    ['healer', 2, 2, 5],
  ],
  [
    ['ogre', 1, 0, 0],
    ['armor', 8, 1.3, 2],
    ['gorynych', 1, 0, 8],
  ],
  [
    ['rebel', 20, 0.4, 0],
    ['scout', 10, 0.4, 6],
    ['healer', 3, 2.5, 2],
  ],
  [
    ['armor', 11, 1, 0],
    ['ogre', 1, 0, 8],
    ['healer', 2, 4, 3],
  ],
  [
    ['scout', 30, 0.28, 0],
    ['ogre', 2, 4, 3],
  ],
  [
    ['armor', 8, 0.9, 0],
    ['rebel', 16, 0.4, 3],
    ['ogre', 2, 5, 10],
    ['healer', 2, 5, 4],
  ],
  [
    ['ogre', 2, 2.5, 0],
    ['scout', 16, 0.35, 4],
    ['gorynych', 2, 9, 6],
  ],
  [
    ['armor', 15, 0.75, 0],
    ['scout', 20, 0.3, 6],
    ['healer', 3, 4, 2],
  ],
  [
    ['ogre', 5, 2.2, 0],
    ['armor', 12, 0.8, 3],
    ['gorynych', 1, 0, 10],
  ],
  [
    ['rebel', 34, 0.25, 0],
    ['scout', 30, 0.25, 5],
    ['ogre', 3, 3, 10],
    ['healer', 4, 2.5, 3],
  ],
  [
    ['ogre', 4, 1.8, 0],
    ['armor', 14, 0.6, 4],
    ['healer', 3, 3, 3],
    ['gorynych', 2, 7, 6],
  ],
  // Волна 20. Латники выходят рядом с генералом, чтобы игрок увидел действие знамени.
  [
    ['general', 1, 0, 0],
    ['armor', 12, 0.55, 0.45],
    ['ogre', 2, 3, 8],
    ['rebel', 10, 0.4, 10],
    ['scout', 16, 0.3, 14],
  ],
  [
    ['scout', 30, 0.26, 0],
    ['armor', 9, 0.66, 4],
    ['rebel', 26, 0.31, 5],
    ['healer', 2, 3, 7],
    ['ogre', 2, 4, 12],
  ],
  [
    ['armor', 14, 0.68, 0.5],
    ['gorynych', 3, 6, 2],
    ['healer', 2, 4, 5],
    ['scout', 18, 0.28, 11],
  ],
  [
    ['rebel', 26, 0.33, 0],
    ['ogre', 5, 2, 1.2],
    ['armor', 10, 0.75, 5],
    ['healer', 2, 4, 7],
  ],
  [
    ['scout', 40, 0.22, 0],
    ['armor', 14, 0.65, 4],
    ['healer', 3, 2.6, 5],
    ['gorynych', 2, 6, 8],
  ],
  // Волна 25. Генерал подтягивает вторую линию латников между двумя группами лазутчиков.
  [
    ['scout', 10, 0.28, 0],
    ['armor', 6, 0.55, 3],
    ['general', 1, 0, 4.2],
    ['armor', 10, 0.62, 6.3],
    ['ogre', 2, 3, 10],
    ['scout', 10, 0.28, 14],
  ],
  [
    ['rebel', 42, 0.24, 0],
    ['healer', 3, 3.5, 3],
    ['scout', 34, 0.24, 5],
    ['gorynych', 2, 6, 10],
  ],
  [
    ['ogre', 5, 2.2, 0],
    ['armor', 9, 0.75, 3],
    ['healer', 2, 4, 4],
    ['gorynych', 2, 6, 8],
  ],
  // Волна 28. Лазутчики обгоняют генерала, а латники держатся рядом со знаменем.
  [
    ['rebel', 23, 0.32, 0],
    ['armor', 12, 0.6, 1.8],
    ['general', 1, 0, 3.5],
    ['scout', 24, 0.24, 4],
    ['ogre', 1, 0, 9],
    ['healer', 2, 3, 10],
  ],
  [
    ['ogre', 3, 2.4, 0],
    ['armor', 14, 0.58, 3],
    ['healer', 3, 3, 4],
    ['gorynych', 2, 6, 7],
  ],
  // Волна 30. Узурпатор выходит только в финале кампании.
  [
    ['boss', 1, 0, 0],
    ['armor', 10, 0.9, 3],
    ['healer', 2, 3, 4],
    ['ogre', 3, 3, 8],
    ['scout', 18, 0.3, 14],
  ],
]

/** В бесконечном режиме босс выходит на каждой 5-й волне (номер волны кратен 5) */
const ENDLESS_BOSS_EVERY = 5

/** Каждые столько волн бесконечного режима боссов в волне становится на одного больше */
const ENDLESS_EXTRA_BOSS_EVERY = 10

/** В бесконечном режиме Змей Горыныч выходит на каждой 3-й волне (номер волны кратен 3) */
const ENDLESS_GORYNYCH_EVERY = 3

/** Всё, что у залов общее. Свой у каждого — id, name, pathPoints, props, theme */
export const HALL_BASE = {
  cols: 9,
  rows: 13,
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
      ['healer', Math.min(6, 3 + Math.floor(wavesPastEnd / 2)), 2.5, 4],
    ]
    if (waveNumber % ENDLESS_GORYNYCH_EVERY === 0) groups.push(['gorynych', 2, 6, 5])
    if (waveNumber % ENDLESS_BOSS_EVERY === 0)
      groups.push(['boss', 1 + Math.floor(wavesPastEnd / ENDLESS_EXTRA_BOSS_EVERY), 6, 0])
    return groups
  },
} satisfies Omit<LevelDef, 'id' | 'name' | 'pathPoints'>
