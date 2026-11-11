<script setup lang="ts">
import type { TowerDef } from '@throne/game'
import { onMounted, useTemplateRef } from 'vue'
import { drawTowerIcon } from '@/render/towers'

const props = defineProps<{
  def: TowerDef
  /** Выбран в магазине */
  isArmed: boolean
  /** Не хватает золота */
  isUnaffordable: boolean
}>()
const emit = defineEmits<{ pick: [] }>()

const iconCanvas = useTemplateRef('iconCanvas')
onMounted(() => drawTowerIcon(iconCanvas.value!, props.def.id))
</script>

<template>
  <button
    type="button"
    class="card"
    :class="{ poor: isUnaffordable }"
    :aria-pressed="isArmed"
    @click="emit('pick')"
  >
    <canvas ref="iconCanvas" width="96" height="96" aria-hidden="true"></canvas>
    <span class="card-name">{{ def.name }}</span>
    <span class="cost">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
      </svg>
      <span class="visually-hidden">цена</span>{{ def.cost }}
    </span>
    <span class="card-description">{{ def.description }}</span>
  </button>
</template>
