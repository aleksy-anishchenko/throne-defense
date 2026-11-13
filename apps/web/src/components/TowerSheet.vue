<script setup lang="ts">
// Меню башни на телефоне: название, характеристики, цель, «Улучшить» и «Продать».
// Открывается само, когда нажали на башню; закрыли — выбор с башни снят. Если башня стоит в нижней половине поля, меню — сверху,
// чтобы не закрывать саму башню и её дальность. С боковой панелью меню скрыто (там TowerInfo)
import { computed, useTemplateRef } from 'vue'
import {
  TARGET_MODE_HINTS,
  TARGET_MODE_LABELS,
  useSelectedTowerInfo,
} from '@/composables/useSelectedTowerInfo'
import { useMenuFocus } from '@/composables/useMenuFocus'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'

const store = useGameStore()
const selection = useSelectionStore()
const info = useSelectedTowerInfo()
const drawerElement = useTemplateRef('drawerElement')

const isOnTop = computed(() => {
  const cell = selection.selectedTowerCell
  return cell !== null && cell.row >= store.game.level.def.rows / 2
})

useMenuFocus(() => selection.isTowerMenuOpen, drawerElement)
</script>

<template>
  <div
    v-if="selection.isTowerMenuOpen && info"
    class="shop-drawer tower-drawer"
    :class="{ top: isOnTop }"
  >
    <div class="shop-drawer-backdrop" @click="selection.closeMenu"></div>
    <div
      ref="drawerElement"
      class="shop-drawer-body"
      role="dialog"
      aria-modal="true"
      :aria-label="`Башня: ${info.title}`"
      tabindex="-1"
    >
      <header class="shop-drawer-header">
        <h2>{{ info.title }}</h2>
        <button
          type="button"
          class="shop-drawer-close"
          aria-label="Закрыть"
          @click="selection.closeMenu"
        >
          ✕
        </button>
      </header>
      <ul class="tower-sheet-stats">
        <li v-for="line in info.lines" :key="line">{{ line }}</li>
        <li v-if="info.targetMode">
          <button
            class="target-mode"
            type="button"
            :title="`${TARGET_MODE_HINTS[info.targetMode]}. Нажмите, чтобы сменить (клавиша T)`"
            :aria-label="`Цель: ${TARGET_MODE_LABELS[info.targetMode]} — ${TARGET_MODE_HINTS[info.targetMode]}. Сменить`"
            @click="selection.cycleTargetMode"
          >
            цель: {{ TARGET_MODE_LABELS[info.targetMode] }}
          </button>
        </li>
      </ul>
      <div class="tower-sheet-actions">
        <button
          class="btn action"
          :class="{ primary: info.canAfford }"
          type="button"
          :disabled="info.upgradeCost === null"
          @click="selection.upgradeSelected"
        >
          <span>{{ info.upgradeCost === null ? 'Высший' : 'Улучшить' }}</span>
          <span class="price">{{
            info.upgradeCost === null ? 'уровень' : `за ${info.upgradeCost}`
          }}</span>
        </button>
        <button class="btn action" type="button" @click="selection.sellSelected">
          <span>{{ info.sellLabel }}</span><span class="price">за {{ info.refund }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
