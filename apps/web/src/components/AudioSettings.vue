<script setup lang="ts">
// Экран «Настройки»: звуки и музыка — у каждого выключатель и громкость
import { useGameStore } from '@/stores/game'

const store = useGameStore()

/** Число из ползунка (браузер отдаёт строку) */
const sliderValue = (event: Event) => Number((event.target as HTMLInputElement).value)
const isChecked = (event: Event) => (event.target as HTMLInputElement).checked

function onSfxToggle(event: Event) {
  store.updateAudioSettings({ isSfxOn: isChecked(event) })
  if (isChecked(event)) store.previewSfx()
}
</script>

<template>
  <div class="audio-settings">
    <div class="audio-row">
      <label class="audio-switch">
        <input type="checkbox" :checked="store.audioSettings.isSfxOn" @change="onSfxToggle" />
        Звуки
      </label>
      <!-- Громкость меняется, пока тянут ползунок (input), а пробный звук — когда отпустили
           (change): иначе он пищал бы на каждый шаг -->
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        aria-label="Громкость звуков"
        :value="store.audioSettings.sfxVolume"
        :disabled="!store.audioSettings.isSfxOn"
        @input="store.updateAudioSettings({ sfxVolume: sliderValue($event) })"
        @change="store.previewSfx"
      />
      <span class="audio-value" aria-hidden="true">{{ store.audioSettings.sfxVolume }}%</span>
    </div>
    <div class="audio-row">
      <label class="audio-switch">
        <input
          type="checkbox"
          :checked="store.audioSettings.isMusicOn"
          @change="store.updateAudioSettings({ isMusicOn: isChecked($event) })"
        />
        Музыка
      </label>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        aria-label="Громкость музыки"
        :value="store.audioSettings.musicVolume"
        :disabled="!store.audioSettings.isMusicOn"
        @input="store.updateAudioSettings({ musicVolume: sliderValue($event) })"
      />
      <span class="audio-value" aria-hidden="true">{{ store.audioSettings.musicVolume }}%</span>
    </div>
  </div>
</template>
