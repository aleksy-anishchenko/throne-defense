<script setup lang="ts">
// Поле игры. Здесь крутится игровой цикл: каждый кадр
// 1) игра делает шаги симуляции, 2) поле перерисовывается, 3) интерфейс получает свежие числа.
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { createRenderer, type Renderer } from '@/render/renderer'
import { useGameStore } from '@/stores/game'
import type { Cell } from '@/types'

/** Самый длинный кадр для симуляции, в секундах */
const MAX_FRAME_DT = 0.1
/** Миллисекунд в секунде (браузер даёт время кадра в мс) */
const MS_PER_SECOND = 1000

const store = useGameStore()
const stageElement = useTemplateRef('stageElement')
const boardCanvas = useTemplateRef('boardCanvas')

let renderer: Renderer | null = null
let resizeObserver: ResizeObserver | null = null
let animationFrameId = 0
let lastTimestamp = 0

function runFrame(timestamp: number) {
  // Если вкладка была скрыта, не пытаемся «догнать» минуты — максимум MAX_FRAME_DT (0,1 с) за кадр
  // `|| 0` — страховка: если получилось «не число» (NaN), считаем, что времени не прошло
  const realDt = Math.min(MAX_FRAME_DT, (timestamp - lastTimestamp) / MS_PER_SECOND || 0)
  lastTimestamp = timestamp
  store.game.advance(realDt)
  renderer?.draw(realDt, store.boardView())
  store.syncHud()
  animationFrameId = requestAnimationFrame(runFrame)
}

function cellFromPointer(event: PointerEvent): Cell {
  const bounds = boardCanvas.value!.getBoundingClientRect()
  const { cols, rows } = store.game.level.def
  return {
    col: Math.floor(((event.clientX - bounds.left) / bounds.width) * cols),
    row: Math.floor(((event.clientY - bounds.top) / bounds.height) * rows),
  }
}

function onPointerDown(event: PointerEvent) {
  event.preventDefault()
  store.cursorCell = null
  const { col, row } = cellFromPointer(event)
  store.tapCell(col, row)
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  const cell = cellFromPointer(event)
  store.hoverCell = store.game.isInsideField(cell.col, cell.row) ? cell : null
}

onMounted(() => {
  renderer = createRenderer(boardCanvas.value!, store.game)
  resizeObserver = new ResizeObserver(() => {
    const bounds = stageElement.value!.getBoundingClientRect()
    renderer?.resize(bounds.width, bounds.height)
  })
  resizeObserver.observe(stageElement.value!)
  animationFrameId = requestAnimationFrame(runFrame)
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId)
  resizeObserver?.disconnect()
  renderer?.dispose()
})
</script>

<template>
  <main ref="stageElement" class="stage">
    <canvas
      id="board"
      ref="boardCanvas"
      tabindex="0"
      aria-label="Тронный зал: игровое поле"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerleave="store.hoverCell = null"
    ></canvas>
    <div class="toast" :class="{ visible: store.toast.isVisible }" role="status" aria-live="polite">
      {{ store.toast.text }}
    </div>
  </main>
</template>
