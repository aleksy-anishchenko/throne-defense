import { describe, expect, it } from 'vitest'
import {
  REWARD_WAVES,
  SIMULATION_STEP,
  maxPossibleScore,
  maxRewardLives,
  rewardStats,
  summarizeRewards,
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
    },
  )

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

  it('сразу выдаёт золото и жизни', () => {
    const goldGame = newGame()
    choose(goldGame, 'war-chest')
    expect(goldGame.state.gold).toBe(270)

    const livesGame = newGame()
    choose(livesGame, 'field-medic')
    expect(livesGame.state.lives).toBe(22)
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
    tower.cooldownLeft = 0.105
    updateTowers(worldOf(game), 0.1)
    expect(game.state.shots).toHaveLength(1)
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
    expect(game.state.gold - gold).toBe(40)
  })

  it('потолок счёта учитывает возможные восемь дополнительных жизней', () => {
    expect(maxRewardLives()).toBe(8)
    const game = newGame()
    const withoutBonusLives = maxPossibleScore(game.level, 20) - maxRewardLives() * 100
    expect(withoutBonusLives).toBeGreaterThan(0)
  })

  it('сводка показывает суммарный эффект повторно выбранных наград', () => {
    expect(
      summarizeRewards([
        { wave: 5, rewardId: 'sharpened-steel' },
        { wave: 10, rewardId: 'sharpened-steel' },
        { wave: 15, rewardId: 'bounty' },
        { wave: 19, rewardId: 'bounty' },
      ]),
    ).toEqual([
      {
        rewardId: 'sharpened-steel',
        name: 'Заточенные клинки',
        description: '+24% ко всему урону стражей',
        count: 2,
      },
      {
        rewardId: 'bounty',
        name: 'Щедрая награда',
        description: '+2 золота за каждого убитого врага',
        count: 2,
      },
    ])
  })
})
