// Управление с клавиатуры: 1–9 выбирают стража, пробел — волна/пауза,
// стрелки двигают курсор по полю, Enter ставит стража, Esc снимает выбор,
// T меняет, кого бьёт выбранная башня. На экране «Лучшие» Esc — «Назад».

import { TOWER_LIST } from '@throne/game'
import { onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/game'

/** Самая большая цифра-горячая клавиша: клавиши 1–9 выбирают стража */
export const MAX_HOTKEY_DIGIT = 9

/** Куда сдвигается курсор от каждой стрелки: на сколько столбцов и строк */
const ARROW_DIRECTIONS: Record<string, { deltaCol: number; deltaRow: number }> = {
  ArrowLeft: { deltaCol: -1, deltaRow: 0 },
  ArrowRight: { deltaCol: 1, deltaRow: 0 },
  ArrowUp: { deltaCol: 0, deltaRow: -1 },
  ArrowDown: { deltaCol: 0, deltaRow: 1 },
}

export function useKeyboard(): void {
  const store = useGameStore()

  function onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    // Игрок печатает имя для таблицы лучших: буквы, цифры и пробел — в поле, а не в игру
    if (event.target instanceof HTMLInputElement) return
    // Зажатая клавиша шлёт повторы. Курсор стрелками удобно водить с удержанием,
    // а остальное — нет: зажатый пробел сначала начал бы волну, потом дёргал паузу
    if (event.repeat && !ARROW_DIRECTIONS[event.key]) return
    // На кнопке пробел и Enter должны нажимать саму кнопку
    const isButtonFocused = event.target instanceof HTMLButtonElement

    // Цифры 1–9, см. MAX_HOTKEY_DIGIT
    if (/^[1-9]$/.test(event.key)) {
      const towerDef = TOWER_LIST[Number(event.key) - 1]
      if (towerDef) store.chooseShopTower(towerDef.id)
      return
    }
    if (event.key === 'Escape') {
      if (store.screen === 'leaderboard') store.closeLeaderboard()
      store.clearSelection()
      return
    }
    if (!store.isPlaying()) return

    if ((event.key === ' ' || event.code === 'Space') && !isButtonFocused) {
      event.preventDefault()
      if (store.game.state.phase === 'build') store.startWave()
      else store.togglePause()
      return
    }
    // По положению клавиши (event.code), а не по букве: на русской раскладке там «Е»
    if (event.code === 'KeyT') {
      store.cycleTargetMode()
      return
    }
    const direction = ARROW_DIRECTIONS[event.key]
    if (direction) {
      event.preventDefault()
      store.moveCursor(direction.deltaCol, direction.deltaRow)
      return
    }
    if (event.key === 'Enter' && store.cursorCell && !isButtonFocused) {
      event.preventDefault()
      store.confirmCursor()
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeyDown))
  onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
}
