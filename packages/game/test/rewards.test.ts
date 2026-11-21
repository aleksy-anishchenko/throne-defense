import { describe, expect, it } from 'vitest'
import {
  ENEMIES,
  REWARDS,
  REWARD_LIST,
  REWARD_WAVES,
  SIMULATION_STEP,
  TOWERS,
  effectiveTowerStats,
  fireRateContributionsOf,
  hpMultiplier,
  refundFor,
  rewardDescriptionForWave,
  rewardRerollCost,
  rewardSetCounts,
  rewardStats,
  rollRewardOptions,
  summarizeRewards,
  towerInvestedGold,
  towerStats,
  upgradeCost,
  type PendingReward,
  type RewardId,
  type Tower,
} from '../src/index.ts'
import { damageEnemy, frostPulse, updateShots } from '../src/systems/combat.ts'
import { moveEnemies, updateHealers } from '../src/systems/enemies.ts'
import { updateTowers } from '../src/systems/towers.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

function choose(
  game: ReturnType<typeof newGame>,
  rewardId: RewardId,
  wave = REWARD_WAVES[game.state.selectedRewards.length],
) {
  game.state.phase = 'reward'
  game.state.pendingReward = {
    kind: 'wave',
    wave,
    options: [rewardId],
    rerolls: 0,
  }
  expect(game.chooseReward(rewardId)).toBe(true)
}

function finishWave(game: ReturnType<typeof newGame>, wave: number, leakingEnemy?: string) {
  game.state.wave = wave
  game.state.waveTime = 0
  game.state.spawnQueue = []
  game.state.enemies = []
  game.state.phase = 'wave'
  if (leakingEnemy) placeEnemy(game, leakingEnemy, game.level.path.length)
  game.step(SIMULATION_STEP)
}

function waveOffer(game: ReturnType<typeof newGame>) {
  const offer = game.state.pendingReward
  if (offer?.kind !== 'wave') throw new Error('Ожидался выбор после волны')
  return offer
}

describe('благословения после волн', () => {
  it('рубежи — только после волн 5, 10, 15, 20, 25 и 29', () => {
    expect(REWARD_WAVES).toEqual([5, 10, 15, 20, 25, 29])
    expect(REWARD_LIST).toHaveLength(18)
    expect(REWARD_LIST.filter((reward) => reward.rarity === 'common')).toHaveLength(7)
    expect(REWARD_LIST.filter((reward) => reward.rarity === 'rare')).toHaveLength(6)
    expect(REWARD_LIST.filter((reward) => reward.rarity === 'legendary')).toHaveLength(5)
  })

  it('в бесконечном режиме выходит не больше шести знахарей', () => {
    const game = newGame()
    for (const wave of [31, 35, 39, 50]) {
      const healers = game
        .waveGroups(wave)
        .filter(([enemyId]) => enemyId === 'healer')
        .reduce((sum, [, count]) => sum + count, 0)
      expect(healers).toBeLessThanOrEqual(6)
    }
  })

  it.each(REWARD_WAVES)(
    'после %i-й волны без урона за отрезок предлагает три разные награды',
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

  it('урон лишает награды только на текущем отрезке, даже на последней волне отрезка', () => {
    const game = newGame()
    const missed: { firstWave: number; lastWave: number }[] = []
    game.on('rewardMissed', (segment) => missed.push(segment))

    finishWave(game, 3, 'rebel')
    finishWave(game, 5)
    expect(game.state.lives).toBe(19)
    expect(game.state.phase).toBe('build')
    expect(game.state.wave).toBe(6)
    expect(game.state.pendingReward).toBeNull()

    finishWave(game, 10)
    const pick = waveOffer(game).options.find((id) => id !== 'field-medic')!
    expect(game.chooseReward(pick)).toBe(true)
    expect(game.state.lives).toBe(19)

    finishWave(game, 15, 'armor')
    expect(game.state.phase).toBe('build')
    expect(game.state.pendingReward).toBeNull()
    expect(game.state.lives).toBe(17)
    expect(game.state.selectedRewards).toMatchObject([{ wave: 10, rewardId: pick }])
    expect(missed).toEqual([
      { firstWave: 1, lastWave: 5 },
      { firstWave: 11, lastWave: 15 },
    ])

    finishWave(game, 20)
    expect(waveOffer(game).wave).toBe(20)
  })

  it('восстановление жизней не стирает прорыв, новая партия сбрасывает историю урона', () => {
    const game = newGame()
    finishWave(game, 27, 'rebel')
    game.state.lives = game.state.maxLives
    finishWave(game, 29)
    expect(game.state.pendingReward).toBeNull()
    expect(game.state.wave).toBe(30)

    game.reset()
    expect(game.state.lastThroneDamageWave).toBe(0)
    finishWave(game, 5)
    expect(waveOffer(game).wave).toBe(5)
  })

  it.each([19, 28, 31, 35])('после %i-й волны нет рубежа с наградой', (wave) => {
    const game = newGame()
    game.state.isEndless = wave > game.level.waveCount
    finishWave(game, wave)
    expect(game.state.phase).toBe('build')
    expect(game.state.pendingReward).toBeNull()
  })

  it('все благословения могут выпасть на каждом рубеже при полном здоровье', () => {
    const game = newGame()
    for (const wave of REWARD_WAVES) {
      const offered = new Set<RewardId>()
      for (let seed = 0; seed < 256; seed++) {
        game.state.rewardSeed = seed
        for (const id of rollRewardOptions(game.state, wave, game.level.def.id)) offered.add(id)
      }
      expect(offered, `награды после волны ${wave}`).toEqual(
        new Set(REWARD_LIST.map((reward) => reward.id)),
      )
    }
  })

  it('«Целебный обоз» можно выбрать на первом рубеже с полным здоровьем', () => {
    const game = newGame()
    game.state.rewardSeed = 2
    finishWave(game, 5)
    expect(game.state.lives).toBe(game.state.maxLives)
    expect(waveOffer(game).options).toContain('field-medic')
    expect(game.chooseReward('field-medic')).toBe(true)
    expect(game.state.lives).toBe(game.state.maxLives)
    expect(game.state.phase).toBe('build')
  })

  it('одинаковое состояние партии даёт одинаковый выбор', () => {
    const first = newGame()
    const second = newGame()
    finishWave(first, 5)
    finishWave(second, 5)
    expect(first.state.pendingReward?.options).toEqual(second.state.pendingReward?.options)
  })

  it('шанс легендарки около 15% на место и 45% на окно, включая платное обновление', () => {
    const game = newGame()
    const sampleSize = 4096
    const legendaryBySlot = [0, 0, 0]
    const previousOffers = [0, 0]
    const legendaryAfterReroll = [0, 0]
    const offers = new Set<string>()
    for (let seed = 0; seed < sampleSize; seed++) {
      game.state.rewardSeed = Math.imul(seed, 2654435761) >>> 0
      const options = rollRewardOptions(game.state, 29, game.level.def.id)
      offers.add(options.join(','))
      const legendary = options.filter((id) => REWARDS[id].rarity === 'legendary')
      expect(legendary.length).toBeLessThanOrEqual(1)
      if (legendary.length) legendaryBySlot[options.indexOf(legendary[0])]++
      previousOffers[legendary.length]++

      const rerolled = rollRewardOptions(game.state, 29, game.level.def.id, {
        kind: 'wave',
        wave: 29,
        options,
        rerolls: 0,
      })
      if (rerolled.some((id) => REWARDS[id].rarity === 'legendary')) {
        legendaryAfterReroll[legendary.length]++
      }
    }
    expect(offers.size).toBeGreaterThan(1)
    for (const count of legendaryBySlot) {
      expect(count / sampleSize).toBeGreaterThan(0.13)
      expect(count / sampleSize).toBeLessThan(0.17)
    }
    for (const [index, count] of legendaryAfterReroll.entries()) {
      const chance = count / previousOffers[index]
      expect(chance).toBeGreaterThan(0.41)
      expect(chance).toBeLessThan(0.49)
    }
  })

  it('первые три обновления на каждом рубеже дорожают с шагом 20 золота', () => {
    expect(
      REWARD_WAVES.map((wave) => [0, 1, 2].map((rerolls) => rewardRerollCost(wave, rerolls))),
    ).toEqual([
      [60, 80, 100],
      [80, 100, 120],
      [100, 120, 140],
      [120, 140, 160],
      [140, 160, 180],
      [160, 180, 200],
    ])
  })

  it('обновляет три карточки за золото, повышает цену и сбрасывает её на следующем рубеже', () => {
    const game = newGame()
    game.state.gold = 500
    finishWave(game, 10)
    const first = waveOffer(game)
    const gold = game.state.gold
    expect(rewardRerollCost(first.wave, first.rerolls)).toBe(80)
    expect(game.rerollRewards()).toBe(true)
    const second = waveOffer(game)
    expect(second.wave).toBe(10)
    expect(game.state.phase).toBe('reward')
    expect(game.state.gold).toBe(gold - 80)
    expect(game.state.selectedRewards).toEqual([])
    expect(second.options).toHaveLength(3)
    expect(second.options.every((id) => !first.options.includes(id))).toBe(true)
    expect(game.chooseReward(first.options[0])).toBe(false)

    expect(rewardRerollCost(second.wave, second.rerolls)).toBe(100)
    expect(game.rerollRewards()).toBe(true)
    expect(game.state.gold).toBe(gold - 80 - 100)
    const third = game.state.pendingReward!
    expect(third.options.every((id) => !second.options.includes(id))).toBe(true)
    expect(new Set(third.options).size).toBe(3)

    expect(game.chooseReward(third.options[0])).toBe(true)
    finishWave(game, 15)
    const nextCheckpoint = waveOffer(game)
    expect(nextCheckpoint.rerolls).toBe(0)
    expect(rewardRerollCost(nextCheckpoint.wave, nextCheckpoint.rerolls)).toBe(100)
  })

  it('сохраняет карточки и золото при отказе и принимает точную цену', () => {
    const game = newGame()
    expect(game.rerollRewards()).toBe(false)
    finishWave(game, 5)
    const offer = game.state.pendingReward
    game.state.gold = 59
    expect(game.rerollRewards()).toBe(false)
    expect(game.state.gold).toBe(59)
    expect(game.state.pendingReward).toBe(offer)

    game.state.gold = 60
    expect(game.rerollRewards()).toBe(true)
    expect(game.state.gold).toBe(0)
    expect(game.rerollRewards()).toBe(false)
    expect(waveOffer(game).rerolls).toBe(1)
  })

  it('принимает только награду из предложенных и возвращает к строительству', () => {
    const game = newGame()
    finishWave(game, 5)
    const options = game.state.pendingReward!.options
    const rejected = REWARD_LIST.find(({ id }) => !options.includes(id))!.id
    expect(game.chooseReward(rejected)).toBe(false)
    expect(game.state.phase).toBe('reward')

    expect(game.chooseReward(options[0])).toBe(true)
    expect(game.state.phase).toBe('build')
    expect(game.state.pendingReward).toBeNull()
    expect(game.state.selectedRewards).toMatchObject([{ wave: 5, rewardId: options[0] }])
    expect(game.chooseReward(options[0])).toBe(false)
  })

  it.each([
    { wave: 5, payout: 140 },
    { wave: 10, payout: 200 },
    { wave: 15, payout: 280 },
    { wave: 20, payout: 360 },
    { wave: 25, payout: 460 },
    { wave: 29, payout: 560 },
  ])(
    '«Военная казна» показывает и выдаёт $payout золота после $wave-й волны',
    ({ wave, payout }) => {
      const game = newGame()
      game.state.wave = wave + 1
      const gold = game.state.gold
      expect(rewardDescriptionForWave('war-chest', wave)).toBe(`+${payout} золота сразу`)
      choose(game, 'war-chest', wave)
      expect(game.state.gold).toBe(gold + payout)
      expect(game.state.selectedRewards).toEqual([
        { wave, rewardId: 'war-chest', goldGranted: payout },
      ])
    },
  )

  it('«Целебный обоз» полностью лечит раненый трон', () => {
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
    expect(hp - enemy.hp).toBeCloseTo(11.8)
    expect(rewardStats(game.state).damageMultiplier).toBeCloseTo(1.18)
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
    expect(upgradeCost(tower, 0.7)).toBe(35)
    expect(game.upgrade(tower.col, tower.row)).toBe(true)
    expect(tower.upgradeGoldPaid).toBe(35)
    expect(towerInvestedGold(tower)).toBe(95)
    expect(refundFor(tower)).toBe(95)
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

  it('«Разгрузочный день» снижает здоровье только боссов и полубоссов', () => {
    const game = newGame()
    choose(game, 'giant-diet', 29)
    game.state.wave = 30
    const waveHealth = hpMultiplier(30, game.level.waveCount)
    const affectedEnemies = new Set(['ogre', 'gorynych', 'general', 'boss'])
    for (const def of Object.values(ENEMIES)) {
      const enemy = placeEnemy(game, def.id)
      const reduction = affectedEnemies.has(def.id) ? 0.8 : 1
      expect(enemy.maxHp, def.id).toBe(Math.round(def.hp * waveHealth * reduction))
      expect(enemy.hp).toBe(enemy.maxHp)
    }
  })

  it('«Ров у трона» замедляет даже Узурпатора, начиная с последней четверти пути', () => {
    const game = newGame()
    choose(game, 'throne-moat', 29)
    game.state.wave = 30
    const moatStart = game.level.path.length * 0.75
    const approach = moatStart - 1
    const rebel = placeEnemy(game, 'rebel', approach)
    const boss = placeEnemy(game, 'boss', moatStart)

    game.step(SIMULATION_STEP)

    expect(rebel.pathDistance - approach).toBeCloseTo(rebel.def.speed * SIMULATION_STEP, 8)
    expect(boss.pathDistance - moatStart).toBeCloseTo(boss.def.speed * 0.88 * SIMULATION_STEP, 8)
  })

  it('«Пустые склянки» уменьшают лечение врагов вдвое вместе с эффектом проклятия', () => {
    const game = newGame()
    choose(game, 'empty-vials')
    const healer = placeEnemy(game, 'healer')
    const armor = placeEnemy(game, 'armor')
    const cursed = placeEnemy(game, 'general')
    const boss = placeEnemy(game, 'boss')
    for (const enemy of [armor, cursed, boss]) enemy.hp = enemy.maxHp / 2
    cursed.curseTimeLeft = 1
    cursed.curseAmount = 0.4
    healer.healCooldownLeft = 0
    const expectedHeal = healer.maxHp * healer.def.heal!.amount * 0.5

    updateHealers(worldOf(game), SIMULATION_STEP)

    expect(armor.hp - armor.maxHp / 2).toBeCloseTo(expectedHeal)
    expect(cursed.hp - cursed.maxHp / 2).toBeCloseTo(expectedHeal * 0.6)
    expect(boss.hp).toBe(boss.maxHp / 2)
  })

  it('«Паника в строю» обновляет три секунды замедления у ближайших врагов', () => {
    const game = newGame()
    choose(game, 'panic-in-formation')
    const world = worldOf(game)
    const fallen = placeEnemy(game, 'rebel')
    const farther = placeEnemy(game, 'rebel', 1.75)
    const outside = placeEnemy(game, 'rebel', 2.5)
    const boss = placeEnemy(game, 'boss', 0.25)
    const rebel = placeEnemy(game, 'rebel', 0.5)
    const frozen = placeEnemy(game, 'rebel', 1)
    frozen.slowFactor = 0.45
    frozen.slowTimeLeft = 4

    damageEnemy(world, fallen, fallen.hp, 'magic')
    expect([boss, rebel, frozen].map((enemy) => enemy.panicTimeLeft)).toEqual([3, 3, 3])
    expect([farther, outside].map((enemy) => enemy.panicTimeLeft)).toEqual([0, 0])

    moveEnemies(world, SIMULATION_STEP)
    expect(boss.pathDistance - 0.25).toBeCloseTo(boss.def.speed * 0.825 * SIMULATION_STEP, 8)
    expect(rebel.pathDistance - 0.5).toBeCloseTo(rebel.def.speed * 0.65 * SIMULATION_STEP, 8)
    expect(frozen.pathDistance - 1).toBeCloseTo(frozen.def.speed * 0.55 * SIMULATION_STEP, 8)
    expect(rebel.panicTimeLeft).toBeCloseTo(3 - SIMULATION_STEP)

    const nextFallen = placeEnemy(game, 'rebel')
    damageEnemy(world, nextFallen, nextFallen.hp, 'magic')
    expect(rebel.panicTimeLeft).toBe(3)
    moveEnemies(world, 3)
    expect(rebel.panicTimeLeft).toBe(0)
  })

  it('повторная «Паника в строю» добавляет одну цель и показывает это в подсказке', () => {
    const game = newGame()
    choose(game, 'panic-in-formation')
    choose(game, 'panic-in-formation')
    const fallen = placeEnemy(game, 'rebel')
    const neighbors = [0.25, 0.5, 1, 1.5, 2.5].map((distance) =>
      placeEnemy(game, 'rebel', distance),
    )

    damageEnemy(worldOf(game), fallen, fallen.hp, 'magic')

    expect(neighbors.map((enemy) => enemy.panicTimeLeft)).toEqual([3, 3, 3, 3, 0])
    expect(summarizeRewards(game.state.selectedRewards)[0].description).toContain('до 4 соседей')
  })

  it.each([1, 2])(
    '«Двойной выстрел» с %i копиями выпускает лишние стрелы на пятой атаке каждого Лучника',
    (copies) => {
      const game = newGame()
      for (let copy = 0; copy < copies; copy++) choose(game, 'double-shot')
      const archer = game.build('archer', 5, 11)!
      const other = game.build('archer', 3, 11)!
      const target = placeEnemy(game, 'boss', 2)
      const world = worldOf(game)
      function fire(tower: Tower) {
        game.state.shots = []
        tower.def.fire!(world, tower, target, towerStats(tower))
        return game.state.shots
      }

      for (let attack = 0; attack < 4; attack++) expect(fire(archer)).toHaveLength(1)
      expect(fire(other)).toHaveLength(1)
      const volley = fire(archer)
      expect(volley).toHaveLength(1 + copies)
      expect(volley.every((shot) => shot.kind === 'homing' && shot.target === target)).toBe(true)
      expect(volley.every((shot) => shot.damage === towerStats(archer).damage)).toBe(true)
      expect(new Set(volley.map((shot) => `${shot.x},${shot.y}`)).size).toBe(volley.length)
      const hp = target.hp
      updateShots(world, 1)
      expect(hp - target.hp).toBeCloseTo(
        (1 + copies) *
          (towerStats(archer).damage - target.def.armor) *
          rewardStats(game.state).damageMultiplier,
        8,
      )
      expect(fire(archer)).toHaveLength(1)
    },
  )

  it('«Два колокола» используют полный сильнейший бонус и половину второго', () => {
    const game = newGame()
    choose(game, 'two-bells')
    game.state.gold = 10_000
    const archer = game.build('archer', 1, 0)!
    const weak = game.build('bell', 0, 0)!
    const strong = game.build('bell', 1, 1)!
    const second = game.build('bell', 2, 0)!
    game.upgrade(strong.col, strong.row)
    game.upgrade(strong.col, strong.row)
    game.upgrade(second.col, second.row)
    const contributions = () =>
      fireRateContributionsOf(game.state.towers, archer, rewardStats(game.state).secondBellShare)
    expect(contributions()).toEqual([
      { source: strong, bonus: 0.4 },
      { source: second, bonus: 0.15 },
    ])
    archer.cooldownLeft = 1
    game.step(SIMULATION_STEP)
    expect(archer.cooldownLeft).toBeCloseTo(1 - SIMULATION_STEP * 1.55, 8)
    game.sell(second.col, second.row)
    expect(contributions()).toEqual([
      { source: strong, bonus: 0.4 },
      { source: weak, bonus: 0.1 },
    ])
    choose(game, 'two-bells')
    expect(contributions()[1].bonus).toBeCloseTo(0.15)
    expect(summarizeRewards(game.state.selectedRewards)[0].description).toContain('75%')
  })

  it('«Лёд и пламя» совмещают горение и мороз в обоих порядках', () => {
    const game = newGame()
    choose(game, 'ice-and-fire')
    game.state.gold = 1000
    const frost = game.build('frost', 5, 11)!
    const mage = game.build('mage', 3, 11)!
    const enemy = placeEnemy(game, 'armor', 2)
    const world = worldOf(game)
    const frostStats = towerStats(frost)
    const mageStats = towerStats(mage)
    frostPulse(world, frost, frostStats)

    mage.def.fire!(world, mage, enemy, mageStats)
    updateShots(world, 1)
    expect(enemy.slowTimeLeft).toBe(frostStats.slowDuration)
    expect(enemy.burnDamageLeft).toBeCloseTo(mageStats.burnDamage!)

    enemy.slowTimeLeft = 0
    frostPulse(world, frost, frostStats)
    expect(enemy.slowTimeLeft).toBe(frostStats.slowDuration)
    expect(enemy.burnDamageLeft).toBeCloseTo(mageStats.burnDamage!)
  })

  it('второе благословение «Гнева стражи» открывает прибавку к общему урону', () => {
    const game = newGame()
    choose(game, 'sharpened-steel')
    expect(rewardStats(game.state).damageMultiplier).toBeCloseTo(1.18)
    choose(game, 'rapid-orders')
    expect(rewardStats(game.state).damageMultiplier).toBeCloseTo(1.28)
    expect(rewardStats(game.state).fireRateMultiplier).toBeCloseTo(1.15)
    choose(game, 'sharpened-steel')
    const enemy = placeEnemy(game, 'rebel', 1.5)
    const hp = enemy.hp
    damageEnemy(worldOf(game), enemy, 10, 'magic')
    expect(hp - enemy.hp).toBeCloseTo(14.6)
  })

  it('второе благословение «Тяжёлого марша» замедляет врагов вместе с «Распутицей»', () => {
    const game = newGame()
    choose(game, 'rasputitsa')
    expect(rewardStats(game.state).enemySpeedMultiplier).toBeCloseTo(0.8)
    choose(game, 'field-medic')
    const enemy = placeEnemy(game, 'rebel')
    game.step(SIMULATION_STEP)
    expect(enemy.pathDistance).toBeCloseTo(enemy.def.speed * 0.8 * 0.95 * SIMULATION_STEP, 8)
  })

  it.each([
    { wave: 10, seed: 1, payout: 200 },
    { wave: 15, seed: 0, payout: 280 },
    { wave: 29, seed: 0, payout: 560 },
  ])('копии собирают «Дар короны» после $wave-й волны', ({ wave, seed, payout }) => {
    const game = newGame()
    choose(game, 'war-chest')
    game.state.rewardSeed = seed
    const offers: PendingReward[] = []
    game.on('rewardOffered', (offer) => offers.push(offer))
    finishWave(game, wave)
    const previous = waveOffer(game)
    const gold = game.state.gold

    expect(game.chooseReward('war-chest')).toBe(true)
    const gift = game.state.pendingReward!
    expect(gift.kind).toBe('crown-gift')
    expect(gift.wave).toBe(wave)
    expect(offers).toEqual([previous, gift])
    expect(game.state.gold).toBe(gold + payout)
    expect(game.state.phase).toBe('reward')
    expect(game.state.wave).toBe(wave + 1)
    expect(game.startWave()).toBe(false)
    expect(gift.options).toHaveLength(2)
    expect(new Set(gift.options).size).toBe(2)
    expect(gift.options.every((id) => REWARDS[id].rarity === 'common')).toBe(true)
    expect(gift.options.every((id) => !previous.options.includes(id))).toBe(true)
    expect(game.rerollRewards()).toBe(false)
    expect(game.chooseReward('war-chest')).toBe(false)
    expect(game.state.pendingReward).toBe(gift)

    const [rewardId, other] = gift.options
    expect(game.chooseReward(rewardId)).toBe(true)
    expect(game.chooseReward(other)).toBe(false)
    expect(game.state.selectedRewards).toHaveLength(3)
    expect(game.state.selectedRewards.at(-1)).toEqual({ wave, rewardId })
    expect(game.state.gold).toBe(gold + payout)
    expect(game.state.pendingReward).toBeNull()
    expect(game.state.phase).toBe('build')
    expect(offers).toHaveLength(2)
  })

  it('«Дар короны» даётся один раз за партию, его карточка засчитывается в другой набор', () => {
    const game = newGame()
    game.state.rewardSeed = 1
    choose(game, 'sharpened-steel')
    choose(game, 'war-chest')
    choose(game, 'war-chest')
    const attackReward = game.state.pendingReward!.options.find(
      (id) => REWARDS[id].setId === 'arsenal',
    )!

    expect(game.chooseReward(attackReward)).toBe(true)
    expect(rewardSetCounts(game.state.selectedRewards).arsenal).toBe(2)
    expect(rewardStats(game.state).damageMultiplier).toBeCloseTo(1.28)
    choose(game, 'war-chest', 20)
    expect(rewardSetCounts(game.state.selectedRewards).supplies).toBe(3)
    expect(game.state.pendingReward).toBeNull()
    game.reset()
    expect(rewardSetCounts(game.state.selectedRewards).supplies).toBe(0)
    choose(game, 'war-chest')
    choose(game, 'war-chest')
    expect(game.state.pendingReward?.kind).toBe('crown-gift')
  })

  it('сводка показывает суммарный эффект повторно выбранных наград', () => {
    expect(
      summarizeRewards([
        { wave: 5, rewardId: 'sharpened-steel' },
        { wave: 10, rewardId: 'sharpened-steel' },
        { wave: 15, rewardId: 'military-engineer' },
        { wave: 20, rewardId: 'military-engineer' },
        { wave: 10, rewardId: 'war-chest' },
        { wave: 29, rewardId: 'war-chest', goldGranted: 560 },
        { wave: 25, rewardId: 'giant-diet' },
      ]),
    ).toEqual([
      {
        rewardId: 'sharpened-steel',
        name: 'Заточенные клинки',
        description: '+36% ко всему урону стражей',
        count: 2,
      },
      {
        rewardId: 'military-engineer',
        name: 'Военный инженер',
        description: '−51% к цене улучшений',
        count: 2,
      },
      {
        rewardId: 'war-chest',
        name: 'Военная казна',
        description: 'Получено 700 золота',
        count: 2,
      },
      {
        rewardId: 'giant-diet',
        name: 'Разгрузочный день',
        description: 'У боссов и полубоссов на 20% меньше здоровья',
        count: 1,
      },
    ])
  })
})
