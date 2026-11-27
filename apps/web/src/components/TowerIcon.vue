<script setup lang="ts">
// Значок башни: тот же рисунок, что на поле, только крупно (canvas 96×96 сжимается стилями)
import { onMounted, useTemplateRef, watchEffect } from 'vue'
import { drawTowerIcon } from '@/render/towers'
import { loadUnitSprites, unitSpritesLoaded } from '@/render/unitSprites'

const props = defineProps<{ towerId: string; tier?: number; aspectId?: string }>()
const iconCanvas = useTemplateRef('iconCanvas')
function draw() {
  if (iconCanvas.value) drawTowerIcon(iconCanvas.value, props.towerId, props.tier, props.aspectId)
}
watchEffect(draw)
onMounted(async () => {
  if (!unitSpritesLoaded() && (await loadUnitSprites())) draw()
})
</script>

<template>
  <canvas ref="iconCanvas" width="96" height="96" aria-hidden="true"></canvas>
</template>
