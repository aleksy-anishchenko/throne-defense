<script setup lang="ts">
import { TOWER_LIST } from '@throne/game'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import TowerCard from './TowerCard.vue'

const store = useGameStore()
const selection = useSelectionStore()
</script>

<template>
  <div class="shop" role="group" aria-label="Стража">
    <TowerCard
      v-for="towerDef in TOWER_LIST"
      :key="towerDef.id"
      :def="towerDef"
      :is-armed="selection.armedTowerId === towerDef.id"
      :is-unaffordable="store.hud.gold < towerDef.cost"
      @pick="selection.chooseShopTower(towerDef.id)"
    />
  </div>
</template>
