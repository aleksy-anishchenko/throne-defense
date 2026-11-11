<script setup lang="ts">
import { TOWER_LIST } from '@throne/game'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
const lastKey = Math.min(9, TOWER_LIST.length)
</script>

<template>
  <div class="controls">
    <button
      class="btn primary grow"
      type="button"
      :disabled="store.hud.phase !== 'build'"
      @click="store.startWave"
    >
      {{ store.hud.phase === 'wave' ? 'Идёт бой' : 'Начать волну' }}
    </button>
    <button class="btn icon" type="button" aria-label="Скорость игры" @click="store.cycleSpeed">
      ×{{ store.hud.speed }}
    </button>
    <button
      class="btn icon"
      type="button"
      :aria-label="store.hud.paused ? 'Продолжить' : 'Пауза'"
      :aria-pressed="store.hud.paused"
      @click="store.togglePause"
    >
      <svg v-if="store.hud.paused" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M7 4l13 8-13 8z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z" />
      </svg>
    </button>
    <button
      class="btn icon"
      type="button"
      aria-label="Звук"
      :aria-pressed="!store.muted"
      @click="store.toggleSound"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z" />
        <path
          v-if="store.muted"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M17 9l5 6M22 9l-5 6"
        />
        <path
          v-else
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
        />
      </svg>
    </button>
    <p class="keys">
      Клавиши: 1–{{ lastKey }} выбирают стража, пробел начинает волну и ставит паузу, стрелки и
      Enter ставят стража без мыши.
    </p>
  </div>
</template>
