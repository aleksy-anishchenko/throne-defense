// node tools/balance/fire-opening.ts — честный старт в позиции со скриншота.
import { PLAYABLE_LEVELS, SIMULATION_STEP, TOWERS, createGame } from '@throne/game'
import { STRATEGIES, playBot } from './bot.ts'

const level = PLAYABLE_LEVELS.find((def) => def.id === 'svetlitsa')!
const mage = TOWERS['mage']
const original = mage.tiers.map((tier) => ({ damage: tier.damage, burnDamage: tier.burnDamage }))
const variants = [
  {
    name: 'Числа v11 на текущей механике (не воспроизведение v11)',
    damage: [5, 9, 14],
    burn: [21, 36, 58],
  },
  { name: 'Слабый взрыв', damage: [1, 2, 3], burn: [21, 36, 58] },
  { name: 'Без взрыва', damage: [0, 0, 0], burn: [21, 36, 58] },
  { name: 'Слабый взрыв и горение −20%', damage: [1, 2, 3], burn: [17, 29, 46] },
]

// Сопоставимый бюджет — не более 300, неистраченный остаток остаётся у игрока.
const plans = [
  { name: 'Огневик III (300)', id: 'mage', count: 1, tier: 2 },
  { name: 'Три Лучника II (270)', id: 'archer', count: 3, tier: 1 },
  { name: 'Баллиста II (240)', id: 'ballista', count: 1, tier: 1 },
  { name: 'Пушкарь II (240)', id: 'cannon', count: 1, tier: 1 },
]
const cells = [
  [2, 7],
  [3, 7],
  [2, 9],
] as const

function opening(plan: (typeof plans)[number]) {
  const game = createGame(level)
  game.reset()
  for (const [col, row] of cells.slice(0, plan.count)) {
    if (!game.isCellFree(col, row)) throw new Error(`Недоступная клетка ${col},${row}`)
  }
  let firstLeak: number | null = null
  const reports = []
  for (let wave = 1; wave <= 20; wave++) {
    for (let i = 0; i < plan.count; i++) {
      const [col, row] = cells[i]
      if (!game.towerAt(col, row)) game.build(plan.id, col, row)
    }
    for (let i = 0; i < plan.count; i++) {
      const [col, row] = cells[i]
      while ((game.towerAt(col, row)?.tier ?? plan.tier) < plan.tier) {
        if (!game.upgrade(col, row)) break
      }
    }
    // Готовность к началу волны, как у основного бота; состояние не подменяется.
    for (let i = 0; i < 360; i++) game.step(SIMULATION_STEP)
    game.startWave()
    const lives = game.state.lives
    let steps = 0
    while (game.state.phase === 'wave' && steps++ < 60 * 600) game.step(SIMULATION_STEP)
    if (game.state.phase === 'wave') throw new Error('Волна зависла')
    if (game.state.lives < lives && firstLeak === null) firstLeak = wave
    reports.push({
      wave,
      cleared: game.state.wavesCleared,
      lives: game.state.lives,
      gold: game.state.gold,
      tiers: game.state.towers.map((tower) => tower.tier + 1),
    })
    if (game.state.phase === 'lost' || game.state.phase === 'won') break
  }
  return { plan: plan.name, firstLeak, reports }
}

try {
  for (const variant of variants) {
    mage.tiers.forEach((tier, index) =>
      Object.assign(tier, { damage: variant.damage[index], burnDamage: variant.burn[index] }),
    )
    console.log(`\n${variant.name}`)
    for (const plan of variant === variants[0] ? plans : plans.slice(0, 1)) {
      console.log(JSON.stringify(opening(plan)))
    }
    const mixed = STRATEGIES.find((strategy) => strategy.name === 'Экономика и поддержка')!
    console.log(
      'Смешанный бот: ' +
        PLAYABLE_LEVELS.map((map) => {
          const result = playBot(map, mixed)
          if (result.outcome === 'stuck') throw new Error(`Волна зависла: ${map.id}`)
          return `${map.name} ${result.wavesCleared}`
        }).join('; '),
    )
  }
} finally {
  mage.tiers.forEach((tier, index) => Object.assign(tier, original[index]))
}
