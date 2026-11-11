<script setup lang="ts">
// Экран поверх поля: заставка, поражение, победа
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import { fmt } from '@/utils/format'
import { shareResult } from '@/utils/share'

const store = useGameStore()
const row = useTemplateRef('row')
/** Подсказка после «Поделиться» (заменяет обычную) */
const shareNote = ref('')

async function share() {
  if ((await shareResult(store.hud.cleared, store.hud.score)) === 'copied') {
    shareNote.value = 'Результат скопирован. Вставьте его в чат друзьям.'
  }
}

function bestNote(): string {
  if (store.newBest) return 'Это ваш новый рекорд.'
  return store.best ? `Ваш рекорд: ${fmt(store.best.score)}.` : ''
}

const content = computed(() => {
  const { hud, best } = store
  switch (store.screen) {
    case 'menu':
      return {
        title: 'Защита трона',
        text: 'Мятежники ломятся в тронный зал. Расставьте стражу вдоль ковра и не подпустите их к трону.',
        note: best
          ? `Ваш рекорд: ${fmt(best.score)}, отбито волн: ${best.wave}.`
          : 'Выберите стража и нажмите на свободную плиту. Нажмите на поставленного стража, чтобы улучшить его или продать.',
        buttons: [{ label: 'Играть', action: store.newGame }],
      }
    case 'defeat':
      return {
        title: 'Трон пал',
        text: `Отбито волн: ${hud.cleared}. Счёт: ${fmt(hud.score)}.`,
        note: bestNote(),
        buttons: [
          { label: 'Сыграть ещё раз', action: store.newGame },
          { label: 'Поделиться результатом', action: share },
        ],
      }
    case 'victory':
      return {
        title: 'Трон устоял',
        text: `Все ${hud.maxWave} волн отбиты. Счёт: ${fmt(hud.score)}.`,
        note: bestNote(),
        buttons: [
          { label: 'Играть дальше', action: store.continueEndless },
          { label: 'Поделиться результатом', action: share },
          { label: 'Начать заново', action: store.newGame },
        ],
      }
    default:
      return null
  }
})

/** Фокус на главную кнопку — чтобы можно было сразу нажать Enter */
async function focusFirst() {
  await nextTick()
  row.value?.querySelector('button')?.focus({ preventScroll: true })
}

onMounted(focusFirst)
watch(
  () => store.screen,
  () => {
    shareNote.value = ''
    focusFirst()
  },
)
</script>

<template>
  <div v-if="content" class="overlay">
    <div class="sheet">
      <h1>{{ content.title }}</h1>
      <p>{{ content.text }}</p>
      <p v-if="shareNote || content.note" class="dim">{{ shareNote || content.note }}</p>
      <div ref="row" class="row">
        <button
          v-for="(b, i) in content.buttons"
          :key="b.label"
          class="btn"
          :class="{ primary: i === 0 }"
          type="button"
          @click="b.action"
        >
          {{ b.label }}
        </button>
      </div>
    </div>
  </div>
</template>
