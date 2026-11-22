<script setup lang="ts">
import { REWARD_SETS, REWARD_SET_SIZE, type RewardSetId } from '@throne/game'
import { computed } from 'vue'

const props = defineProps<{
  setId: RewardSetId
  count: number
  preview?: boolean
  numeric?: boolean
}>()

const set = computed(() => REWARD_SETS[props.setId])
const collected = computed(() => Math.min(props.count, REWARD_SET_SIZE))
</script>

<template>
  <span
    class="reward-set"
    :class="{
      'reward-set-ready': preview && collected === REWARD_SET_SIZE - 1,
      'reward-set-numeric': numeric,
    }"
  >
    <span v-if="!numeric" class="reward-set-threshold">
      <span aria-hidden="true">×{{ REWARD_SET_SIZE }}</span>
      <span class="visually-hidden">Бонус за {{ REWARD_SET_SIZE }} благословения</span>
    </span>
    <span class="reward-set-copy">
      <span class="reward-set-title">{{ set.name }}</span>
      <span class="reward-set-effect">{{ set.description }}</span>
    </span>
    <span class="reward-set-status">
      <template v-if="preview && collected === REWARD_SET_SIZE">Собран</template>
      <template v-else>
        <span v-if="numeric" class="reward-set-count" aria-hidden="true">
          {{ collected }}/{{ REWARD_SET_SIZE }}
        </span>
        <span v-else class="reward-set-pips" aria-hidden="true">
          <span
            v-for="part in REWARD_SET_SIZE"
            :key="part"
            :class="{
              'is-filled': part <= collected,
              'is-preview': preview && part === collected + 1,
            }"
          ></span>
        </span>
        <span v-if="preview && collected === REWARD_SET_SIZE - 1" class="visually-hidden">
          Это благословение завершит набор
        </span>
        <span v-else class="visually-hidden">Собрано {{ collected }} из {{ REWARD_SET_SIZE }}</span>
      </template>
    </span>
  </span>
</template>
