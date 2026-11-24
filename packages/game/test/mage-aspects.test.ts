import { describe, expect, it } from 'vitest'
import {
  BOILING_OIL,
  SIMULATION_STEP,
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
import { damageEnemy, updateBurning, updateOilPuddles, updateShots } from '../src/systems/combat.ts'
import { moveEnemies } from '../src/systems/enemies.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

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
    expect(ogre.burnDamageLeft).toBeCloseTo(70.38)
    game.sell(5, 11)
    const hp = ogre.hp
    for (let i = 0; i < 60; i++) game.step(SIMULATION_STEP)
    expect(hp - ogre.hp).toBeCloseTo(35.19)
    for (let i = 0; i < 61; i++) game.step(SIMULATION_STEP)
    expect(hp - ogre.hp).toBeCloseTo(70.38)
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
    expect(primary.burnDamageLeft).toBeCloseTo(61.2)
    expect(primary.slowTimeLeft).toBe(0)
    hit(game, mage, primary)
    expect(game.state.oilPuddles).toHaveLength(1)
    expect(game.state.oilPuddles[0]).toMatchObject({ radius: 0.75, timeLeft: 3 })
    game.sell(5, 11)

    const entrant = placeEnemy(game, 'rebel', 2)
    game.step(0.25)
    expect(entrant.pathDistance).toBeCloseTo(2 + 0.25 * 0.8)
    expect(entrant.oilTimeLeft).toBeCloseTo(2)
    expect(entrant.burnDamageLeft).toBe(0)
    expect(primary.maxHp - primary.hp).toBeCloseTo((61.2 / 5) * 0.25 * 1.3)
    expect(far.oilTimeLeft).toBe(0)
    for (let i = 0; i < 11; i++) game.step(0.25)
    expect(game.state.oilPuddles).toEqual([])
    expect(entrant.oilTimeLeft).toBeGreaterThan(0)
    for (let i = 0; i < 8; i++) game.step(0.25)
    expect(entrant.oilTimeLeft).toBe(0)
  })

  it('масло усиливает уже горящую цель только на время покрытия и не меняет прочий урон', () => {
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
    expect(ogre.burnDamageLeft).toBeCloseTo((70.38 / 2) * 1.3 * 1.5)
    damageEnemy(world, ogre, 10, 'physical')
    expect(hp - ogre.hp).toBeCloseTo(10)
    updateBurning(world, 1.5)
    expect(hp - ogre.hp).toBeCloseTo(10 + (70.38 / 2) * 1.3 * 1.5 * 1.3)
    expect(ogre.burnDamageLeft).toBe(0)
    expect(ogre.oilTimeLeft).toBe(0.5)

    const normal = buildMage(game, 7)
    hit(game, normal, ogre)
    const lastHp = ogre.hp
    updateBurning(world, 5)
    expect(lastHp - ogre.hp).toBeCloseTo((61.2 / 5) * 1.3 * (5 + 0.5 * 0.3))
  })

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
})

describe('прогноз горения на полосе здоровья', () => {
  function compareWithBattle(game: Game, enemy: Enemy) {
    const before = { ...enemy }
    const puddles = game.state.oilPuddles.map((puddle) => ({ ...puddle }))
    const forecast = forecastBurnDamage(
      enemy,
      game.level.path,
      game.state.oilPuddles,
      rewardStats(game.state),
    )
    expect(enemy).toEqual(before)
    expect(game.state.oilPuddles).toEqual(puddles)
    const steps = Math.ceil(before.burnTimeLeft / SIMULATION_STEP) + 1
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

  it('считает вход в перекрывающиеся лужи после сети и окончание проклятия', () => {
    const game = newGame()
    game.state.wave = 20
    game.state.selectedRewards = [
      { rewardId: 'rasputitsa', wave: 5 },
      { rewardId: 'sharpened-steel', wave: 10 },
    ]
    const enemy = placeEnemy(game, 'armor', 2)
    Object.assign(enemy, {
      burnTimeLeft: 5,
      burnDamageLeft: 61.2,
      rootTimeLeft: 0.3,
      curseTimeLeft: 1.5,
      curseAmount: 0.3,
    })
    for (const distance of [3, 3.4]) {
      const [x, y] = game.level.path.positionAt(distance)
      game.state.oilPuddles.push({ x, y, pathDistance: distance, radius: 0.75, timeLeft: 2.5 })
    }
    expect(compareWithBattle(game, enemy)).toBeGreaterThan(61.2)
  })

  it('ограничивает прогноз уроном до прорыва к трону', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'ogre', game.level.path.length - 0.2)
    Object.assign(enemy, { burnTimeLeft: 2, burnDamageLeft: 70.38, oilTimeLeft: 0.2 })
    const fullBurn = pendingBurnDamage(enemy)
    const forecast = compareWithBattle(game, enemy)
    expect(enemy.isDead).toBe(true)
    expect(forecast).toBeGreaterThan(0)
    expect(forecast).toBeLessThan(fullBurn)
  })
})
