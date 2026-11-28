<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useMenuFocus } from '@/composables/useMenuFocus'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import RewardIcon from './RewardIcon.vue'
import RewardSetStrip from './RewardSetStrip.vue'

const store = useGameStore()
const selection = useSelectionStore()
const drawerElement = useTemplateRef('drawerElement')

const groups = computed(() => {
  const blessings = store.receivedBlessings
  const setIds = new Set(blessings.map((blessing) => blessing.setId))
  return [...setIds].map((setId) => ({
    setId,
    count: setId ? store.blessingSetCounts[setId] : 0,
    blessings: blessings.filter((blessing) => blessing.setId === setId),
  }))
})

useMenuFocus(() => selection.isRewardSheetOpen, drawerElement)
</script>

<template>
  <div v-if="selection.isRewardSheetOpen" class="shop-drawer reward-drawer">
    <div class="shop-drawer-backdrop" @click="selection.closeMenu"></div>
    <div
      ref="drawerElement"
      class="shop-drawer-body"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reward-drawer-title"
      tabindex="-1"
    >
      <header class="shop-drawer-header">
        <h2 id="reward-drawer-title">Благословения</h2>
        <button
          type="button"
          class="shop-drawer-close"
          aria-label="Закрыть"
          @click="selection.closeMenu"
        >
          ✕
        </button>
      </header>
      <div
        class="shop-drawer-list"
        role="region"
        aria-label="Полученные благословения"
        tabindex="0"
      >
        <div v-for="group in groups" :key="group.setId ?? 'unique'" class="reward-drawer-group">
          <ul class="reward-drawer-rewards">
            <li
              v-for="blessing in group.blessings"
              :key="blessing.rewardId"
              class="reward-drawer-entry"
              :data-rarity="blessing.rarity"
            >
              <RewardIcon :reward-id="blessing.rewardId" />
              <div>
                <strong>
                  {{ blessing.name }}
                  <span v-if="blessing.count > 1" class="reward-drawer-count">
                    ×{{ blessing.count }}
                  </span>
                </strong>
                <p class="reward-description">{{ blessing.description }}</p>
              </div>
            </li>
          </ul>
          <RewardSetStrip v-if="group.setId" :set-id="group.setId" :count="group.count" />
        </div>
      </div>
    </div>
  </div>
</template>
