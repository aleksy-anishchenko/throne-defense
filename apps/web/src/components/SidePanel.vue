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

// Окно стало широким или телефон повернули набок — меню скрыты стилями, а состояние «открыто»
// осталось бы и блокировало клавиши. Условие то же, что у боковой панели в responsive.css
const sidePanelQuery = matchMedia(SIDE_PANEL_QUERY)
const closeMenuIfSidePanel = () => {
  if (sidePanelQuery.matches) selection.closeMenu()
}
onMounted(() => sidePanelQuery.addEventListener('change', closeMenuIfSidePanel))
onUnmounted(() => sidePanelQuery.removeEventListener('change', closeMenuIfSidePanel))
</script>

<template>
  <aside class="panel" :class="{ 'has-selected-tower': selection.selected.towerId !== null }">
    <!-- Заголовок виден только с боковой панелью: там магазин стоит в самом верху,
         а подсказка — под ним (её высота меняется, и карточки над ней не прыгают) -->
    <h2 class="panel-title">
      {{ selection.selected.towerId !== null ? 'Выбранный страж' : 'Строительство' }}
    </h2>
    <!-- Описание башни «в руке» и «что делать дальше»: какое из двух видно, решают стили —
         с описаниями в карточках описание здесь не повторяем (responsive.css) -->
    <p id="hint">
      <span :class="{ 'hint-armed-description': selection.isArmedTowerHint }">{{
        selection.hint
      }}</span>
      <span v-if="selection.isArmedTowerHint" class="hint-armed-action">
        Нажмите на свободную плиту, чтобы поставить стража
      </span>
    </p>
    <TowerInfo />
    <ShopPanel />
    <ControlsBar />
    <ShopSheet />
    <TowerSheet />
  </aside>
</template>
