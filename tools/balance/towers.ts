// npm run towers — роли башен, предельный урон и реальные армии на общий бюджет.
//
// Как меряем: башня ставится на лучшую для неё клетку, мимо идёт поток врагов, которых
// нельзя убить (предельный урон), либо с обычным здоровьем (полезный урон).
// Так учитываются сразу дальность, скорострельность, броня, пробивание и взрывы.
//
// Хороший баланс: у башен разные сильные стороны (кто-то лучше против брони, кто-то против толпы),
// но нет башни, которая выгоднее всех против всего. И улучшение не должно становиться
// всё выгоднее и выгоднее — иначе выгодно строить только её.

import {
  BALANCE_VERSION,
  PLAYABLE_LEVELS as LEVELS,
  SIMULATION_STEP,
  TOWER_LIST,
  createGame,
  investedGold,
  spawnEnemy,
} from '@throne/game'
import type { Game, LevelDef, TowerDef } from '@throne/game'
import { MAX_WAVE_STEPS, findBestCell, pathCoverage } from './bot.ts'

export interface EnemyStream {
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
  { name: 'плотная толпа', enemyId: 'rebel', count: 30, gap: 0.2 },
]

export const DAMAGE_TOWERS = TOWER_LIST.filter(
  (def) => (def.tiers[0].damage > 0 || (def.tiers[0].burnDamage ?? 0) > 0) && def.id !== 'frost',
)
export const MEASUREMENT_WAVES = [1, 10, 20] as const
/** Сопоставляем ступени с этапами, где их покупают: I — начало, II — развитие, III — середина. */
export const ROLE_WAVES = [1, 5, 10] as const
export const ARMY_BUDGET = 420

export interface Placement {
  towerId: string
  col: number
  row: number
  tier?: number
  aspectId?: string
}

export interface CombatReport {
  spentGold: number
  /** Полезный урон: избыточный урон последнего попадания не учитывается */
  damage: number
  kills: number
  leaks: number
  livesLost: number
  elapsed: number
}

/** Один и тот же поток для одиночной башни, армии и проверок поддержки */
function runStream(game: Game, stream: EnemyStream, immortal = false): CombatReport {
  if (
    !Number.isInteger(stream.count) ||
    stream.count < 1 ||
    !Number.isFinite(stream.gap) ||
    stream.gap < 0
  ) {
    throw new Error('Неверные параметры потока')
  }
  const report: CombatReport = {
    spentGold: game.state.towers.reduce(
      (sum, tower) => sum + investedGold(tower.def, tower.tier, tower.aspectId),
      0,
    ),
    damage: 0,
    kills: 0,
    leaks: 0,
    livesLost: 0,
    elapsed: 0,
  }
  game.on('kill', (enemy) => {
    report.kills++
    report.damage += enemy.maxHp
  })
  game.on('leak', (enemy) => {
    report.leaks++
    report.livesLost += enemy.def.throneDamage
    report.damage += enemy.maxHp - enemy.hp
  })
  const world = { state: game.state, level: game.level, emit: () => {} }
  let spawned = 0
  for (let i = 0; i < MAX_WAVE_STEPS; i++) {
    while (spawned < stream.count && spawned * stream.gap <= game.state.time) {
      spawnEnemy(world, stream.enemyId)
      if (immortal) {
        const enemy = game.state.enemies[game.state.enemies.length - 1]
        enemy.maxHp = UNLIMITED
        enemy.hp = UNLIMITED
      }
      spawned++
    }
    if (spawned === stream.count && !game.state.enemies.length) {
      report.elapsed = game.state.time
      return report
    }
    game.step(SIMULATION_STEP)
  }
  throw new Error(`Поток «${stream.name}» не завершился за ${MAX_WAVE_STEPS} шагов`)
}

function measurementGame(level: LevelDef, wave: number): Game {
  if (!Number.isInteger(wave) || wave < 1) throw new Error('Неверный номер волны')
  const game = createGame(level)
  game.reset()
  game.state.gold = UNLIMITED
  game.state.lives = UNLIMITED
  // Остаёмся в build: врагов выпускает стенд, бонусов и автоматических волн здесь нет.
  game.state.wave = wave
  return game
}

/** Реальный бой с заданной расстановкой; нужен и для сравнения поддержки за те же деньги */
export function measureDefense(
  level: LevelDef,
  placements: readonly Placement[],
  stream: EnemyStream,
  wave = 1,
): CombatReport {
  const game = measurementGame(level, wave)
  for (const placement of placements) {
    if (!game.build(placement.towerId, placement.col, placement.row))
      throw new Error('Не удалось построить башню стенда')
    const tier = placement.tier ?? 0
    if (!Number.isInteger(tier) || tier < 0) throw new Error('Неверная ступень')
    for (let i = 0; i < tier; i++) {
      if (!game.upgrade(placement.col, placement.row))
        throw new Error('Не удалось улучшить башню стенда')
    }
    if (placement.aspectId && !game.specialize(placement.col, placement.row, placement.aspectId)) {
      throw new Error('Не удалось выбрать специализацию башни стенда')
    }
  }
  return runStream(game, stream)
}

/** Армия одного типа на общий бюджет. Остаток денег не даёт преимущества в сравнении. */
export function measureArmy(
  level: LevelDef,
  def: TowerDef,
  tier: number,
  stream: EnemyStream,
  wave: number,
  budget = ARMY_BUDGET,
): CombatReport {
  if (!Number.isInteger(tier) || !def.tiers[tier]) throw new Error('Неверная ступень')
  if (!Number.isFinite(budget) || budget < 0) throw new Error('Неверный бюджет')
  const game = measurementGame(level, wave)
  const cost = investedGold(def, tier)
  for (let remaining = budget; remaining >= cost; remaining -= cost) {
    const cell = findBestCell(game, def.tiers[0].range)
    if (!cell) break
    game.build(def.id, cell.col, cell.row)
    for (let i = 0; i < tier; i++) game.upgrade(cell.col, cell.row)
  }
  return runStream(game, stream)
}

/** «Бесконечное» число: столько золота, жизней и здоровья ставим, чтобы ничто не кончилось */
const UNLIMITED = 1e9

/**
 * Клетка для замера: лучшая для башни первой ступени. Улучшают башню там, где её
 * поставили, поэтому и для старших ступеней клетка та же
 */
function measureCell(game: Game, def: TowerDef): { col: number; row: number } {
  const cell = findBestCell(game, def.tiers[0].range)
  if (!cell) throw new Error(`Башню «${def.name}» некуда поставить: на поле нет свободной клетки`)
  return cell
}

/** Урон на одну вложенную монету: башня def ступени tier против потока врагов stream */
export function damagePerGold(
  level: LevelDef,
  def: TowerDef,
  tier: number,
  stream: EnemyStream,
): number {
  const game = measurementGame(level, 1)
  const cell = measureCell(game, def)
  game.build(def.id, cell.col, cell.row)
  for (let i = 0; i < tier; i++) game.upgrade(cell.col, cell.row)

  return runStream(game, stream, true).damage / investedGold(def, tier)
}

/** Роли проверяем на живых врагах: урон сверх здоровья не помогает удерживать трон. */
export function effectiveDamagePerGold(
  level: LevelDef,
  def: TowerDef,
  tier: number,
  stream: EnemyStream,
): number {
  const game = measurementGame(level, ROLE_WAVES[tier])
  const cell = measureCell(game, def)
  game.build(def.id, cell.col, cell.row)
  for (let i = 0; i < tier; i++) {
    if (!game.upgrade(cell.col, cell.row)) throw new Error('Неверная ступень')
  }
  return runStream(game, stream).damage / investedGold(def, tier)
}

// Свой список римских цифр, а не toRoman из apps/web — пакет game не зависит от интерфейса
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const padCell = (value: string | number, width: number) => String(value).padStart(width)

if (import.meta.main) {
  console.log(
    `Баланс версии ${BALANCE_VERSION}. Роли: полезный урон на монету, среднее ${LEVELS.length} залов.\n`,
  )

  console.log(
    [
      'башня'.padEnd(10),
      padCell('ур', 4),
      padCell('волна', 7),
      ...STREAMS.map((stream) => padCell(stream.name, 16)),
    ].join(''),
  )
  for (const def of DAMAGE_TOWERS)
    for (let tier = 0; tier < def.tiers.length; tier++) {
      console.log(
        [
          def.name.padEnd(10),
          padCell(ROMAN[tier], 4),
          padCell(ROLE_WAVES[tier], 7),
          ...STREAMS.map((stream) =>
            padCell(
              (
                LEVELS.reduce(
                  (sum, level) => sum + effectiveDamagePerGold(level, def, tier, stream),
                  0,
                ) / LEVELS.length
              ).toFixed(2),
              16,
            ),
          ),
        ].join(''),
      )
    }

  for (const level of LEVELS) {
    console.log(`\n=== Уровень «${level.name}». Бессмертные мишени: предельный урон на монету.\n`)
    const headerCells = [
      'башня'.padEnd(10),
      padCell('ур', 4),
      padCell('вложено', 9),
      padCell('ковра в зоне', 14),
    ]
    console.log([...headerCells, ...STREAMS.map((stream) => padCell(stream.name, 16))].join(''))

    // Поддержка проверяется совместно с атакующими башнями в bot.test.ts.
    for (const def of DAMAGE_TOWERS) {
      for (let tier = 0; tier < def.tiers.length; tier++) {
        const game = createGame(level)
        game.reset()
        // Покрытие — на той же клетке, где меряется урон, но с дальностью этой ступени
        const cell = measureCell(game, def)
        const coverage = pathCoverage(game, cell.col, cell.row, def.tiers[tier].range)
        const tableRow = [
          (tier === 0 ? def.name : '').padEnd(10),
          padCell(ROMAN[tier] ?? tier + 1, 4),
          padCell(investedGold(def, tier), 9),
          padCell(coverage.toFixed(1), 14),
          ...STREAMS.map((stream) =>
            padCell(damagePerGold(level, def, tier, stream).toFixed(1), 16),
          ),
        ]
        console.log(tableRow.join(''))
      }
    }
    console.log()

    console.log(
      `Реальные враги, общий бюджет ${ARMY_BUDGET}. Ячейка: убито / пропущено / потеряно жизней.`,
    )
    console.log(
      [
        'башня'.padEnd(10),
        padCell('ур', 4),
        padCell('волна', 7),
        padCell('вложено', 9),
        ...STREAMS.map((stream) => padCell(stream.name, 16)),
      ].join(''),
    )
    for (const def of DAMAGE_TOWERS) {
      for (let tier = 0; tier < def.tiers.length; tier++) {
        for (const wave of MEASUREMENT_WAVES) {
          const reports = STREAMS.map((stream) => measureArmy(level, def, tier, stream, wave))
          console.log(
            [
              def.name.padEnd(10),
              padCell(ROMAN[tier], 4),
              padCell(wave, 7),
              padCell(reports[0].spentGold, 9),
              ...reports.map((report) =>
                padCell(`${report.kills}/${report.leaks}/${report.livesLost}`, 16),
              ),
            ].join(''),
          )
        }
      }
    }
    console.log()
  }
}
