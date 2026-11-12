<script setup lang="ts">
// Блок «общий топ» на экране итогов: поле имени (один раз), «отправляю…», место в таблице
import { PLAYER_NAME_MAX_LENGTH } from '@throne/contracts'
import { ref } from 'vue'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
/** «Сменить имя» — поле уже с прежним именем */
const nameInput = ref(store.playerName ?? '')
const nameError = ref('')

function submitName() {
  if (store.setPlayerName(nameInput.value)) {
    nameError.value = ''
  } else {
    nameError.value = `Имя — от 1 до ${PLAYER_NAME_MAX_LENGTH} символов`
  }
}

function placeText(): string {
  const { rank, playerCount } = store.submission
  if (playerCount === 1) return `${store.playerName}, вы первым попали в таблицу лучших.`
  return `${store.playerName}, вы на ${rank}-м месте из ${playerCount}.`
}
</script>

<template>
  <form
    v-if="store.submission.status === 'needs-name'"
    class="name-form"
    novalidate
    @submit.prevent="submitName"
  >
    <label for="player-name">Ваше имя для таблицы лучших</label>
    <div class="name-row">
      <input
        id="player-name"
        v-model="nameInput"
        type="text"
        :maxlength="PLAYER_NAME_MAX_LENGTH"
        autocomplete="nickname"
        enterkeyhint="send"
        spellcheck="false"
        :aria-invalid="nameError ? 'true' : undefined"
        :aria-describedby="nameError ? 'player-name-error' : undefined"
      />
      <button class="btn" type="submit">В таблицу</button>
    </div>
    <p v-if="nameError" id="player-name-error" class="name-error" role="alert">
      {{ nameError }}
    </p>
  </form>
  <!-- role="status": скринридер прочитает, когда текст сменится («отправляю» → «вы на 7-м месте») -->
  <p v-else-if="store.submission.status !== 'idle'" class="run-place" role="status">
    <template v-if="store.submission.status === 'sending'">Отправляю результат…</template>
    <template v-else-if="store.submission.status === 'sent'">
      {{ placeText() }}
      <button class="link-button" type="button" @click="store.changePlayerName">Сменить имя</button>
    </template>
    <template v-else>Таблица лучших сейчас недоступна.</template>
  </p>
</template>
