<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useSelectionStore } from '@/stores/selection'
import { SIDE_PANEL_QUERY } from '@/utils/layout'
import ControlsBar from './ControlsBar.vue'
import ShopPanel from './ShopPanel.vue'
import ShopSheet from './ShopSheet.vue'
import TowerSheet from './TowerSheet.vue'
import TowerInfo from './TowerInfo.vue'

const selection = useSelectionStore()

// Окно стало широким или телефон повернули — меню подстраиваются (см. syncMenuWithLayout).
// Условие то же, что у боковой панели в responsive.css
const sidePanelQuery = matchMedia(SIDE_PANEL_QUERY)
onMounted(() => sidePanelQuery.addEventListener('change', selection.syncMenuWithLayout))
onUnmounted(() => sidePanelQuery.removeEventListener('change', selection.syncMenuWithLayout))
</script>

<template>
  <aside class="panel" :class="{ 'has-selected-tower': selection.selected.towerId !== null }">
    <!-- Заголовок виден только с боковой панелью: там магазин стоит в самом верху,
         а подсказка — под ним (её высота меняется, и карточки над ней не прыгают) -->
    <h2 class="panel-title">
      {{ selection.selected.towerId !== null ? 'Выбранный страж' : 'Строительство' }}
    </h2>
    <p id="hint">{{ selection.hint }}</p>
    <TowerInfo />
    <ShopPanel />
    <ControlsBar />
    <ShopSheet />
    <TowerSheet />
  </aside>
</template>
