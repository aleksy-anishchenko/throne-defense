import { describe, expect, it } from 'vitest'
import {
  ENEMIES,
  SIMULATION_STEP,
  TOWERS,
  fireRateBonusOf,
  waveBonus,
  type TargetMode,
} from '../src/index.ts'
import { THAW_BURN_MULTIPLIER, damageEnemy } from '../src/systems/combat.ts'
import { newGame, placeEnemy, stepUntil, worldOf } from './helpers.ts'

// Выбор цели, знахарь, Змей Горыныч, Звонарь и Казна (баланс v4)

describe('выбор цели — умение баллисты', () => {
  /**
   * Баллиста у двери (клетка 5,11) и двое в её радиусе:
   * бунтовщик дальше прошёл по ковру, огр крупнее
   */
  function setUp(mode: TargetMode | null) {
    const game = newGame()
    game.build('ballista', 5, 11)
    if (mode) expect(game.setTargetMode(5, 11, mode)).toBe(true)
    const first = placeEnemy(game, 'rebel', 4)
    const strongest = placeEnemy(game, 'ogre', 1.5)
    // огр ранен, у него здоровья меньше, чем было, но он всё равно крупнее бунтовщика
    strongest.hp = strongest.maxHp / 2
    game.step(SIMULATION_STEP)
    const shot = game.state.shots[0]
    if (shot?.kind !== 'line') throw new Error('баллиста не выстрелила')
    return { game, shot, first, strongest }
  }

  /** Куда летит болт: к кому из двоих направление ближе */
  function aimedAt(
    shot: { directionX: number; directionY: number },
    game: ReturnType<typeof newGame>,
    enemy: { x: number; y: number },
  ) {
    const tower = game.towerAt(5, 11)!
    const distance = Math.hypot(enemy.x - tower.x, enemy.y - tower.y)
    return (
      Math.hypot(
        (enemy.x - tower.x) / distance - shot.directionX,
        (enemy.y - tower.y) / distance - shot.directionY,
      ) < 0.01
    )
  }

  it('по умолчанию — тот, кто ближе всех к трону', () => {
    const { game, shot, first } = setUp(null)
    expect(game.towerAt(5, 11)!.targetMode).toBe('first')
    expect(aimedAt(shot, game, first)).toBe(true)
  })

  it('«сильный» — самый крупный враг, даже раненый', () => {
    const { game, shot, strongest } = setUp('strongest')
    expect(aimedAt(shot, game, strongest)).toBe(true)
  })

  it('у остальных башен цель не выбирается; чужие значения не принимаются', () => {
    const game = newGame()
    game.state.gold = 1000
    game.build('archer', 5, 11)
    game.build('ballista', 2, 9)
    expect(game.setTargetMode(5, 11, 'strongest')).toBe(false)
    expect(game.setTargetMode(2, 9, 'nearest' as TargetMode)).toBe(false)
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

  it('fireRateBonusOf говорит интерфейсу, кого и насколько ускорил Звонарь', () => {
    const game = newGame()
    game.state.gold = 1000
    const archer = game.build('archer', 5, 11)!
    const frost = game.build('frost', 5, 10)!
    const bell = game.build('bell', 6, 11)!
    const towers = game.state.towers
    expect(fireRateBonusOf(towers, archer)).toBe(TOWERS['bell'].tiers[0].fireRateBonus)
    expect(fireRateBonusOf(towers, frost)).toBe(0)
    expect(fireRateBonusOf(towers, bell)).toBe(0)
  })

  it('Морозко не ускоряет — только стреляющих', () => {
    const game = newGame()
    game.state.gold = 1000
    const frost = game.build('frost', 5, 11)!
    game.build('bell', 6, 11)
    frost.cooldownLeft = 1
    game.step(SIMULATION_STEP)
    expect(frost.cooldownLeft).toBeCloseTo(1 - SIMULATION_STEP)
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

describe('огневик: горение', () => {
  it('поджигает: сразу малая часть урона, остальное — горением', () => {
    const game = newGame()
    game.build('mage', 5, 11)
    const rebel = placeEnemy(game, 'rebel', 2)
    const stats = TOWERS['mage'].tiers[0]
    // шагаем, пока огненный шар не долетит
    stepUntil(game, () => rebel.burnTimeLeft > 0, 5)
    expect(rebel.burnDamageLeft).toBeGreaterThan(0)
    expect(rebel.burnTimeLeft).toBeCloseTo(stats.burnDuration!, 1)
  })

  it('огонь растапливает лёд: замедление снято, но часть огня ушла на таяние', () => {
    const game = newGame()
    game.build('mage', 5, 11)
    const rebel = placeEnemy(game, 'rebel', 2)
    rebel.slowTimeLeft = 10
    rebel.slowFactor = 0.01 // почти не замедляем, чтобы враг не ушёл из радиуса раньше времени
    let thawed = 0
    game.on('thaw', () => thawed++)
    stepUntil(game, () => rebel.burnTimeLeft > 0, 5)
    const burn = TOWERS['mage'].tiers[0].burnDamage!
    expect(rebel.burnDamageLeft).toBeCloseTo(burn * THAW_BURN_MULTIPLIER)
    expect(rebel.slowTimeLeft).toBe(0)
    expect(thawed).toBe(1)
  })

  it('весь запас огня догорает к сроку — урон не теряется и не удваивается', () => {
    const game = newGame()
    const ogre = placeEnemy(game, 'ogre', 1)
    ogre.burnDamageLeft = 30
    ogre.burnTimeLeft = 3
    stepUntil(game, () => ogre.burnTimeLeft === 0, 4)
    expect(ogre.maxHp - ogre.hp).toBeCloseTo(30)
    expect(ogre.burnDamageLeft).toBe(0)
  })

  it('горение может добить врага: награда и событие kill', () => {
    const game = newGame()
    const kills: string[] = []
    game.on('kill', (enemy) => kills.push(enemy.def.id))
    const rebel = placeEnemy(game, 'rebel', 1)
    rebel.hp = 1
    rebel.burnDamageLeft = 10
    rebel.burnTimeLeft = 0.1
    const gold = game.state.gold
    stepUntil(game, () => rebel.isDead, 1)
    expect(kills).toEqual(['rebel'])
    expect(game.state.gold).toBe(gold + ENEMIES['rebel'].reward)
  })
})

describe('пар: Морозко тушит горящих', () => {
  it('огонь гаснет без урона: остаток огня пропадает, событие steam', () => {
    const game = newGame()
    game.build('frost', 5, 11)
    const ogre = placeEnemy(game, 'ogre', 1.5)
    ogre.burnDamageLeft = 40
    ogre.burnTimeLeft = 3
    let steams = 0
    game.on('steam', () => steams++)
    game.step(SIMULATION_STEP)

    // за этот шаг горение успело отнять 40 × (1/60) / 3, остальное пропало
    const burnedThisStep = (40 * SIMULATION_STEP) / 3
    const frostDamage = TOWERS['frost'].tiers[0].damage
    expect(steams).toBe(1)
    expect(ogre.maxHp - ogre.hp).toBeCloseTo(burnedThisStep + frostDamage)
    expect(ogre.burnDamageLeft).toBe(0)
    expect(ogre.burnTimeLeft).toBe(0)
  })

  it('не горящего врага Морозко просто замедляет', () => {
    const game = newGame()
    game.build('frost', 5, 11)
    const ogre = placeEnemy(game, 'ogre', 1.5)
    let steams = 0
    game.on('steam', () => steams++)
    game.step(SIMULATION_STEP)
    expect(steams).toBe(0)
    expect(ogre.slowTimeLeft).toBeGreaterThan(0)
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
