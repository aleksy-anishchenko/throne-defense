// npm run towers — насколько выгодна каждая башня: урон на одну вложенную монету.
//
// Как меряем: башня ставится на лучшую для неё клетку, мимо идёт поток врагов, которых
// нельзя убить. Весь нанесённый урон делим на золото, вложенное в башню.
// Так учитываются сразу дальность, скорострельность, броня, пробивание и взрывы.
//
// Хороший баланс: у башен разные сильные стороны (кто-то лучше против брони, кто-то против толпы),
// но нет башни, которая выгоднее всех против всего. И улучшение не должно становиться
// всё выгоднее и выгоднее — иначе выгодно строить только её.

import {
  BALANCE_VERSION,
  LEVELS,
  SIMULATION_STEP,
  TOWER_LIST,
  createGame,
  investedGold,
  spawnEnemy,
} from '@throne/game'
import type { LevelDef, TowerDef } from '@throne/game'
import { MAX_WAVE_STEPS, findBestCell, pathCoverage } from './bot.ts'

interface EnemyStream {
  name: string
  enemyId: string
  count: number
  /** Пауза между врагами, с */
  gap: number
}

export const STREAMS: EnemyStream[] = [
  { name: 'бунтовщики', enemyId: 'rebel', count: 30, gap: 0.7 },
  { name: 'лазутчики', enemyId: 'scout', count: 30, gap: 0.3 },
  { name: 'латники', enemyId: 'armor', count: 20, gap: 1 },
  { name: 'огры', enemyId: 'ogre', count: 8, gap: 2.5 },
]

/** «Бесконечное» число: столько золота, жизней и здоровья ставим, чтобы ничто не кончилось */
const UNLIMITED = 1e9

/** Урон на одну вложенную монету: башня def ступени tier против потока врагов stream */
export function damagePerGold(
  level: LevelDef,
  def: TowerDef,
  tier: number,
  stream: EnemyStream,
): number {
  const game = createGame(level)
  game.reset()
  game.state.gold = UNLIMITED
  game.state.lives = UNLIMITED // трон не падает, сколько бы врагов ни дошло
  const cell = findBestCell(game, def.tiers[0].range)
  if (!cell) return 0
  game.build(def.id, cell.col, cell.row)
  for (let i = 0; i < tier; i++) game.upgrade(cell.col, cell.row)

  let dealt = 0
  game.on('leak', (enemy) => {
    dealt += enemy.maxHp - enemy.hp
  })

  // Выпускаем врагов сами (а не волной), чтобы сразу сделать их бессмертными
  const world = { state: game.state, level: game.level, emit: () => {} }
  let spawned = 0
  for (let i = 0; i < MAX_WAVE_STEPS; i++) {
    while (spawned < stream.count && spawned * stream.gap <= game.state.time) {
      spawnEnemy(world, stream.enemyId)
      const enemy = game.state.enemies[game.state.enemies.length - 1]
      enemy.maxHp = UNLIMITED
      enemy.hp = UNLIMITED
      spawned++
    }
    if (spawned === stream.count && !game.state.enemies.length) break
    game.step(SIMULATION_STEP)
  }
  return dealt / investedGold(def, tier)
}

// Свой список римских цифр, а не toRoman из apps/web — пакет game не зависит от интерфейса
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const padCell = (value: string | number, width: number) => String(value).padStart(width)

if (import.meta.main) {
  console.log(
    `Баланс версии ${BALANCE_VERSION}. Урон на 1 вложенную монету — чем больше, тем выгоднее.\n`,
  )

  for (const level of LEVELS) {
    console.log(`=== Уровень «${level.name}»\n`)
    const headerCells = [
      'башня'.padEnd(10),
      padCell('ур', 4),
      padCell('вложено', 9),
      padCell('ковра в зоне', 14),
    ]
    console.log([...headerCells, ...STREAMS.map((stream) => padCell(stream.name, 12))].join(''))

    for (const def of TOWER_LIST) {
      for (let tier = 0; tier < def.tiers.length; tier++) {
        const game = createGame(level)
        game.reset()
        const best = findBestCell(game, def.tiers[tier].range)
        const coverage = best ? pathCoverage(game, best.col, best.row, def.tiers[tier].range) : 0
        const tableRow = [
          (tier === 0 ? def.name : '').padEnd(10),
          padCell(ROMAN[tier] ?? tier + 1, 4),
          padCell(investedGold(def, tier), 9),
          padCell(coverage.toFixed(1), 14),
          ...STREAMS.map((stream) =>
            padCell(damagePerGold(level, def, tier, stream).toFixed(1), 12),
          ),
        ]
        console.log(tableRow.join(''))
      }
    }
    console.log()
  }
}
