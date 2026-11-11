// Мост между игрой и интерфейсом.
//
// Сама игра (враги, снаряды, башни) живёт в обычном объекте game — Vue за ним НЕ следит.
// Если положить её в ref/reactive, Vue обернёт каждого врага в Proxy и будет отслеживать
// каждое изменение x/y 60 раз в секунду — игра начнёт тормозить.
//
// Интерфейсу нужно немного: золото, жизни, номер волны… Эти числа каждый кадр копируются
// в реактивный объект hud (функция sync). Vue перерисует только то, что реально поменялось.

import {
  ENEMIES,
  LEVELS,
  TOWERS,
  createGame,
  upgradeCost,
  type Phase,
  type Tower,
} from '@throne/game'
import { defineStore } from 'pinia'
import { computed, markRaw, reactive, ref } from 'vue'
import { sfx } from '@/audio/sfx'
import type { BoardView, Cell } from '@/types'
import { plural } from '@/utils/format'
import { loadBest, saveBest, type Best } from '@/utils/storage'

/** Какой экран поверх поля: меню, поражение, победа или никакого */
export type Screen = 'menu' | 'defeat' | 'victory' | null

const sameCell = (a: Cell | null, c: number, r: number) => !!a && a.c === c && a.r === r

export const useGameStore = defineStore('game', () => {
  // markRaw — «Vue, не трогай этот объект»
  const game = markRaw(createGame(LEVELS[0]))
  const state = game.state
  const { cols, rows } = game.level.def

  // ---------------------------------------------------------------- Снимок для интерфейса

  const hud = reactive({
    phase: state.phase as Phase,
    wave: state.wave,
    maxWave: game.level.maxWave,
    gold: state.gold,
    lives: state.lives,
    score: state.score,
    cleared: state.cleared,
    paused: state.paused,
    speed: state.speed,
    /** Врагов осталось в волне */
    left: 0,
    towers: 0,
    /** Тип и уровень выбранной башни (null — ничего не выбрано) */
    selType: null as string | null,
    selLv: 0,
  })

  /** Вызывается каждый кадр. Присваивание того же значения Vue не замечает — это дёшево */
  function sync() {
    hud.phase = state.phase
    hud.wave = state.wave
    hud.gold = state.gold
    hud.lives = state.lives
    hud.score = state.score
    hud.cleared = state.cleared
    hud.paused = state.paused
    hud.speed = state.speed
    hud.left = game.enemiesLeft()
    hud.towers = state.towers.length

    const t = selectedTower()
    if (selected.value && !t) selected.value = null
    hud.selType = t ? t.def.id : null
    hud.selLv = t ? t.lv : 0
  }

  // ---------------------------------------------------------------- Выбор игрока

  const screen = ref<Screen>('menu')
  const armed = ref<string | null>(null)
  const selected = ref<Cell | null>(null)
  const tile = ref<Cell | null>(null)
  const cursor = ref<Cell | null>(null)
  const hover = ref<Cell | null>(null)

  const selectedTower = (): Tower | undefined =>
    selected.value ? game.towerAt(selected.value.c, selected.value.r) : undefined

  /** Для рисования поля */
  const view = (): BoardView => ({
    armed: armed.value,
    selected: selected.value,
    tile: tile.value,
    hover: hover.value,
    cursor: cursor.value,
  })

  // ---------------------------------------------------------------- Звук, тосты, рекорд

  const muted = ref(sfx.muted)
  const toast = reactive({ text: '', on: false })
  /** Счётчики «подпрыгиваний» жизней и золота в шапке */
  const bumps = reactive({ lives: 0, gold: 0 })
  const best = ref<Best | null>(loadBest())
  const newBest = ref(false)

  let toastTimer = 0
  function showToast(text: string) {
    toast.text = text
    toast.on = true
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => (toast.on = false), 1700)
  }

  function deny(text: string) {
    showToast(text)
    bumps.gold++
    sfx.deny()
  }

  function recordResult() {
    newBest.value = !best.value || state.score > best.value.score
    if (newBest.value) {
      best.value = { score: state.score, wave: state.cleared }
      saveBest(best.value)
    }
  }

  // ---------------------------------------------------------------- Подписки на события игры

  game.on('build', () => sfx.build())
  game.on('upgrade', () => sfx.upgrade())
  game.on('sell', () => sfx.sell())
  game.on('waveStart', () => sfx.wave())
  game.on('kill', () => sfx.kill())
  game.on('leak', () => {
    sfx.leak()
    bumps.lives++
  })
  game.on('waveCleared', () => bumps.gold++)
  game.on('victory', () => {
    recordResult()
    sfx.win()
    screen.value = 'victory'
  })
  game.on('defeat', () => {
    recordResult()
    sfx.lose()
    screen.value = 'defeat'
  })

  // ---------------------------------------------------------------- Действия

  const isPlaying = () => state.phase === 'build' || state.phase === 'wave'
  const inGrid = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < rows

  function clearSelection() {
    armed.value = null
    selected.value = null
    tile.value = null
  }

  function newGame() {
    game.reset()
    clearSelection()
    newBest.value = false
    screen.value = null
    sync()
  }

  function tryBuild(id: string, c: number, r: number): boolean {
    const def = TOWERS[id]
    if (state.gold < def.cost) {
      deny(`Не хватает золота: ${def.name} стоит ${def.cost}`)
      return false
    }
    return game.build(id, c, r) !== null
  }

  /** Нажали на карточку стража в магазине */
  function pickCard(id: string) {
    if (!isPlaying()) return
    const t = tile.value
    if (t && game.isFree(t.c, t.r)) {
      if (tryBuild(id, t.c, t.r)) tile.value = null
      return
    }
    armed.value = armed.value === id ? null : id
    selected.value = null
  }

  /** Нажали на клетку поля */
  function tapTile(c: number, r: number) {
    if (!isPlaying() || !inGrid(c, r)) return
    if (game.towerAt(c, r)) {
      selected.value = sameCell(selected.value, c, r) ? null : { c, r }
      armed.value = null
      tile.value = null
      return
    }
    selected.value = null
    if (!game.isFree(c, r)) {
      tile.value = null
      return
    }
    if (armed.value) {
      tryBuild(armed.value, c, r)
      return
    }
    tile.value = sameCell(tile.value, c, r) ? null : { c, r }
  }

  function upgradeSelected() {
    const t = selectedTower()
    if (!t) return
    if (!game.upgrade(t.c, t.r) && upgradeCost(t) !== null) deny('Не хватает золота на улучшение')
  }

  function sellSelected() {
    const t = selectedTower()
    if (!t) return
    game.sell(t.c, t.r)
    selected.value = null
  }

  function moveCursor(dc: number, dr: number) {
    const k = cursor.value ?? { c: Math.floor(cols / 2), r: Math.floor(rows / 2) }
    cursor.value = {
      c: Math.max(0, Math.min(cols - 1, k.c + dc)),
      r: Math.max(0, Math.min(rows - 1, k.r + dr)),
    }
  }

  function confirmCursor() {
    if (cursor.value) tapTile(cursor.value.c, cursor.value.r)
  }

  // ---------------------------------------------------------------- Подсказка над магазином

  const describe = (id: string) => `${TOWERS[id].name}: ${TOWERS[id].desc}`

  function previewText(n: number): string {
    const counts = new Map<string, number>()
    for (const [enemy, count] of game.waveGroups(n)) {
      counts.set(enemy, (counts.get(enemy) ?? 0) + count)
    }
    return [...counts]
      .map(([enemy, count]) => `${count} ${plural(count, ENEMIES[enemy].name)}`)
      .join(', ')
  }

  const hint = computed(() => {
    if (hud.selType) return describe(hud.selType)
    if (hud.paused) return 'Пауза. Стражу можно ставить и улучшать'
    if (armed.value) return describe(armed.value)
    if (tile.value) return 'Выберите стража для этой плиты'
    if (hud.phase === 'wave') return `Врагов осталось: ${hud.left}`
    if (hud.phase === 'over' || hud.phase === 'won') return ''
    if (hud.phase === 'build' && hud.wave === 1 && hud.towers === 0) {
      return 'Выберите стража и нажмите на плиту у ковра'
    }
    return `Дальше: ${previewText(hud.wave)}`
  })

  return {
    game,
    hud,
    screen,
    armed,
    selected,
    tile,
    cursor,
    hover,
    muted,
    toast,
    bumps,
    best,
    newBest,
    hint,
    sync,
    view,
    isPlaying,
    inGrid,
    newGame,
    pickCard,
    tapTile,
    upgradeSelected,
    sellSelected,
    moveCursor,
    confirmCursor,
    startWave: () => game.startWave(),
    cycleSpeed: () => game.setSpeed((state.speed % 3) + 1),
    togglePause: () => game.setPaused(!state.paused),
    pauseIfFighting: () => state.phase === 'wave' && game.setPaused(true),
    toggleSound() {
      sfx.toggle()
      muted.value = sfx.muted
    },
    continueEndless() {
      game.continueEndless()
      screen.value = null
    },
    escape: clearSelection,
  }
})
