<script setup lang="ts">
// Поле игры. Здесь крутится игровой цикл: каждый кадр
// 1) игра делает шаги симуляции, 2) поле перерисовывается, 3) интерфейс получает свежие числа.
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { createRenderer, type Renderer } from '@/render/renderer'
import { useGameStore } from '@/stores/game'
import type { Cell } from '@/types'

const store = useGameStore()
const stage = useTemplateRef('stage')
const board = useTemplateRef('board')

let renderer: Renderer | null = null
let observer: ResizeObserver | null = null
let raf = 0
let lastTs = 0

function frame(ts: number) {
  // Если вкладка была скрыта, не пытаемся «догнать» минуты — максимум 0,1 с за кадр
  const realDt = Math.min(0.1, (ts - lastTs) / 1000 || 0)
  lastTs = ts
  store.game.advance(realDt)
  renderer?.draw(realDt, store.view())
  store.sync()
  raf = requestAnimationFrame(frame)
}

function cellAt(ev: PointerEvent): Cell {
  const box = board.value!.getBoundingClientRect()
  const { cols, rows } = store.game.level.def
  return {
    c: Math.floor(((ev.clientX - box.left) / box.width) * cols),
    r: Math.floor(((ev.clientY - box.top) / box.height) * rows),
  }
}

function onPointerDown(ev: PointerEvent) {
  ev.preventDefault()
  store.cursor = null
  const { c, r } = cellAt(ev)
  store.tapTile(c, r)
}

function onPointerMove(ev: PointerEvent) {
  if (ev.pointerType !== 'mouse') return
  const p = cellAt(ev)
  store.hover = store.inGrid(p.c, p.r) ? p : null
}

onMounted(() => {
  renderer = createRenderer(board.value!, store.game)
  observer = new ResizeObserver(() => {
    const box = stage.value!.getBoundingClientRect()
    renderer?.resize(box.width, box.height)
  })
  observer.observe(stage.value!)
  raf = requestAnimationFrame(frame)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  renderer?.dispose()
})
</script>

<template>
  <main ref="stage" class="stage">
    <canvas
      id="board"
      ref="board"
      tabindex="0"
      aria-label="Тронный зал: игровое поле"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerleave="store.hover = null"
    ></canvas>
    <div class="toast" :class="{ on: store.toast.on }" role="status" aria-live="polite">
      {{ store.toast.text }}
    </div>
  </main>
</template>
