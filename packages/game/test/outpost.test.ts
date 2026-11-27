import { expect, it } from 'vitest'
import { createGame, PLAYABLE_LEVELS, SIMULATION_STEP } from '../src/index.ts'

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
  while (wall.hp === wall.maxHp && game.state.time < 10) game.step(SIMULATION_STEP)
  expect(wall.hp).toBeLessThan(wall.maxHp)
  expect(game.state.enemies[0].pathDistance).toBe(wall.distance)
  expect(shots).toBeGreaterThan(0)
  while (wall.hp > 0 && game.state.time < 20) game.step(SIMULATION_STEP)
  expect(wall.hp).toBe(0)
  const shotsBefore = shots
  game.step(SIMULATION_STEP)
  expect(game.state.enemies[0].pathDistance).toBeGreaterThan(wall.distance)
  while (game.state.phase === 'wave' && game.state.time < 300) game.step(SIMULATION_STEP)
  expect(shots).toBe(shotsBefore)
  expect(game.state.phase).toBe('build')
  expect(wall.hp).toBe(wall.maxHp)
  expect(game.sell(col, row)).toBe(75)
})
