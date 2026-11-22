<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { audioEngine } from '@/audio/engine'
import { music } from '@/audio/music'
import { useKeyboard } from '@/composables/useKeyboard'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import GameBoard from './components/GameBoard.vue'
import HudBar from './components/HudBar.vue'
import RewardSheet from './components/RewardSheet.vue'
import ScreenOverlay from './components/ScreenOverlay.vue'
import SidePanel from './components/SidePanel.vue'

const store = useGameStore()
const selection = useSelectionStore()
const isGameInert = computed(() => store.screen !== null || selection.isRewardSheetOpen)
useKeyboard()

// Браузер разрешает звук только после действия игрока
const UNLOCK_EVENTS = ['pointerup', 'click', 'keydown'] as const
const unlockAudio = () => audioEngine.unlock()

// Свернули вкладку посреди боя — ставим на паузу. Музыка в свёрнутой вкладке молчит
function onVisibilityChange() {
  if (document.hidden) store.pauseIfFighting()
  music.setHidden(document.hidden)
}

onMounted(() => {
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlockAudio, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlockAudio)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <!-- inert отключает нажатия и Tab в игре под открытым диалогом. -->
  <HudBar :inert="isGameInert" />
  <GameBoard :inert="isGameInert" />
  <SidePanel :inert="isGameInert" />
  <RewardSheet />
  <ScreenOverlay />
</template>
