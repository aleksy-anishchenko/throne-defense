<script setup lang="ts">
// Поле игры: canvas, игровой цикл (useGameLoop) и нажатия на клетки (useBoardPointer)
import { useTemplateRef } from 'vue'
import { useBoardPointer } from '@/composables/useBoardPointer'
import { useGameLoop } from '@/composables/useGameLoop'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
const stageElement = useTemplateRef('stageElement')
const boardCanvas = useTemplateRef('boardCanvas')

useGameLoop(stageElement, boardCanvas)
const { onPointerDown, onPointerMove, onPointerLeave } = useBoardPointer(boardCanvas)
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
      @pointerleave="onPointerLeave"
      @contextmenu.prevent
    ></canvas>
    <div class="toast" :class="{ visible: store.toast.isVisible }" role="status" aria-live="polite">
      {{ store.toast.text }}
    </div>
  </main>
</template>
