<script setup lang="ts">
// Значок башни: тот же рисунок, что на поле, только крупно (canvas 96×96 сжимается стилями)
import { onMounted, useTemplateRef } from 'vue'
import { drawTowerIcon } from '@/render/towers'

const props = defineProps<{ towerId: string }>()
const iconCanvas = useTemplateRef('iconCanvas')
onMounted(() => drawTowerIcon(iconCanvas.value!, props.towerId))
</script>

<template>
  <canvas ref="iconCanvas" width="96" height="96" aria-hidden="true"></canvas>
</template>
