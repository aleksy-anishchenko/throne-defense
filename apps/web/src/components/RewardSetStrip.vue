<script setup lang="ts">
import { REWARD_SETS, REWARD_SET_SIZE, type RewardSetId } from '@throne/game'
import { computed } from 'vue'

const props = defineProps<{
  setId: RewardSetId
  count: number
  preview?: boolean
}>()

const set = computed(() => REWARD_SETS[props.setId])
const collected = computed(() => Math.min(props.count, REWARD_SET_SIZE))
const opensBonus = computed(() => props.preview && collected.value === REWARD_SET_SIZE - 1)
const status = computed(() => {
  if (!props.preview) return `Собрано ${collected.value} из ${REWARD_SET_SIZE}`
  if (collected.value === REWARD_SET_SIZE) return 'Бонус уже получен'
  if (opensBonus.value) return 'Откроет бонус'
  return `После выбора ${collected.value + 1} из ${REWARD_SET_SIZE}`
})
</script>

<template>
  <span class="reward-set" :class="{ 'reward-set-ready': opensBonus }">
    <span class="reward-set-heading">
      <span class="reward-set-title">Набор «{{ set.name }}»</span>
      <span class="reward-set-status">{{ status }}</span>
    </span>
    <span class="reward-set-effect">{{ set.description }}</span>
  </span>
</template>
