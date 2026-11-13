import { ENEMIES } from '../data/enemies.ts'
import type { Level, LevelDef, Point, WaveGroup } from '../types.ts'
import { createPath } from './path.ts'

/** Ключ клетки для Set/Map: "столбец,строка" */
export const cellKey = (col: number, row: number): string => `${col},${row}`

/** Через сколько клеток ковра проверяем, по какой клетке он идёт (меньше клетки, чтобы ничего не пропустить) */
const CARPET_SAMPLE_STEP = 0.1

/** Лежит ли точка внутри поля уровня (координаты могут быть дробными: трон, путь) */
export function isInsideLevelField(def: LevelDef, col: number, row: number): boolean {
  return col >= 0 && col < def.cols && row >= 0 && row < def.rows
}

/**
 * Клетка ли это поля: целые столбец и строка внутри поля.
 * Дробная «клетка» (4.5, 10.5) даёт ключ "4.5,10.5", который не совпадает
 * ни с одной закрытой клеткой, — без этой проверки башню можно было поставить на ковёр.
 */
export function isLevelCell(def: LevelDef, col: number, row: number): boolean {
  return Number.isInteger(col) && Number.isInteger(row) && isInsideLevelField(def, col, row)
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
    if (!isLevelCell(def, col, row)) {
      fail(def, `закрытая клетка (${col},${row}) — не целая или за краем поля`)
    }
  }
  for (const { cell } of def.props ?? []) {
    if (!isLevelCell(def, cell[0], cell[1])) {
      fail(def, `препятствие на клетке (${cell}) — не целой или за краем поля`)
    }
  }
}

/** Число, а не NaN или бесконечность, и не меньше min */
const isNumberAtLeast = (value: number, min: number) => Number.isFinite(value) && value >= min

function checkStartValues(def: LevelDef): void {
  if (!isNumberAtLeast(def.startGold, 0)) {
    fail(def, `стартовое золото должно быть числом не меньше 0, а оно ${def.startGold}`)
  }
  if (!Number.isInteger(def.startLives) || def.startLives < 1) {
    fail(def, `у трона должна быть хотя бы одна жизнь (целое число), а их ${def.startLives}`)
  }
}

/** Проверить одну волну: waveNumber — её номер (для понятного текста ошибки) */
function checkWave(def: LevelDef, waveGroups: readonly WaveGroup[], waveNumber: number): void {
  if (!waveGroups.length) fail(def, `волна ${waveNumber} пустая`)
  for (const [enemyId, count, gap, delay] of waveGroups) {
    if (!Object.hasOwn(ENEMIES, enemyId))
      fail(def, `неизвестный враг «${enemyId}» в волне ${waveNumber}`)
    if (!Number.isInteger(count) || count < 1)
      fail(def, `в волне ${waveNumber} врагов «${enemyId}»: ${count} — нужно целое ≥ 1`)
    if (!isNumberAtLeast(gap, 0) || !isNumberAtLeast(delay, 0)) {
      fail(
        def,
        `в волне ${waveNumber} у «${enemyId}» пауза ${gap} или задержка ${delay} отрицательная или не число`,
      )
    }
  }
}

/**
 * Сколько волн бесконечного режима проверяем при загрузке. Их состав считает функция,
 * так что все не проверить; без этого опечатка всплыла бы только после победы
 */
const ENDLESS_WAVES_TO_CHECK = 30

function checkWaves(def: LevelDef): void {
  if (!def.waves.length) fail(def, `нет ни одной волны`)
  def.waves.forEach((waveGroups, i) => checkWave(def, waveGroups, i + 1))

  const firstEndlessWave = def.waves.length + 1
  for (let offset = 0; offset < ENDLESS_WAVES_TO_CHECK; offset++) {
    const waveNumber = firstEndlessWave + offset
    checkWave(def, def.endlessWaveGroups(waveNumber), waveNumber)
  }
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
  const propCellKeys = new Set((def.props ?? []).map(({ cell }) => cellKey(cell[0], cell[1])))
  // Все клетки, по которым проходит ковёр
  for (let distance = 0; distance <= path.length; distance += CARPET_SAMPLE_STEP) {
    const [x, y] = path.positionAt(distance)
    const col = Math.floor(x)
    const row = Math.floor(y)
    if (!isInsideLevelField(def, col, row)) continue
    // Препятствие на ковре загородило бы дорогу врагам — это опечатка в уровне
    if (propCellKeys.has(cellKey(col, row)))
      fail(def, `препятствие на ковре, клетка (${col},${row})`)
    blockedCellKeys.add(cellKey(col, row))
  }
  for (const key of propCellKeys) blockedCellKeys.add(key)

  return { def, path, blockedCellKeys, waveCount: def.waves.length }
}
