<script setup lang="ts">
// Блок «общий топ» на экране итогов: поле имени (один раз), «отправляю…», место в таблице
import { PLAYER_NAME_MAX_LENGTH } from '@throne/contracts'
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
/**
 * maxlength браузер считает в «половинках» символов (UTF-16): эмодзи — две. С обычным
 * пределом имя из эмодзи обрезалось бы на 10. Настоящую длину проверяет isValidPlayerName
 */
const NAME_INPUT_MAX_LENGTH = PLAYER_NAME_MAX_LENGTH * 2
/** «Сменить имя» — поле уже с прежним именем */
const nameInput = ref(store.playerName ?? '')
const nameError = ref('')
const savingName = computed(() => store.submission.status === 'saving-name')
const editingName = computed(() => store.submission.status === 'editing-name' || savingName.value)
const nameFeedback = computed(() => nameError.value || store.submission.message)

function submitName() {
  if (store.setPlayerName(nameInput.value)) {
    nameError.value = ''
  } else {
    nameError.value = `Имя — от 1 до ${PLAYER_NAME_MAX_LENGTH} видимых символов`
  }
}

function editName() {
  nameInput.value = store.playerName ?? ''
  nameError.value = ''
  store.changePlayerName()
}

function placeText(): string {
  const { rank, playerCount } = store.submission
  if (playerCount === 1) return `${store.playerName}, вы первым попали в таблицу лучших.`
  return `${store.playerName}, вы на ${rank}-м месте из ${playerCount}.`
}

const refreshGame = () => window.location.reload()
</script>

<template>
  <form
    v-if="store.submission.status === 'needs-name' || editingName"
    class="name-form"
    novalidate
    @submit.prevent="submitName"
  >
    <label for="player-name">{{ editingName ? 'Имя в таблице' : 'Ваше имя' }}</label>
    <div class="name-row">
      <input
        id="player-name"
        v-model="nameInput"
        type="text"
        :maxlength="NAME_INPUT_MAX_LENGTH"
        autocomplete="nickname"
        enterkeyhint="send"
        spellcheck="false"
        :disabled="savingName"
        :aria-invalid="nameError ? 'true' : undefined"
        :aria-describedby="nameFeedback ? 'player-name-error' : undefined"
      />
      <button class="btn" type="submit" :disabled="savingName">
        {{ savingName ? 'Сохраняю…' : 'Сохранить' }}
      </button>
    </div>
    <p v-if="nameFeedback" id="player-name-error" class="name-error" role="alert">
      {{ nameFeedback }}
    </p>
  </form>
  <!-- role="status": скринридер прочитает, когда текст сменится («отправляю» → «вы на 7-м месте») -->
  <p v-else-if="store.submission.status !== 'idle'" class="run-place" role="status">
    <template v-if="store.submission.status === 'sending'">Отправляю результат…</template>
    <template v-else-if="store.submission.status === 'sent'">
      {{ placeText() }}
      <button class="link-button" type="button" @click="editName">Сменить имя</button>
    </template>
    <template v-else-if="store.submission.status === 'outdated'">
      {{ store.submission.message }}
      <button class="link-button" type="button" @click="refreshGame">Обновить игру</button>
    </template>
    <template v-else-if="store.submission.status === 'rejected'">{{
      store.submission.message
    }}</template>
    <template v-else>
      {{ store.submission.message }}
      <button class="link-button" type="button" @click="store.retrySubmission">
        Отправить ещё раз
      </button>
    </template>
  </p>
</template>
