// node tools/balance/ranges.ts — сравнение вариантов без изменения файлов баланса.
import { PLAYABLE_LEVELS, TOWERS, createLevel } from '@throne/game'
import { STRATEGIES, playBot } from './bot.ts'

const ids = ['archer', 'ballista', 'cannon', 'mage'] as const
const variants = [
  {
    name: 'v10: исходные',
    ranges: [
      [2.4, 2.6, 2.9],
      [3.4, 3.6, 3.9],
      [3.8, 4.1, 4.4],
      [2.2, 2.4, 2.6],
    ],
  },
  {
    name: 'v11: сокращение ~15%',
    ranges: [
      [2, 2.2, 2.5],
      [2.9, 3.1, 3.3],
      [3.2, 3.5, 3.7],
      [1.9, 2, 2.2],
    ],
  },
  {
    name: 'A: мягкое сокращение',
    ranges: [
      [2.2, 2.4, 2.7],
      [3.2, 3.4, 3.6],
      [3.4, 3.6, 3.9],
      [1.9, 2, 2.2],
    ],
  },
  {
    name: 'B: короткая пушка',
    ranges: [
      [2.2, 2.4, 2.7],
      [3.2, 3.4, 3.6],
      [3.3, 3.5, 3.7],
      [1.9, 2, 2.2],
    ],
  },
  {
    name: 'C: прежние лучник и баллиста',
    ranges: [
      [2.4, 2.6, 2.9],
      [3.4, 3.6, 3.9],
      [3.5, 3.7, 4],
      [1.9, 2, 2.2],
    ],
  },
]

// Изменяем только объекты в этом отдельном процессе и восстанавливаем их в finally.
const original = ids.map((id) => TOWERS[id].tiers.map((tier) => tier.range))
function apply(ranges: number[][]) {
  ids.forEach((id, index) => {
    TOWERS[id].tiers.forEach((tier, tierIndex) => {
      Object.assign(tier, { range: ranges[index][tierIndex] })
    })
  })
}

/** Максимальная доля дороги в круге обстрела, без взрыва и продолжения полёта болта. */
function coverage(def: (typeof PLAYABLE_LEVELS)[number], range: number): number {
  const level = createLevel(def)
  const samples = Math.ceil(level.path.length / 0.05)
  let best = 0
  for (let row = 0; row < def.rows; row++) {
    for (let col = 0; col < def.cols; col++) {
      if (level.blockedCellKeys.has(`${col},${row}`)) continue
      let covered = 0
      for (let i = 0; i < samples; i++) {
        const [x, y] = level.path.positionAt(((i + 0.5) / samples) * level.path.length)
        if (Math.hypot(x - col - 0.5, y - row - 0.5) <= range) covered++
      }
      best = Math.max(best, covered / samples)
    }
  }
  return Math.round(best * 100)
}

try {
  for (const variant of variants) {
    apply(variant.ranges)
    console.log(`\n${variant.name}`)
    console.log('Порядок стратегий: экономика; лучники; огневики; пушкари; баллисты')
    for (const level of PLAYABLE_LEVELS) {
      const strategies = STRATEGIES.filter(
        (s) => s.name === 'Экономика и поддержка' || s.name.startsWith('Только '),
      )
      const results = strategies.map((s) => {
        const r = playBot(level, s)
        if (r.outcome === 'stuck') throw new Error(`${level.id}: ${s.name}: зависание`)
        return r.wavesCleared
      })
      const zones = ids.map((id) => {
        const tiers = TOWERS[id].tiers
        return `${id} ${coverage(level, tiers[0].range)}/${coverage(level, tiers[2].range)}%`
      })
      console.log(`${level.name}: ${results.join('/')} | покрытие I/III: ${zones.join(', ')}`)
    }
  }
} finally {
  apply(original)
}
