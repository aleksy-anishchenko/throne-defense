import { describe, expect, it } from 'vitest'
import { SIMULATION_STEP, TOWERS } from '../src/index.ts'
import {
  KNOCKBACK_IMMUNITY_SECONDS,
  NET_ON_FIRE_SHARE,
  ROOT_IMMUNITY_SECONDS,
  damageEnemy,
  shootHoming,
} from '../src/systems/combat.ts'
import type { Enemy, Tower } from '../src/types.ts'
import { newGame, placeEnemy, stepUntil, worldOf } from './helpers.ts'

// Башни контроля (баланс v5): Ловчий держит в сети, Колдун проклинает, Пушкарь отбрасывает

/** Сколько секунд в n шагах симуляции */
const steps = (count: number) => count * SIMULATION_STEP

describe('Ловчий', () => {
  it('враг в сети стоит на месте и не теряет здоровья', () => {
    const game = newGame()
    game.build('trapper', 5, 11)
    const enemy = placeEnemy(game, 'rebel', 1.5)
    stepUntil(game, () => enemy.rootTimeLeft > 0, 10)
    const caughtAt = enemy.pathDistance
    for (let i = 0; i < 30; i++) game.step(SIMULATION_STEP)
    expect(enemy.pathDistance).toBe(caughtAt)
    expect(enemy.hp).toBe(enemy.maxHp)
  })

  it('вырвавшись, враг ещё ROOT_IMMUNITY_SECONDS рвёт новые сети', () => {
    const game = newGame()
    game.build('trapper', 5, 11)
    const enemy = placeEnemy(game, 'rebel', 1.5)
    stepUntil(game, () => enemy.rootTimeLeft > 0, 10)
    // Сеть I ступени держит 1,8 с; иммунитет считается с поимки и длится на 2 с дольше
    expect(enemy.rootImmunityLeft - enemy.rootTimeLeft).toBeCloseTo(ROOT_IMMUNITY_SECONDS)
  })

  it('горящего сеть держит пятую часть времени, потом сгорает', () => {
    const game = newGame()
    game.build('trapper', 5, 11)
    const enemy = placeEnemy(game, 'rebel', 1.5)
    enemy.burnDamageLeft = 1
    enemy.burnTimeLeft = 100
    let burntNets = 0
    game.on('netBurn', () => burntNets++)
    stepUntil(game, () => enemy.rootTimeLeft > 0, 10)
    const netTime = TOWERS['trapper'].tiers[0].rootDuration! * NET_ON_FIRE_SHARE
    expect(enemy.rootTimeLeft).toBeCloseTo(netTime, 1)
    // Вырвавшись, рвёт сети, как обычно, — ROOT_IMMUNITY_SECONDS
    expect(enemy.rootImmunityLeft - enemy.rootTimeLeft).toBeCloseTo(ROOT_IMMUNITY_SECONDS)
    stepUntil(game, () => enemy.rootTimeLeft === 0, 2)
    expect(burntNets).toBe(1)
  })

  it('загоревшись в сети, враг сжигает её: она держит не дольше пятой части времени', () => {
    const game = newGame()
    const trapper = game.build('trapper', 5, 11) as Tower
    const enemy = placeEnemy(game, 'rebel', 1.5)
    stepUntil(game, () => enemy.rootTimeLeft > 0, 10)
    const fullNetTime = enemy.rootDuration
    let burntNets = 0
    game.on('netBurn', () => burntNets++)
    // Огненный снаряд — когда враг уже в сети
    shootHoming(worldOf(game), trapper, enemy, {
      look: 'fireball',
      speed: 50,
      damage: 1,
      damageKind: 'magic',
      burnDamage: 5,
      burnDuration: 1,
    })
    stepUntil(game, () => enemy.burnTimeLeft > 0, 5)
    expect(enemy.rootTimeLeft).toBeGreaterThan(0)
    expect(enemy.rootTimeLeft).toBeLessThanOrEqual(fullNetTime * NET_ON_FIRE_SHARE)
    expect(enemy.rootImmunityLeft - enemy.rootTimeLeft).toBeCloseTo(ROOT_IMMUNITY_SECONDS)
    stepUntil(game, () => enemy.rootTimeLeft === 0, 2)
    expect(burntNets).toBe(1)
  })

  it('узурпатора сеть держит только 30% времени', () => {
    const game = newGame()
    game.build('trapper', 5, 11)
    const boss = placeEnemy(game, 'boss', 1.5)
    stepUntil(game, () => boss.rootTimeLeft > 0, 10)
    // 1,8 с × (1 − 0,7); один шаг мог уже пройти
    expect(boss.rootTimeLeft).toBeGreaterThan(0.54 - steps(2))
    expect(boss.rootTimeLeft).toBeLessThanOrEqual(0.54 + 1e-9)
  })
})

describe('Колдун', () => {
  it('проклятый враг получает больше урона — и от брони не зависит', () => {
    const game = newGame()
    game.build('warlock', 5, 11)
    const enemy = placeEnemy(game, 'armor', 1.5)
    game.step(SIMULATION_STEP)
    expect(enemy.curseAmount).toBeCloseTo(0.35)
    const hpBefore = enemy.hp
    damageEnemy(worldOf(game), enemy, 16, 'magic')
    expect(hpBefore - enemy.hp).toBeCloseTo(16 * 1.35)
  })

  it('два Колдуна не складываются: действует самое сильное проклятие', () => {
    const game = newGame()
    game.state.gold = 1000
    game.build('warlock', 5, 11)
    game.build('warlock', 3, 11)
    game.upgrade(3, 11) // II — проклятие 50%
    const enemy = placeEnemy(game, 'rebel', 1.5)
    game.step(SIMULATION_STEP)
    expect(enemy.curseAmount).toBeCloseTo(0.5)
  })

  it('проклятие проходит само', () => {
    const game = newGame()
    game.build('warlock', 5, 11)
    const enemy = placeEnemy(game, 'rebel', 1.5)
    game.step(SIMULATION_STEP)
    game.sell(5, 11)
    stepUntil(game, () => enemy.curseTimeLeft === 0, 5)
    const hpBefore = enemy.hp
    damageEnemy(worldOf(game), enemy, 10, 'magic')
    expect(hpBefore - enemy.hp).toBe(10)
  })
})

describe('Пушкарь', () => {
  /** Выстрелить в врага ядром, отбрасывающим на distance клеток, и дождаться попадания */
  function knockBack(enemyId: string, pathDistance: number, distance: number) {
    const game = newGame()
    const shooter = game.build('archer', 5, 11) as Tower
    const enemy: Enemy = placeEnemy(game, enemyId, pathDistance)
    // Враг стоит в «сети», чтобы сам не сдвинулся, пока летит ядро
    enemy.rootTimeLeft = 100
    enemy.rootImmunityLeft = 100
    const fire = () =>
      shootHoming(worldOf(game), shooter, enemy, {
        look: 'cannonball',
        speed: 50,
        damage: 1,
        damageKind: 'magic',
        knockbackDistance: distance,
      })
    fire()
    stepUntil(game, () => game.state.shots.length === 0, 5)
    return { game, enemy, fire }
  }

  it('отбрасывает врага назад по ковру', () => {
    const { enemy } = knockBack('rebel', 3, 1)
    expect(enemy.pathDistance).toBeCloseTo(2)
  })

  it('огра отбрасывает на 30% меньше', () => {
    const { enemy } = knockBack('ogre', 3, 1)
    expect(enemy.pathDistance).toBeCloseTo(2.3)
  })

  it('не дальше двери', () => {
    const { enemy } = knockBack('rebel', 0.3, 1)
    expect(enemy.pathDistance).toBe(0)
  })

  it('ядро Пушкаря бьёт и отбрасывает всех в круге взрыва', () => {
    const game = newGame()
    game.build('cannon', 5, 11)
    const front = placeEnemy(game, 'rebel', 3)
    const behind = placeEnemy(game, 'rebel', 2.8)
    let splashLook = ''
    game.on('splash', ({ look }) => (splashLook = look))
    stepUntil(game, () => front.hp < front.maxHp, 10)
    expect(behind.hp).toBeLessThan(behind.maxHp)
    expect(front.knockbackImmunityLeft).toBeGreaterThan(0)
    expect(behind.knockbackImmunityLeft).toBeGreaterThan(0)
    expect(splashLook).toBe('cannonball')
  })

  it('Пушкарь бьёт дальше всех башен', () => {
    const cannonRange = TOWERS['cannon'].tiers[0].range
    for (const def of Object.values(TOWERS)) {
      if (def.id === 'cannon' || !def.fire) continue
      expect(cannonRange, def.id).toBeGreaterThan(def.tiers[0].range)
    }
  })

  it('второе ядро сразу после первого не отбрасывает', () => {
    const { game, enemy, fire } = knockBack('rebel', 3, 1)
    expect(enemy.knockbackImmunityLeft).toBeGreaterThan(KNOCKBACK_IMMUNITY_SECONDS - steps(5))
    fire()
    stepUntil(game, () => game.state.shots.length === 0, 5)
    expect(enemy.pathDistance).toBeCloseTo(2)
  })
})
