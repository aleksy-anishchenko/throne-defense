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
    expect(level.blockedCellKeys.has('4,12')).toBe(true) // ковёр у двери
    expect(level.blockedCellKeys.has('4,0')).toBe(true) // помост
    expect(level.blockedCellKeys.has('5,11')).toBe(false) // свободная плита
  })

  it('первая точка пути может быть за краем — это дверь', () => {
    expect(throneHall.pathPoints[0][1]).toBeGreaterThanOrEqual(throneHall.rows)
    expect(() => createLevel(throneHall)).not.toThrow()
  })

  const broken: { name: string; patch: Partial<LevelDef>; message: string }[] = [
    {
      name: 'неизвестный враг',
      patch: withWaves([[['dragon', 1, 0, 0]]]),
      message: 'неизвестный враг «dragon» в волне 1',
    },
    {
      name: 'пустая волна',
      patch: withWaves([[['rebel', 3, 1, 0]], []]),
      message: 'волна 2 пустая',
    },
    {
      name: 'ноль врагов в группе',
      patch: withWaves([[['rebel', 0, 1, 0]]]),
      message: 'нужно целое ≥ 1',
    },
    {
      name: 'дробное число врагов',
      patch: withWaves([[['rebel', 2.5, 1, 0]]]),
      message: 'нужно целое ≥ 1',
    },
    {
      name: 'отрицательная пауза',
      patch: withWaves([[['rebel', 3, -1, 0]]]),
      message: 'отрицательная',
    },
    { name: 'нет волн', patch: withWaves([]), message: 'нет ни одной волны' },
    { name: 'трон за краем', patch: { throne: [4.5, 20] }, message: 'трон' },
    {
      name: 'путь уходит за край',
      patch: {
        pathPoints: [
          [4.5, 13.5],
          [4.5, -2],
        ],
      },
      message: 'путь должен заканчиваться на поле',
    },
    { name: 'помост за краем', patch: { blockedCells: [[9, 0]] }, message: 'закрытая клетка' },
    { name: 'нет жизней', patch: { startLives: 0 }, message: 'хотя бы одна жизнь' },
    { name: 'дробные жизни', patch: { startLives: 2.5 }, message: 'хотя бы одна жизнь' },
    { name: 'золото — не число', patch: { startGold: NaN }, message: 'стартовое золото' },
    {
      name: 'бесконечная пауза',
      patch: withWaves([[['rebel', 3, Infinity, 0]]]),
      message: 'не число',
    },
    {
      name: 'опечатка в бесконечном режиме',
      patch: {
        endlessWaveGroups: (waveNumber) =>
          waveNumber === 25 ? [['dragon', 1, 0, 0]] : [['rebel', 1, 0, 0]],
      },
      message: 'неизвестный враг «dragon» в волне 25',
    },
  ]

  for (const { name, patch, message } of broken) {
    it(`${name} — понятная ошибка`, () => {
      expect(() => createLevel({ ...throneHall, ...patch })).toThrow(message)
    })
  }
})
