<script setup lang="ts">
import type { TowerDef } from '@throne/game'
import { shopTowerLabel } from '@/utils/towerStats'
import TowerIcon from './TowerIcon.vue'

defineProps<{
  def: TowerDef
  /** Выбран в магазине */
  isArmed: boolean
  /** Не хватает золота */
  isUnaffordable: boolean
}>()
const emit = defineEmits<{ pick: [] }>()
</script>

<template>
  <button
    type="button"
    class="card"
    :class="{ poor: isUnaffordable }"
    :aria-pressed="isArmed"
    :aria-label="shopTowerLabel(def, isUnaffordable)"
    :aria-description="def.shortDescription"
    @click="emit('pick')"
  >
    <TowerIcon :tower-id="def.id" />
    <span class="card-name">{{ def.name }}</span>
    <span class="cost">
      <svg v-if="def.cost" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
      </svg>
      <span class="visually-hidden">цена</span>{{ def.cost || 'Бесплатно' }}
    </span>
    <span class="card-description">{{ def.shortDescription }}</span>
  </button>
</template>
