import { ENEMIES } from '../data/enemies.ts'
import type { Level, LevelDef, Point } from '../types.ts'
import { createPath } from './path.ts'

/** Ключ клетки для Set/Map: "столбец,строка" */
export const cellKey = (c: number, r: number): string => `${c},${r}`

/**
 * Проверить описание уровня. Опечатка в новом уровне должна давать понятную ошибку
 * при запуске, а не невидимых врагов или трон за краем экрана.
 */
function validate(def: LevelDef): void {
  const fail = (msg: string): never => {
    throw new Error(`Уровень «${def.id}»: ${msg}`)
  }
  const isInt = (v: number) => Number.isInteger(v)
  const inside = ([x, y]: Point) => x >= 0 && x < def.cols && y >= 0 && y < def.rows

  if (!isInt(def.cols) || !isInt(def.rows) || def.cols < 1 || def.rows < 1) {
    fail(`размер поля должен быть целым и положительным, а он ${def.cols}×${def.rows}`)
  }
  if (!inside(def.throne)) fail(`трон (${def.throne}) за краем поля`)
  // Первая точка пути может быть за краем — это дверь, откуда выходят враги.
  // А последняя — у трона, она должна быть на поле.
  const end = def.path[def.path.length - 1]
  if (!end || !inside(end)) fail(`путь должен заканчиваться на поле, а заканчивается в (${end})`)
  for (const cell of def.blocked) {
    if (!isInt(cell[0]) || !isInt(cell[1]) || !inside(cell)) {
      fail(`закрытая клетка (${cell}) — не целая или за краем поля`)
    }
  }
  if (def.startGold < 0) fail(`стартовое золото не может быть отрицательным`)
  if (def.startLives < 1) fail(`у трона должна быть хотя бы одна жизнь`)
  if (!def.waves.length) fail(`нет ни одной волны`)

  def.waves.forEach((wave, i) => {
    const n = i + 1
    if (!wave.length) fail(`волна ${n} пустая`)
    for (const [enemy, count, gap, delay] of wave) {
      if (!ENEMIES[enemy]) fail(`неизвестный враг «${enemy}» в волне ${n}`)
      if (!isInt(count) || count < 1)
        fail(`в волне ${n} врагов «${enemy}»: ${count} — нужно целое ≥ 1`)
      if (!(gap >= 0) || !(delay >= 0)) {
        fail(`в волне ${n} у «${enemy}» пауза ${gap} или задержка ${delay} отрицательная`)
      }
    }
  })
}

/** Подготовить уровень к игре: проверить, рассчитать путь и клетки, где строить нельзя */
export function createLevel(def: LevelDef): Level {
  validate(def)

  const path = createPath(def.path)
  const blocked = new Set(def.blocked.map(([c, r]) => cellKey(c, r)))
  // Все клетки, по которым проходит ковёр
  for (let d = 0; d <= path.length; d += 0.1) {
    const [x, y] = path.posAt(d)
    const c = Math.floor(x)
    const r = Math.floor(y)
    if (c >= 0 && c < def.cols && r >= 0 && r < def.rows) blocked.add(cellKey(c, r))
  }

  return { def, path, blocked, maxWave: def.waves.length }
}
