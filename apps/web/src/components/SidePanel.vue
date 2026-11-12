<script setup lang="ts">
import { useGameStore } from '@/stores/game'
import ControlsBar from './ControlsBar.vue'
import ShopPanel from './ShopPanel.vue'
import TowerInfo from './TowerInfo.vue'

const store = useGameStore()
</script>

<template>
  <aside class="panel" :class="{ 'has-selected-tower': store.hud.selectedTowerId !== null }">
    <!-- Заголовок виден только с боковой панелью: там магазин стоит в самом верху,
         а подсказка — под ним (её высота меняется, и карточки над ней не прыгают) -->
    <h2 class="panel-title">
      {{ store.hud.selectedTowerId !== null ? 'Выбранный страж' : 'Строительство' }}
    </h2>
    <p id="hint">{{ store.hint }}</p>
    <TowerInfo />
    <ShopPanel />
    <ControlsBar />
  </aside>
</template>
