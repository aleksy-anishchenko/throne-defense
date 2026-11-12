<script setup lang="ts">
// Меню выбора стража на телефоне: список с описанием и характеристиками до покупки.
// Нажал на стража — меню закрылось, он «в руке», осталось нажать на свободную плиту.
// С боковой панелью (компьютер, телефон набок) меню скрыто стилями, там работает ShopPanel
import { TOWER_LIST } from '@throne/game'
import { useTemplateRef } from 'vue'
import { useMenuFocus } from '@/composables/useMenuFocus'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import { describeNewTowerStats } from '@/utils/towerStats'
import TowerIcon from './TowerIcon.vue'

const store = useGameStore()
const selection = useSelectionStore()
const drawerElement = useTemplateRef('drawerElement')

useMenuFocus(() => selection.isShopOpen, drawerElement)
</script>

<template>
  <div v-if="selection.isShopOpen" class="shop-drawer">
    <div class="shop-drawer-backdrop" @click="selection.closeMenu"></div>
    <div
      ref="drawerElement"
      class="shop-drawer-body"
      role="dialog"
      aria-modal="true"
      aria-label="Выбор стража"
      tabindex="-1"
    >
      <header class="shop-drawer-header">
        <h2>Выберите стража</h2>
        <button
          type="button"
          class="shop-drawer-close"
          aria-label="Закрыть"
          @click="selection.closeMenu"
        >
          ✕
        </button>
      </header>
      <ul class="shop-drawer-list">
        <li v-for="towerDef in TOWER_LIST" :key="towerDef.id">
          <button
            type="button"
            class="drawer-card"
            :class="{ poor: store.hud.gold < towerDef.cost }"
            :aria-pressed="selection.armedTowerId === towerDef.id"
            @click="selection.chooseShopTower(towerDef.id)"
          >
            <TowerIcon :tower-id="towerDef.id" class="drawer-card-icon" />
            <span class="drawer-card-name">{{ towerDef.name }}</span>
            <span class="drawer-card-cost">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
              </svg>
              <span class="visually-hidden">цена</span>{{ towerDef.cost }}
            </span>
            <span class="drawer-card-description">{{ towerDef.description }}</span>
            <span class="drawer-card-stats">{{ describeNewTowerStats(towerDef) }}</span>
            <span v-if="store.hud.gold < towerDef.cost" class="drawer-card-poor">
              не хватает {{ towerDef.cost - store.hud.gold }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
