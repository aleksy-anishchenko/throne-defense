// Управление с клавиатуры: 1–9 выбирают стража, пробел — волна/пауза,
// стрелки двигают курсор по полю, Enter ставит стража, Esc снимает выбор.

import { TOWER_LIST } from '@throne/game'
import { onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/game'

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function useKeyboard(): void {
  const store = useGameStore()

  function onKey(ev: KeyboardEvent) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return
    // Зажатая клавиша шлёт повторы. Курсор стрелками удобно водить с удержанием,
    // а остальное — нет: зажатый пробел сначала начал бы волну, потом дёргал паузу
    if (ev.repeat && !ARROWS[ev.key]) return
    // На кнопке пробел и Enter должны нажимать саму кнопку
    const onButton = ev.target instanceof HTMLButtonElement

    if (/^[1-9]$/.test(ev.key)) {
      const def = TOWER_LIST[Number(ev.key) - 1]
      if (def) store.pickCard(def.id)
      return
    }
    if (ev.key === 'Escape') {
      store.escape()
      return
    }
    if (!store.isPlaying()) return

    if ((ev.key === ' ' || ev.code === 'Space') && !onButton) {
      ev.preventDefault()
      if (store.game.state.phase === 'build') store.startWave()
      else store.togglePause()
      return
    }
    const move = ARROWS[ev.key]
    if (move) {
      ev.preventDefault()
      store.moveCursor(move[0], move[1])
      return
    }
    if (ev.key === 'Enter' && store.cursor && !onButton) {
      ev.preventDefault()
      store.confirmCursor()
    }
  }

  onMounted(() => document.addEventListener('keydown', onKey))
  onUnmounted(() => document.removeEventListener('keydown', onKey))
}
