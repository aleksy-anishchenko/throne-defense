import { describe, expect, it } from 'vitest'
import { SIMULATION_STEP, createGame, waveBonus, type GameEvents } from '../src/index.ts'
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
    // Дошедший до трона враг не остаётся на поле «мёртвым»
    expect(game.state.enemies.some((enemy) => enemy.isDead)).toBe(false)
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
  // Сравниваем число шагов (время × 60, округлённое): прямое toBe(0.5) не пройдёт
  // из-за дробной погрешности, а toBeCloseTo(…, 1) пропускал ошибку в 3 шага из 18

  it('advance делает шаги по 1/60 с и учитывает скорость', () => {
    const game = newGame()
    game.setSpeed(3)
    game.advance(0.1)
    expect(Math.round(game.state.time * 60)).toBe(18)
  })

  it('60 вызовов advance(1/120) дают ровно 30 шагов', () => {
    const game = newGame()
    for (let i = 0; i < 60; i++) game.advance(1 / 120)
    expect(Math.round(game.state.time * 60)).toBe(30)
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
    // Это важно для защиты рейтинга: сервер сможет повторить партию и проверить счёт.
    // Все клетки свободны: если постройка не удалась, тест падает, а не сравнивает
    // две одинаково неудавшиеся партии
    const frostCells = [
      [3, 8],
      [3, 6],
      [3, 5],
      [5, 8],
      [6, 8],
    ]
    function play() {
      const game = createGame(throneHall)
      // Полный журнал: и частые события (выстрелы, попадания), и время каждого
      const eventLog: string[] = []
      const eventTypes: (keyof GameEvents)[] = [
        'build',
        'upgrade',
        'sell',
        'waveStart',
        'waveCleared',
        'fire',
        'hit',
        'splash',
        'heal',
        'steam',
        'income',
        'kill',
        'leak',
        'victory',
        'defeat',
      ]
      for (const eventType of eventTypes) {
        game.on(eventType, () => eventLog.push(`${game.state.time.toFixed(6)} ${eventType}`))
      }
      game.reset()
      expect(game.build('archer', 5, 11)).not.toBeNull()
      expect(game.build('mage', 2, 9)).not.toBeNull()
      for (const [col, row] of frostCells) {
        if (game.state.phase !== 'build') break
        game.startWave()
        stepUntil(game, () => game.state.phase !== 'wave')
        // Трон мог пасть в этой волне — тогда строить уже нельзя
        if (game.state.phase === 'build' && game.state.gold >= 70) {
          expect(game.build('frost', col, row)).not.toBeNull()
        }
      }
      const { gold, lives, score, kills, wave, towers } = game.state
      return { gold, lives, score, kills, wave, towerCount: towers.length, eventLog }
    }
    const first = play()
    expect(first.towerCount).toBeGreaterThan(2) // хоть один Морозко действительно встал
    expect(play()).toEqual(first)
  })
})
