<script setup lang="ts">
// Панель выбранной башни: характеристики, «Улучшить», «Продать»
import { TOWERS, refundFor, type StatKey, type TowerStats } from '@throne/game'
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { num, pct, roman } from '@/utils/format'

const store = useGameStore()

/** Как подписывать и показывать каждую характеристику */
const STAT: Record<StatKey, { label: string; format: (v: number) => string }> = {
  dmg: { label: 'урон', format: String },
  range: { label: 'дальность', format: num },
  rate: { label: 'перезарядка', format: (v) => `${num(v)} с` },
  slow: { label: 'замедление', format: pct },
  splash: { label: 'взрыв', format: num },
  pierce: { label: 'пронзает', format: String },
}

/** «урон 9 → 15»: текущее значение и (если есть) значение после улучшения */
function statLine(key: StatKey, cur: TowerStats, next: TowerStats | undefined): string {
  const { label, format } = STAT[key]
  const now = format(cur[key] ?? 0)
  const after = next ? format(next[key] ?? 0) : null
  return after === null || after === now ? `${label} ${now}` : `${label} ${now} → ${after}`
}

const info = computed(() => {
  const id = store.hud.selType
  if (!id) return null
  const def = TOWERS[id]
  const lv = store.hud.selLv
  const next = def.levels[lv + 1]
  const upPrice = next ? def.upgrades[lv] : null
  return {
    title: `${def.name} ${roman(lv)}`,
    lines: def.display.map((key) => statLine(key, def.levels[lv], next)),
    upPrice,
    canAfford: upPrice !== null && store.hud.gold >= upPrice,
    refund: refundFor(def, lv),
  }
})
</script>

<template>
  <div v-if="info" class="towerbox">
    <div class="who">
      <b>{{ info.title }}</b>
      <span v-for="line in info.lines" :key="line">{{ line }}</span>
    </div>
    <button
      class="btn act"
      :class="{ primary: info.canAfford }"
      type="button"
      :disabled="info.upPrice === null"
      @click="store.upgradeSelected"
    >
      <span>{{ info.upPrice === null ? 'Высший' : 'Улучшить' }}</span>
      <span class="pr">{{ info.upPrice === null ? 'уровень' : `за ${info.upPrice}` }}</span>
    </button>
    <button class="btn act" type="button" @click="store.sellSelected">
      <span>Продать</span><span class="pr">за {{ info.refund }}</span>
    </button>
  </div>
</template>
