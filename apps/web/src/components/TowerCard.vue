<script setup lang="ts">
import type { TowerDef } from '@throne/game'
import { onMounted, useTemplateRef } from 'vue'
import { drawTowerIcon } from '@/render/towers'

const props = defineProps<{
  def: TowerDef
  /** Выбран в магазине */
  pressed: boolean
  /** Не хватает золота */
  poor: boolean
}>()
const emit = defineEmits<{ pick: [] }>()

const icon = useTemplateRef('icon')
onMounted(() => drawTowerIcon(icon.value!, props.def.id))
</script>

<template>
  <button
    type="button"
    class="card"
    :class="{ poor }"
    :aria-pressed="pressed"
    @click="emit('pick')"
  >
    <canvas ref="icon" width="96" height="96" aria-hidden="true"></canvas>
    <span class="nm">{{ def.name }}</span>
    <span class="cost">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
      </svg>
      <span class="vh">цена</span>{{ def.cost }}
    </span>
    <span class="ds">{{ def.desc }}</span>
  </button>
</template>
