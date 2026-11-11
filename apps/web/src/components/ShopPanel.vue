<script setup lang="ts">
import { TOWER_LIST } from '@throne/game'
import { useGameStore } from '@/stores/game'
import TowerCard from './TowerCard.vue'

const store = useGameStore()
</script>

<template>
  <div class="shop" role="group" aria-label="Стража">
    <TowerCard
      v-for="def in TOWER_LIST"
      :key="def.id"
      :def="def"
      :pressed="store.armed === def.id"
      :poor="store.hud.gold < def.cost"
      @pick="store.pickCard(def.id)"
    />
  </div>
</template>
