import { describe, expect, it } from 'vitest'
import {
  ENEMIES,
  LEVELS,
  PLAYABLE_LEVELS,
  TOWERS,
  createGame,
  createLevel,
  hpMultiplier,
  investedGold,
  maxPossibleScore,
  type RewardPick,
} from '@throne/game'
import { STRATEGIES, findCellFor, playBot, type Strategy } from './bot.ts'
import {
  ARMY_BUDGET,
  DAMAGE_TOWERS,
  STREAMS,
  measureArmy,
  measureDefense,
  type Placement,
} from './towers.ts'

const throneHall = LEVELS.find((level) => level.id === 'throne-hall')!
const classicLevels = LEVELS.filter((level) => level.id !== 'compact-throne-hall')
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

// Критерии эффективности v8 вынесены в classic-balance.legacy.ts.
// Совместимость старых залов и потолок счёта по-прежнему обязательны.
describe('совместимость классических залов', () => {
  for (const level of classicLevels) {
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

describe('компактные залы', () => {
  for (const level of PLAYABLE_LEVELS) {
    it(`${level.name}: стратегии завершаются и не превышают потолок счёта`, () => {
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

describe('экономика Казны', () => {
  it('Одиночная Казна: постройка и каждое улучшение окупаются за 6–7 волн без продажи', () => {
    const treasury = TOWERS['treasury']
    for (let tier = 0; tier < treasury.tiers.length; tier++) {
      const income = treasury.tiers[tier].goldPerWave!
      const totalPayback = investedGold(treasury, tier) / income
      const marginalPayback =
        tier === 0
          ? totalPayback
          : treasury.upgradeCosts[tier - 1] / (income - treasury.tiers[tier - 1].goldPerWave!)
      for (const payback of [totalPayback, marginalPayback]) {
        expect(payback).toBeGreaterThanOrEqual(6)
        expect(payback).toBeLessThanOrEqual(7)
      }
    }
  })
  it('при одинаковых благословениях Казна окупается к десятой волне', () => {
    const withoutTreasury: Strategy = {
      name: 'Без Казны',
      opening: ['archer', 'archer', 'archer', 'upgrade', 'upgrade', 'upgrade'],
      loop: ['upgrade', 'ballista', 'upgrade', 'archer', 'trapper', 'upgrade', 'warlock', 'bell'],
      placement: 'coverage',
    }
    const withTreasury: Strategy = {
      ...withoutTreasury,
      name: 'С Казной',
      opening: ['archer', 'archer', 'archer', 'treasury', 'upgrade', 'upgrade', 'upgrade'],
    }
    function play(candidate: Strategy) {
      const picks: RewardPick[] = []
      const { waves, wavesCleared } = playBot(throneHall, candidate, 10, (game) => {
        if (game.state.wave === 1) game.on('rewardChosen', (pick) => picks.push(pick))
      })
      expect(wavesCleared, candidate.name).toBe(10)
      return { picks, wealth: waves[9].wealth }
    }

    const withIncome = play(withTreasury)
    const withoutIncome = play(withoutTreasury)
    expect(withIncome.picks.map((pick) => pick.wave)).toEqual([5, 10])
    expect(withIncome.picks).toEqual(withoutIncome.picks)
    expect(withIncome.wealth).toBeGreaterThan(withoutIncome.wealth + TOWERS['treasury'].cost)
  })
})

describe('достоверность стенда', () => {
  it('избыточный урон не считается полезным: один лазутчик даёт ровно своё здоровье', () => {
    const stream = { name: 'один лазутчик', enemyId: 'scout', count: 1, gap: 0 }
    const report = measureDefense(throneHall, lineup([{ id: 'ballista', tier: 2 }]), stream)
    expect(report.kills).toBe(1)
    expect(report.damage).toBe(
      Math.round(ENEMIES['scout'].hp * hpMultiplier(1, throneHall.waves.length)),
    )
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
})
