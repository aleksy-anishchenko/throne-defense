<script setup lang="ts">
// Кнопка «Стражи» слева в нижней строке (телефон): открывает меню выбора стража.
// Когда страж уже «в руке», на кнопке его значок, чтобы режим был виден и без подсказки
// (на телефоне нет призрака под мышью).
// Меню выбранной башни своей кнопки не имеет — оно открывается само при нажатии на башню.
// С боковой панелью кнопка скрыта стилями, там всё лежит на самой панели
import { TOWERS } from '@throne/game'
import { computed } from 'vue'
import { useSelectionStore } from '@/stores/selection'
import TowerIcon from './TowerIcon.vue'

const selection = useSelectionStore()
const ariaLabel = computed(() =>
  selection.armedTowerId
    ? `Выбрать стража (сейчас в руке: ${TOWERS[selection.armedTowerId].name})`
    : 'Выбрать стража',
)
</script>

<template>
  <button
    type="button"
    class="shop-toggle"
    :class="{ armed: selection.armedTowerId !== null }"
    :aria-label="ariaLabel"
    aria-haspopup="dialog"
    :aria-expanded="selection.isShopOpen"
    @click="selection.openShop"
  >
    <TowerIcon
      v-if="selection.armedTowerId"
      :key="selection.armedTowerId"
      :tower-id="selection.armedTowerId"
      class="shop-toggle-icon"
    />
    <!-- viewBox обрезан по рисунку башни: без пустых полей значка зазор до подписи ровный -->
    <svg v-else class="shop-toggle-icon" viewBox="2.4 3.4 19.2 19.2" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 21V10l1.5-1V5h2.2v2h2.1V5h2.4v2h2.1V5H17.5v4l1.5 1v11h-5v-4a2 2 0 0 0-4 0v4z"
      />
    </svg>
    <span class="shop-toggle-label">Стражи</span>
  </button>
</template>
