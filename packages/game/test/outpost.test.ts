import { expect, it } from 'vitest'
import { createGame, PLAYABLE_LEVELS, SIMULATION_STEP } from '../src/index.ts'

import { damageEnemy, updateBurning } from '../src/systems/combat.ts'
import { placeEnemy, stepUntil, worldOf } from './helpers.ts'

it.each(PLAYABLE_LEVELS)('Застава занимает только ковёр в зале $name', (level) => {
  const game = createGame(level)
  game.reset()
  const [site, other] = Array.from(game.level.outpostSites.keys(), (key) =>
    key.split(',').map(Number),
  )
  const gold = game.state.gold
  expect(game.build('archer', site[0], site[1])).toBeNull()
  expect(game.build('outpost', Math.floor(level.throne[0]), Math.floor(level.throne[1]))).toBeNull()
  expect(game.build('outpost', 0.5, 0)).toBeNull()
  expect(game.build('outpost', site[0], site[1])).toBeTruthy()
  expect(game.build('outpost', other[0], other[1])).toBeNull()
  expect(game.state.gold).toBe(gold - 75)
  game.sell(site[0], site[1])
  expect(game.state.gold).toBe(gold)
  expect(game.build('outpost', other[0], other[1])).toBeTruthy()
})

it('Застава перекрывает оба поворота по диагонали и сохраняет прямой проход между ними', () => {
  const game = createGame(PLAYABLE_LEVELS[0])
  game.reset()
  // На ряд 8 враги входят снизу, затем поворачивают налево и уходят вверх на столбце 1.
  expect(game.build('outpost', 3, 8)?.barricade?.angle).toBe(-Math.PI / 4)
  game.sell(3, 8)
  expect(game.isCellFree(3, 9, 'outpost')).toBe(true)
  expect(game.build('outpost', 2, 8)).toBeNull()
  expect(game.build('outpost', 1, 8)?.barricade?.angle).toBe(-Math.PI / 4)
  game.sell(1, 8)
  expect(game.level.outpostSites.get('1,6')?.angle).toBe(Math.PI / 4)
  expect(game.isCellFree(1, 7, 'outpost')).toBe(true)
})

it('гарнизон стреляет, держит огра до разрушения и восстанавливается после волны', () => {
  const game = createGame({
    ...PLAYABLE_LEVELS[0],
    endlessWaveGroups: () => [['rebel', 1, 0, 0]],
    waves: [[['ogre', 1, 0, 0]], [['rebel', 1, 0, 0]]],
  })
  game.reset()
  const [col, row] = [...game.level.outpostSites.keys()][0].split(',').map(Number)
  const tower = game.build('outpost', col, row)!
  const wall = tower.barricade!
  let shots = 0
  game.on('fire', () => shots++)
  game.startWave()
  while (!game.state.enemies[0]?.wallAttack && game.state.time < 10) game.step(SIMULATION_STEP)
  expect(game.state.enemies[0].wallAttack!.nextHitAt).toBeGreaterThan(game.state.time)
  expect(wall.hp).toBe(75)
  while (wall.hp === wall.maxHp && game.state.time < 10) game.step(SIMULATION_STEP)
  expect(wall.hp).toBe(wall.maxHp - 40)
  expect(wall.lastHitAt).toBe(game.state.enemies[0].wallAttack!.lastHitAt)
  const contactDistance = wall.distance - game.state.enemies[0].def.radius
  expect(game.state.enemies[0].pathDistance).toBeCloseTo(contactDistance)
  expect(shots).toBeGreaterThan(0)
  game.state.gold = 160
  const damageTaken = wall.maxHp - wall.hp
  expect(game.upgrade(col, row)).toBe(true)
  expect(wall.maxHp).toBe(130)
  expect(wall.hp).toBeCloseTo(130 - damageTaken)
  expect(game.state.gold).toBe(100)
  while (wall.hp > 0 && game.state.time < 20) game.step(SIMULATION_STEP)
  expect(wall.hp).toBe(0)
  expect(game.upgrade(col, row)).toBe(true)
  expect(wall.hp).toBe(0)
  expect(wall.maxHp).toBe(220)
  expect(game.state.gold).toBe(0)
  expect(game.upgrade(col, row)).toBe(false)
  const shotsBefore = shots
  game.step(SIMULATION_STEP)
  expect(game.state.enemies[0].pathDistance).toBeGreaterThan(contactDistance)
  while (game.state.phase === 'wave' && game.state.time < 300) game.step(SIMULATION_STEP)
  expect(shots).toBe(shotsBefore)
  expect(game.state.phase).toBe('build')
  expect(wall.hp).toBe(wall.maxHp)
  expect(game.sell(col, row)).toBe(235)
})

function outpostWithAspect(id: string) {
  const game = createGame(PLAYABLE_LEVELS[0])
  game.reset()
  game.state.gold = 375
  const [col, row] = [...game.level.outpostSites.keys()].at(-1)!.split(',').map(Number)
  const tower = game.build('outpost', col, row)!
  expect(game.specialize(col, row, id)).toBe(false)
  game.upgrade(col, row)
  game.upgrade(col, row)
  expect(game.specialize(col, row, id)).toBe(true)
  expect(game.state.gold).toBe(0)
  game.startWave()
  game.state.spawnQueue = []
  tower.cooldownLeft = 100
  return { game, wall: tower.barricade! }
}

it('ограничивает каждый удар отдельно, даже если огр, Узурпатор и бунтовщик бьют вместе', () => {
  const { game, wall } = outpostWithAspect('reinforced-wall')
  const enemies = ['ogre', 'boss', 'rebel'].map((id) => placeEnemy(game, id, wall.distance))
  game.step(SIMULATION_STEP)
  for (const enemy of enemies) enemy.wallAttack!.nextHitAt = game.state.time + SIMULATION_STEP
  game.step(SIMULATION_STEP)
  expect(wall.hp).toBe(220 - 25 - 25 - 7)
})

it('котёл срабатывает от удара, обливает только атакующих и снова готов через пять секунд', () => {
  const { game, wall } = outpostWithAspect('machicolations')
  const first = placeEnemy(game, 'rebel', wall.distance)
  const second = placeEnemy(game, 'scout', wall.distance)
  const distant = placeEnemy(game, 'ogre', 0)
  game.step(SIMULATION_STEP)
  expect(first.resinTimeLeft).toBeUndefined()
  stepUntil(game, () => wall.hp < wall.maxHp, 2)
  const pouredAt = wall.lastPourAt!
  expect([first.resinTimeLeft, second.resinTimeLeft, distant.resinTimeLeft]).toEqual([
    3,
    3,
    undefined,
  ])
  const initialHp = first.hp
  damageEnemy(worldOf(game), first, 10, 'physical')
  first.burnDamageLeft = 10
  first.burnTimeLeft = 1
  updateBurning(worldOf(game), 0.5)
  expect(initialHp - first.hp).toBeCloseTo(18)
  stepUntil(game, () => game.state.time >= pouredAt + 3.1)
  expect(first.resinTimeLeft).toBe(0)
  stepUntil(game, () => wall.lastPourAt !== pouredAt, 3)
  expect(wall.lastPourAt! - pouredAt).toBeGreaterThanOrEqual(5)
  expect(second.resinTimeLeft).toBe(3)
})
