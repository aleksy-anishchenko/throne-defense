// Управление с клавиатуры: 1–9 выбирают стража, пробел — волна/пауза,
// стрелки двигают курсор по полю, Enter ставит стража (Shift — и оставляет его «в руке»),
// Esc снимает выбор,
// T меняет, кого бьёт выбранная башня. На экранах «Лучшие результаты» и «Настройки» Esc — «Назад».

import { TOWER_LIST } from '@throne/game'
import { onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'

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
  const selection = useSelectionStore()

  function onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    // Игрок печатает имя для таблицы лучших или двигает ползунок громкости: клавиши — полю,
    // а не игре. Кроме Escape: он закрывает экран, где бы ни стоял фокус
    if (event.target instanceof HTMLInputElement && event.key !== 'Escape') return
    // Зажатая клавиша шлёт повторы. Курсор стрелками удобно водить с удержанием,
    // а остальное — нет: зажатый пробел сначала начал бы волну, потом дёргал паузу
    if (event.repeat && !ARROW_DIRECTIONS[event.key]) return
    // На кнопке пробел и Enter должны нажимать саму кнопку (фокус на кнопке бывает только
    // с клавиатуры — после щелчка мышью его снимает onClick ниже)
    const isButtonFocused = event.target instanceof HTMLButtonElement
    // Открыты настройки посреди партии: клавиши не должны управлять игрой под ними
    if (store.screen === 'settings' && event.key !== 'Escape') return

    // Цифры 1–9, см. MAX_HOTKEY_DIGIT. По положению клавиши (event.code), а не по символу:
    // с зажатым Shift (режим «ставить подряд») клавиша «2» даёт «@», а не «2»
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1] ?? null
    if (digit) {
      const towerDef = TOWER_LIST[Number(digit) - 1]
      if (towerDef) selection.chooseShopTower(towerDef.id)
      return
    }
    if (event.key === 'Escape') {
      // Escape закрывает экран поверх поля — и только: выбранная башня остаётся выбранной
      if (store.screen === 'leaderboard') {
        store.closeLeaderboard()
        return
      }
      if (store.screen === 'settings') {
        store.closeSettings()
        return
      }
      // Открыто меню (стражей или башни) — Escape закрывает только его, выбор остаётся
      if (selection.openMenu) {
        selection.closeMenu()
        return
      }
      selection.clearSelection()
      return
    }
    // Меню закрывает поле: пробел и стрелки под ним ничего не делают
    if (selection.openMenu) return
    if (!store.isPlaying()) return

    if ((event.key === ' ' || event.code === 'Space') && !isButtonFocused) {
      event.preventDefault()
      if (store.game.state.phase === 'build') store.startWave()
      else store.togglePause()
      return
    }
    // По положению клавиши (event.code), а не по букве: на русской раскладке там «Е»
    if (event.code === 'KeyT') {
      selection.cycleTargetMode()
      return
    }
    const direction = ARROW_DIRECTIONS[event.key]
    if (direction) {
      event.preventDefault()
      selection.moveCursor(direction.deltaCol, direction.deltaRow)
      return
    }
    if (event.key === 'Enter' && selection.cursorCell && !isButtonFocused) {
      event.preventDefault()
      // Shift — оставить стража «в руке» и ставить подряд
      selection.confirmCursor(event.shiftKey)
    }
  }

  /**
   * Щёлкнули по кнопке мышью или пальцем — снимаем с неё фокус. Иначе фокус остаётся на
   * кнопке, и пробел нажимает её, а не игру: щёлкнул «Лучника», нажал пробел — и вместо
   * волны карточка отжалась. Нажатие с клавиатуры (Enter, пробел) — это click с detail 0:
   * тогда фокус оставляем, чтобы можно было идти дальше клавишей Tab
   */
  function onClick(event: MouseEvent) {
    if (event.detail === 0) return
    const button = event.target instanceof Element ? event.target.closest('button') : null
    if (button && button === document.activeElement) button.blur()
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick)
  })
  onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('click', onClick)
  })
}
