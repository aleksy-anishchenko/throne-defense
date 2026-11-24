<script setup lang="ts">
import type { TowerStatRow } from '@/utils/towerStatRows'

defineProps<{ stat: TowerStatRow; expanded: boolean; detailsId: string }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    v-if="stat.details.length"
    class="tower-stat-current is-boosted"
    type="button"
    :aria-label="`${stat.label} ${stat.current}, источники усиления`"
    :aria-expanded="expanded"
    :aria-controls="expanded ? detailsId : undefined"
    :title="stat.details.join(' · ')"
    @click="$emit('toggle')"
  >
    {{ stat.current }}
  </button>
  <span v-else class="tower-stat-current">{{ stat.current }}</span>
</template>
