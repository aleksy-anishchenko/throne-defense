<script setup lang="ts">
// Поле игры: canvas, игровой цикл (useGameLoop) и нажатия на клетки (useBoardPointer)
import { useTemplateRef } from 'vue'
import { useBoardPointer } from '@/composables/useBoardPointer'
import { useGameLoop } from '@/composables/useGameLoop'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'

const store = useGameStore()
const selection = useSelectionStore()
const stageElement = useTemplateRef('stageElement')
const boardCanvas = useTemplateRef('boardCanvas')

useGameLoop(stageElement, boardCanvas)
const { onPointerDown, onPointerMove, onPointerLeave } = useBoardPointer(boardCanvas)
</script>

<template>
  <!-- touchend.prevent: нажатие на поле срабатывает уже на pointerdown, а после касания браузер
       ещё шлёт «щелчок». Safari на iPhone ищет, что под пальцем, заново — а там уже
       открывшееся меню башни, и щелчок закрывал его. Отменённое касание щелчка не даёт -->
  <main ref="stageElement" class="stage">
    <canvas
      id="board"
      ref="boardCanvas"
      :class="{ clickable: selection.isBoardClickable }"
      tabindex="0"
      aria-label="Тронный зал: игровое поле"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
      @touchend.prevent
      @contextmenu.prevent
    ></canvas>
    <div class="toast" :class="{ visible: store.toast.isVisible }" role="status" aria-live="polite">
      {{ store.toast.text }}
    </div>
  </main>
</template>
