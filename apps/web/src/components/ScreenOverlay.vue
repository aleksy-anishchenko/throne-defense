<script setup lang="ts">
// Экран поверх поля: заставка, поражение, победа
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import { formatNumber } from '@/utils/format'
import { shareResult } from '@/utils/share'

const store = useGameStore()
const buttonsRow = useTemplateRef('buttonsRow')
const sheet = useTemplateRef('sheet')
/** Подсказка после «Поделиться» (заменяет обычную) */
const shareNote = ref('')

/** Идёт ли «Поделиться» прямо сейчас */
let isSharing = false

async function share() {
  // Двойное касание открыло бы второе окно «Поделиться» (браузер его отклонит), и после
  // отказа мы бы скопировали текст и показали «скопировано» поверх первого окна
  if (isSharing) return
  isSharing = true
  try {
    if ((await shareResult(store.hud.wavesCleared, store.hud.score)) === 'copied') {
      shareNote.value = 'Результат скопирован. Вставьте его в чат друзьям.'
    }
  } finally {
    isSharing = false
  }
}

function bestNote(): string {
  if (store.isNewBest) return 'Это ваш новый рекорд.'
  return store.bestResult ? `Ваш рекорд: ${formatNumber(store.bestResult.score)}.` : ''
}

const screenContent = computed(() => {
  const { hud, bestResult } = store
  switch (store.screen) {
    case 'menu':
      return {
        title: 'Защита трона',
        text: 'Мятежники ломятся в тронный зал. Расставьте стражу вдоль ковра и не подпустите их к трону.',
        note: bestResult
          ? `Ваш рекорд: ${formatNumber(bestResult.score)}, отбито волн: ${bestResult.wave}.`
          : 'Выберите стража и нажмите на свободную плиту. Нажмите на поставленного стража, чтобы улучшить его или продать.',
        buttons: [{ label: 'Играть', action: store.newGame }],
      }
    case 'defeat':
      return {
        title: 'Трон пал',
        text: `Отбито волн: ${hud.wavesCleared}. Счёт: ${formatNumber(hud.score)}.`,
        note: bestNote(),
        buttons: [
          { label: 'Сыграть ещё раз', action: store.newGame },
          { label: 'Поделиться результатом', action: share },
        ],
      }
    case 'victory':
      return {
        title: 'Трон устоял',
        text: `Все ${hud.waveCount} волн отбиты. Счёт: ${formatNumber(hud.score)}.`,
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

/**
 * Куда поставить фокус, когда экран открылся.
 * В меню — на «Играть», чтобы можно было сразу нажать Enter.
 * После поражения и победы — на сам экран: игрок мог в этот момент жать Enter
 * (ставил стража с клавиатуры), и партия перезапустилась бы сама. Tab ведёт к кнопкам
 */
async function focusScreen() {
  await nextTick()
  if (store.screen === 'menu') {
    buttonsRow.value?.querySelector('button')?.focus({ preventScroll: true })
  } else {
    sheet.value?.focus({ preventScroll: true })
  }
}

onMounted(focusScreen)
watch(
  () => store.screen,
  () => {
    shareNote.value = ''
    focusScreen()
  },
)
</script>

<template>
  <div v-if="screenContent" class="overlay">
    <!-- role="dialog" и aria-modal: скринридер понимает, что под экраном ничего нет -->
    <div
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="screen-title"
      tabindex="-1"
    >
      <h1 id="screen-title">{{ screenContent.title }}</h1>
      <p>{{ screenContent.text }}</p>
      <p v-if="shareNote || screenContent.note" class="note">
        {{ shareNote || screenContent.note }}
      </p>
      <div ref="buttonsRow" class="buttons">
        <button
          v-for="(button, i) in screenContent.buttons"
          :key="button.label"
          class="btn"
          :class="{ primary: i === 0 }"
          type="button"
          @click="button.action"
        >
          {{ button.label }}
        </button>
      </div>
    </div>
  </div>
</template>
