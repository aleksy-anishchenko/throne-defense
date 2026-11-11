// Мост между игрой и интерфейсом.
//
// Сама игра (враги, снаряды, башни) живёт в обычном объекте game — Vue за ним НЕ следит.
// Если положить её в ref/reactive, Vue обернёт каждого врага в Proxy и будет отслеживать
// каждое изменение x/y 60 раз в секунду — игра начнёт тормозить.
//
// Интерфейсу нужно немного: золото, жизни, номер волны… Эти числа каждый кадр копируются
// в реактивный объект hud (функция syncHud). Vue перерисует только то, что реально поменялось.

import {
  ENEMIES,
  LEVELS,
  MAX_SPEED,
  TOWERS,
  createGame,
  upgradeCost,
  type Phase,
  type Tower,
} from '@throne/game'
import { defineStore } from 'pinia'
import { computed, markRaw, nextTick, reactive, ref } from 'vue'
import { sfx } from '@/audio/sfx'
import type { BoardView, Cell, OverlayScreen } from '@/types'
import { plural } from '@/utils/format'
import { loadBest, saveBest, type BestResult } from '@/utils/storage'

/** Сколько миллисекунд висит всплывающее сообщение (тост) */
const TOAST_DURATION_MS = 1700

const isSameCell = (cell: Cell | null, col: number, row: number) =>
  cell !== null && cell.col === col && cell.row === row

export const useGameStore = defineStore('game', () => {
  // markRaw — «Vue, не трогай этот объект»
  const game = markRaw(createGame(LEVELS[0]))
  const state = game.state
  const { cols, rows } = game.level.def

  // ---------------------------------------------------------------- Снимок для интерфейса

  const hud = reactive({
    phase: state.phase as Phase,
    wave: state.wave,
    waveCount: game.level.waveCount,
    gold: state.gold,
    lives: state.lives,
    score: state.score,
    wavesCleared: state.wavesCleared,
    isPaused: state.isPaused,
    speed: state.speed,
    /** Врагов осталось в волне */
    enemiesLeft: 0,
    towerCount: 0,
    /** Тип и ступень улучшения выбранной башни (null — ничего не выбрано) */
    selectedTowerId: null as string | null,
    selectedTowerTier: 0,
  })

  /** Вызывается каждый кадр. Присваивание того же значения Vue не замечает — это дёшево */
  function syncHud() {
    hud.phase = state.phase
    hud.wave = state.wave
    hud.gold = state.gold
    hud.lives = state.lives
    hud.score = state.score
    hud.wavesCleared = state.wavesCleared
    hud.isPaused = state.isPaused
    hud.speed = state.speed
    hud.enemiesLeft = game.enemiesLeft()
    hud.towerCount = state.towers.length

    const tower = selectedTower()
    // Так задумано: если выбранной башни уже нет (её продали), выбор снимается сам
    if (selectedTowerCell.value && !tower) selectedTowerCell.value = null
    hud.selectedTowerId = tower ? tower.def.id : null
    hud.selectedTowerTier = tower ? tower.tier : 0
  }

  // ---------------------------------------------------------------- Выбор игрока

  // Какой экран показан поверх поля (меню, поражение, победа) или null
  const screen = ref<OverlayScreen>('menu')
  const armedTowerId = ref<string | null>(null)
  const selectedTowerCell = ref<Cell | null>(null)
  const selectedEmptyCell = ref<Cell | null>(null)
  const cursorCell = ref<Cell | null>(null)
  const hoverCell = ref<Cell | null>(null)

  const selectedTower = (): Tower | undefined =>
    selectedTowerCell.value
      ? game.towerAt(selectedTowerCell.value.col, selectedTowerCell.value.row)
      : undefined

  /** Для рисования поля */
  const boardView = (): BoardView => ({
    armedTowerId: armedTowerId.value,
    selectedTowerCell: selectedTowerCell.value,
    selectedEmptyCell: selectedEmptyCell.value,
    hoverCell: hoverCell.value,
    cursorCell: cursorCell.value,
  })

  // ---------------------------------------------------------------- Звук, тосты, рекорд

  const isMuted = ref(sfx.isMuted)
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

  // ---------------------------------------------------------------- Подписки на события игры

  game.on('build', () => sfx.build())
  game.on('upgrade', () => sfx.upgrade())
  game.on('sell', () => sfx.sell())
  game.on('waveStart', () => sfx.waveStart())
  game.on('kill', () => sfx.kill())
  game.on('leak', () => {
    sfx.leak()
    bumpCounters.lives++
  })
  game.on('waveCleared', () => {
    bumpCounters.gold++
  })
  game.on('victory', () => {
    saveResultIfBest()
    sfx.victory()
    screen.value = 'victory'
  })
  game.on('defeat', () => {
    saveResultIfBest()
    sfx.defeat()
    screen.value = 'defeat'
  })

  // ---------------------------------------------------------------- Действия

  const isPlaying = () => game.isPlaying()

  function clearSelection() {
    armedTowerId.value = null
    selectedTowerCell.value = null
    selectedEmptyCell.value = null
  }

  function newGame() {
    game.reset()
    clearSelection()
    isNewBest.value = false
    screen.value = null
    syncHud()
  }

  function tryBuild(towerId: string, col: number, row: number): boolean {
    const towerDef = TOWERS[towerId]
    if (state.gold < towerDef.cost) {
      rejectAction(`Не хватает золота: ${towerDef.name} стоит ${towerDef.cost}`)
      return false
    }
    return game.build(towerId, col, row) !== null
  }

  /** Нажали на карточку стража в магазине */
  function chooseShopTower(towerId: string) {
    if (!isPlaying()) return
    const emptyCell = selectedEmptyCell.value
    if (emptyCell && game.isCellFree(emptyCell.col, emptyCell.row)) {
      if (tryBuild(towerId, emptyCell.col, emptyCell.row)) selectedEmptyCell.value = null
      return
    }
    armedTowerId.value = armedTowerId.value === towerId ? null : towerId
    selectedTowerCell.value = null
  }

  /** Нажали на клетку поля */
  function tapCell(col: number, row: number) {
    if (!isPlaying() || !game.isInsideField(col, row)) return
    if (game.towerAt(col, row)) {
      selectedTowerCell.value = isSameCell(selectedTowerCell.value, col, row) ? null : { col, row }
      armedTowerId.value = null
      selectedEmptyCell.value = null
      return
    }
    selectedTowerCell.value = null
    if (!game.isCellFree(col, row)) {
      selectedEmptyCell.value = null
      return
    }
    if (armedTowerId.value) {
      tryBuild(armedTowerId.value, col, row)
      return
    }
    selectedEmptyCell.value = isSameCell(selectedEmptyCell.value, col, row) ? null : { col, row }
  }

  // Проверка «партия идёт» — как в chooseShopTower и tapCell: кнопки под экраном итогов
  // выключены (inert), но действие можно вызвать и не кнопкой
  function upgradeSelected() {
    const tower = selectedTower()
    if (!tower || !isPlaying()) return
    if (!game.upgrade(tower.col, tower.row) && upgradeCost(tower) !== null) {
      rejectAction('Не хватает золота на улучшение')
    }
  }

  function sellSelected() {
    const tower = selectedTower()
    if (!tower || !isPlaying()) return
    game.sell(tower.col, tower.row)
    selectedTowerCell.value = null
  }

  function moveCursor(deltaCol: number, deltaRow: number) {
    // Курсор ушёл с выбранной плиты — выбор снимаем: иначе цифра поставила бы стража
    // на старую плиту, а не туда, где курсор
    selectedEmptyCell.value = null
    const current = cursorCell.value ?? { col: Math.floor(cols / 2), row: Math.floor(rows / 2) }
    cursorCell.value = {
      col: Math.max(0, Math.min(cols - 1, current.col + deltaCol)),
      row: Math.max(0, Math.min(rows - 1, current.row + deltaRow)),
    }
  }

  function confirmCursor() {
    if (cursorCell.value) tapCell(cursorCell.value.col, cursorCell.value.row)
  }

  function startWave() {
    game.startWave()
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

  function toggleMute() {
    sfx.toggleMute()
    isMuted.value = sfx.isMuted
  }

  function continueEndless() {
    game.continueEndless()
    screen.value = null
  }

  // ---------------------------------------------------------------- Подсказка над магазином

  const describeTower = (towerId: string) =>
    `${TOWERS[towerId].name}: ${TOWERS[towerId].description}`

  /** Какие враги придут в волне waveNumber: «5 бунтовщиков, 2 разведчика» */
  function describeWave(waveNumber: number): string {
    const counts = new Map<string, number>()
    for (const [enemyId, count] of game.waveGroups(waveNumber)) {
      counts.set(enemyId, (counts.get(enemyId) ?? 0) + count)
    }
    return [...counts]
      .map(([enemyId, count]) => `${count} ${plural(count, ENEMIES[enemyId].nameForms)}`)
      .join(', ')
  }

  // Порядок проверок — это приоритет подсказок: выбранная башня важнее паузы,
  // пауза важнее выбора в магазине и так далее
  const hint = computed(() => {
    if (hud.selectedTowerId) return describeTower(hud.selectedTowerId)
    if (hud.isPaused) return 'Пауза. Стражу можно ставить и улучшать'
    if (armedTowerId.value) return describeTower(armedTowerId.value)
    if (selectedEmptyCell.value) return 'Выберите стража для этой плиты'
    if (hud.phase === 'wave') return `Врагов осталось: ${hud.enemiesLeft}`
    if (hud.phase === 'lost' || hud.phase === 'won') return ''
    if (hud.phase === 'build' && hud.wave === 1 && hud.towerCount === 0) {
      return 'Выберите стража и нажмите на плиту у ковра'
    }
    return `Дальше: ${describeWave(hud.wave)}`
  })

  return {
    game,
    hud,
    screen,
    armedTowerId,
    selectedTowerCell,
    selectedEmptyCell,
    cursorCell,
    hoverCell,
    isMuted,
    toast,
    bumpCounters,
    bestResult,
    isNewBest,
    hint,
    syncHud,
    boardView,
    isPlaying,
    newGame,
    chooseShopTower,
    tapCell,
    upgradeSelected,
    sellSelected,
    moveCursor,
    confirmCursor,
    startWave,
    cycleSpeed,
    togglePause,
    pauseIfFighting,
    toggleMute,
    continueEndless,
    clearSelection,
  }
})
