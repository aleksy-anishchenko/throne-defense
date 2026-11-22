<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'

const store = useGameStore()
const selection = useSelectionStore()

/** Когда жизней трона осталось столько или меньше, счётчик подсвечивается */
const LOW_LIVES_THRESHOLD = 5

// В бесконечном режиме (номер волны больше числа волн уровня) «из N» не пишем
const waveLabel = computed(() =>
  store.hud.wave > store.hud.waveCount
    ? `Волна ${store.hud.wave}`
    : `Волна ${store.hud.wave} из ${store.hud.waveCount}`,
)

const rewardCount = computed(() => store.rewards.selected.length)
</script>

<template>
  <header class="hud">
    <span class="brand">Защита трона</span>
    <div class="hud-stats">
      <!-- :key меняется → элемент пересоздаётся → CSS-анимация «подпрыгивания» играет заново -->
      <span
        :key="`lives-${store.bumpCounters.lives}`"
        class="stat"
        :class="{ low: store.hud.lives <= LOW_LIVES_THRESHOLD, bump: store.bumpCounters.lives > 0 }"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#d8394a"
            d="M12 21s-8-5.2-8-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8C20 15.8 12 21 12 21z"
          />
        </svg>
        <span class="visually-hidden">Жизни трона:</span><span>{{ store.hud.lives }}</span>
      </span>
      <span
        :key="`gold-${store.bumpCounters.gold}`"
        class="stat"
        :class="{ bump: store.bumpCounters.gold > 0 }"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="#e3b24a" />
          <circle cx="12" cy="12" r="5.5" fill="none" stroke="#a87a1f" stroke-width="2" />
        </svg>
        <span class="visually-hidden">Золото:</span><span>{{ store.hud.gold }}</span>
      </span>
      <button
        class="hud-reward-toggle"
        :class="{ 'is-empty': rewardCount === 0 }"
        type="button"
        :aria-label="`Благословения, получено ${rewardCount}`"
        aria-haspopup="dialog"
        :aria-expanded="selection.isRewardSheetOpen"
        @click="selection.openRewards"
      >
        <span class="hud-reward-count" aria-hidden="true">✦ {{ rewardCount }}</span>
      </button>
    </div>
    <span class="wave">
      <span class="wave-label">{{ waveLabel }}</span>
      <!-- Зал выпадает на партию случайно — его название под номером волны -->
      <small class="hud-level">{{ store.hud.levelName }}</small>
    </span>
  </header>
</template>
