<script setup lang="ts">
import { TOWER_LIST } from '@throne/game'
import { MAX_HOTKEY_DIGIT } from '@/composables/useKeyboard'
import { useGameStore } from '@/stores/game'
import ActionToggle from './ActionToggle.vue'

const store = useGameStore()
const lastHotkeyDigit = Math.min(MAX_HOTKEY_DIGIT, TOWER_LIST.length)
</script>

<template>
  <div class="controls">
    <ActionToggle />
    <button
      class="btn primary grow"
      type="button"
      :disabled="store.hud.phase !== 'build'"
      @click="store.startWave"
    >
      {{ store.hud.phase === 'wave' ? 'Идёт бой' : 'Начать волну' }}
    </button>
    <button
      class="btn icon"
      type="button"
      :aria-label="`Скорость игры: ×${store.hud.speed}`"
      @click="store.cycleSpeed"
    >
      ×{{ store.hud.speed }}
    </button>
    <button
      class="btn icon"
      type="button"
      :aria-label="store.hud.isPaused ? 'Продолжить' : 'Пауза'"
      @click="store.togglePause"
    >
      <svg v-if="store.hud.isPaused" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M7 4l13 8-13 8z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z" />
      </svg>
    </button>
    <!-- Шестерёнка: звук и музыка — в настройках. Отдельной кнопке музыки на узком
         телефоне не хватило бы места рядом с «Начать волну» -->
    <button class="btn icon" type="button" aria-label="Настройки" @click="store.openSettings">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          fill-rule="evenodd"
          d="M10.17 4.62 L10.36 2.14 L13.64 2.14 L13.83 4.62 L15.92 5.49 L17.81 3.86 L20.14 6.19 L18.51 8.08 L19.38 10.17 L21.86 10.36 L21.86 13.64 L19.38 13.83 L18.51 15.92 L20.14 17.81 L17.81 20.14 L15.92 18.51 L13.83 19.38 L13.64 21.86 L10.36 21.86 L10.17 19.38 L8.08 18.51 L6.19 20.14 L3.86 17.81 L5.49 15.92 L4.62 13.83 L2.14 13.64 L2.14 10.36 L4.62 10.17 L5.49 8.08 L3.86 6.19 L6.19 3.86 L8.08 5.49ZM12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0 -6.4Z"
        />
      </svg>
    </button>
    <p class="keys">
      Клавиши: 1–{{ lastHotkeyDigit }} выбирают стража, пробел начинает волну и ставит паузу,
      стрелки и Enter ставят стража без мыши, Shift оставляет стража «в руке» — можно ставить
      подряд, T меняет цель выбранного стража.
    </p>
  </div>
</template>
