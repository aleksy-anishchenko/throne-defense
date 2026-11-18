<script setup lang="ts">
import { REWARDS, type RewardId } from '@throne/game'
import { useGameStore } from '@/stores/game'

const store = useGameStore()

const selectedCount = (rewardId: RewardId) =>
  store.rewards.selected.filter((reward) => reward.rewardId === rewardId).length

const selectedRewards = () =>
  store.rewards.selected.map((reward) => ({
    ...reward,
    def: REWARDS[reward.rewardId],
  }))
</script>

<template>
  <div class="reward-choice">
    <div class="reward-options">
      <button
        v-for="rewardId in store.rewards.options"
        :key="rewardId"
        class="reward-card"
        type="button"
        @click="store.chooseReward(rewardId)"
      >
        <span class="reward-mark" aria-hidden="true">{{ REWARDS[rewardId].mark }}</span>
        <strong>{{ REWARDS[rewardId].name }}</strong>
        <span class="reward-description">{{ REWARDS[rewardId].description }}</span>
        <small v-if="selectedCount(rewardId)" class="reward-owned">
          Уже выбрано: {{ selectedCount(rewardId) }}
        </small>
      </button>
    </div>

    <section v-if="store.rewards.selected.length" class="reward-history">
      <h2>Ваши благословения</h2>
      <ul>
        <li v-for="reward in selectedRewards()" :key="`${reward.wave}-${reward.rewardId}`">
          <span class="reward-history-mark" aria-hidden="true">{{ reward.def.mark }}</span>
          <strong>{{ reward.def.name }}</strong>
          <small>волна {{ reward.wave }}</small>
          <span class="reward-history-effect">{{ reward.def.description }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
