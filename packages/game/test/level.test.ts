import { describe, expect, it } from 'vitest'
import {
  LEVELS,
  PLAYABLE_LEVELS,
  createGame,
  createLevel,
  type LevelDef,
  type WaveGroup,
} from '../src/index.ts'
import { createPath } from '../src/core/path.ts'
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
    const entrance = throneHall.pathPoints[0]
    expect(entrance[1]).toBeGreaterThanOrEqual(throneHall.rows)
    expect(createLevel(throneHall).path.positionAt(0)).toEqual(entrance)
  })

  const invalidEndlessWave = throneHall.waves.length + 5
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
      name: 'NaN в координате входа',
      patch: { pathPoints: [[NaN, 13.5], throneHall.throne] },
      message: 'Координаты точки пути 1',
    },
    {
      name: 'путь из двух совпадающих точек',
      patch: { pathPoints: [throneHall.throne, throneHall.throne] },
      message: 'Длина отрезка пути 1–2',
    },
    {
      name: 'совпадающие соседние точки на пути ненулевой длины',
      patch: { pathPoints: [throneHall.pathPoints[0], ...throneHall.pathPoints] },
      message: 'Длина отрезка пути 1–2',
    },
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
      patch: { props: [{ kind: 'amphora', cell: [9, 3] }] },
      message: 'препятствие на клетке (9,3)',
    },
    {
      name: 'опечатка в бесконечном режиме',
      patch: {
        endlessWaveGroups: (waveNumber) =>
          waveNumber === invalidEndlessWave ? [['dragon', 1, 0, 0]] : [['rebel', 1, 0, 0]],
      },
      message: `неизвестный враг «dragon» в волне ${invalidEndlessWave}`,
    },
  ]

  for (const { name, patch, message } of broken) {
    it(`${name} — понятная ошибка`, () => {
      expect(() => createLevel({ ...throneHall, ...patch })).toThrow(message)
    })
  }
})

describe('расчёт пути', () => {
  it.each([Infinity, -Infinity])('координата %s в промежуточной точке недопустима', (value) => {
    expect(() => createPath([[4.5, 13.5], [4.5, value], throneHall.throne])).toThrow(
      'Координаты точки пути 2',
    )
  })

  it('длина отрезка может переполниться даже при конечных координатах', () => {
    expect(() =>
      createPath([
        [-Number.MAX_VALUE, 0],
        [Number.MAX_VALUE, 0],
      ]),
    ).toThrow('Длина отрезка пути 1–2')
  })

  it('полная длина может переполниться при сложении конечных длин отрезков', () => {
    expect(() =>
      createPath([
        [0, 0],
        [Number.MAX_VALUE, 0],
        [0, 0],
      ]),
    ).toThrow('Полная длина пути должна быть конечной')
  })
})

describe('залы', () => {
  const hallLevels = LEVELS.filter((level) => level.id !== 'compact-throne-hall').map(createLevel)
  const throne = createLevel(throneHall)

  it('для новых партий доступны только четыре выбранных зала', () => {
    expect(PLAYABLE_LEVELS.map((level) => level.id)).toEqual([
      'throne-hall',
      'marble-hall',
      'svetlitsa',
      'anubis-temple',
    ])
  })

  it('в Храме Анубиса анкх занимает клетку нижнего обелиска', () => {
    const def = PLAYABLE_LEVELS.find((level) => level.id === 'anubis-temple')!
    expect(def.props).toContainEqual({ kind: 'ankh', cell: [2, 7] })
    expect(createGame(def).isCellFree(2, 7)).toBe(false)
  })

  it('доступные залы компактны, имеют корректный путь и препятствия', () => {
    for (const def of PLAYABLE_LEVELS) {
      expect([def.cols, def.rows], def.id).toEqual([7, 11])
      const level = createLevel(def)
      expect(level.path.length, def.id).toBeGreaterThan(0)
      const originalProps = LEVELS.find((original) => original.id === def.id)?.props?.length ?? 0
      expect(def.props?.length ?? 0, def.id).toBe(
        originalProps + (def.id === 'throne-hall' ? 3 : 0),
      )
      for (const [index, point] of def.pathPoints.entries()) {
        if (index === 0) continue
        const previous = def.pathPoints[index - 1]
        expect(point[0] === previous[0] || point[1] === previous[1], def.id).toBe(true)
      }
    }
  })

  it('компактный зал меньше и сохраняет двадцать исходных волн', () => {
    const compact = LEVELS.find((level) => level.id === 'compact-throne-hall')!
    expect([compact.cols, compact.rows]).toEqual([7, 11])
    expect(compact.waves).toEqual(throneHall.waves)
    expect(createLevel(compact).path.length).toBeGreaterThan(0)
  })

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

  it('препятствия не у самого края поля — по краю смотрится дёшево', () => {
    for (const { def } of hallLevels) {
      for (const { cell } of def.props ?? []) {
        const [col, row] = cell
        const isEdge = col === 0 || col === def.cols - 1 || row === 0 || row === def.rows - 1
        expect(isEdge, `${def.id}: препятствие у края (${col},${row})`).toBe(false)
      }
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
