<script setup lang="ts">
defineProps<{ details: string[] }>()
</script>

<template>
  <small class="tower-stat-bonus">
    <template v-for="(detail, index) in details" :key="detail">
      <template v-if="index">{{ ' · ' }}</template><span>{{ detail }}</span>
    </template>
  </small>
</template>
