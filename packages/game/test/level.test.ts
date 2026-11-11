import { describe, expect, it } from 'vitest'
import { LEVELS, createLevel, type LevelDef, type WaveGroup } from '../src/index.ts'
import { throneHall } from '../src/levels/throne-hall.ts'

const withWaves = (waves: WaveGroup[][]): LevelDef => ({ ...throneHall, waves })

describe('проверка уровня при загрузке', () => {
  it('все уровни игры проходят проверку', () => {
    for (const level of LEVELS) expect(() => createLevel(level), level.id).not.toThrow()
  })

  it('ковёр и помост закрыты для постройки', () => {
    const level = createLevel(throneHall)
    expect(level.blocked.has('4,12')).toBe(true) // ковёр у двери
    expect(level.blocked.has('4,0')).toBe(true) // помост
    expect(level.blocked.has('5,11')).toBe(false) // свободная плита
  })

  it('первая точка пути может быть за краем — это дверь', () => {
    expect(throneHall.path[0][1]).toBeGreaterThanOrEqual(throneHall.rows)
    expect(() => createLevel(throneHall)).not.toThrow()
  })

  const broken: [string, Partial<LevelDef>, string][] = [
    ['неизвестный враг', withWaves([[['dragon', 1, 0, 0]]]), 'неизвестный враг «dragon» в волне 1'],
    ['пустая волна', withWaves([[['rebel', 3, 1, 0]], []]), 'волна 2 пустая'],
    ['ноль врагов в группе', withWaves([[['rebel', 0, 1, 0]]]), 'нужно целое ≥ 1'],
    ['дробное число врагов', withWaves([[['rebel', 2.5, 1, 0]]]), 'нужно целое ≥ 1'],
    ['отрицательная пауза', withWaves([[['rebel', 3, -1, 0]]]), 'отрицательная'],
    ['нет волн', withWaves([]), 'нет ни одной волны'],
    ['трон за краем', { throne: [4.5, 20] }, 'трон'],
    [
      'путь уходит за край',
      {
        path: [
          [4.5, 13.5],
          [4.5, -2],
        ],
      },
      'путь должен заканчиваться на поле',
    ],
    ['помост за краем', { blocked: [[9, 0]] }, 'закрытая клетка'],
    ['нет жизней', { startLives: 0 }, 'хотя бы одна жизнь'],
  ]

  for (const [name, patch, message] of broken) {
    it(`${name} — понятная ошибка`, () => {
      expect(() => createLevel({ ...throneHall, ...patch })).toThrow(message)
    })
  }
})
