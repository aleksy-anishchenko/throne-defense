<script setup lang="ts">
// Экран поверх поля: заставка, поражение, победа, таблица лучших, настройки
import { REWARD_SETS } from '@throne/game'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { keepDialogFocus } from '@/composables/useMenuFocus'
import { useGameStore } from '@/stores/game'
import { formatNumber } from '@/utils/format'
import { shareResult } from '@/utils/share'
import AudioSettings from './AudioSettings.vue'
import LeaderboardTable from './LeaderboardTable.vue'
import RewardChoice from './RewardChoice.vue'
import RunSubmission from './RunSubmission.vue'

const store = useGameStore()
const isCrownGift = computed(() => store.rewards.kind === 'crown-gift')
/** Какая версия выложена: «хеш коммита · дата сборки» (видно в меню) */
const appVersion = __APP_VERSION__
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
      if (store.isPlaying()) {
        const waveText =
          hud.wave > hud.waveCount ? `Волна ${hud.wave}` : `Волна ${hud.wave} из ${hud.waveCount}`
        return {
          title: 'Пауза',
          text: `${waveText}. Жизни трона: ${hud.lives}.`,
          note: '',
          buttons: [
            { label: 'Продолжить', action: store.closeGameMenu },
            { label: 'Настройки', action: store.openSettings },
            { label: 'Сдаться', action: store.requestSurrender },
          ],
        }
      }
      return {
        title: 'Защита трона',
        text: 'Мятежники ломятся в тронный зал. Расставьте стражу вдоль ковра и не подпустите их к трону.',
        note: bestResult
          ? `Ваш рекорд: ${formatNumber(bestResult.score)}, отбито волн: ${bestResult.wave}.`
          : 'Выберите стража и нажмите на свободную плиту. Нажмите на поставленного стража, чтобы улучшить его или продать.',
        buttons: [
          { label: 'Играть', action: store.newGame },
          { label: 'Лучшие результаты', action: store.openLeaderboard },
          { label: 'Настройки', action: store.openSettings },
        ],
      }
    case 'defeat':
      return {
        title: 'Трон пал',
        text: `Отбито волн: ${hud.wavesCleared}. Счёт: ${formatNumber(hud.score)}.`,
        note: bestNote(),
        buttons: [
          { label: 'Сыграть ещё раз', action: store.newGame },
          { label: 'Поделиться результатом', action: share },
          { label: 'Лучшие результаты', action: store.openLeaderboard },
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
          { label: 'Лучшие результаты', action: store.openLeaderboard },
        ],
      }
    case 'reward':
      return {
        title: isCrownGift.value ? REWARD_SETS.supplies.name : 'Выберите благословение',
        text: isCrownGift.value ? 'Выберите одно обычное благословение.' : '',
        note: '',
        buttons: [],
      }
    case 'surrender':
      return {
        title: 'Сдаться?',
        text: 'Текущая партия завершится. Результат сохранится.',
        note: '',
        buttons: [
          { label: 'Отмена', action: store.cancelSurrender },
          { label: 'Да, сдаться', action: store.surrender },
        ],
      }
    case 'leaderboard':
      return {
        title: 'Лучшие результаты',
        // Таблица общая: все залы и все версии правил — зал рекорда указан в каждой строке
        text: 'Все залы',
        note: '',
        buttons: [{ label: 'Назад', action: store.closeLeaderboard }],
      }
    case 'settings':
      return {
        title: 'Настройки',
        text: '',
        note: '',
        buttons: [{ label: 'Готово', action: store.closeSettings }],
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
watch([() => store.screen, () => store.rewards.kind], () => {
  shareNote.value = ''
  focusScreen()
})
</script>

<template>
  <div
    v-if="screenContent"
    class="overlay"
    :class="{ 'reward-overlay': store.screen === 'reward' }"
  >
    <!-- role="dialog" и aria-modal: скринридер понимает, что под экраном ничего нет -->
    <div
      ref="sheet"
      class="sheet"
      :class="{
        'reward-sheet': store.screen === 'reward',
        'reward-gift-sheet': store.screen === 'reward' && isCrownGift,
      }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="screen-title"
      :aria-describedby="
        store.screen === 'reward' && screenContent.text ? 'reward-caption' : undefined
      "
      tabindex="-1"
      @keydown="keepDialogFocus($event, sheet)"
    >
      <RewardChoice
        v-if="store.screen === 'reward'"
        :key="store.rewards.kind ?? undefined"
        :title="screenContent.title"
        :caption="screenContent.text"
      />
      <template v-else>
        <h1 id="screen-title">{{ screenContent.title }}</h1>
        <p v-if="screenContent.text">{{ screenContent.text }}</p>
        <p v-if="shareNote || screenContent.note" class="note">
          {{ shareNote || screenContent.note }}
        </p>
        <RunSubmission v-if="store.screen === 'defeat' || store.screen === 'victory'" />
        <LeaderboardTable v-if="store.screen === 'leaderboard'" />
        <AudioSettings v-if="store.screen === 'settings'" />
        <div v-if="screenContent.buttons.length" ref="buttonsRow" class="buttons">
          <button
            v-for="(button, i) in screenContent.buttons"
            :key="button.label"
            class="btn"
            :class="{ primary: i === 0, danger: button.label === 'Да, сдаться' }"
            type="button"
            @click="button.action"
          >
            {{ button.label }}
          </button>
        </div>
        <p v-if="store.screen === 'menu' && !store.isPlaying()" class="version">
          Версия {{ appVersion }}
        </p>
      </template>
    </div>
  </div>
</template>
