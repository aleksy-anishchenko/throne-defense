<script setup lang="ts">
import { TOWER_LIST } from '@throne/game'
import { MAX_HOTKEY_DIGIT } from '@/composables/useKeyboard'
import { useGameStore } from '@/stores/game'
import ShopToggle from './ShopToggle.vue'

const store = useGameStore()
const lastHotkeyDigit = Math.min(MAX_HOTKEY_DIGIT, TOWER_LIST.length)
</script>

<template>
  <div class="controls">
    <ShopToggle />
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
    <!-- Меню: продолжить, настройки или завершить партию. Настройки открываются из него -->
    <button class="btn icon" type="button" aria-label="Меню" @click="store.openGameMenu">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
      </svg>
    </button>
    <p class="keys">
      Клавиши: 1–{{ lastHotkeyDigit }} выбирают стража, пробел начинает волну и ставит паузу,
      стрелки и Enter ставят стража без мыши, Shift оставляет стража «в руке» — можно ставить
      подряд, T меняет цель выбранного стража.
    </p>
  </div>
</template>
