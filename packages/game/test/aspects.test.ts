import { describe, expect, it } from 'vitest'
import {
  ENEMIES,
  REFUND_RATE,
  SIMULATION_STEP,
  investedGold,
  isFullRefund,
  refundFor,
  towerAspect,
  towerStats,
  type Enemy,
  type Game,
  type Phase,
  type Tower,
} from '../src/index.ts'
import { damageEnemy, updateShots } from '../src/systems/combat.ts'
import { moveEnemies } from '../src/systems/enemies.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

const ASPECT_COST = 180
const BASE_COST = 510

function setUp(aspectId?: string) {
  const game = newGame()
  game.state.gold = 5000
  game.state.wave = 20
  const tower = game.build('ballista', 5, 11)!
  game.upgrade(tower.col, tower.row)
  game.upgrade(tower.col, tower.row)
  if (aspectId) expect(game.specialize(tower.col, tower.row, aspectId)).toBe(true)
  return { game, tower }
}

function targetAt(game: Game, tower: Tower, id: string, offset = 1): Enemy {
  const enemy = placeEnemy(game, id)
  enemy.x = tower.x - offset
  enemy.y = tower.y
  return enemy
}

function shoot(game: Game, tower: Tower, target: Enemy) {
  tower.def.fire!(worldOf(game), tower, target, towerStats(tower))
  const shot = game.state.shots.at(-1)
  if (shot?.kind !== 'line') throw new Error('Ожидался болт Баллисты')
  return shot
}

describe('покупка специализации', () => {
  it('два аспекта после III, базовые характеристики и режим цели не меняются', () => {
    const { game, tower } = setUp()
    const stats = towerStats(tower)
    const gold = game.state.gold
    expect(tower.def.aspects?.map((aspect) => aspect.id)).toEqual(['giant-slayer', 'armor-breaker'])
    expect(game.specialize(tower.col, tower.row, 'giant-slayer')).toBe(true)
    expect(game.state.gold).toBe(gold - ASPECT_COST)
    expect(tower.aspectId).toBe('giant-slayer')
    expect(tower.aspectLocked).toBe(false)
    expect(towerAspect(tower)?.name).toBe('Сокрушитель')
    expect(towerStats(tower)).toBe(stats)
    expect(tower.tier).toBe(2)
    expect(tower.targetMode).toBe('first')
    expect(game.upgrade(tower.col, tower.row)).toBe(false)
  })

  it('нельзя купить до III или для башни без аспектов', () => {
    const game = newGame()
    game.state.gold = 5000
    const ballista = game.build('ballista', 5, 11)!
    const archer = game.build('archer', 6, 11)!
    for (let tier = 0; tier < 2; tier++) {
      expect(game.specialize(ballista.col, ballista.row, 'giant-slayer')).toBe(false)
      game.upgrade(ballista.col, ballista.row)
      game.upgrade(archer.col, archer.row)
    }
    expect(game.specialize(archer.col, archer.row, 'giant-slayer')).toBe(false)
    expect(game.specialize(ballista.col, ballista.row, 'giant-slayer')).toBe(true)
  })

  it.each<Phase>(['idle', 'wave', 'lost', 'won'])(
    'фаза %s: покупка и отмена запрещены, в том числе на паузе',
    (phase) => {
      const { game, tower } = setUp()
      game.state.phase = phase
      game.state.isPaused = true
      const gold = game.state.gold
      expect(game.specialize(tower.col, tower.row, 'giant-slayer')).toBe(false)
      expect(game.state.gold).toBe(gold)
      game.state.phase = 'build'
      game.specialize(tower.col, tower.row, 'giant-slayer')
      game.state.phase = phase
      expect(game.undoSpecialization(tower.col, tower.row)).toBe(false)
    },
  )

  it('не принимает чужие id, отсутствующую башню и покупку без золота', () => {
    const { game, tower } = setUp()
    const gold = game.state.gold
    for (const id of ['missing', '__proto__', 'constructor', null, 1, ['giant-slayer']]) {
      expect(game.specialize(tower.col, tower.row, id as string)).toBe(false)
    }
    expect(game.specialize(0, 0, 'giant-slayer')).toBe(false)
    expect(game.specialize(-1, 0, 'giant-slayer')).toBe(false)
    expect(game.undoSpecialization(0, 0)).toBe(false)
    expect(game.undoSpecialization(tower.col, tower.row)).toBe(false)
    expect(game.state.gold).toBe(gold)
    game.state.gold = ASPECT_COST - 1
    expect(game.specialize(tower.col, tower.row, 'giant-slayer')).toBe(false)
    expect(game.state.gold).toBe(ASPECT_COST - 1)
  })

  it('на одной башне только один аспект, разные башни могут выбрать разные', () => {
    const { game, tower } = setUp('giant-slayer')
    const gold = game.state.gold
    expect(game.specialize(tower.col, tower.row, 'giant-slayer')).toBe(false)
    expect(game.specialize(tower.col, tower.row, 'armor-breaker')).toBe(false)
    expect(game.state.gold).toBe(gold)
    const other = game.build('ballista', 6, 11)!
    game.upgrade(other.col, other.row)
    game.upgrade(other.col, other.row)
    expect(game.specialize(other.col, other.row, 'armor-breaker')).toBe(true)
    expect([tower.aspectId, other.aspectId]).toEqual(['giant-slayer', 'armor-breaker'])
  })

  it('покупка сообщает об улучшении, новая партия сбрасывает аспекты', () => {
    const { game, tower } = setUp()
    const upgraded: Tower[] = []
    game.on('upgrade', (current) => upgraded.push(current))
    game.specialize(tower.col, tower.row, 'giant-slayer')
    expect(upgraded).toEqual([tower])
    game.reset()
    game.state.gold = 1000
    const fresh = game.build('ballista', tower.col, tower.row)!
    expect(fresh.aspectId).toBeNull()
    expect(fresh.aspectLocked).toBe(false)
  })
})

describe('отмена аспекта и продажа', () => {
  it('до первого боя стоимость аспекта входит в полный возврат', () => {
    const { game, tower } = setUp('giant-slayer')
    expect(investedGold(tower.def, tower.tier)).toBe(BASE_COST)
    expect(investedGold(tower.def, tower.tier, tower.aspectId)).toBe(BASE_COST + ASPECT_COST)
    expect(isFullRefund(tower)).toBe(true)
    expect(refundFor(tower)).toBe(BASE_COST + ASPECT_COST)
    expect(game.sell(tower.col, tower.row)).toBe(BASE_COST + ASPECT_COST)
    expect(game.state.gold).toBe(5000)
  })

  it('отменяет только аспект, повторные отмены и смена выбора не создают золото', () => {
    const { game, tower } = setUp()
    const gold = game.state.gold
    for (const id of ['giant-slayer', 'armor-breaker', 'giant-slayer']) {
      expect(game.specialize(tower.col, tower.row, id)).toBe(true)
      expect(game.undoSpecialization(tower.col, tower.row)).toBe(true)
      expect(game.undoSpecialization(tower.col, tower.row)).toBe(false)
      expect(game.state.gold).toBe(gold)
      expect(tower.goldSinceLastWave).toBe(BASE_COST)
      expect(refundFor(tower)).toBe(BASE_COST)
      expect(tower.aspectId).toBeNull()
    }
  })

  it('после начала волны аспект закрепляется и продаётся на общих условиях', () => {
    const { game, tower } = setUp('giant-slayer')
    game.state.wave = 19
    game.startWave()
    expect(tower.aspectLocked).toBe(true)
    expect(tower.goldSinceLastWave).toBe(0)
    expect(isFullRefund(tower)).toBe(false)
    expect(refundFor(tower)).toBe(Math.floor((BASE_COST + ASPECT_COST) * REFUND_RATE))
    expect(game.undoSpecialization(tower.col, tower.row)).toBe(false)
    game.state.spawnQueue = []
    game.step(SIMULATION_STEP)
    expect(game.state.phase).toBe('reward')
    expect(game.chooseReward(game.state.pendingReward!.options[0])).toBe(true)
    expect(game.state.phase).toBe('build')
    expect(game.undoSpecialization(tower.col, tower.row)).toBe(false)
    expect(game.specialize(tower.col, tower.row, 'armor-breaker')).toBe(false)
  })

  it('старую башню с новым аспектом продаёт за 60% башни + 100% аспекта', () => {
    const { game, tower } = setUp()
    game.state.wave = 19
    game.startWave()
    game.state.spawnQueue = []
    game.step(SIMULATION_STEP)
    expect(game.chooseReward(game.state.pendingReward!.options[0])).toBe(true)
    const baseRefund = Math.floor(BASE_COST * REFUND_RATE)
    game.specialize(tower.col, tower.row, 'armor-breaker')
    expect(refundFor(tower)).toBe(baseRefund + ASPECT_COST)
    expect(isFullRefund(tower)).toBe(false)
    game.undoSpecialization(tower.col, tower.row)
    expect(tower.goldSinceLastWave).toBe(0)
    expect(refundFor(tower)).toBe(baseRefund)
    game.specialize(tower.col, tower.row, 'giant-slayer')
    expect(game.sell(tower.col, tower.row)).toBe(baseRefund + ASPECT_COST)
  })
})

describe('Сокрушитель', () => {
  it('исполины — только огр, Горыныч и Узурпатор', () => {
    expect(
      Object.values(ENEMIES)
        .filter((enemy) => enemy.isGiant)
        .map((enemy) => enemy.id),
    ).toEqual(['ogre', 'gorynych', 'boss'])
  })

  it.each(Object.keys(ENEMIES))('%s: бонус определяется типом каждого задетого врага', (id) => {
    const { game, tower } = setUp('giant-slayer')
    const enemy = targetAt(game, tower, id)
    const shot = shoot(game, tower, enemy)
    expect(shot.speed).toBe(18)
    expect(shot.piercesLeft).toBe(2)
    expect(shot.distanceLeft).toBeCloseTo(3.1 * 1.15)
    expect(shot.armorBreakDuration).toBe(0)
    updateShots(worldOf(game), 0.2)
    const damage = enemy.def.isGiant ? 312 : 195
    expect(enemy.maxHp - enemy.hp).toBeCloseTo(damage - enemy.def.armor * 0.5)
    expect(enemy.armorBreakTimeLeft).toBe(0)
  })

  it.each(['rebel', 'ogre'])(
    'один болт задевает мелкого и исполина: выбранная цель %s не меняет бонус второго попадания',
    (targetId) => {
      const { game, tower } = setUp('giant-slayer')
      const rebel = targetAt(game, tower, 'rebel', 0.8)
      const ogre = targetAt(game, tower, 'ogre', 1.8)
      shoot(game, tower, targetId === 'rebel' ? rebel : ogre)
      updateShots(worldOf(game), 0.2)
      expect(rebel.maxHp - rebel.hp).toBeCloseTo(195)
      expect(ogre.maxHp - ogre.hp).toBeCloseTo(312)
    },
  )

  it('бонус учитывает броню и проклятие, но не даёт его обычной Баллисте', () => {
    const { game, tower } = setUp()
    const boss = targetAt(game, tower, 'boss')
    shoot(game, tower, boss)
    updateShots(worldOf(game), 0.2)
    expect(boss.maxHp - boss.hp).toBeCloseTo(193)
    game.state.shots = []
    boss.hp = boss.maxHp
    boss.curseAmount = 0.4
    boss.curseTimeLeft = 10
    game.specialize(tower.col, tower.row, 'giant-slayer')
    shoot(game, tower, boss)
    updateShots(worldOf(game), 0.2)
    expect(boss.maxHp - boss.hp).toBeCloseTo((312 - 2) * 1.4)
  })

  it('болт сохраняет аспект при выстреле, даже если затем башню продали', () => {
    const { game, tower } = setUp('giant-slayer')
    const boss = targetAt(game, tower, 'boss')
    shoot(game, tower, boss)
    game.sell(tower.col, tower.row)
    updateShots(worldOf(game), 0.2)
    expect(boss.maxHp - boss.hp).toBeCloseTo(310)
  })

  it('уже выпущенный обычный болт не получает купленный позже аспект', () => {
    const { game, tower } = setUp()
    const boss = targetAt(game, tower, 'boss')
    shoot(game, tower, boss)
    game.specialize(tower.col, tower.row, 'giant-slayer')
    updateShots(worldOf(game), 0.2)
    expect(boss.maxHp - boss.hp).toBeCloseTo(193)
  })
})

describe('Раскол лат', () => {
  it.each(['armor', 'gorynych', 'boss'])('%s: снимает броню уже для самого попадания', (id) => {
    const { game, tower } = setUp('armor-breaker')
    const enemy = targetAt(game, tower, id)
    shoot(game, tower, enemy)
    updateShots(worldOf(game), 0.2)
    expect(enemy.maxHp - enemy.hp).toBeCloseTo(195)
    expect(enemy.armorBreakTimeLeft).toBe(4)
    expect(ENEMIES[id].armor).toBeGreaterThan(0)
  })

  it('снятие брони действует для обоих пробитых врагов, но не для остальных экземпляров', () => {
    const { game, tower } = setUp('armor-breaker')
    const first = targetAt(game, tower, 'armor', 0.8)
    const second = targetAt(game, tower, 'boss', 1.8)
    const missed = targetAt(game, tower, 'armor', 2)
    missed.y += 2
    shoot(game, tower, first)
    updateShots(worldOf(game), 0.2)
    expect([
      first.armorBreakTimeLeft,
      second.armorBreakTimeLeft,
      missed.armorBreakTimeLeft,
    ]).toEqual([4, 4, 0])
    damageEnemy(worldOf(game), missed, 19, 'physical')
    expect(missed.maxHp - missed.hp).toBeCloseTo(14)
  })

  it('помогает физическому и пробивающему урону союзников, после 4 с броня возвращается', () => {
    const { game, tower } = setUp('armor-breaker')
    const enemy = targetAt(game, tower, 'armor')
    shoot(game, tower, enemy)
    updateShots(worldOf(game), 0.2)
    const before = enemy.hp
    damageEnemy(worldOf(game), enemy, 19, 'physical')
    damageEnemy(worldOf(game), enemy, 75, 'piercing')
    expect(before - enemy.hp).toBeCloseTo(19 + 75)
    moveEnemies(worldOf(game), 3.9)
    expect(enemy.armorBreakTimeLeft).toBeCloseTo(0.1)
    moveEnemies(worldOf(game), 0.1 + SIMULATION_STEP)
    expect(enemy.armorBreakTimeLeft).toBe(0)
    const after = enemy.hp
    damageEnemy(worldOf(game), enemy, 19, 'physical')
    damageEnemy(worldOf(game), enemy, 75, 'piercing')
    expect(after - enemy.hp).toBeCloseTo(14 + 72.5)
    expect(enemy.def.armor).toBe(5)
  })

  it('повторные попадания двух Баллист обновляют срок, а не складывают его', () => {
    const { game, tower } = setUp('armor-breaker')
    const other = game.build('ballista', 6, 11)!
    game.upgrade(other.col, other.row)
    game.upgrade(other.col, other.row)
    game.specialize(other.col, other.row, 'armor-breaker')
    const enemy = targetAt(game, tower, 'boss')
    shoot(game, tower, enemy)
    updateShots(worldOf(game), 0.2)
    moveEnemies(worldOf(game), 2)
    expect(enemy.armorBreakTimeLeft).toBe(2)
    game.state.shots = []
    enemy.x = other.x - 1
    enemy.y = other.y
    shoot(game, other, enemy)
    updateShots(worldOf(game), 0.2)
    expect(enemy.armorBreakTimeLeft).toBe(4)
    moveEnemies(worldOf(game), 4)
    expect(enemy.armorBreakTimeLeft).toBe(0)
  })

  it.each(['rebel', 'scout', 'healer', 'snakelet', 'ogre'])(
    '%s: без брони урон не усиливается и статус не накладывается',
    (id) => {
      const { game, tower } = setUp('armor-breaker')
      const enemy = targetAt(game, tower, id)
      shoot(game, tower, enemy)
      updateShots(worldOf(game), 0.2)
      expect(enemy.maxHp - enemy.hp).toBeCloseTo(195)
      expect(enemy.armorBreakTimeLeft).toBe(0)
    },
  )

  it('магический урон не меняется; сопротивления и броня других врагов не затронуты', () => {
    const { game, tower } = setUp('armor-breaker')
    const enemy = targetAt(game, tower, 'boss')
    const before = { ...ENEMIES['boss'] }
    shoot(game, tower, enemy)
    updateShots(worldOf(game), 0.2)
    const hp = enemy.hp
    damageEnemy(worldOf(game), enemy, 30, 'magic')
    expect(hp - enemy.hp).toBeCloseTo(30)
    expect(ENEMIES['boss']).toEqual(before)
    const fresh = placeEnemy(game, 'boss')
    expect(fresh.armorBreakTimeLeft).toBe(0)
    expect(fresh.def.armor).toBe(4)
  })
})
