import { describe, expect, it } from 'vitest'
import { LEVELS, TOWERS, createLevel, maxPossibleScore } from '@throne/game'
import { STRATEGIES, playBot } from './bot.ts'
import { STREAMS, damagePerGold } from './towers.ts'

const throneHall = LEVELS.find((level) => level.id === 'throne-hall')!

// «Сторожа баланса»: если после правки чисел что-то сильно уехало — эти тесты упадут.
// Упал тест — это не обязательно ошибка. Возможно, ты так и задумал; тогда поправь порог.

const strategy = (name: string) => STRATEGIES.find((candidate) => candidate.name === name)!
const wavesReached = (name: string) => playBot(throneHall, strategy(name)).waves.length

describe('бот', () => {
  it('смешанная стратегия держится хотя бы 14 волн', () => {
    // До v6 — 15. В v6 пар гасит огонь без урона, а бот ставит огневика рядом с Морозко:
    // смесь падает на 14-й (решение владельца: принять). Ниже — уже что-то сломалось
    expect(wavesReached('Смешанная')).toBeGreaterThanOrEqual(14)
  })

  it('только лучниками все 20 волн не пройти', () => {
    // Именно поражение: «зависшая волна» (stuck) — это ошибка, а не слабая стратегия
    expect(playBot(throneHall, strategy('Только лучники')).outcome).toBe('lost')
  })

  it('одни баллисты слабее, чем баллисты с огневиками', () => {
    // В балансе v1 баллисты «в одиночку» доходили так же далеко, как лучшие смеси.
    // До v6 сравнивали со смесями с Морозко. В v6 огонь и лёд гасят друг друга (пар без урона),
    // а бот ставит их рядом — такие смеси падают раньше баллист (решение владельца: принять,
    // человек огонь и лёд разведёт). Поэтому сравниваем со смесью без льда
    expect(wavesReached('Только баллисты')).toBeLessThan(wavesReached('Огонь и баллисты'))
  })
})

describe('залы одной сложности', () => {
  // Залы отбирали ботом: на каждом «Смешанная» доходит до той же волны, что в «Тронном зале».
  // Поменяли баланс или зал — сторож скажет, если какой-то зал стал заметно легче или тяжелее
  const reference = wavesReached('Смешанная')
  for (const level of LEVELS) {
    it(`${level.name}: «Смешанная» — в пределах ±1 волны от «Тронного зала»`, () => {
      const waves = playBot(level, strategy('Смешанная')).waves.length
      expect(Math.abs(waves - reference), `${waves} против ${reference}`).toBeLessThanOrEqual(1)
    })
  }
})

describe('потолок счёта (проверка правдоподобия на сервере)', () => {
  it('ни одна стратегия бота не набирает больше maxPossibleScore', () => {
    // Сервер отвергает счёт выше потолка: если потолок посчитан неверно,
    // честные игроки не попадут в таблицу лучших
    const level = createLevel(throneHall)
    for (const candidate of STRATEGIES) {
      const result = playBot(throneHall, candidate)
      const wavesCleared = result.outcome === 'won' ? result.waves.length : result.waves.length - 1
      expect(result.score, candidate.name).toBeLessThanOrEqual(
        maxPossibleScore(level, wavesCleared),
      )
    }
  })
})

describe('выгодность башен', () => {
  const rebels = STREAMS.find((stream) => stream.enemyId === 'rebel')!

  it('улучшение баллисты не становится намного выгоднее постройки', () => {
    // В v1 баллиста III давала на 48% больше урона на монету, чем баллиста I
    const first = damagePerGold(throneHall, TOWERS['ballista'], 0, rebels)
    const third = damagePerGold(throneHall, TOWERS['ballista'], 2, rebels)
    expect(third / first).toBeLessThan(1.25)
  })
})
