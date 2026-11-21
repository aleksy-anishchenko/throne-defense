<script setup lang="ts">
// Таблица лучших: строка профиля с его рекордом и залом партии
import { levelName, useGameStore } from '@/stores/game'
import { formatNumber, plural } from '@/utils/format'

const store = useGameStore()

const WAVE_FORMS = ['волна', 'волны', 'волн'] as const
</script>

<template>
  <p v-if="store.leaderboard.status === 'loading'" class="leaderboard-status" role="status">
    Загружаю…
  </p>
  <p v-else-if="store.leaderboard.status === 'failed'" class="leaderboard-status" role="status">
    Не удалось загрузить таблицу. Проверьте интернет и попробуйте позже.
  </p>
  <p v-else-if="store.leaderboard.entries.length === 0" class="leaderboard-status">
    Пока никого. Сыграйте — и будете первым.
  </p>
  <template v-else>
    <!-- Место пишем сами, а не нумерацией списка: у равных счетов одно место -->
    <ol class="leaderboard">
      <li
        v-for="entry in store.leaderboard.entries"
        :key="entry.playerId ?? `legacy:${entry.playerName}`"
        :class="{
          'is-player': entry.playerId && entry.playerId === store.leaderboard.viewerPlayerId,
        }"
      >
        <span class="leaderboard-rank">{{ entry.rank }}</span>
        <span class="leaderboard-name">
          {{ entry.playerName }}
          <!-- Топ общий на все залы: где сыгран рекорд -->
          <small class="leaderboard-level">
            {{ levelName(entry.levelId) }}<template v-if="!entry.playerId"> · До профилей</template>
          </small>
        </span>
        <span class="leaderboard-score">{{ formatNumber(entry.score) }}</span>
        <span class="leaderboard-waves">
          {{ entry.wavesCleared }} {{ plural(entry.wavesCleared, WAVE_FORMS) }}
        </span>
      </li>
    </ol>
    <p v-if="store.leaderboard.playerCount > store.leaderboard.entries.length" class="note">
      Всего игроков: {{ formatNumber(store.leaderboard.playerCount) }}
    </p>
  </template>
</template>
