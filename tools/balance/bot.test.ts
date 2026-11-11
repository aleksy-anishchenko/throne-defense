import { describe, expect, it } from 'vitest'
import { LEVELS, TOWERS } from '@throne/game'
import { STRATEGIES, playBot } from './bot.ts'
import { STREAMS, damagePerGold } from './towers.ts'

const throneHall = LEVELS.find((level) => level.id === 'throne-hall')!

// «Сторожа баланса»: если после правки чисел что-то сильно уехало — эти тесты упадут.
// Упал тест — это не обязательно ошибка. Возможно, ты так и задумал; тогда поправь порог.

const strategy = (name: string) => STRATEGIES.find((candidate) => candidate.name === name)!
const wavesReached = (name: string) => playBot(throneHall, strategy(name)).waves.length

describe('бот', () => {
  it('смешанная стратегия держится хотя бы 15 волн', () => {
    expect(wavesReached('Смешанная')).toBeGreaterThanOrEqual(15)
  })

  it('только лучниками все 20 волн не пройти', () => {
    // Именно поражение: «зависшая волна» (stuck) — это ошибка, а не слабая стратегия
    expect(playBot(throneHall, strategy('Только лучники')).outcome).toBe('lost')
  })

  it('одни баллисты слабее, чем смешанная стратегия вообще без баллист', () => {
    // В балансе v1 баллисты «в одиночку» доходили так же далеко, как лучшие смеси
    expect(wavesReached('Только баллисты')).toBeLessThan(wavesReached('Смешанная без баллист'))
  })
})

describe('выгодность башен', () => {
  const rebels = STREAMS.find((stream) => stream.enemyId === 'rebel')!

  it('улучшение баллисты не становится намного выгоднее постройки', () => {
    // В v1 баллиста III давала на 48% больше урона на монету, чем баллиста I
    const first = damagePerGold(throneHall, TOWERS.ballista, 0, rebels)
    const third = damagePerGold(throneHall, TOWERS.ballista, 2, rebels)
    expect(third / first).toBeLessThan(1.25)
  })
})
