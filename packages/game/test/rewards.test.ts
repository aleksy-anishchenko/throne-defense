import { describe, expect, it } from 'vitest'
import {
  REWARDS,
  REWARD_LIST,
  REWARD_WAVES,
  SIMULATION_STEP,
  TOWERS,
  effectiveTowerStats,
  refundFor,
  rewardStats,
  summarizeRewards,
  towerInvestedGold,
  upgradeCost,
  type RewardId,
} from '../src/index.ts'
import { damageEnemy } from '../src/systems/combat.ts'
import { updateTowers } from '../src/systems/towers.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

function choose(game: ReturnType<typeof newGame>, rewardId: RewardId) {
  game.state.phase = 'reward'
  game.state.pendingReward = { wave: 5, options: [rewardId] }
  expect(game.chooseReward(rewardId)).toBe(true)
}

function finishWave(game: ReturnType<typeof newGame>, wave: number) {
  game.state.wave = wave
  game.state.waveTime = 0
  game.state.spawnQueue = []
  game.state.enemies = []
  game.state.phase = 'wave'
  game.step(SIMULATION_STEP)
}

describe('благословения после волн', () => {
  it('рубежи — только после волн 5, 10, 15 и 19', () => {
    expect(REWARD_WAVES).toEqual([5, 10, 15, 19])
    expect(REWARD_LIST).toHaveLength(12)
  })

  it.each(REWARD_WAVES)(
    'после %i-й волны останавливает партию и предлагает три разные награды',
    (wave) => {
      const game = newGame()
      finishWave(game, wave)
      expect(game.state.phase).toBe('reward')
      expect(game.state.wave).toBe(wave + 1)
      expect(game.state.pendingReward?.wave).toBe(wave)
      expect(game.state.pendingReward?.options).toHaveLength(3)
      expect(new Set(game.state.pendingReward?.options).size).toBe(3)
      for (const rewardId of game.state.pendingReward!.options) {
        const availableWaves = REWARDS[rewardId].availableWaves
        if (availableWaves) expect(availableWaves).toContain(wave)
      }
    },
  )

  it('развитийные награды не выпадают после 15-й и 19-й волн', () => {
    expect(REWARDS['bounty'].availableWaves).toEqual([5, 10])
    expect(REWARDS['royal-tax'].availableWaves).toEqual([5, 10])
    for (const wave of [15, 19]) {
      const game = newGame()
      finishWave(game, wave)
      expect(game.state.pendingReward?.options).not.toContain('bounty')
      expect(game.state.pendingReward?.options).not.toContain('royal-tax')
    }
  })

  it('одинаковое состояние партии даёт одинаковый выбор', () => {
    const first = newGame()
    const second = newGame()
    finishWave(first, 5)
    finishWave(second, 5)
    expect(first.state.pendingReward?.options).toEqual(second.state.pendingReward?.options)
  })

  it('принимает только награду из предложенных и возвращает к строительству', () => {
    const game = newGame()
    finishWave(game, 5)
    const options = game.state.pendingReward!.options
    const rejected = (['war-chest', 'field-medic', 'sharpened-steel'] as const).find(
      (rewardId) => !options.includes(rewardId),
    )!
    expect(game.chooseReward(rejected)).toBe(false)
    expect(game.state.phase).toBe('reward')

    expect(game.chooseReward(options[0])).toBe(true)
    expect(game.state.phase).toBe('build')
    expect(game.state.pendingReward).toBeNull()
    expect(game.state.selectedRewards).toEqual([{ wave: 5, rewardId: options[0] }])
    expect(game.chooseReward(options[0])).toBe(false)
  })

  it('сразу выдаёт 140 золота или полностью лечит трон', () => {
    const goldGame = newGame()
    choose(goldGame, 'war-chest')
    expect(goldGame.state.gold).toBe(290)

    const livesGame = newGame()
    livesGame.state.lives = 5
    choose(livesGame, 'field-medic')
    expect(livesGame.state.lives).toBe(20)
  })

  it('«Заточенные клинки» усиливают обычный урон и горение', () => {
    const game = newGame()
    choose(game, 'sharpened-steel')
    const enemy = placeEnemy(game, 'rebel', 1.5)
    const hp = enemy.hp
    damageEnemy(worldOf(game), enemy, 10, 'magic')
    expect(hp - enemy.hp).toBeCloseTo(11.2)
    expect(rewardStats(game.state).damageMultiplier).toBeCloseTo(1.12)
  })

  it('«Быстрые приказы» ускоряют перезарядку башни', () => {
    const game = newGame()
    choose(game, 'rapid-orders')
    const tower = game.build('archer', 5, 11)!
    placeEnemy(game, 'rebel', 2)
    tower.cooldownLeft = 0.113
    updateTowers(worldOf(game), 0.1)
    expect(game.state.shots).toHaveLength(1)
    expect(rewardStats(game.state).fireRateMultiplier).toBeCloseTo(1.15)
  })

  it('«Щедрая награда» добавляет золото за убийство', () => {
    const game = newGame()
    choose(game, 'bounty')
    const enemy = placeEnemy(game, 'rebel', 1.5)
    enemy.hp = 1
    const gold = game.state.gold
    damageEnemy(worldOf(game), enemy, 1, 'magic')
    expect(game.state.gold).toBe(gold + enemy.def.reward + 1)
  })

  it('«Военный налог» увеличивает золото за волну', () => {
    const game = newGame()
    choose(game, 'royal-tax')
    const gold = game.state.gold
    finishWave(game, 2)
    expect(game.state.gold - gold).toBe(42)
  })

  it('«Военный инженер» даёт 30% скидки на улучшения с точным возвратом денег', () => {
    const game = newGame()
    choose(game, 'military-engineer')
    const tower = game.build('archer', 5, 11)!
    expect(upgradeCost(tower, 0.7)).toBe(28)
    expect(game.upgrade(tower.col, tower.row)).toBe(true)
    expect(tower.upgradeGoldPaid).toBe(28)
    expect(towerInvestedGold(tower)).toBe(78)
    expect(refundFor(tower)).toBe(78)
  })

  it('скидка военного инженера не распространяется на аспекты', () => {
    const game = newGame()
    game.state.gold = 1000
    choose(game, 'military-engineer')
    const tower = game.build('ballista', 5, 11)!
    expect(game.upgrade(tower.col, tower.row)).toBe(true)
    expect(game.upgrade(tower.col, tower.row)).toBe(true)
    const gold = game.state.gold
    expect(game.specialize(tower.col, tower.row, 'giant-slayer')).toBe(true)
    expect(game.state.gold).toBe(gold - 180)
  })

  it('новые награды меняют нужные характеристики башен и врагов', () => {
    const wildfire = newGame()
    choose(wildfire, 'wildfire')
    const mage = wildfire.build('mage', 5, 11)!
    expect(
      effectiveTowerStats(wildfire.state, mage, TOWERS['mage'].tiers[0]).burnDamage,
    ).toBeCloseTo(15.3 * 1.3)

    const control = newGame()
    choose(control, 'control-master')
    const frost = control.build('frost', 5, 11)!
    const trapper = control.build('trapper', 3, 11)!
    expect(
      effectiveTowerStats(control.state, frost, TOWERS['frost'].tiers[0]).slowAmount,
    ).toBeCloseTo(0.55)
    expect(
      effectiveTowerStats(control.state, trapper, TOWERS['trapper'].tiers[0]).rootDuration,
    ).toBeCloseTo(1.8 * 1.2)

    const lastStand = newGame()
    choose(lastStand, 'last-stand')
    const front = lastStand.build('archer', 5, 3)!
    const back = lastStand.build('archer', 0, 4)!
    expect(
      effectiveTowerStats(lastStand.state, front, TOWERS['archer'].tiers[0]).damage,
    ).toBeCloseTo(7 * 1.2)
    expect(effectiveTowerStats(lastStand.state, back, TOWERS['archer'].tiers[0]).damage).toBe(7)
  })

  it('«Распутица» замедляет врагов, а «Разгрузочный день» уменьшает огров и Горынычей', () => {
    const normal = newGame()
    const normalOgre = placeEnemy(normal, 'ogre', 1)
    const normalBoss = placeEnemy(normal, 'boss', 2)

    const changed = newGame()
    choose(changed, 'rasputitsa')
    choose(changed, 'giant-diet')
    const slowed = placeEnemy(changed, 'rebel', 1)
    const dietOgre = placeEnemy(changed, 'ogre', 2)
    const dietBoss = placeEnemy(changed, 'boss', 3)
    const before = slowed.pathDistance
    changed.step(SIMULATION_STEP)
    expect(slowed.pathDistance - before).toBeCloseTo(slowed.def.speed * 0.85 * SIMULATION_STEP)
    expect(dietOgre.maxHp / normalOgre.maxHp).toBeCloseTo(0.8, 1)
    expect(dietBoss.maxHp).toBe(normalBoss.maxHp)
  })

  it('сводка показывает суммарный эффект повторно выбранных наград', () => {
    expect(
      summarizeRewards([
        { wave: 5, rewardId: 'sharpened-steel' },
        { wave: 10, rewardId: 'sharpened-steel' },
        { wave: 15, rewardId: 'military-engineer' },
        { wave: 19, rewardId: 'military-engineer' },
      ]),
    ).toEqual([
      {
        rewardId: 'sharpened-steel',
        name: 'Заточенные клинки',
        description: '+24% ко всему урону стражей',
        count: 2,
      },
      {
        rewardId: 'military-engineer',
        name: 'Военный инженер',
        description: '−51% к цене улучшений',
        count: 2,
      },
    ])
  })
})
