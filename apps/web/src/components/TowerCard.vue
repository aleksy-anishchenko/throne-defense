<script setup lang="ts">
import type { TowerDef } from '@throne/game'
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { towerInteractionHint } from '@/utils/towerStats'
import TowerIcon from './TowerIcon.vue'

const props = defineProps<{
  def: TowerDef
  /** Выбран в магазине */
  isArmed: boolean
  /** Не хватает золота */
  isUnaffordable: boolean
}>()
const store = useGameStore()
const hint = computed(() => towerInteractionHint(props.def, store.blessingEffects))
const emit = defineEmits<{ pick: [] }>()
</script>

<template>
  <button
    type="button"
    class="card"
    :class="{ poor: isUnaffordable }"
    :aria-pressed="isArmed"
    :title="hint"
    :aria-label="`${def.name}, цена ${def.cost}`"
    :aria-description="`${def.description} ${hint ?? ''}`.trim()"
    @click="emit('pick')"
  >
    <TowerIcon :tower-id="def.id" />
    <span class="card-name">{{ def.name }}</span>
    <span class="cost">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
      </svg>
      <span class="visually-hidden">цена</span>{{ def.cost }}
    </span>
    <span class="card-description">{{ def.description }}</span>
  </button>
</template>
