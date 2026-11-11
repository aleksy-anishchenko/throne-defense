<script setup lang="ts">
import { useGameStore } from '@/stores/game'
import ControlsBar from './ControlsBar.vue'
import ShopPanel from './ShopPanel.vue'
import TowerInfo from './TowerInfo.vue'

const store = useGameStore()
</script>

<template>
  <aside class="panel" :class="{ tw: store.hud.selType !== null }">
    <p id="hint">{{ store.hint }}</p>
    <TowerInfo />
    <ShopPanel />
    <ControlsBar />
  </aside>
</template>
