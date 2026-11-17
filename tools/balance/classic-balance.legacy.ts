// Критерии v8: девять классических залов, прежние роли башен и сила поддержки.
// Сохраняем все пороги, в том числе проходящие проверки. Запуск: npm run test:balance:legacy.
import { describe, expect, it } from 'vitest'
import { LEVELS, TOWERS, createGame } from '@throne/game'
import { STRATEGIES, findCellFor, playBot, type Strategy } from './bot.ts'
import {
  DAMAGE_TOWERS,
  ROLE_WAVES,
  STREAMS,
  damagePerGold,
  effectiveDamagePerGold,
  measureDefense,
  type Placement,
} from './towers.ts'

const classicLevels = LEVELS.filter((level) => level.id !== 'compact-throne-hall')
const throneHall = classicLevels.find((level) => level.id === 'throne-hall')!
const mixed = STRATEGIES.find((candidate) => candidate.name === 'Экономика и поддержка')!
const monoStrategies = STRATEGIES.filter((candidate) => candidate.name.startsWith('Только '))
const results = new WeakMap<(typeof LEVELS)[number], Map<string, ReturnType<typeof playBot>>>()
function result(level: (typeof LEVELS)[number], candidate: Strategy) {
  let byStrategy = results.get(level)
  if (!byStrategy) {
    byStrategy = new Map()
    results.set(level, byStrategy)
  }
  if (!byStrategy.has(candidate.name)) byStrategy.set(candidate.name, playBot(level, candidate))
  return byStrategy.get(candidate.name)!
}

describe('архив v8: роли четырёх атакующих башен', () => {
  for (let tier = 0; tier < ROLE_WAVES.length; tier++) {
    const rankings = STREAMS.map((stream) =>
      DAMAGE_TOWERS.map((def) => ({
        id: def.id,
        value:
          classicLevels.reduce(
            (sum, level) => sum + effectiveDamagePerGold(level, def, tier, stream),
            0,
          ) / classicLevels.length,
      })).sort((a, b) => b.value - a.value),
    )

    for (const def of DAMAGE_TOWERS) {
      it(`${def.name} ${tier + 1}: есть сильный и слабый поток, не больше двух побед`, () => {
        const positions = rankings.map((ranking) =>
          ranking.findIndex((entry) => entry.id === def.id),
        )
        expect(positions.some((position) => position < 2)).toBe(true)
        expect(positions.some((position) => position >= 2)).toBe(true)
        expect(positions.filter((position) => position === 0).length).toBeLessThanOrEqual(2)
      })
    }
    for (const [index, stream] of STREAMS.entries()) {
      it(`${stream.name}, ступень ${tier + 1}: лучший урон не выше двойного среднего`, () => {
        const ranking = rankings[index]
        const average = ranking.reduce((sum, entry) => sum + entry.value, 0) / ranking.length
        expect(ranking[0].value / average).toBeLessThanOrEqual(2)
      })
    }
  }
})

describe('архив v8: стратегии и залы', () => {
  for (const level of classicLevels) {
    it(`${level.name}: смесь отбивает минимум на две волны больше каждой моностратегии`, () => {
      const reference = result(level, mixed)
      expect(reference.outcome).not.toBe('stuck')
      expect(reference.wavesCleared).toBeGreaterThanOrEqual(18)
      for (const candidate of monoStrategies) {
        const mono = result(level, candidate)
        expect(mono.outcome, candidate.name).toBe('lost')
        expect(reference.wavesCleared - mono.wavesCleared, candidate.name).toBeGreaterThanOrEqual(2)
      }
    })
    it(`${level.name}: сложность смеси в пределах ±1 волны от Тронного зала`, () => {
      expect(
        Math.abs(result(level, mixed).wavesCleared - result(throneHall, mixed).wavesCleared),
      ).toBeLessThanOrEqual(1)
    })
  }
})

function lineup(towers: readonly { id: string; tier: number }[]): Placement[] {
  const game = createGame(throneHall)
  game.reset()
  game.state.gold = 1e9
  return towers.map(({ id, tier }) => {
    const cell = findCellFor(game, TOWERS[id])!
    game.build(id, cell.col, cell.row)
    for (let i = 0; i < tier; i++) game.upgrade(cell.col, cell.row)
    return { towerId: id, tier, ...cell }
  })
}

describe('архив v8: эффективность на монету', () => {
  const base = Array.from({ length: 4 }, () => ({ id: 'cannon', tier: 2 }))
  const armor = STREAMS.find((stream) => stream.enemyId === 'armor')!
  for (const id of ['frost', 'trapper', 'warlock', 'bell']) {
    it(`${TOWERS[id].name}: усиливает батарею против латников сильнее дополнительных лучников`, () => {
      const supported = measureDefense(throneHall, lineup([...base, { id, tier: 0 }]), armor, 20)
      const attackers = measureDefense(
        throneHall,
        lineup([
          ...base,
          ...Array.from({ length: Math.floor(TOWERS[id].cost / TOWERS['archer'].cost) }, () => ({
            id: 'archer',
            tier: 0,
          })),
        ]),
        armor,
        20,
      )
      expect(attackers.spentGold).toBeLessThanOrEqual(supported.spentGold)
      expect(supported.damage / attackers.damage).toBeGreaterThan(1.1)
    })
  }
  it('улучшение баллисты не становится намного выгоднее постройки на бессмертных мишенях', () => {
    const rebels = STREAMS[0]
    expect(
      damagePerGold(throneHall, TOWERS['ballista'], 2, rebels) /
        damagePerGold(throneHall, TOWERS['ballista'], 0, rebels),
    ).toBeLessThan(1.25)
  })
})
