<script setup lang="ts">
import { REWARD_RARITIES, REWARD_SET_SIZE, type RewardId } from '@throne/game'
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import RewardIcon from './RewardIcon.vue'
import RewardSetStrip from './RewardSetStrip.vue'

const store = useGameStore()
const selection = useSelectionStore()
const inventory = useTemplateRef('inventory')
const hovered = ref<RewardId | null>(null)
const focused = ref<RewardId | null>(null)
const tapped = ref<RewardId | null>(null)
const inspected = computed(() => hovered.value ?? focused.value ?? tapped.value)
let pressedWithMouse = false

function hover(event: PointerEvent, rewardId: RewardId | null) {
  if (event.pointerType === 'mouse') hovered.value = rewardId
}

function focus(event: FocusEvent, rewardId: RewardId) {
  if (event.currentTarget instanceof HTMLElement && event.currentTarget.matches(':focus-visible')) {
    hovered.value = null
    tapped.value = null
    focused.value = rewardId
  }
}

function inspect(event: MouseEvent, rewardId: RewardId) {
  if (event.detail === 0) focused.value = rewardId
  // Safari на iPhone может пометить click от касания как мышь. Тип берём из pointerdown.
  else if (!pressedWithMouse) {
    hovered.value = null
    tapped.value = tapped.value === rewardId ? null : rewardId
  }
  pressedWithMouse = false
}

function closeTooltip() {
  hovered.value = null
  focused.value = null
  tapped.value = null
}

function closeOnOutsidePress(event: PointerEvent) {
  if (event.target instanceof Node && !inventory.value?.contains(event.target)) closeTooltip()
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !inspected.value) return
  closeTooltip()
  event.stopPropagation()
}

watch([() => store.screen, () => selection.openMenu], closeTooltip)
onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsidePress, true)
  document.addEventListener('keydown', closeOnEscape, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', closeOnOutsidePress, true)
  document.removeEventListener('keydown', closeOnEscape, true)
})
</script>

<template>
  <ul ref="inventory" class="reward-inventory" aria-label="Полученные благословения">
    <li
      v-for="blessing in store.receivedBlessings"
      :key="blessing.rewardId"
      class="reward-inventory-entry"
      :data-rarity="blessing.rarity"
      @pointerenter="hover($event, blessing.rewardId)"
      @pointerleave="hover($event, null)"
    >
      <button
        type="button"
        class="reward-inventory-button"
        :aria-label="blessing.count > 1 ? `${blessing.name} ×${blessing.count}` : blessing.name"
        :aria-describedby="`reward-info-${blessing.rewardId}`"
        @focus="focus($event, blessing.rewardId)"
        @blur="focused = null"
        @pointerdown="pressedWithMouse = $event.pointerType === 'mouse'"
        @click="inspect($event, blessing.rewardId)"
      >
        <RewardIcon :reward-id="blessing.rewardId" />
        <span v-if="blessing.count > 1" class="reward-count" aria-hidden="true">
          ×{{ blessing.count }}
        </span>
        <span class="reward-progress" aria-hidden="true">
          <span
            v-for="part in REWARD_SET_SIZE"
            :key="part"
            :class="{ 'is-filled': part <= store.blessingSetCounts[blessing.setId] }"
          ></span>
        </span>
      </button>
      <div
        v-show="inspected === blessing.rewardId"
        :id="`reward-info-${blessing.rewardId}`"
        class="reward-tooltip"
        role="tooltip"
      >
        <div class="reward-tooltip-body">
          <span class="reward-rarity">{{ REWARD_RARITIES[blessing.rarity].label }}</span>
          <strong>{{ blessing.name }}</strong>
          <span class="reward-tooltip-effect">{{ blessing.description }}</span>
          <RewardSetStrip
            :set-id="blessing.setId"
            :count="store.blessingSetCounts[blessing.setId]"
          />
        </div>
      </div>
    </li>
  </ul>
</template>
