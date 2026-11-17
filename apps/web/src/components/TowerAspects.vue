<script setup lang="ts">
// Один выбор специализации для боковой панели и мобильного меню.
import { useSelectedTowerInfo } from '@/composables/useSelectedTowerInfo'
import { useSelectionStore } from '@/stores/selection'

const info = useSelectedTowerInfo()
const selection = useSelectionStore()
</script>

<template>
  <section v-if="info?.hasAspects" class="tower-aspects" aria-label="Специализация IV ступени">
    <template v-if="info.aspect">
      <h3>{{ info.aspect.name }}</h3>
      <p class="aspect-description">{{ info.aspect.description }}</p>
      <button
        v-if="info.canUndoSpecialization"
        class="btn aspect-undo"
        type="button"
        @click="selection.undoSpecializationSelected"
      >
        Отменить аспект — вернуть {{ info.aspect.cost }}
      </button>
      <p class="aspect-hint">
        {{
          info.canUndoSpecialization
            ? 'Можно отменить до начала следующей волны.'
            : 'Специализация закреплена после первого боя.'
        }}
      </p>
    </template>
    <template v-else>
      <h3>IV ступень — выберите аспект</h3>
      <p class="aspect-hint">
        {{
          info.canSpecialize
            ? 'Один аспект на башню. До начала волны покупку можно отменить.'
            : 'Выбор доступен между волнами.'
        }}
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
