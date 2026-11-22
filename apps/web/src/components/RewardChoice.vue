<script setup lang="ts">
import { REWARDS, REWARD_RARITIES, rewardDescriptionForWave, rewardSetCounts } from '@throne/game'
import { computed, nextTick, useTemplateRef } from 'vue'
import { useGameStore } from '@/stores/game'
import RewardIcon from './RewardIcon.vue'
import RewardSetStrip from './RewardSetStrip.vue'

defineProps<{ title: string; caption: string }>()

const store = useGameStore()
const options = useTemplateRef('options')

const cards = computed(() => {
  const counts = rewardSetCounts(store.rewards.selected)
  return store.rewards.options.map((rewardId) => {
    const reward = REWARDS[rewardId]
    return {
      ...reward,
      description: rewardDescriptionForWave(rewardId, store.rewards.wave),
      setCount: counts[reward.setId],
    }
  })
})

async function reroll(event: MouseEvent) {
  if (!store.rerollRewards() || event.detail !== 0) return
  await nextTick()
  options.value?.querySelector('button')?.focus()
}
</script>

<template>
  <div class="reward-choice">
    <header class="reward-heading">
      <p id="reward-caption" class="reward-caption">{{ caption }}</p>
      <button
        v-if="store.rewards.rerollCost !== null"
        class="reward-reroll"
        type="button"
        :aria-label="`Обновить варианты за ${store.rewards.rerollCost} золота`"
        :disabled="store.hud.gold < store.rewards.rerollCost"
        @click="reroll"
      >
        <span class="reward-reroll-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path
              d="M20 11a8 8 0 1 0-2.3 6.5M20 5v6h-6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span class="reward-reroll-cost" aria-hidden="true">
          −{{ store.rewards.rerollCost }}<span class="reward-coin"></span>
        </span>
      </button>
      <h1 id="screen-title">{{ title }}</h1>
    </header>
    <div ref="options" class="reward-options">
      <button
        v-for="card in cards"
        :key="card.id"
        class="reward-card"
        :data-rarity="card.rarity"
        type="button"
        @click="store.chooseReward(card.id)"
      >
        <span class="reward-emblem">
          <RewardIcon :reward-id="card.id" />
          <span class="reward-rarity reward-rarity-chip">{{
            REWARD_RARITIES[card.rarity].label
          }}</span>
        </span>
        <span class="reward-card-copy">
          <strong>{{ card.name }}</strong>
          <span class="reward-description">{{ card.description }}</span>
        </span>
        <RewardSetStrip
          class="reward-card-set"
          :set-id="card.setId"
          :count="card.setCount"
          preview
        />
      </button>
    </div>
  </div>
</template>
