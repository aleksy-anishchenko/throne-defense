<script setup lang="ts">
import type { TowerStatRow } from '@/utils/towerStatRows'

defineProps<{ stat: TowerStatRow; as: 'span' | 'li' }>()
</script>

<template>
  <component :is="as" :data-stat="stat.key">
    {{ stat.text
    }}<small v-if="stat.details.length" class="tower-stat-bonus">
      <template v-for="(detail, index) in stat.details" :key="detail">
        <template v-if="index">{{ ' · ' }}</template><span>{{ detail }}</span>
      </template>
    </small>
  </component>
</template>
