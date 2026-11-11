<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const store = useGameStore()

const waveLabel = computed(() =>
  store.hud.wave > store.hud.maxWave
    ? `Волна ${store.hud.wave}`
    : `Волна ${store.hud.wave} из ${store.hud.maxWave}`,
)
</script>

<template>
  <header class="hud">
    <span class="brand">Защита трона</span>
    <!-- :key меняется → элемент пересоздаётся → CSS-анимация «подпрыгивания» играет заново -->
    <span
      :key="`lives-${store.bumps.lives}`"
      class="stat"
      :class="{ low: store.hud.lives <= 5, bump: store.bumps.lives > 0 }"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#d8394a"
          d="M12 21s-8-5.2-8-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8C20 15.8 12 21 12 21z"
        />
      </svg>
      <span class="vh">Жизни трона:</span><span>{{ store.hud.lives }}</span>
    </span>
    <span :key="`gold-${store.bumps.gold}`" class="stat" :class="{ bump: store.bumps.gold > 0 }">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#e3b24a" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="#a87a1f" stroke-width="2" />
      </svg>
      <span class="vh">Золото:</span><span>{{ store.hud.gold }}</span>
    </span>
    <span class="wave">{{ waveLabel }}</span>
  </header>
</template>
