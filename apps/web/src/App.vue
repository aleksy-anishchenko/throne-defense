<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { sfx } from '@/audio/sfx'
import { useKeyboard } from '@/composables/useKeyboard'
import { useGameStore } from '@/stores/game'
import GameBoard from './components/GameBoard.vue'
import HudBar from './components/HudBar.vue'
import ScreenOverlay from './components/ScreenOverlay.vue'
import SidePanel from './components/SidePanel.vue'

const store = useGameStore()
useKeyboard()

// Браузер разрешает звук только после действия игрока
const UNLOCK_EVENTS = ['pointerup', 'click', 'keydown'] as const
const unlockAudio = () => sfx.unlock()

// Свернули вкладку посреди боя — ставим на паузу
function onVisibility() {
  if (document.hidden) store.pauseIfFighting()
}

onMounted(() => {
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlockAudio, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlockAudio)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <HudBar />
  <GameBoard />
  <SidePanel />
  <ScreenOverlay />
</template>
