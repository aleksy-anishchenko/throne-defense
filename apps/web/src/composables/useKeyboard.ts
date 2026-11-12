// Управление с клавиатуры: 1–9 выбирают стража, пробел — волна/пауза,
// стрелки двигают курсор по полю, Enter ставит стража, Esc снимает выбор,
// T меняет, кого бьёт выбранная башня. На экранах «Лучшие результаты» и «Настройки» Esc — «Назад».

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

    // Цифры 1–9, см. MAX_HOTKEY_DIGIT
    if (/^[1-9]$/.test(event.key)) {
      const towerDef = TOWER_LIST[Number(event.key) - 1]
      if (towerDef) store.chooseShopTower(towerDef.id)
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
