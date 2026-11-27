import { describe, expect, it } from 'vitest'
import {
  BOILING_OIL,
  SIMULATION_STEP,
  burnTimeRemaining,
  effectiveTowerStats,
  forecastBurnDamage,
  pendingBurnDamage,
  rewardStats,
  towerStats,
  type Enemy,
  type Game,
  type MageAspectId,
  type Tower,
} from '../src/index.ts'
import {
  damageEnemy,
  frostPulse,
  updateBurning,
  updateOilPuddles,
  updateShots,
} from '../src/systems/combat.ts'
import { moveEnemies } from '../src/systems/enemies.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

const tierThreeBurn = 73.44
const wildfireBurn = tierThreeBurn * 1.2

function buildMage(game: Game, col: number, aspect?: MageAspectId) {
  const tower = game.build('mage', col, 11)!
  expect(game.upgrade(col, 11) && game.upgrade(col, 11)).toBe(true)
  if (aspect) expect(game.specialize(col, 11, aspect)).toBe(true)
  return tower
}

function hit(game: Game, mage: Tower, enemy: Enemy) {
  const world = worldOf(game)
  mage.def.fire!(world, mage, enemy, effectiveTowerStats(game.state, mage, towerStats(mage)))
  updateShots(world, 2)
  game.state.shots = game.state.shots.filter((shot) => !shot.isDone)
}

describe('два аспекта Огневика', () => {
  it('в настоящей волне синий поджог отрабатывает за две секунды, даже после продажи башни', () => {
    const game = newGame()
    game.state.gold = 450
    const mage = buildMage(game, 5, 'wildfire')
    expect(game.state.gold).toBe(0)
    game.startWave()
    expect(mage.aspectLocked).toBe(true)
    const ogre = placeEnemy(game, 'ogre', 2)
    for (let i = 0; i < 60 && !ogre.wildfire; i++) game.step(SIMULATION_STEP)
    expect(ogre.burnTimeLeft).toBe(2)
    expect(ogre.burnDamageLeft).toBeCloseTo(wildfireBurn, 6)
    game.sell(5, 11)
    const hp = ogre.hp
    for (let i = 0; i < 60; i++) game.step(SIMULATION_STEP)
    expect(hp - ogre.hp).toBeCloseTo(wildfireBurn / 2, 6)
    for (let i = 0; i < 61; i++) game.step(SIMULATION_STEP)
    expect(hp - ogre.hp).toBeCloseTo(wildfireBurn, 6)
    expect(ogre.wildfire).toBe(false)
  })

  it('попадание покрывает всю группу сразу, а лужа замедляет и тех, кто вошёл позже', () => {
    const game = newGame()
    game.state.gold = 1000
    const mage = buildMage(game, 5, 'boiling-oil')
    const primary = placeEnemy(game, 'ogre', 2)
    const near = placeEnemy(game, 'armor', 2.5)
    const far = placeEnemy(game, 'scout', 4)
    hit(game, mage, primary)
    expect([primary.oilTimeLeft, near.oilTimeLeft, far.oilTimeLeft]).toEqual([2, 2, 0])
    expect(primary.oilBurn?.burnDamageLeft).toBeCloseTo(tierThreeBurn)
    expect(primary.slowTimeLeft).toBe(0)
    hit(game, mage, primary)
    expect(game.state.oilPuddles).toHaveLength(1)
    expect(game.state.oilPuddles[0]).toMatchObject({ radius: 0.75, timeLeft: 4 })
    game.sell(5, 11)

    const entrant = placeEnemy(game, 'rebel', 2)
    game.step(0.25)
    expect(entrant.pathDistance).toBeCloseTo(2 + 0.25 * 0.8)
    expect(entrant.oilTimeLeft).toBeCloseTo(2)
    expect(pendingBurnDamage(entrant)).toBe(0)
    expect(primary.maxHp - primary.hp).toBeCloseTo((tierThreeBurn / 5) * 0.25 * 1.3)
    expect(far.oilTimeLeft).toBe(0)
    for (let i = 0; i < 14; i++) game.step(0.25)
    expect(game.state.oilPuddles[0]?.timeLeft).toBe(0.25)
    const lateEntrant = placeEnemy(game, 'rebel', 2)
    game.step(0.25)
    expect(game.state.oilPuddles).toEqual([])
    expect(lateEntrant.oilTimeLeft).toBe(2)
    for (let i = 0; i < 8; i++) game.step(0.25)
    expect(lateEntrant.oilTimeLeft).toBe(0)
  })

  it.each([
    { source: 'обычный огонь', aspect: undefined, rate: tierThreeBurn / 5 },
    { source: 'синее пламя', aspect: 'wildfire', rate: wildfireBurn / 2 },
  ] as const)('лужа усиливает $source другого Огневика на 30%', ({ aspect, rate }) => {
    const game = newGame()
    game.state.gold = 1000
    const oil = buildMage(game, 5, 'boiling-oil')
    const mage = buildMage(game, 6, aspect)
    const world = worldOf(game)
    const first = placeEnemy(game, 'ogre', 1)
    hit(game, oil, first)
    const entrant = placeEnemy(game, 'ogre', 4)
    hit(game, mage, entrant)
    const hp = entrant.hp
    updateBurning(world, 0.25)
    expect(hp - entrant.hp).toBeCloseTo(rate * 0.25, 6)
    Object.assign(entrant, { x: first.x, y: first.y })
    updateOilPuddles(world, 0.25)
    updateBurning(world, 0.25)
    expect(entrant.oilBurn).toBeUndefined()
    expect(hp - entrant.hp).toBeCloseTo(rate * 0.25 + rate * 0.25 * 1.3, 6)
  })

  it.each(['boiling-oil', 'wildfire'] as const)(
    'оба поджога горят независимо, первым попадает %s',
    (first) => {
      const game = newGame()
      game.state.gold = 1000
      const oil = buildMage(game, 5, 'boiling-oil')
      const blue = buildMage(game, 6, 'wildfire')
      const world = worldOf(game)
      const ogre = placeEnemy(game, 'ogre', 2)
      const hp = ogre.hp
      for (const mage of first === 'boiling-oil' ? [oil, blue] : [blue, oil]) hit(game, mage, ogre)

      expect(pendingBurnDamage(ogre, 2)).toBeCloseTo(152.7552, 6)
      updateOilPuddles(world, 2)
      updateBurning(world, 2)
      expect(hp - ogre.hp).toBeCloseTo(152.7552, 6)
      expect(ogre.wildfire).toBe(false)
      expect(ogre.oilBurn?.burnTimeLeft).toBe(3)

      updateOilPuddles(world, 3)
      updateBurning(world, 3)
      expect(hp - ogre.hp).toBeCloseTo((tierThreeBurn + wildfireBurn) * 1.3, 6)
      expect(burnTimeRemaining(ogre)).toBe(0)
    },
  )

  it('масло усиливает оба поджога только на время покрытия и не меняет прочий урон', () => {
    const game = newGame()
    game.state.gold = 2000
    const oil = buildMage(game, 5, 'boiling-oil')
    const blue = buildMage(game, 6, 'wildfire')
    game.state.selectedRewards = [{ rewardId: 'wildfire', wave: 5 }]
    const world = worldOf(game)
    const ogre = placeEnemy(game, 'ogre', 2)
    hit(game, blue, ogre)
    updateBurning(world, 0.5)
    const hp = ogre.hp
    hit(game, oil, ogre)
    expect(ogre.wildfire).toBe(true)
    expect(ogre.burnTimeLeft).toBe(1.5)
    expect(ogre.burnDamageLeft).toBeCloseTo((wildfireBurn / 2) * 1.3 * 1.5)
    damageEnemy(world, ogre, 10, 'physical')
    expect(hp - ogre.hp).toBeCloseTo(10)
    updateBurning(world, 1.5)
    expect(hp - ogre.hp).toBeCloseTo(10 + (wildfireBurn / 2 + tierThreeBurn / 5) * 1.3 * 1.5 * 1.3)
    expect(ogre.burnDamageLeft).toBe(0)
    expect(ogre.oilBurn?.burnTimeLeft).toBe(3.5)
    expect(ogre.oilTimeLeft).toBe(0.5)

    const normal = buildMage(game, 7)
    hit(game, normal, ogre)
    const lastHp = ogre.hp
    updateBurning(world, 5)
    expect(lastHp - ogre.hp).toBeCloseTo((tierThreeBurn / 5) * 1.3 * (5 + 0.5 * 0.3))
  })

  it.each(['boiling-oil', 'wildfire'] as const)(
    'ещё один Огневик с аспектом %s обновляет только свой поджог',
    (aspect) => {
      const game = newGame()
      game.state.gold = 2000
      const oil = buildMage(game, 5, 'boiling-oil')
      const blue = buildMage(game, 6, 'wildfire')
      const another = buildMage(game, 7, aspect)
      const world = worldOf(game)
      const enemy = placeEnemy(game, 'ogre', 2)
      hit(game, oil, enemy)
      hit(game, blue, enemy)
      updateBurning(world, 0.5)
      hit(game, another, enemy)
      expect(enemy.burnTimeLeft).toBe(aspect === 'wildfire' ? 2 : 1.5)
      expect(enemy.oilBurn?.burnTimeLeft).toBe(aspect === 'boiling-oil' ? 5 : 4.5)
      const hp = enemy.hp
      updateBurning(world, 1)
      expect(hp - enemy.hp).toBeCloseTo((tierThreeBurn / 5 + wildfireBurn / 2) * 1.3, 6)
    },
  )

  it('Морозко тушит оба поджога одним импульсом, «Лёд и пламя» сохраняет оба', () => {
    const game = newGame()
    game.state.gold = 1000
    const oil = buildMage(game, 5, 'boiling-oil')
    const blue = buildMage(game, 6, 'wildfire')
    const frost = game.build('frost', 3, 11)!
    const world = worldOf(game)
    const enemy = placeEnemy(game, 'ogre', 2)
    Object.assign(enemy, { x: frost.x, y: frost.y })
    hit(game, oil, enemy)
    hit(game, blue, enemy)
    game.state.selectedRewards = [{ rewardId: 'ice-and-fire', wave: 5 }]
    const pending = pendingBurnDamage(enemy)
    frostPulse(world, frost, towerStats(frost))
    expect(pendingBurnDamage(enemy)).toBe(pending)
    expect(enemy.slowTimeLeft).toBeGreaterThan(0)
    game.state.selectedRewards = []
    frostPulse(world, frost, towerStats(frost))
    expect(burnTimeRemaining(enemy)).toBe(0)
    expect(pendingBurnDamage(enemy)).toBe(0)
    expect(enemy.wildfire).toBe(false)
    expect(enemy.oilTimeLeft).toBe(2)
  })

  it.each(['boiling-oil', 'wildfire'] as const)(
    'обычный Огневик и аспект %s сохраняют один сильнейший поджог в обоих порядках',
    (aspect) => {
      const game = newGame()
      game.state.gold = 1000
      const normal = game.build('mage', 6, 11)!
      const specialized = buildMage(game, 5, aspect)
      for (const order of [
        [normal, specialized],
        [specialized, normal],
      ]) {
        const enemy = placeEnemy(game, 'ogre', 2)
        for (const mage of order) hit(game, mage, enemy)
        const hp = enemy.hp
        updateBurning(worldOf(game), 1)
        const expected = aspect === 'wildfire' ? wildfireBurn / 2 : (tierThreeBurn / 5) * 1.3
        expect(hp - enemy.hp).toBeCloseTo(expected, 6)
      }
    },
  )

  it('перекрытие луж обновляет покрытие, а противник учитывает своё сопротивление', () => {
    const game = newGame()
    const boss = placeEnemy(game, 'boss', 2)
    const world = worldOf(game)
    for (const x of [boss.x, boss.x + 0.1]) {
      game.state.oilPuddles.push({
        x,
        y: boss.y,
        pathDistance: boss.pathDistance,
        radius: 0.75,
        timeLeft: 3,
      })
    }
    updateOilPuddles(world, 0.5)
    moveEnemies(world, 0.5)
    expect(boss.pathDistance - 2).toBeCloseTo(boss.def.speed * 0.5 * 0.9)
    updateBurning(world, 0.5)
    expect(boss.oilTimeLeft).toBe(BOILING_OIL.coatDuration)
    game.reset()
    expect(game.state.oilPuddles).toEqual([])
  })

  it.each([
    { tier: 1, rewards: [], rebelSpeed: 0.5, bossSpeed: 0.75 },
    { tier: 2, rewards: ['rasputitsa'], rebelSpeed: 0.3, bossSpeed: 0.525 },
    { tier: 3, rewards: [], rebelSpeed: 0.3, bossSpeed: 0.65 },
    {
      tier: 3,
      rewards: ['rasputitsa', 'empty-vials', 'field-medic'],
      rebelSpeed: 0.2025,
      bossSpeed: 0.43875,
    },
    {
      tier: 3,
      rewards: ['rasputitsa', 'control-master', 'field-medic'],
      rebelSpeed: 0.2,
      bossSpeed: 0.405,
    },
  ] as const)(
    'масло и Морозко $tier оставляют бунтовщику долю скорости $rebelSpeed с учётом благословений',
    ({ tier, rewards, rebelSpeed, bossSpeed }) => {
      const game = newGame()
      game.state.gold = 1000
      game.state.selectedRewards = rewards.map((rewardId, i) => ({ rewardId, wave: (i + 1) * 5 }))
      const mage = buildMage(game, 5, 'boiling-oil')
      const frost = game.build('frost', 3, 11)!
      for (let level = 1; level < tier; level++) expect(game.upgrade(3, 11)).toBe(true)
      const rebel = placeEnemy(game, 'rebel', 2)
      const boss = placeEnemy(game, 'boss', 2)

      hit(game, mage, rebel)
      frostPulse(worldOf(game), frost, effectiveTowerStats(game.state, frost, towerStats(frost)))
      game.step(1)

      expect(rebel.pathDistance - 2).toBeCloseTo(rebel.def.speed * rebelSpeed, 8)
      expect(boss.pathDistance - 2).toBeCloseTo(boss.def.speed * bossSpeed, 8)
    },
  )

  it.each([
    { frostTime: 0.25, oilTime: 0.75, distance: 0.25 * 0.2 + 0.5 * 0.6 + 0.25 * 0.75 },
    { frostTime: 0.75, oilTime: 0.25, distance: 0.25 * 0.2 + 0.5 * 0.3 + 0.25 * 0.75 },
  ])(
    'учитывает предел замедления и сроки холода ($frostTime с) и масла ($oilTime с)',
    ({ frostTime, oilTime, distance }) => {
      const game = newGame()
      game.state.selectedRewards = [{ rewardId: 'rasputitsa', wave: 5 }]
      const rebel = placeEnemy(game, 'rebel', 2)
      Object.assign(rebel, { slowFactor: 0.6, slowTimeLeft: frostTime, oilTimeLeft: oilTime })
      game.step(1)
      expect(rebel.pathDistance - 2).toBeCloseTo(distance, 8)
    },
  )
})

describe('прогноз горения на полосе здоровья', () => {
  function compareWithBattle(game: Game, enemy: Enemy) {
    const before = { ...enemy, oilBurn: enemy.oilBurn && { ...enemy.oilBurn } }
    const puddles = game.state.oilPuddles.map((puddle) => ({ ...puddle }))
    const forecast = forecastBurnDamage(
      enemy,
      game.level.path,
      game.state.oilPuddles,
      rewardStats(game.state),
    )
    expect(enemy).toEqual(before)
    expect(game.state.oilPuddles).toEqual(puddles)
    const steps = Math.ceil(burnTimeRemaining(before) / SIMULATION_STEP) + 1
    for (let i = 0; i < steps && !enemy.isDead; i++) game.step(SIMULATION_STEP)
    expect(forecast).toBeCloseTo(before.hp - enemy.hp, 7)
    return forecast
  }

  it.each(['boss', 'scout'])('учитывает, как долго %s идёт через оставленную лужу', (id) => {
    const game = newGame()
    game.state.wave = 20
    game.state.gold = 450
    const mage = buildMage(game, 5, 'boiling-oil')
    const enemy = placeEnemy(game, id, 2)
    hit(game, mage, enemy)
    game.sell(5, 11)
    game.step(SIMULATION_STEP)
    const currentCoatingOnly = pendingBurnDamage(enemy)
    expect(compareWithBattle(game, enemy)).toBeGreaterThan(currentCoatingOnly)
  })

  it('считает оба поджога при входе в лужи после сети и окончании проклятия', () => {
    const game = newGame()
    game.state.wave = 20
    game.state.selectedRewards = [
      { rewardId: 'rasputitsa', wave: 5 },
      { rewardId: 'sharpened-steel', wave: 10 },
    ]
    const enemy = placeEnemy(game, 'armor', 2)
    Object.assign(enemy, {
      wildfire: true,
      burnTimeLeft: 2,
      burnDamageLeft: wildfireBurn,
      oilBurn: { burnTimeLeft: 5, burnDamageLeft: tierThreeBurn },
      rootTimeLeft: 0.3,
      curseTimeLeft: 1.5,
      curseAmount: 0.3,
    })
    for (const distance of [3, 3.4]) {
      const [x, y] = game.level.path.positionAt(distance)
      game.state.oilPuddles.push({ x, y, pathDistance: distance, radius: 0.75, timeLeft: 2.5 })
    }
    expect(compareWithBattle(game, enemy)).toBeGreaterThan(tierThreeBurn)
  })

  it('ограничивает прогноз горения уроном до прорыва даже при максимальном замедлении', () => {
    const game = newGame()
    game.state.selectedRewards = [{ rewardId: 'rasputitsa', wave: 5 }]
    const enemy = placeEnemy(game, 'ogre', game.level.path.length - 0.075)
    Object.assign(enemy, {
      burnTimeLeft: 2,
      burnDamageLeft: wildfireBurn,
      oilTimeLeft: 2,
      slowTimeLeft: 2,
      slowFactor: 0.6,
    })
    const fullBurn = pendingBurnDamage(enemy)
    const forecast = compareWithBattle(game, enemy)
    expect(enemy.isDead).toBe(true)
    expect(forecast).toBeGreaterThan(0)
    expect(forecast).toBeLessThan(fullBurn)
  })
})
