<script setup lang="ts">
import { TOWER_LIST } from '@throne/game'
import { MAX_HOTKEY_DIGIT } from '@/composables/useKeyboard'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import { placementReach } from '@/utils/towerStats'
import ShopToggle from './ShopToggle.vue'

const store = useGameStore()
const selection = useSelectionStore()
const lastHotkeyDigit = Math.min(MAX_HOTKEY_DIGIT, TOWER_LIST.length)
</script>

<template>
  <div
    class="controls"
    :class="{ 'placement-actions': selection.pendingPlacement }"
    role="group"
    :aria-labelledby="selection.pendingPlacement ? 'placement-prompt' : undefined"
  >
    <div
      id="placement-status"
      role="status"
      aria-atomic="true"
      :class="{ 'visually-hidden': !selection.placementTower }"
    >
      <template v-if="selection.placementTower">
        <span id="placement-prompt">{{
          selection.pendingPlacement ? 'Поставить стража?' : selection.hint
        }}</span>
        <span id="placement-details" class="visually-hidden">
          {{ selection.placementTower.name }}.
          <template v-if="selection.pendingPlacement">
            {{ placementReach(selection.placementTower) }}. Столбец
            {{ selection.pendingPlacement.cell.col + 1 }}, ряд
            {{ selection.pendingPlacement.cell.row + 1 }}. Цена
            {{
              selection.placementTower.cost
                ? selection.placementTower.cost + ' золота'
                : 'Бесплатно'
            }}. {{ selection.hint }}
          </template>
        </span>
      </template>
    </div>
    <template v-if="selection.pendingPlacement">
      <button
        class="btn primary"
        type="button"
        :disabled="store.hud.gold < selection.pendingPlacement.tower.cost"
        aria-describedby="placement-details"
        @click="selection.confirmPlacement"
      >
        Да
      </button>
      <button class="btn" type="button" @click="selection.clearSelection">Нет</button>
    </template>
    <template v-else-if="!selection.placementTower">
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
    </template>
  </div>
</template>
