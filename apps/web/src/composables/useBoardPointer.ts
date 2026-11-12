// Мышь и касания на поле: из координат на экране — в клетку поля.

import type { ShallowRef } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import type { Cell } from '@/types'

/** event.button основной кнопки: левая кнопка мыши, касание пальцем, кончик пера */
const PRIMARY_BUTTON = 0

/** Обработчики событий указателя для canvas поля */
export function useBoardPointer(boardCanvas: Readonly<ShallowRef<HTMLCanvasElement | null>>) {
  const store = useGameStore()
  const selection = useSelectionStore()

  function cellFromPointer(event: PointerEvent): Cell {
    const bounds = boardCanvas.value!.getBoundingClientRect()
    const { cols, rows } = store.game.level.def
    return {
      col: Math.floor(((event.clientX - bounds.left) / bounds.width) * cols),
      row: Math.floor(((event.clientY - bounds.top) / bounds.height) * rows),
    }
  }

  function onPointerDown(event: PointerEvent) {
    // Правая и средняя кнопки мыши ничего не строят.
    // isPrimary отсекает второй палец при касании двумя пальцами
    if (!event.isPrimary || event.button !== PRIMARY_BUTTON) return
    event.preventDefault()
    selection.cursorCell = null
    const { col, row } = cellFromPointer(event)
    // Shift — оставить стража «в руке» и ставить подряд
    selection.tapCell(col, row, event.shiftKey)
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    const cell = cellFromPointer(event)
    selection.hoverCell = store.game.isInsideField(cell.col, cell.row) ? cell : null
  }

  function onPointerLeave() {
    selection.hoverCell = null
  }

  return { onPointerDown, onPointerMove, onPointerLeave }
}
