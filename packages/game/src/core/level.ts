import { ENEMIES } from '../data/enemies.ts'
import type { Level, LevelDef, Point } from '../types.ts'
import { createPath } from './path.ts'

/** Ключ клетки для Set/Map: "столбец,строка" */
export const cellKey = (col: number, row: number): string => `${col},${row}`

/** Через сколько клеток ковра проверяем, по какой клетке он идёт (меньше клетки, чтобы ничего не пропустить) */
const CARPET_SAMPLE_STEP = 0.1

/** Лежит ли точка (или клетка) внутри поля уровня */
export function isInsideLevelField(def: LevelDef, col: number, row: number): boolean {
  return col >= 0 && col < def.cols && row >= 0 && row < def.rows
}

function fail(def: LevelDef, message: string): never {
  throw new Error(`Уровень «${def.id}»: ${message}`)
}

function checkFieldSize(def: LevelDef): void {
  if (!Number.isInteger(def.cols) || !Number.isInteger(def.rows) || def.cols < 1 || def.rows < 1) {
    fail(def, `размер поля должен быть целым и положительным, а он ${def.cols}×${def.rows}`)
  }
}

function checkThroneAndPath(def: LevelDef): void {
  const isInside = ([x, y]: Point) => isInsideLevelField(def, x, y)
  if (!isInside(def.throne)) fail(def, `трон (${def.throne}) за краем поля`)
  // Первая точка пути может быть за краем — это дверь, откуда выходят враги.
  // А последняя — у трона, она должна быть на поле.
  const end = def.pathPoints[def.pathPoints.length - 1]
  if (!end || !isInside(end)) {
    fail(def, `путь должен заканчиваться на поле, а заканчивается в (${end})`)
  }
}

function checkBlockedCells(def: LevelDef): void {
  for (const [col, row] of def.blockedCells) {
    const isWholeCell = Number.isInteger(col) && Number.isInteger(row)
    if (!isWholeCell || !isInsideLevelField(def, col, row)) {
      fail(def, `закрытая клетка (${col},${row}) — не целая или за краем поля`)
    }
  }
}

function checkStartValues(def: LevelDef): void {
  if (def.startGold < 0) fail(def, `стартовое золото не может быть отрицательным`)
  if (def.startLives < 1) fail(def, `у трона должна быть хотя бы одна жизнь`)
}

function checkWaves(def: LevelDef): void {
  if (!def.waves.length) fail(def, `нет ни одной волны`)

  def.waves.forEach((waveGroups, i) => {
    const waveNumber = i + 1
    if (!waveGroups.length) fail(def, `волна ${waveNumber} пустая`)
    for (const [enemyId, count, gap, delay] of waveGroups) {
      if (!ENEMIES[enemyId]) fail(def, `неизвестный враг «${enemyId}» в волне ${waveNumber}`)
      if (!Number.isInteger(count) || count < 1)
        fail(def, `в волне ${waveNumber} врагов «${enemyId}»: ${count} — нужно целое ≥ 1`)
      if (!(gap >= 0) || !(delay >= 0)) {
        fail(
          def,
          `в волне ${waveNumber} у «${enemyId}» пауза ${gap} или задержка ${delay} отрицательная`,
        )
      }
    }
  })
}

/**
 * Проверить описание уровня. Опечатка в новом уровне должна давать понятную ошибку
 * при запуске, а не невидимых врагов или трон за краем экрана.
 */
function validate(def: LevelDef): void {
  checkFieldSize(def)
  checkThroneAndPath(def)
  checkBlockedCells(def)
  checkStartValues(def)
  checkWaves(def)
}

/** Подготовить уровень к игре: проверить, рассчитать путь и клетки, где строить нельзя */
export function createLevel(def: LevelDef): Level {
  validate(def)

  const path = createPath(def.pathPoints)
  const blockedCellKeys = new Set(def.blockedCells.map(([col, row]) => cellKey(col, row)))
  // Все клетки, по которым проходит ковёр
  for (let distance = 0; distance <= path.length; distance += CARPET_SAMPLE_STEP) {
    const [x, y] = path.positionAt(distance)
    const col = Math.floor(x)
    const row = Math.floor(y)
    if (isInsideLevelField(def, col, row)) blockedCellKeys.add(cellKey(col, row))
  }

  return { def, path, blockedCellKeys, waveCount: def.waves.length }
}
