// Одноразовый генератор залов: строит дорожки той же длины, что в «Тронном зале», но с другими
// поворотами, ставит препятствия, гоняет на каждой карте бота и печатает отобранные.
// Запуск: node tools/maps/generate.ts > /tmp/halls.json
// Результат перенесён руками в packages/game/src/levels/halls.ts; сам скрипт — для истории.

import { LEVELS, type LevelDef, type LevelProp, type Point, type PropKind } from '@throne/game'
import { STRATEGIES, playBot } from '../balance/bot.ts'

const BASE = LEVELS.find((level) => level.id === 'throne-hall')!
const { cols: COLS, rows: ROWS } = BASE

/** Клеток ковра — как в «Тронном зале» (28): длина пути одна, иначе нечестно по времени */
const PATH_CELLS = 28
/** Последняя клетка ковра — под троном, в неё входят снизу */
const END: Cell = [4, 1]
const BEFORE_END: Cell = [4, 2]
/** Ковёр не прижимается к краю: столбцы 1..7, строки 1..12 */
const MIN_COL = 1
const MAX_COL = COLS - 2
/** Прямые куски между поворотами — не короче стольких шагов (без «лесенок») */
const MIN_RUN = 2
/** Сколько препятствий на карте */
const PROP_COUNT = 3
const PROP_KINDS: readonly PropKind[] = ['column', 'statue', 'brazier', 'barrel']

type Cell = readonly [col: number, row: number]
const key = ([col, row]: Cell) => `${col},${row}`
const DIRECTIONS: readonly Cell[] = [
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
]

/** Псевдослучайные числа с зерном — чтобы запуск можно было повторить */
function makeRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

/**
 * Дорожка от двери (столбец doorCol, нижняя строка) до клетки под троном, ровно PATH_CELLS клеток.
 * Правила: ходим по клеткам вверх/вниз/вбок; не касаемся своих же клеток, кроме соседних по пути
 * (между коридорами — хотя бы одна плита пола); прямые куски — не короче MIN_RUN.
 * Поиск в глубину со случайным порядком; null — не нашли за отведённые шаги
 */
function generatePath(doorCol: number, random: () => number): Cell[] | null {
  const start: Cell = [doorCol, ROWS - 1]
  const path: Cell[] = [start]
  const used = new Set([key(start)])
  let budget = 20000

  const isInside = ([col, row]: Cell) => col >= MIN_COL && col <= MAX_COL && row >= 1 && row < ROWS
  const touchesOld = (cell: Cell, previous: Cell) =>
    DIRECTIONS.some(([dc, dr]) => {
      const neighbour: Cell = [cell[0] + dc, cell[1] + dr]
      return used.has(key(neighbour)) && key(neighbour) !== key(previous)
    })

  function runLength(): number {
    // Сколько последних шагов сделано в одном направлении
    if (path.length < 2) return 99
    const last = path.length - 1
    const dc = path[last][0] - path[last - 1][0]
    const dr = path[last][1] - path[last - 1][1]
    let length = 1
    for (let i = last - 1; i > 0; i--) {
      if (path[i][0] - path[i - 1][0] !== dc || path[i][1] - path[i - 1][1] !== dr) break
      length++
    }
    return length
  }

  function search(): boolean {
    if (--budget < 0) return false
    const current = path[path.length - 1]
    const remaining = PATH_CELLS - path.length
    if (remaining === 0) return key(current) === key(END)
    // Успеем ли дойти: манхэттенское расстояние и чётность
    const distance = Math.abs(current[0] - END[0]) + Math.abs(current[1] - END[1])
    if (distance > remaining || (remaining - distance) % 2) return false

    const previous = path[path.length - 2]
    const lastDirection: Cell | null = previous
      ? [current[0] - previous[0], current[1] - previous[1]]
      : [0, -1]
    const mustGoStraight = path.length > 1 && runLength() < MIN_RUN
    const order = [...DIRECTIONS].sort(() => random() - 0.5)
    // Прямо — чаще: длинные коридоры красивее
    if (lastDirection && random() < 0.55) order.unshift(lastDirection)
    const tried = new Set<string>()
    for (const direction of order) {
      if (tried.has(key(direction))) continue
      tried.add(key(direction))
      const isStraight = !!lastDirection && key(direction) === key(lastDirection)
      if (mustGoStraight && !isStraight) continue
      const next: Cell = [current[0] + direction[0], current[1] + direction[1]]
      if (!isInside(next) || used.has(key(next)) || touchesOld(next, current)) continue
      // В клетку под троном входим только снизу, и это последний шаг
      if (key(next) === key(END) && (key(current) !== key(BEFORE_END) || remaining !== 1)) continue
      path.push(next)
      used.add(key(next))
      if (search()) return true
      path.pop()
      used.delete(key(next))
    }
    return false
  }

  return search() ? path : null
}

/** Точки ковра для LevelDef: дверь за краем, повороты, вход в трон */
function toPathPoints(path: Cell[]): Point[] {
  const points: Point[] = [[path[0][0] + 0.5, ROWS + 0.5]]
  // Перед первой клеткой — «клетка» за дверью: так поворот сразу у двери тоже попадёт в точки
  const withDoor: Cell[] = [[path[0][0], ROWS], ...path]
  for (let i = 1; i < withDoor.length - 1; i++) {
    const [a, b, c] = [withDoor[i - 1], withDoor[i], withDoor[i + 1]]
    const isTurn = b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]
    if (isTurn) points.push([b[0] + 0.5, b[1] + 0.5])
  }
  points.push([END[0] + 0.5, 0.8])
  return points
}

/**
 * Препятствия — на плитах рядом с ковром (до него не дальше одной клетки, считая по диагонали):
 * там самые выгодные места для башен, и препятствие меняет расстановку
 */
function placeProps(path: Cell[], random: () => number): LevelProp[] {
  const pathKeys = new Set(path.map(key))
  const candidates: Cell[] = []
  for (let row = 1; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (pathKeys.has(key([col, row]))) continue
      const nearPath = path.some(([pc, pr]) => Math.abs(pc - col) <= 1 && Math.abs(pr - row) <= 1)
      if (nearPath) candidates.push([col, row])
    }
  }
  const props: LevelProp[] = []
  while (props.length < PROP_COUNT && candidates.length) {
    const [cell] = candidates.splice(Math.floor(random() * candidates.length), 1)
    // Препятствия не вплотную друг к другу
    if (
      props.some(
        ({ cell: other }) => Math.abs(other[0] - cell[0]) + Math.abs(other[1] - cell[1]) < 2,
      )
    ) {
      continue
    }
    props.push({ kind: PROP_KINDS[Math.floor(random() * PROP_KINDS.length)], cell })
  }
  return props
}

const STRATEGY_NAMES = ['Смешанная', 'Огонь и баллисты', 'Только лучники']
const wavesReached = (def: LevelDef, name: string) =>
  playBot(
    def,
    STRATEGIES.find((strategy) => strategy.name === name)!,
  ).waves.length

const reference = Object.fromEntries(STRATEGY_NAMES.map((name) => [name, wavesReached(BASE, name)]))
console.error('Тронный зал:', reference)

const random = makeRandom(Number(process.argv[2] ?? 7))
const seen = new Set<string>()
const accepted: { def: LevelDef; waves: Record<string, number>; doorCol: number }[] = []
const ATTEMPTS = Number(process.argv[3] ?? 400)
for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
  const doorCol = MIN_COL + Math.floor(random() * (MAX_COL - MIN_COL + 1))
  const path = generatePath(doorCol, random)
  if (!path || seen.has(path.map(key).join(';'))) continue
  seen.add(path.map(key).join(';'))
  const def: LevelDef = {
    ...BASE,
    id: `hall-${accepted.length + 1}`,
    name: `Зал ${accepted.length + 1}`,
    pathPoints: toPathPoints(path),
    props: placeProps(path, random),
  }
  const waves = Object.fromEntries(STRATEGY_NAMES.map((name) => [name, wavesReached(def, name)]))
  // Сложность как у «Тронного зала»: каждая стратегия — не дальше ±1 волны
  const isFair = STRATEGY_NAMES.every((name) => Math.abs(waves[name] - reference[name]) <= 1)
  console.error(attempt, doorCol, waves, isFair ? 'берём' : '')
  if (isFair) accepted.push({ def, waves, doorCol })
}

console.log(
  JSON.stringify(
    accepted.map(({ def, waves, doorCol }) => ({
      doorCol,
      waves,
      pathPoints: def.pathPoints,
      props: def.props,
    })),
  ),
)
