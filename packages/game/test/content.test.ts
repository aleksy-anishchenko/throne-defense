import { describe, expect, it } from 'vitest'
import { ENEMIES, SIMULATION_STEP, TOWERS, waveBonus, type TargetMode } from '../src/index.ts'
import { damageEnemy } from '../src/systems/combat.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

// Выбор цели, знахарь, Змей Горыныч, Звонарь и Казна (баланс v4)

describe('выбор цели', () => {
  /**
   * Лучник у двери (клетка 5,11) и трое в его радиусе:
   * бунтовщик дальше всех прошёл по ковру, огр живучее всех, второй бунтовщик ближе всех к башне
   */
  function setUp(mode: TargetMode) {
    const game = newGame()
    game.build('archer', 5, 11)
    expect(game.setTargetMode(5, 11, mode)).toBe(true)
    const first = placeEnemy(game, 'rebel', 4)
    const strongest = placeEnemy(game, 'ogre', 1.5)
    const nearest = placeEnemy(game, 'rebel', 2)
    game.step(SIMULATION_STEP)
    const shot = game.state.shots[0]
    if (shot?.kind !== 'homing') throw new Error('лучник не выстрелил')
    return { target: shot.target, first, strongest, nearest }
  }

  it('по умолчанию — тот, кто ближе всех к трону', () => {
    const { target, first } = setUp('first')
    expect(target).toBe(first)
  })

  it('«сильного» — тот, у кого больше здоровья', () => {
    const { target, strongest } = setUp('strongest')
    expect(target).toBe(strongest)
  })

  it('«ближнего» — тот, кто ближе всех к башне', () => {
    const { target, nearest } = setUp('nearest')
    expect(target).toBe(nearest)
  })

  it('у Морозко, Звонаря и Казны цель не выбирается; чужие значения не принимаются', () => {
    const game = newGame()
    game.state.gold = 1000
    game.build('frost', 5, 11)
    game.build('archer', 2, 9)
    expect(game.setTargetMode(5, 11, 'strongest')).toBe(false)
    expect(game.setTargetMode(2, 9, 'random' as TargetMode)).toBe(false)
    expect(game.setTargetMode(0, 0, 'strongest')).toBe(false) // пустая клетка
    expect(game.towerAt(2, 9)!.targetMode).toBe('first')
  })
})

describe('знахарь', () => {
  it('лечит раненых соседей, но не себя', () => {
    const game = newGame()
    const healer = placeEnemy(game, 'healer', 1.5)
    const rebel = placeEnemy(game, 'rebel', 1.7)
    rebel.hp = 1
    healer.hp = 1
    healer.healCooldownLeft = 0
    game.step(SIMULATION_STEP)

    const amount = healer.maxHp * ENEMIES['healer'].heal!.amount
    expect(rebel.hp).toBeCloseTo(1 + amount)
    expect(healer.hp).toBe(1)
  })

  it('не лечит выше полного здоровья и не лечит дальних', () => {
    const game = newGame()
    const healer = placeEnemy(game, 'healer', 1.5)
    const near = placeEnemy(game, 'rebel', 1.6)
    const far = placeEnemy(game, 'rebel', 8)
    near.hp = near.maxHp - 1
    far.hp = 1
    healer.healCooldownLeft = 0
    game.step(SIMULATION_STEP)

    expect(near.hp).toBe(near.maxHp)
    expect(far.hp).toBe(1)
  })
})

describe('Змей Горыныч', () => {
  it('погибая, распадается на трёх змеёнышей там же, а волна не кончается раньше времени', () => {
    const game = newGame()
    game.startWave()
    game.state.spawnQueue = [] // в волне только Горыныч
    const gorynych = placeEnemy(game, 'gorynych', 5)
    damageEnemy(worldOf(game), gorynych, 1e9, 'magic')
    game.step(SIMULATION_STEP)

    const snakelets = game.state.enemies.filter((enemy) => enemy.def.id === 'snakelet')
    expect(snakelets).toHaveLength(3)
    for (const snakelet of snakelets) {
      expect(snakelet.pathDistance).toBeGreaterThan(4)
      expect(snakelet.pathDistance).toBeLessThanOrEqual(5 + SIMULATION_STEP * 2)
    }
    expect(game.state.phase).toBe('wave')
  })

  it('дошёл до трона — не распадается', () => {
    const game = newGame()
    placeEnemy(game, 'gorynych', game.level.path.length - 0.001)
    game.step(SIMULATION_STEP)
    expect(game.state.enemies).toHaveLength(0)
    expect(game.state.splitQueue).toHaveLength(0)
  })
})

describe('Звонарь', () => {
  it('ускоряет перезарядку соседей', () => {
    const game = newGame()
    game.state.gold = 1000
    const archer = game.build('archer', 5, 11)!
    game.build('bell', 6, 11)
    archer.cooldownLeft = 1
    game.step(SIMULATION_STEP)
    const bonus = TOWERS['bell'].tiers[0].fireRateBonus!
    expect(archer.cooldownLeft).toBeCloseTo(1 - SIMULATION_STEP * (1 + bonus))
  })

  it('несколько Звонарей не складываются — действует самый сильный', () => {
    const game = newGame()
    game.state.gold = 1000
    const archer = game.build('archer', 5, 11)!
    game.build('bell', 6, 11)
    game.build('bell', 5, 10)
    game.upgrade(5, 10)
    archer.cooldownLeft = 1
    game.step(SIMULATION_STEP)
    const bonus = TOWERS['bell'].tiers[1].fireRateBonus!
    expect(archer.cooldownLeft).toBeCloseTo(1 - SIMULATION_STEP * (1 + bonus))
  })

  it('далёкую башню не ускоряет', () => {
    const game = newGame()
    game.state.gold = 1000
    const archer = game.build('archer', 5, 11)!
    game.build('bell', 8, 12)
    archer.cooldownLeft = 1
    game.step(SIMULATION_STEP)
    expect(archer.cooldownLeft).toBeCloseTo(1 - SIMULATION_STEP)
  })
})

describe('баллиста III', () => {
  it('стреляет «двойным болтом» — это только вид снаряда, снаряд один', () => {
    const game = newGame()
    game.state.gold = 1000
    game.build('ballista', 5, 11)
    game.upgrade(5, 11)
    game.upgrade(5, 11)
    placeEnemy(game, 'rebel', 2)
    game.step(SIMULATION_STEP)
    expect(game.state.shots).toHaveLength(1)
    expect(game.state.shots[0].look).toBe('twinBolt')
  })
})

describe('Казна', () => {
  it('приносит золото после отбитой волны и сообщает об этом', () => {
    const game = newGame()
    game.build('treasury', 0, 0)
    const incomes: number[] = []
    game.on('income', ({ gold }) => incomes.push(gold))
    const goldBefore = game.state.gold

    game.startWave()
    game.state.spawnQueue = []
    game.step(SIMULATION_STEP) // врагов нет — волна отбита сразу

    const income = TOWERS['treasury'].tiers[0].goldPerWave!
    expect(incomes).toEqual([income])
    expect(game.state.gold).toBe(goldBefore + waveBonus(1) + income)
  })
})

describe('данные новых врагов', () => {
  it('все, на кого распадаются враги, существуют', () => {
    for (const def of Object.values(ENEMIES)) {
      if (def.splitInto) expect(Object.hasOwn(ENEMIES, def.splitInto.enemyId), def.id).toBe(true)
    }
  })
})
