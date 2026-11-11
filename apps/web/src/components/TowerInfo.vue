<script setup lang="ts">
// Панель выбранной башни: характеристики, «Улучшить», «Продать»
import { TOWERS, refundFor, type StatKey, type TowerStats } from '@throne/game'
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { formatDecimal, formatPercent, toRoman } from '@/utils/format'

const store = useGameStore()

/** Как подписывать и показывать каждую характеристику */
const STAT_DISPLAY: Record<StatKey, { label: string; format: (value: number) => string }> = {
  damage: { label: 'урон', format: String },
  range: { label: 'дальность', format: formatDecimal },
  cooldown: { label: 'перезарядка', format: (value) => `${formatDecimal(value)} с` },
  slowAmount: { label: 'замедление', format: formatPercent },
  splashRadius: { label: 'взрыв', format: formatDecimal },
  pierceCount: { label: 'пронзает', format: String },
}

/** «урон 9 → 15»: текущее значение и (если есть) значение после улучшения */
function formatStatLine(
  statKey: StatKey,
  currentStats: TowerStats,
  nextStats: TowerStats | undefined,
): string {
  const { label, format } = STAT_DISPLAY[statKey]
  const currentText = format(currentStats[statKey] ?? 0)
  const nextText = nextStats ? format(nextStats[statKey] ?? 0) : null
  return nextText === null || nextText === currentText
    ? `${label} ${currentText}`
    : `${label} ${currentText} → ${nextText}`
}

const selectedTowerInfo = computed(() => {
  const towerId = store.hud.selectedTowerId
  if (!towerId) return null
  const def = TOWERS[towerId]
  const tier = store.hud.selectedTowerTier
  const nextStats = def.tiers[tier + 1]
  const upgradeCost = nextStats ? def.upgradeCosts[tier] : null
  return {
    title: `${def.name} ${toRoman(tier)}`,
    lines: def.displayStats.map((statKey) => formatStatLine(statKey, def.tiers[tier], nextStats)),
    upgradeCost,
    canAfford: upgradeCost !== null && store.hud.gold >= upgradeCost,
    refund: refundFor(def, tier),
  }
})
</script>

<template>
  <div v-if="selectedTowerInfo" class="tower-info">
    <div class="tower-stats">
      <b>{{ selectedTowerInfo.title }}</b>
      <span v-for="line in selectedTowerInfo.lines" :key="line">{{ line }}</span>
    </div>
    <button
      class="btn action"
      :class="{ primary: selectedTowerInfo.canAfford }"
      type="button"
      :disabled="selectedTowerInfo.upgradeCost === null"
      @click="store.upgradeSelected"
    >
      <span>{{ selectedTowerInfo.upgradeCost === null ? 'Высший' : 'Улучшить' }}</span>
      <span class="price">{{
        selectedTowerInfo.upgradeCost === null ? 'уровень' : `за ${selectedTowerInfo.upgradeCost}`
      }}</span>
    </button>
    <button class="btn action" type="button" @click="store.sellSelected">
      <span>Продать</span><span class="price">за {{ selectedTowerInfo.refund }}</span>
    </button>
  </div>
</template>
