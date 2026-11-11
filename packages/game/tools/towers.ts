// npm run towers — насколько выгодна каждая башня: урон на одну вложенную монету.
//
// Как меряем: башня ставится на лучшую для неё клетку, мимо идёт поток врагов, которых
// нельзя убить. Весь нанесённый урон делим на золото, вложенное в башню.
// Так учитываются сразу дальность, скорострельность, броня, пробивание и взрывы.
//
// Хороший баланс: у башен разные сильные стороны (кто-то лучше против брони, кто-то против толпы),
// но нет башни, которая выгоднее всех против всего. И улучшение не должно становиться
// всё выгоднее и выгоднее — иначе выгодно строить только её.

import { BALANCE_VERSION, LEVELS, STEP, TOWER_LIST, createGame, invested } from '../src/index.ts'
import type { LevelDef, TowerDef } from '../src/index.ts'
import { spawn } from '../src/systems/enemies.ts'
import { bestCell, coverage } from './bot.ts'

interface StreamTest {
  name: string
  enemy: string
  count: number
  /** Пауза между врагами, с */
  gap: number
}

export const STREAMS: StreamTest[] = [
  { name: 'бунтовщики', enemy: 'rebel', count: 30, gap: 0.7 },
  { name: 'лазутчики', enemy: 'scout', count: 30, gap: 0.3 },
  { name: 'латники', enemy: 'armor', count: 20, gap: 1 },
  { name: 'огры', enemy: 'ogre', count: 8, gap: 2.5 },
]

const IMMORTAL = 1e9

/** Урон на одну вложенную монету: башня def уровня lv против потока врагов */
export function damagePerGold(level: LevelDef, def: TowerDef, lv: number, t: StreamTest): number {
  const game = createGame(level)
  game.reset()
  game.state.gold = IMMORTAL
  game.state.lives = IMMORTAL // трон не падает, сколько бы врагов ни дошло
  const cell = bestCell(game, def.levels[0].range)
  if (!cell) return 0
  game.build(def.id, cell.c, cell.r)
  for (let i = 0; i < lv; i++) game.upgrade(cell.c, cell.r)

  let dealt = 0
  game.on('leak', (e) => (dealt += e.maxHp - e.hp))

  // Выпускаем врагов сами (а не волной), чтобы сразу сделать их бессмертными
  const world = { state: game.state, level: game.level, emit: () => {} }
  let spawned = 0
  for (let i = 0; i < 36_000; i++) {
    while (spawned < t.count && spawned * t.gap <= game.state.time) {
      spawn(world, t.enemy)
      const e = game.state.enemies[game.state.enemies.length - 1]
      e.hp = e.maxHp = IMMORTAL
      spawned++
    }
    if (spawned === t.count && !game.state.enemies.length) break
    game.step(STEP)
  }
  return dealt / invested(def, lv)
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const cell = (v: string | number, w: number) => String(v).padStart(w)

if (import.meta.main) {
  console.log(
    `Баланс версии ${BALANCE_VERSION}. Урон на 1 вложенную монету — чем больше, тем выгоднее.\n`,
  )

  for (const level of LEVELS) {
    console.log(`=== Уровень «${level.name}»\n`)
    const head = ['башня'.padEnd(10), cell('ур', 4), cell('вложено', 9), cell('ковра в зоне', 14)]
    console.log([...head, ...STREAMS.map((s) => cell(s.name, 12))].join(''))

    for (const def of TOWER_LIST) {
      for (let lv = 0; lv < def.levels.length; lv++) {
        const game = createGame(level)
        game.reset()
        const best = bestCell(game, def.levels[lv].range)
        const cov = best ? coverage(game, best.c, best.r, def.levels[lv].range) : 0
        const row = [
          (lv === 0 ? def.name : '').padEnd(10),
          cell(ROMAN[lv] ?? lv + 1, 4),
          cell(invested(def, lv), 9),
          cell(cov.toFixed(1), 14),
          ...STREAMS.map((s) => cell(damagePerGold(level, def, lv, s).toFixed(1), 12)),
        ]
        console.log(row.join(''))
      }
    }
    console.log()
  }
}
