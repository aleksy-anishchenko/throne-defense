import { describe, expect, it } from 'vitest'
import { SIMULATION_STEP, bannerArmorOf, towerStats } from '../src/index.ts'
import { cursePulse, damageEnemy, frostPulse, updateShots } from '../src/systems/combat.ts'
import { moveEnemies } from '../src/systems/enemies.ts'
import { updateTowers } from '../src/systems/towers.ts'
import type { World } from '../src/types.ts'
import { newGame, placeEnemy, worldOf } from './helpers.ts'

describe('«Под знаменем»', () => {
  it.each(['rebel', 'scout', 'armor'])('%s получает +3 брони рядом с генералом', (id) => {
    const game = newGame()
    placeEnemy(game, 'general', 1)
    const enemy = placeEnemy(game, id, 2.5)
    damageEnemy(worldOf(game), enemy, 12, 'physical')
    expect(enemy.maxHp - enemy.hp).toBe(12 - enemy.def.armor - 3)
  })

  it('два знамени дают один бонус, он сразу пропадает вне радиуса или при гибели генерала', () => {
    const game = newGame()
    const general = placeEnemy(game, 'general', 0.5)
    const other = placeEnemy(game, 'general', 1.2)
    const enemy = placeEnemy(game, 'armor', 1)
    expect(bannerArmorOf(game.state.enemies, enemy)).toBe(3)
    damageEnemy(worldOf(game), general, general.maxHp, 'magic')
    expect(bannerArmorOf(game.state.enemies, enemy)).toBe(3)
    other.y += 2
    expect(bannerArmorOf(game.state.enemies, enemy)).toBe(0)
    other.y -= 2
    damageEnemy(worldOf(game), other, other.maxHp, 'magic')
    damageEnemy(worldOf(game), enemy, 12, 'physical')
    expect(enemy.maxHp - enemy.hp).toBe(7)
  })

  it('знамя прикрывает свиту, а пробивающий и магический урон учитывают броню по своим правилам', () => {
    const game = newGame()
    const general = placeEnemy(game, 'general')
    const giant = placeEnemy(game, 'ogre')
    const healer = placeEnemy(game, 'healer')
    const enemy = placeEnemy(game, 'rebel')
    for (const unit of [general, giant, healer]) {
      expect(bannerArmorOf(game.state.enemies, unit)).toBe(0)
    }
    damageEnemy(worldOf(game), enemy, 12, 'piercing')
    expect(enemy.maxHp - enemy.hp).toBe(10.5)
    damageEnemy(worldOf(game), enemy, 12, 'magic')
    expect(enemy.maxHp - enemy.hp).toBe(22.5)
  })
})

describe('урон и броня', () => {
  it('физический урон режется бронёй', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'armor') // броня 5
    damageEnemy(worldOf(game), enemy, 9, 'physical')
    expect(enemy.maxHp - enemy.hp).toBe(4)
  })

  it('физический урон не бывает меньше 1', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'armor')
    damageEnemy(worldOf(game), enemy, 3, 'physical')
    expect(enemy.maxHp - enemy.hp).toBe(1)
  })

  it('пронзающий урон режется только половиной брони', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'armor')
    damageEnemy(worldOf(game), enemy, 55, 'piercing')
    expect(enemy.maxHp - enemy.hp).toBe(52.5)
  })

  it('магический урон броню игнорирует', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'armor')
    damageEnemy(worldOf(game), enemy, 16, 'magic')
    expect(enemy.maxHp - enemy.hp).toBe(16)
  })

  it('за убийство дают золото, очки и события hit и kill', () => {
    const game = newGame()
    const enemy = placeEnemy(game, 'rebel')
    const gold = game.state.gold
    const events: string[] = []
    const world: World = { ...worldOf(game), emit: (type) => events.push(type) }

    damageEnemy(world, enemy, 999, 'magic')

    expect(enemy.isDead).toBe(true)
    expect(game.state.gold).toBe(gold + 6)
    expect(game.state.score).toBe(60)
    expect(game.state.kills).toBe(1)
    expect(events).toEqual(['hit', 'kill'])
  })
})

it.each([false, true])('болт бьёт по порядку касания при reverse=%s', (reverse) => {
  const game = newGame()
  game.state.gold = 1000
  const ballista = game.build('ballista', 5, 11)!
  const far = placeEnemy(game, 'scout')
  const small = placeEnemy(game, 'scout')
  const large = placeEnemy(game, 'boss')
  Object.assign(far, { x: ballista.x + 1.05, y: ballista.y })
  Object.assign(small, { x: ballista.x + 0.75, y: ballista.y + 0.12 })
  Object.assign(large, { x: ballista.x + 0.82, y: ballista.y })
  if (reverse) game.state.enemies.reverse()
  const world = worldOf(game)
  ballista.def.fire!(world, ballista, far, towerStats(ballista))
  const shot = game.state.shots[0]
  if (shot.kind !== 'line') throw new Error('Ожидался болт Баллисты')

  updateShots(world, 0.1)

  expect([...shot.hitEnemies].map(({ id }) => id)).toEqual([large.id, small.id])
  expect(far.hp).toBe(far.maxHp)
  expect(shot.isDone).toBe(true)
})

describe('Морозко', () => {
  it.each([1, 2, 3])('на ступени %i выпускает волну холода раз в секунду', (level) => {
    const game = newGame()
    game.state.gold = 1000
    const tower = game.build('frost', 5, 11)!
    for (let step = 1; step < level; step++) expect(game.upgrade(5, 11)).toBe(true)
    const enemy = placeEnemy(game, 'rebel', 1.5)
    const world = worldOf(game)
    updateTowers(world, SIMULATION_STEP)
    expect(enemy.slowFactor).toBe(towerStats(tower).slowAmount)
    expect(tower.cooldownLeft).toBe(1)
    updateTowers(world, 0.75)
    expect(tower.cooldownLeft).toBe(0.25)
    updateTowers(world, 0.25)
    expect(tower.cooldownLeft).toBe(1)
  })

  it('замедляет врагов в радиусе', () => {
    const game = newGame()
    game.build('frost', 5, 11)
    const enemy = placeEnemy(game, 'rebel', 1.5) // у двери, рядом с башней
    game.step(SIMULATION_STEP)
    expect(enemy.slowFactor).toBeCloseTo(0.45)
    expect(enemy.slowTimeLeft).toBeGreaterThan(0)
  })

  it('узурпатора замедляет вдвое слабее', () => {
    const game = newGame()
    game.build('frost', 5, 11)
    const boss = placeEnemy(game, 'boss', 1.5)
    game.step(SIMULATION_STEP)
    expect(boss.slowFactor).toBeCloseTo(0.225)
  })

  it('слабый мороз дожидается окончания сильного', () => {
    const game = newGame()
    const tower = game.build('frost', 5, 11)!
    const enemy = placeEnemy(game, 'rebel', 1.5)
    const world = worldOf(game)
    const weak = towerStats(tower)
    frostPulse(world, tower, { ...weak, slowAmount: 0.65, slowDuration: 0.1 })
    frostPulse(world, tower, weak)
    expect(enemy.slowFactor).toBe(0.65)
    expect(enemy.slowTimeLeft).toBe(0.1)
    moveEnemies(world, 0.1)
    frostPulse(world, tower, weak)
    expect(enemy.slowFactor).toBe(weak.slowAmount)
    expect(enemy.slowTimeLeft).toBe(weak.slowDuration)
  })
})

it('сильное проклятие получает свой срок, равное обновляет его', () => {
  const game = newGame()
  const tower = game.build('warlock', 5, 11)!
  const enemy = placeEnemy(game, 'rebel', 1.5)
  const world = worldOf(game)
  const weak = towerStats(tower)
  const strong = { ...weak, curseAmount: 0.4, curseDuration: 0.2 }
  cursePulse(world, tower, weak)
  cursePulse(world, tower, strong)
  expect(enemy.curseTimeLeft).toBe(0.2)
  moveEnemies(world, 0.1)
  cursePulse(world, tower, weak)
  expect(enemy.curseAmount).toBe(0.4)
  expect(enemy.curseTimeLeft).toBe(0.1)
  cursePulse(world, tower, strong)
  expect(enemy.curseTimeLeft).toBe(0.2)
  moveEnemies(world, 0.2)
  cursePulse(world, tower, weak)
  expect(enemy.curseAmount).toBe(weak.curseAmount)
  expect(enemy.curseTimeLeft).toBe(weak.curseDuration)
})
