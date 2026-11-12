<script setup lang="ts">
// Кнопка слева в нижней строке (телефон): открывает меню.
//  - башня выбрана на поле → «Действие»: меню башни (характеристики, улучшить, продать);
//  - иначе → «Стражи»: меню выбора стража; когда страж уже «в руке», на кнопке его значок,
//    чтобы режим был виден и без подсказки (на телефоне нет призрака под мышью)
// С боковой панелью кнопка скрыта стилями, там всё лежит на самой панели
import { TOWERS } from '@throne/game'
import { computed } from 'vue'
import { useSelectionStore } from '@/stores/selection'
import TowerIcon from './TowerIcon.vue'

const selection = useSelectionStore()
const isTowerSelected = computed(() => selection.selected.towerId !== null)
// Значок: у «Стражи» — страж в руке или общий (башня), у «Действие» — три точки («ещё»).
// Размер кнопки один и тот же (см. components.css), чтобы строка не прыгала
const iconTowerId = computed(() => (isTowerSelected.value ? null : selection.armedTowerId))
const label = computed(() => (isTowerSelected.value ? 'Действие' : 'Стражи'))
const ariaLabel = computed(() => {
  if (isTowerSelected.value) return 'Действия с башней'
  if (selection.armedTowerId)
    return `Выбрать стража (сейчас в руке: ${TOWERS[selection.armedTowerId].name})`
  return 'Выбрать стража'
})

function open() {
  if (isTowerSelected.value) selection.openTowerMenu()
  else selection.openShop()
}
</script>

<template>
  <button
    type="button"
    class="shop-toggle"
    :class="{ armed: iconTowerId !== null || isTowerSelected }"
    :aria-label="ariaLabel"
    aria-haspopup="dialog"
    :aria-expanded="selection.openMenu !== null"
    @click="open"
  >
    <TowerIcon
      v-if="iconTowerId"
      :key="iconTowerId"
      :tower-id="iconTowerId"
      class="shop-toggle-icon"
    />
    <svg
      v-else-if="isTowerSelected"
      class="shop-toggle-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="2.2" fill="currentColor" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <circle cx="19" cy="12" r="2.2" fill="currentColor" />
    </svg>
    <!-- viewBox обрезан по рисунку башни: без пустых полей значка зазор до подписи ровный -->
    <svg v-else class="shop-toggle-icon" viewBox="2.4 3.4 19.2 19.2" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 21V10l1.5-1V5h2.2v2h2.1V5h2.4v2h2.1V5H17.5v4l1.5 1v11h-5v-4a2 2 0 0 0-4 0v4z"
      />
    </svg>
    <span class="shop-toggle-label">{{ label }}</span>
  </button>
</template>
