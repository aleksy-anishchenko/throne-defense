import { describe, expect, it } from 'vitest'
import {
  ENEMIES,
  LEVELS,
  TOWERS,
  createGame,
  createLevel,
  hpMultiplier,
  investedGold,
  maxPossibleScore,
} from '@throne/game'
import { STRATEGIES, findCellFor, playBot, type Strategy } from './bot.ts'
import {
  ARMY_BUDGET,
  DAMAGE_TOWERS,
  ROLE_WAVES,
  STREAMS,
  damagePerGold,
  effectiveDamagePerGold,
  measureArmy,
  measureDefense,
  type Placement,
} from './towers.ts'

const throneHall = LEVELS.find((level) => level.id === 'throne-hall')!
const strategy = (name: string) => STRATEGIES.find((candidate) => candidate.name === name)!
const mixed = strategy('Экономика и поддержка')
const monoStrategies = STRATEGIES.filter((candidate) => candidate.name.startsWith('Только '))
const results = new Map<string, ReturnType<typeof playBot>>()
function result(level: (typeof LEVELS)[number], candidate: Strategy) {
  const key = `${level.id}:${candidate.name}`
  if (!results.has(key)) results.set(key, playBot(level, candidate))
  return results.get(key)!
}

// Роли сравниваем по среднему девяти залов: отдельная геометрия может помогать конкретной
// башне. Ступени I/II/III соответствуют здоровью врагов волн 1/5/10, а не бессмертной мишени.
describe('роли четырёх атакующих башен', () => {
  for (let tier = 0; tier < ROLE_WAVES.length; tier++) {
    const rankings = STREAMS.map((stream) =>
      DAMAGE_TOWERS.map((def) => ({
        id: def.id,
        value:
          LEVELS.reduce((sum, level) => sum + effectiveDamagePerGold(level, def, tier, stream), 0) /
          LEVELS.length,
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

describe('стратегии и залы', () => {
  for (const level of LEVELS) {
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
    it(`${level.name}: стратегии не зависают и укладываются в серверный потолок счёта`, () => {
      const prepared = createLevel(level)
      for (const candidate of STRATEGIES) {
        const played = result(level, candidate)
        expect(played.outcome, candidate.name).not.toBe('stuck')
        expect(played.score, candidate.name).toBeLessThanOrEqual(
          maxPossibleScore(prepared, played.wavesCleared),
        )
      }
    })
  }
})

/** Та же логика выбора мест, что у бота; итоговая расстановка остаётся явными данными. */
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

describe('поддержка за общий бюджет', () => {
  const base = Array.from({ length: 4 }, () => ({ id: 'cannon', tier: 2 }))
  const armor = STREAMS.find((stream) => stream.enemyId === 'armor')!
  for (const id of ['frost', 'trapper', 'warlock', 'bell']) {
    it(`${TOWERS[id].name}: усиливает батарею против латников сильнее дополнительных лучников`, () => {
      // Основные башни уже улучшены: за бюджет поддержки можно добавить одного-двух
      // лучников. Сравниваем одинаковый доступный бюджет, остаток денег не даёт урона.
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
  it('Казна: постройка и каждое улучшение окупаются за 3,5–4,5 волны без продажи', () => {
    const treasury = TOWERS['treasury']
    for (let tier = 0; tier < treasury.tiers.length; tier++) {
      const income = treasury.tiers[tier].goldPerWave!
      const totalPayback = investedGold(treasury, tier) / income
      const marginalPayback =
        tier === 0
          ? totalPayback
          : treasury.upgradeCosts[tier - 1] / (income - treasury.tiers[tier - 1].goldPerWave!)
      for (const payback of [totalPayback, marginalPayback]) {
        expect(payback).toBeGreaterThanOrEqual(3.5)
        expect(payback).toBeLessThanOrEqual(4.5)
      }
    }
  })
  it('Казна даёт больше средств к десятой волне, чем та же очередь покупок без Казны', () => {
    const withoutTreasury = {
      ...mixed,
      name: 'Без Казны',
      opening: mixed.opening.filter((id) => id !== 'treasury'),
      loop: mixed.loop.filter((id) => id !== 'treasury'),
    }
    const played = playBot(throneHall, withoutTreasury)
    expect(played.outcome).not.toBe('stuck')
    const withTreasury = result(throneHall, mixed).waves.find((wave) => wave.wave === 10)!
    const without = played.waves.find((wave) => wave.wave === 10)!
    expect(withTreasury.wealth).toBeGreaterThan(without.wealth + TOWERS['treasury'].cost)
  })
})

describe('достоверность стенда', () => {
  it('избыточный урон не считается полезным: один лазутчик даёт ровно своё здоровье', () => {
    const stream = { name: 'один лазутчик', enemyId: 'scout', count: 1, gap: 0 }
    const report = measureDefense(throneHall, lineup([{ id: 'ballista', tier: 2 }]), stream)
    expect(report.kills).toBe(1)
    expect(report.damage).toBe(ENEMIES['scout'].hp)
    expect(report.leaks).toBe(0)
  })
  it('без защиты все враги доходят и отнимают свои жизни', () => {
    const stream = STREAMS.find((candidate) => candidate.enemyId === 'armor')!
    const report = measureDefense(throneHall, [], stream, 10)
    expect(report.kills).toBe(0)
    expect(report.damage).toBe(0)
    expect(report.leaks).toBe(stream.count)
    expect(report.livesLost).toBe(stream.count * ENEMIES['armor'].throneDamage)
  })
  for (const wave of [1, 10, 20]) {
    it(`волна ${wave}: бюджет, число врагов и здоровье сохраняются в реальном бою`, () => {
      for (const def of DAMAGE_TOWERS)
        for (let tier = 0; tier < def.tiers.length; tier++)
          for (const stream of STREAMS) {
            const report = measureArmy(throneHall, def, tier, stream, wave)
            const totalHp =
              stream.count *
              Math.round(ENEMIES[stream.enemyId].hp * hpMultiplier(wave, throneHall.waves.length))
            expect(report.spentGold).toBeLessThanOrEqual(ARMY_BUDGET)
            expect(report.kills + report.leaks).toBe(stream.count)
            expect(report.damage).toBeGreaterThanOrEqual(0)
            expect(report.damage).toBeLessThanOrEqual(totalHp + 1e-6)
          }
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
