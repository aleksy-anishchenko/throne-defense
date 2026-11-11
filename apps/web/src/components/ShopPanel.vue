<script setup lang="ts">
import { TOWER_LIST } from '@throne/game'
import { useGameStore } from '@/stores/game'
import TowerCard from './TowerCard.vue'

const store = useGameStore()
</script>

<template>
  <div class="shop" role="group" aria-label="Стража">
    <TowerCard
      v-for="towerDef in TOWER_LIST"
      :key="towerDef.id"
      :def="towerDef"
      :is-armed="store.armedTowerId === towerDef.id"
      :is-unaffordable="store.hud.gold < towerDef.cost"
      @pick="store.chooseShopTower(towerDef.id)"
    />
  </div>
</template>
