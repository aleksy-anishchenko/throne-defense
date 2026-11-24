<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import type { TowerStatRow } from '@/utils/towerStatRows'
import TowerStatBonuses from './TowerStatBonuses.vue'
import TowerStatValue from './TowerStatValue.vue'

const props = defineProps<{
  stats: TowerStatRow[]
  nextLevel: string | null
  description: string
  hint: string
}>()
const detailsId = useId()
const expandedKey = ref<TowerStatRow['key'] | null>(null)
const expandedStat = computed(() => props.stats.find((stat) => stat.key === expandedKey.value))
watch(
  () => expandedStat.value?.details.length,
  (count) => {
    if (!count) expandedKey.value = null
  },
)
function toggle(stat: TowerStatRow) {
  expandedKey.value = expandedKey.value === stat.key ? null : stat.key
}
</script>

<template>
  <div class="tower-characteristics">
    <p class="tower-description">
      {{ description }}
      <template v-if="hint">{{ ' ' + hint }}</template>
    </p>
    <table
      class="tower-stat-table"
      :class="{ 'with-upgrade': nextLevel }"
      aria-label="Характеристики стража"
    >
      <thead v-if="nextLevel">
        <tr>
          <th scope="col">
            <span class="visually-hidden">Характеристика и текущее значение</span>
          </th>
          <th scope="col" class="tower-stat-after-heading">{{ nextLevel }} уровень</th>
        </tr>
      </thead>
      <tbody v-for="stat in stats" :key="stat.key" :data-stat="stat.key">
        <tr>
          <th scope="row" class="tower-stat-name">
            {{ stat.label }}
            <TowerStatValue
              :stat="stat"
              :expanded="expandedKey === stat.key"
              :details-id="detailsId"
              @toggle="toggle(stat)"
            />
          </th>
          <td v-if="nextLevel">
            <span v-if="stat.next !== null" class="tower-stat-next">
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 20 14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M2 7h15m-5-5 5 5-5 5" />
              </svg>
              {{ stat.next }}
            </span>
            <span v-else class="visually-hidden">Столько же</span>
          </td>
        </tr>
        <tr v-if="expandedKey === stat.key">
          <td :colspan="nextLevel ? 2 : 1">
            <TowerStatBonuses :id="detailsId" :details="stat.details" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
