<script setup lang="ts">
// Один выбор специализации для боковой панели и мобильного меню.
import { useSelectedTowerInfo } from '@/composables/useSelectedTowerInfo'
import { useSelectionStore } from '@/stores/selection'

import TowerIcon from './TowerIcon.vue'

const info = useSelectedTowerInfo()
const selection = useSelectionStore()
</script>

<template>
  <section v-if="info?.hasAspects" class="tower-aspects" aria-label="Специализация IV ступени">
    <template v-if="info.aspect">
      <TowerIcon
        v-if="selection.selected.towerId === 'outpost'"
        class="outpost-aspect-icon"
        tower-id="outpost"
        :tier="2"
        :aspect-id="info.aspect.id"
      />
      <h3>{{ info.aspect.name }}</h3>
      <p class="aspect-description">{{ info.aspect.description }}</p>
      <button
        v-if="info.canUndoSpecialization"
        class="btn aspect-undo"
        type="button"
        @click="selection.undoSpecializationSelected"
      >
        Отменить аспект — вернуть {{ info.aspectGoldPaid }}
      </button>
      <p v-if="info.canUndoSpecialization" class="aspect-hint">
        Можно отменить до начала следующей волны.
      </p>
    </template>
    <template v-else>
      <h3>IV ступень — выберите аспект</h3>
      <p class="aspect-hint">
        До начала волны покупку можно отменить. В бою выбор закрепляется сразу.
      </p>
      <button
        v-for="aspect in info.aspects"
        :key="aspect.id"
        class="btn aspect-option"
        :class="{ primary: aspect.canAfford && info.canSpecialize }"
        type="button"
        :disabled="!info.canSpecialize || !aspect.canAfford"
        :aria-label="`${aspect.name} за ${aspect.cost} золота`"
        @click="selection.specializeSelected(aspect.id)"
      >
        <TowerIcon
          v-if="selection.selected.towerId === 'outpost'"
          class="outpost-aspect-icon"
          tower-id="outpost"
          :tier="2"
          :aspect-id="aspect.id"
        />
        <span class="aspect-heading">
          <strong>{{ aspect.name }}</strong>
          <span class="aspect-cost">за {{ aspect.cost }}</span>
        </span>
        <span class="aspect-description">{{ aspect.description }}</span>
        <span v-if="!aspect.canAfford" class="aspect-hint">Не хватает золота</span>
      </button>
    </template>
  </section>
</template>
