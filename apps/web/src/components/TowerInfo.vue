<script setup lang="ts">
// Панель выбранной башни (с боковой панелью): характеристики, «Улучшить», «Продать».
// На телефоне то же самое — в меню TowerSheet
import {
  TARGET_MODE_HINTS,
  TARGET_MODE_LABELS,
  useSelectedTowerInfo,
} from '@/composables/useSelectedTowerInfo'
import { useSelectionStore } from '@/stores/selection'
import TowerAspects from './TowerAspects.vue'
import TowerStat from './TowerStat.vue'

const selection = useSelectionStore()
const selectedTowerInfo = useSelectedTowerInfo()
</script>

<template>
  <div v-if="selectedTowerInfo" class="tower-info">
    <div class="tower-stats">
      <b>{{ selectedTowerInfo.title }}</b>
      <p class="tower-description">{{ selectedTowerInfo.description }}</p>
      <p v-if="selectedTowerInfo.showUpgradeCaption" class="tower-stat-caption">
        Сейчас → после улучшения
      </p>
      <TowerStat v-for="stat in selectedTowerInfo.stats" :key="stat.key" :stat="stat" as="span" />
      <span v-for="line in selectedTowerInfo.lines" :key="line">{{ line }}</span>
      <button
        v-if="selectedTowerInfo.targetMode"
        class="target-mode"
        type="button"
        :title="`${TARGET_MODE_HINTS[selectedTowerInfo.targetMode]}. Нажмите, чтобы сменить (клавиша T)`"
        :aria-label="`Цель: ${TARGET_MODE_LABELS[selectedTowerInfo.targetMode]} — ${TARGET_MODE_HINTS[selectedTowerInfo.targetMode]}. Сменить`"
        @click="selection.cycleTargetMode"
      >
        цель: {{ TARGET_MODE_LABELS[selectedTowerInfo.targetMode] }}
      </button>
    </div>
    <TowerAspects />
    <button
      v-if="!selectedTowerInfo.hasAspects"
      class="btn action"
      :class="{ primary: selectedTowerInfo.canAfford }"
      type="button"
      :disabled="selectedTowerInfo.upgradeCost === null"
      @click="selection.upgradeSelected"
    >
      <span>{{ selectedTowerInfo.upgradeCost === null ? 'Высший' : 'Улучшить' }}</span>
      <span class="price">{{
        selectedTowerInfo.upgradeCost === null ? 'уровень' : `за ${selectedTowerInfo.upgradeCost}`
      }}</span>
    </button>
    <button class="btn action" type="button" @click="selection.sellSelected">
      <span>{{ selectedTowerInfo.sellLabel }}</span><span class="price"
        >за {{ selectedTowerInfo.refund }}</span
      >
    </button>
  </div>
</template>
