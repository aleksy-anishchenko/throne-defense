<script setup lang="ts">
// Поле игры: canvas, игровой цикл (useGameLoop) и нажатия на клетки (useBoardPointer)
import { useTemplateRef } from 'vue'
import { useBoardPointer } from '@/composables/useBoardPointer'
import { useGameLoop } from '@/composables/useGameLoop'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import RewardInventory from './RewardInventory.vue'

const store = useGameStore()
const selection = useSelectionStore()
const boardArea = useTemplateRef('boardArea')
const boardCanvas = useTemplateRef('boardCanvas')

useGameLoop(boardArea, boardCanvas)
const { onPointerDown, onPointerMove, onPointerLeave } = useBoardPointer(boardCanvas)
</script>

<template>
  <main class="stage">
    <RewardInventory v-if="store.rewards.selected.length" :inert="selection.openMenu !== null" />
    <div ref="boardArea" class="board-area">
      <!-- Отменяем щелчок после касания: на iPhone он иначе закроет только что открытое меню. -->
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
      <div
        class="toast"
        :class="{ visible: store.toast.isVisible }"
        role="status"
        aria-live="polite"
      >
        {{ store.toast.text }}
      </div>
    </div>
  </main>
</template>
