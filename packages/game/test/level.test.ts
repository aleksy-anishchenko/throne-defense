import { describe, expect, it } from 'vitest'
import { LEVELS, createGame, createLevel, type LevelDef, type WaveGroup } from '../src/index.ts'
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
      name: 'препятствие на ковре',
      patch: { props: [{ kind: 'column', cell: [4, 12] }] },
      message: 'препятствие на ковре, клетка (4,12)',
    },
    {
      name: 'препятствие за краем поля',
      patch: { props: [{ kind: 'statue', cell: [9, 3] }] },
      message: 'препятствие на клетке (9,3)',
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

describe('залы', () => {
  const hallLevels = LEVELS.map(createLevel)
  const throne = createLevel(throneHall)

  it('id и названия не повторяются', () => {
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(LEVELS.length)
    expect(new Set(LEVELS.map((level) => level.name)).size).toBe(LEVELS.length)
  })

  it('у всех одно поле и трон в одном месте — на это рассчитана отрисовка', () => {
    for (const { def } of hallLevels) {
      expect([def.cols, def.rows, ...def.throne], def.id).toEqual([
        throneHall.cols,
        throneHall.rows,
        ...throneHall.throne,
      ])
    }
  })

  it('ковёр у всех одной длины — иначе по времени под обстрелом нечестно', () => {
    for (const level of hallLevels) {
      expect(level.path.length, level.def.id).toBeCloseTo(throne.path.length)
    }
  })

  it('на препятствии строить нельзя', () => {
    const [withProps] = hallLevels.filter((level) => level.def.props?.length)
    const [col, row] = withProps.def.props![0].cell
    expect(withProps.blockedCellKeys.has(`${col},${row}`)).toBe(true)
  })

  it('новая партия может начаться в другом зале: другой ковёр, свободные клетки', () => {
    const game = createGame(throneHall)
    game.reset()
    const other = LEVELS.find((level) => level.id !== throneHall.id)!
    game.reset(other)
    expect(game.level.def.id).toBe(other.id)
    const [col, row] = other.props![0].cell
    expect(game.isCellFree(col, row)).toBe(false)
    expect(game.build('archer', col, row)).toBeNull()
  })
})
