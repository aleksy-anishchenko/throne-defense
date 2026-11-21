// Мост между игрой и интерфейсом.
//
// Сама игра (враги, снаряды, башни) живёт в обычном объекте game — Vue за ним НЕ следит.
// Если положить её в ref/reactive, Vue обернёт каждого врага в Proxy и будет отслеживать
// каждое изменение x/y 60 раз в секунду — игра начнёт тормозить.
//
// Интерфейсу нужно немного: золото, жизни, номер волны… Эти числа каждый кадр копируются
// в реактивный объект hud (функция syncHud). Vue перерисует только то, что реально поменялось.

import { isValidPlayerName, normalizePlayerName, type LeaderboardEntry } from '@throne/contracts'
import {
  BALANCE_VERSION,
  LEVELS,
  PLAYABLE_LEVELS,
  MAX_SPEED,
  REWARDS,
  REWARD_SETS,
  REWARD_SET_SIZE,
  TOWERS,
  createGame,
  rewardRerollCost,
  rewardSetCounts,
  rewardStats,
  type LevelDef,
  type PendingReward,
  type Phase,
  type RewardId,
  type RewardPick,
} from '@throne/game'
import { defineStore } from 'pinia'
import { computed, markRaw, nextTick, reactive, ref, watch } from 'vue'
import { fetchLeaderboard, submitRun } from '@/api/leaderboard'
import { audioEngine } from '@/audio/engine'
import { connectGameSounds, musicMoodFor } from '@/audio/gameSounds'
import { music } from '@/audio/music'
import { sfx } from '@/audio/sfx'
import type { OverlayScreen } from '@/types'
import {
  loadBest,
  loadPlayerName,
  saveBest,
  savePlayerName,
  type AudioSettings,
  type BestResult,
} from '@/utils/storage'

/** Сколько миллисекунд висит всплывающее сообщение (тост) */
const TOAST_DURATION_MS = 1700

/** Что с результатом последней партии в общем топе */
type SubmissionStatus =
  /** Отправлять нечего: партия идёт или кончилась без очков */
  | 'idle'
  /** Имени ещё нет — экран итогов спрашивает его */
  | 'needs-name'
  | 'sending'
  | 'sent'
  /** Нет сети или сервер не ответил — игра идёт как раньше, просто без топа */
  | 'failed'
  | 'outdated'
  | 'rejected'

/**
 * ?level=throne-hall в адресе — всегда этот зал: для проверок в браузере (e2e) и чтобы
 * позвать друга в тот же зал. Нет или нет такого — зал на партию выпадает случайно
 */
const forcedLevel: LevelDef | undefined =
  typeof location === 'undefined'
    ? undefined
    : PLAYABLE_LEVELS.find(
        (level) => level.id === new URLSearchParams(location.search).get('level'),
      )

/** Случайный зал, кроме exceptId — чтобы два раза подряд не выпал один и тот же */
function randomLevel(exceptId?: string): LevelDef {
  const candidates = PLAYABLE_LEVELS.filter((level) => level.id !== exceptId)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/** Название зала по id (для таблицы лучших); неизвестный id — как есть */
export const levelName = (levelId: string): string =>
  LEVELS.find((level) => level.id === levelId)?.name ?? levelId

export const useGameStore = defineStore('game', () => {
  // markRaw — «Vue, не трогай этот объект».
  // Зал под меню — тот, в котором начнётся первая партия
  const game = markRaw(createGame(forcedLevel ?? randomLevel()))
  const state = game.state

  // ---------------------------------------------------------------- Снимок для интерфейса

  const hud = reactive({
    /** Название зала этой партии — в шапке */
    levelName: game.level.def.name,
    phase: state.phase as Phase,
    wave: state.wave,
    waveCount: game.level.waveCount,
    gold: state.gold,
    lives: state.lives,
    lastThroneDamageWave: state.lastThroneDamageWave,
    score: state.score,
    wavesCleared: state.wavesCleared,
    isPaused: state.isPaused,
    speed: state.speed,
    /** Врагов осталось в волне */
    enemiesLeft: 0,
    towerCount: 0,
  })

  /** Вызывается каждый кадр. Присваивание того же значения Vue не замечает — это дёшево */
  function syncHud() {
    hud.phase = state.phase
    hud.wave = state.wave
    hud.gold = state.gold
    hud.lives = state.lives
    hud.lastThroneDamageWave = state.lastThroneDamageWave
    hud.score = state.score
    hud.wavesCleared = state.wavesCleared
    hud.isPaused = state.isPaused
    hud.speed = state.speed
    hud.enemiesLeft = game.enemiesLeft()
    hud.towerCount = state.towers.length
  }

  // ---------------------------------------------------------------- Экран поверх поля

  // Какой экран показан поверх поля (меню, поражение, победа) или null
  const screen = ref<OverlayScreen>('menu')
  /** Меню само поставило паузу и снимет её после «Продолжить» */
  let isPausedByGameMenu = false

  /** Выбор благословения и уже полученные награды — снимок для Vue */
  const rewards = reactive({
    wave: 0,
    kind: null as PendingReward['kind'] | null,
    options: [] as RewardId[],
    rerollCost: null as number | null,
    selected: [] as RewardPick[],
  })
  const blessingEffects = computed(() => rewardStats({ selectedRewards: rewards.selected }))

  function syncRewards() {
    const pending = state.pendingReward
    rewards.wave = pending?.wave ?? 0
    rewards.kind = pending?.kind ?? null
    rewards.options = pending ? [...pending.options] : []
    rewards.rerollCost =
      pending?.kind === 'wave' ? rewardRerollCost(pending.wave, pending.rerolls) : null
    rewards.selected = state.selectedRewards.map((reward) => ({ ...reward }))
  }

  // ---------------------------------------------------------------- Звук, тосты, рекорд

  /** Копия настроек звука для экрана «Настройки»; сами настройки живут в audio/engine.ts */
  const audioSettings = ref<AudioSettings>(audioEngine.settings)
  const toast = reactive({ text: '', isVisible: false })
  /** Счётчики «подпрыгиваний» жизней и золота в шапке */
  const bumpCounters = reactive({ lives: 0, gold: 0 })
  const bestResult = ref<BestResult | null>(loadBest())
  const isNewBest = ref(false)

  let toastTimeoutId = 0
  async function showToast(text: string) {
    // Скринридер читает область aria-live, только когда текст в ней меняется.
    // Тот же текст ещё раз: сначала очищаем, и только в следующем обновлении экрана пишем снова
    if (toast.text === text) {
      toast.text = ''
      await nextTick()
    }
    toast.text = text
    toast.isVisible = true
    clearTimeout(toastTimeoutId)
    toastTimeoutId = window.setTimeout(() => {
      toast.isVisible = false
    }, TOAST_DURATION_MS)
  }

  /** Отказ в действии: сообщение, «подпрыгивание» золота и звук */
  function rejectAction(text: string) {
    showToast(text)
    bumpCounters.gold++
    sfx.deny()
  }

  function saveResultIfBest() {
    // Перечитываем из хранилища: в другой вкладке рекорд мог обновиться, и мы бы его затёрли
    bestResult.value = loadBest()
    // Партия без единого очка — не рекорд, даже если рекорда ещё нет
    isNewBest.value = state.score > 0 && (!bestResult.value || state.score > bestResult.value.score)
    if (isNewBest.value) {
      bestResult.value = { score: state.score, wave: state.wavesCleared }
      saveBest(bestResult.value)
    }
  }

  // ---------------------------------------------------------------- Общий топ

  const playerName = ref<string | null>(loadPlayerName())
  const submission = reactive({
    status: 'idle' as SubmissionStatus,
    rank: 0,
    playerCount: 0,
    message: '',
  })
  const leaderboard = reactive({
    status: 'idle' as 'idle' | 'loading' | 'loaded' | 'failed',
    entries: [] as LeaderboardEntry[],
    playerCount: 0,
  })
  /** Итог последней партии. Запоминаем в момент конца: «Играть дальше» продолжит менять счёт */
  let finishedRun: { score: number; wavesCleared: number } | null = null
  /**
   * Номер отправки. Ответ сервера приходит не сразу: если за это время началась новая партия
   * или результат отправили ещё раз (сменили имя), старый ответ уже не про то — его пропускаем
   */
  let submissionNumber = 0
  /** Откуда открыли таблицу лучших — туда и вернёт «Назад» */
  let screenBeforeLeaderboard: OverlayScreen = 'menu'

  async function submitFinishedRun() {
    if (!finishedRun || !playerName.value) return
    const number = ++submissionNumber
    submission.status = 'sending'
    const result = await submitRun({
      playerName: playerName.value,
      levelId: game.level.def.id,
      score: finishedRun.score,
      wavesCleared: finishedRun.wavesCleared,
      balanceVersion: BALANCE_VERSION,
    })
    if (number !== submissionNumber) return
    if (result.ok) {
      submission.status = 'sent'
      submission.rank = result.data.rank
      submission.playerCount = result.data.playerCount
      submission.message = ''
    } else {
      submission.status =
        result.code === 'outdated-balance'
          ? 'outdated'
          : result.code === 'invalid-run'
            ? 'rejected'
            : 'failed'
      submission.message = result.message
    }
  }

  /** Партия кончилась (победа или поражение): результат — в общий топ */
  function finishRunForLeaderboard() {
    submissionNumber++
    // Партия без единого очка — не результат, как и для рекорда в браузере
    finishedRun = state.score > 0 ? { score: state.score, wavesCleared: state.wavesCleared } : null
    if (!finishedRun) submission.status = 'idle'
    else if (!playerName.value) submission.status = 'needs-name'
    else void submitFinishedRun()
  }

  function forgetFinishedRun() {
    submissionNumber++
    finishedRun = null
    submission.status = 'idle'
  }

  /**
   * Игрок ввёл имя (впервые или сменил). Запоминаем и отправляем результат этой партии.
   * false — имя не годится, ничего не меняем
   */
  function setPlayerName(rawName: string): boolean {
    const name = normalizePlayerName(rawName)
    if (!isValidPlayerName(name)) return false
    playerName.value = name
    savePlayerName(name)
    void submitFinishedRun()
    return true
  }

  /** Сеть подвела в момент отправки — «Отправить ещё раз» на экране итогов */
  function retrySubmission() {
    void submitFinishedRun()
  }

  /** «Сменить имя» на экране итогов: снова показать поле ввода */
  function changePlayerName() {
    if (finishedRun) submission.status = 'needs-name'
  }

  /** Номер последней загрузки таблицы: ответ на старую (открыли, закрыли, открыли) пропускаем */
  let leaderboardRequestNumber = 0

  async function openLeaderboard() {
    if (screen.value !== 'leaderboard') screenBeforeLeaderboard = screen.value ?? 'menu'
    screen.value = 'leaderboard'
    leaderboard.status = 'loading'
    const number = ++leaderboardRequestNumber
    // Общий топ по всем залам и всем версиям баланса: рекорды копятся и не пропадают
    // при смене правил. В каждой строке — где сыгран рекорд
    const result = await fetchLeaderboard({})
    if (number !== leaderboardRequestNumber) return
    if (result) {
      leaderboard.entries = result.entries
      leaderboard.playerCount = result.playerCount
      leaderboard.status = 'loaded'
    } else {
      leaderboard.status = 'failed'
    }
  }

  function closeLeaderboard() {
    if (screen.value === 'leaderboard') screen.value = screenBeforeLeaderboard
  }

  // ---------------------------------------------------------------- Подписки на события игры

  connectGameSounds(game)
  game.on('leak', () => {
    bumpCounters.lives++
  })
  game.on('waveCleared', () => {
    bumpCounters.gold++
  })
  game.on('rewardOffered', () => {
    syncRewards()
    syncHud()
    screen.value = 'reward'
  })
  game.on('rewardMissed', ({ firstWave, lastWave }) => {
    syncHud()
    void showToast(`Благословение за волны ${firstWave}–${lastWave} упущено`)
  })
  game.on('rewardChosen', ({ rewardId }) => {
    // Если открылся «Дар короны», экран обновится по событию rewardOffered.
    if (state.pendingReward) return
    syncRewards()
    syncHud()
    screen.value = null
    const { setId } = REWARDS[rewardId]
    if (rewardSetCounts(state.selectedRewards)[setId] === REWARD_SET_SIZE) {
      void showToast(`Набор «${REWARD_SETS[setId].name}» собран`)
    }
  })
  game.on('victory', () => {
    saveResultIfBest()
    finishRunForLeaderboard()
    screen.value = 'victory'
  })
  game.on('defeat', () => {
    isPausedByGameMenu = false
    saveResultIfBest()
    finishRunForLeaderboard()
    screen.value = 'defeat'
  })

  // Музыка следует за снимком hud: он обновляется каждый кадр, а watch срабатывает,
  // только когда фаза, волна или пауза действительно поменялись
  watch([() => hud.phase, () => hud.wave], () => music.setMood(musicMoodFor(game)), {
    immediate: true,
  })
  // В настройках музыку не глушим, хоть игра и на паузе: игрок подбирает её громкость
  watch(
    () => hud.isPaused && screen.value !== 'settings',
    (isMuffled) => music.setMuffled(isMuffled),
  )

  // ---------------------------------------------------------------- Действия

  const isPlaying = () => game.isPlaying()

  /**
   * Сколько раз начинали партию заново. Выбор игрока (stores/selection.ts) следит за этим
   * числом и сам сбрасывается: игровой стор про выбор ничего не знает
   */
  const runCount = ref(0)

  /** Была ли уже партия: первая начинается в зале, который виден под меню */
  let hasPlayed = false

  function newGame() {
    // Каждая следующая партия — в новом случайном зале (не в том же, что сейчас)
    const nextLevel = forcedLevel ?? (hasPlayed ? randomLevel(game.level.def.id) : game.level.def)
    hasPlayed = true
    game.reset(nextLevel, Math.floor(Math.random() * 2 ** 32))
    hud.levelName = game.level.def.name
    runCount.value++
    forgetFinishedRun()
    isNewBest.value = false
    isPausedByGameMenu = false
    syncRewards()
    screen.value = null
    syncHud()
  }

  /** Построить стража; нехватка золота — отказ с тостом. true — построили */
  function tryBuild(towerId: string, col: number, row: number): boolean {
    const towerDef = TOWERS[towerId]
    if (state.gold < towerDef.cost) {
      rejectAction(`Не хватает золота: ${towerDef.name} стоит ${towerDef.cost}`)
      return false
    }
    return game.build(towerId, col, row) !== null
  }

  function startWave() {
    game.startWave()
  }

  function chooseReward(rewardId: RewardId): boolean {
    return game.chooseReward(rewardId)
  }

  function rerollRewards(): boolean {
    return game.rerollRewards()
  }

  function cycleSpeed() {
    // Скорость по кругу: 1 → 2 → 3 → 1
    game.setSpeed((state.speed % MAX_SPEED) + 1)
  }

  function togglePause() {
    game.setPaused(!state.isPaused)
  }

  function pauseIfFighting() {
    if (state.phase === 'wave') game.setPaused(true)
  }

  /** Меню посреди партии: бой останавливается до «Продолжить» */
  function openGameMenu() {
    if (!isPlaying() || screen.value !== null) return
    isPausedByGameMenu = state.phase === 'wave' && !state.isPaused
    pauseIfFighting()
    screen.value = 'menu'
  }

  function closeGameMenu() {
    if (screen.value !== 'menu' || !isPlaying()) return
    screen.value = null
    if (isPausedByGameMenu && state.phase === 'wave') game.setPaused(false)
    isPausedByGameMenu = false
  }

  function requestSurrender() {
    if (screen.value === 'menu' && isPlaying()) screen.value = 'surrender'
  }

  function cancelSurrender() {
    if (screen.value === 'surrender' && isPlaying()) screen.value = 'menu'
  }

  function surrender() {
    if (screen.value !== 'surrender') return
    isPausedByGameMenu = false
    game.surrender()
  }

  /** Изменить настройки звука (выключатели, громкость) — сразу слышно и сохраняется */
  function updateAudioSettings(changes: Partial<AudioSettings>) {
    audioEngine.update(changes)
    audioSettings.value = audioEngine.settings
  }

  /** Короткий звук — услышать, как звучат звуки на выбранной громкости */
  const previewSfx = () => sfx.build()

  /** Откуда открыли настройки — туда и вернёт «Готово» (посреди партии — обратно в игру) */
  let screenBeforeSettings: OverlayScreen = null
  /** Паузу поставили сами настройки — значит, и снимут её при закрытии */
  let isPausedBySettings = false

  function openSettings() {
    if (screen.value === 'settings') return
    // Настройки закрывают поле — бой не должен идти вслепую
    isPausedBySettings = state.phase === 'wave' && !state.isPaused
    pauseIfFighting()
    screenBeforeSettings = screen.value
    screen.value = 'settings'
  }

  function closeSettings() {
    if (screen.value !== 'settings') return
    screen.value = screenBeforeSettings
    // Закрыли настройки — бой идёт дальше сам (без этого казалось, что игра зависла).
    // Паузу, которую игрок поставил ещё до настроек, не трогаем
    if (isPausedBySettings && state.phase === 'wave') game.setPaused(false)
    isPausedBySettings = false
  }

  function continueEndless() {
    game.continueEndless()
    screen.value = null
  }

  return {
    game,
    hud,
    screen,
    rewards,
    blessingEffects,
    audioSettings,
    toast,
    bumpCounters,
    bestResult,
    isNewBest,
    playerName,
    submission,
    leaderboard,
    syncHud,
    runCount,
    isPlaying,
    newGame,
    tryBuild,
    rejectAction,
    startWave,
    chooseReward,
    rerollRewards,
    cycleSpeed,
    togglePause,
    pauseIfFighting,
    openGameMenu,
    closeGameMenu,
    requestSurrender,
    cancelSurrender,
    surrender,
    updateAudioSettings,
    previewSfx,
    openSettings,
    closeSettings,
    continueEndless,
    setPlayerName,
    changePlayerName,
    retrySubmission,
    openLeaderboard,
    closeLeaderboard,
  }
})
