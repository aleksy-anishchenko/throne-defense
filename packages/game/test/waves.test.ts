import { describe, expect, it } from 'vitest'
import { SIMULATION_STEP, createGame, waveBonus } from '../src/index.ts'
import { throneHall } from '../src/levels/throne-hall.ts'
import { newGame, recordEvents, stepUntil } from './helpers.ts'

describe('волны', () => {
  it('первая волна с двумя лучниками проходится без потерь', () => {
    const game = newGame()
    game.build('archer', 5, 11)
    game.build('archer', 2, 9)
    game.startWave()
    stepUntil(game, () => game.state.phase !== 'wave')

    expect(game.state.phase).toBe('build')
    expect(game.state.wave).toBe(2)
    expect(game.state.lives).toBe(20)
    expect(game.state.kills).toBe(8)
  })

  it('за отбитую волну дают бонус золота и очки', () => {
    const game = newGame()
    game.build('archer', 5, 11)
    game.build('archer', 2, 9)
    game.startWave()
    stepUntil(game, () => game.state.phase !== 'wave')

    // 150 − 2 × 50 + 8 бунтовщиков × 6 + бонус за 1-ю волну
    expect(game.state.gold).toBe(150 - 100 + 8 * 6 + waveBonus(1))
    expect(game.state.score).toBe(8 * 60 + 100)
  })

  it('без стражи враги доходят до трона и отнимают жизни', () => {
    const game = newGame()
    const recordedEvents = recordEvents(game)
    game.startWave()
    stepUntil(game, () => game.state.phase !== 'wave')

    expect(game.state.lives).toBe(20 - 8)
    expect(recordedEvents.filter((eventType) => eventType === 'leak')).toHaveLength(8)
  })

  it('когда жизни кончаются — поражение', () => {
    const game = newGame()
    const recordedEvents = recordEvents(game)
    game.state.lives = 3
    game.startWave()
    stepUntil(game, () => game.state.phase !== 'wave')

    expect(game.state.phase).toBe('lost')
    expect(game.state.lives).toBe(0)
    expect(recordedEvents).toContain('defeat')
  })

  it('после поражения мир стоит: лишние шаги ничего не меняют', () => {
    // Раньше дошедший враг оставался в списке и «доходил» снова на каждом шаге
    const game = newGame()
    const recordedEvents = recordEvents(game)
    game.state.lives = 3
    game.startWave()
    stepUntil(game, () => game.state.phase !== 'wave')
    const leaks = recordedEvents.filter((eventType) => eventType === 'leak').length
    const time = game.state.time

    for (let i = 0; i < 300; i++) game.step(SIMULATION_STEP)

    expect(recordedEvents.filter((eventType) => eventType === 'leak')).toHaveLength(leaks)
    expect(recordedEvents.filter((eventType) => eventType === 'defeat')).toHaveLength(1)
    expect(game.state.time).toBe(time)
  })

  it('волну нельзя начать, пока идёт предыдущая', () => {
    const game = newGame()
    expect(game.startWave()).toBe(true)
    expect(game.startWave()).toBe(false)
  })

  it('после последней волны — победа и бонус за жизни', () => {
    const game = newGame()
    const recordedEvents = recordEvents(game)
    game.state.wave = 20
    game.state.spawnQueue = []
    game.state.phase = 'wave' // волна «пустая» — отбита на первом же шаге
    game.step(SIMULATION_STEP)

    expect(game.state.phase).toBe('won')
    expect(recordedEvents).toContain('victory')
    expect(game.state.score).toBe(100 * 20 + 20 * 100)
  })

  it('после победы можно играть дальше, в бесконечном режиме', () => {
    const game = newGame()
    game.state.phase = 'won'
    game.state.wave = 20
    game.continueEndless()
    expect(game.state.phase).toBe('build')
    expect(game.state.wave).toBe(21)
    expect(game.waveGroups(25).some(([enemyId]) => enemyId === 'boss')).toBe(true)
  })
})

describe('время', () => {
  it('advance делает шаги по 1/60 с и учитывает скорость', () => {
    const game = newGame()
    game.setSpeed(3)
    game.advance(0.1)
    expect(game.state.time).toBeCloseTo(0.3, 1)
  })

  it('на паузе время стоит', () => {
    const game = newGame()
    game.setPaused(true)
    game.advance(0.1)
    expect(game.state.time).toBe(0)
  })

  it('новая партия сохраняет выбранную скорость', () => {
    const game = newGame()
    game.setSpeed(3)
    game.state.gold = 0
    game.reset()
    expect(game.state.speed).toBe(3)
    expect(game.state.gold).toBe(150)
  })

  it('одинаковые действия всегда дают одинаковый результат', () => {
    // Это важно для защиты рейтинга: сервер сможет повторить партию и проверить счёт
    function play() {
      const game = createGame(throneHall)
      game.reset()
      game.build('archer', 5, 11)
      game.build('mage', 2, 9)
      for (let waveIndex = 0; waveIndex < 5 && game.state.phase === 'build'; waveIndex++) {
        game.startWave()
        stepUntil(game, () => game.state.phase !== 'wave')
        if (game.state.gold >= 70) game.build('frost', 3, 8 - waveIndex)
      }
      const { gold, lives, score, kills, wave } = game.state
      return { gold, lives, score, kills, wave }
    }
    expect(play()).toEqual(play())
  })
})
