// Игровой цикл: каждый кадр 1) игра делает шаги симуляции, 2) поле перерисовывается,
// 3) интерфейс получает свежие числа. Плюс подгонка поля под размер области.

import { onMounted, onUnmounted, type ShallowRef } from 'vue'
import { createRenderer, type Renderer } from '@/render/renderer'
import { useGameStore } from '@/stores/game'

/** Самый длинный кадр для симуляции, в секундах */
const MAX_FRAME_DT = 0.1
/** Миллисекунд в секунде (браузер даёт время кадра в мс) */
const MS_PER_SECOND = 1000

/**
 * Запустить цикл, когда компонент появится на странице, и остановить, когда исчезнет.
 * stageElement — область, в которую вписывается поле; boardCanvas — сам canvas
 */
export function useGameLoop(
  stageElement: Readonly<ShallowRef<HTMLElement | null>>,
  boardCanvas: Readonly<ShallowRef<HTMLCanvasElement | null>>,
): void {
  const store = useGameStore()

  let renderer: Renderer | null = null
  let resizeObserver: ResizeObserver | null = null
  let pixelRatioQuery: MediaQueryList | null = null
  let animationFrameId = 0
  let lastTimestamp = 0

  function runFrame(timestamp: number) {
    // Следующий кадр просим первым делом: если в этом кадре случится ошибка,
    // игра не остановится навсегда — следующий кадр всё равно придёт
    animationFrameId = requestAnimationFrame(runFrame)
    // Если вкладка была скрыта, не пытаемся «догнать» минуты — максимум MAX_FRAME_DT (0,1 с) за кадр
    // `|| 0` — страховка: если получилось «не число» (NaN), считаем, что времени не прошло
    const realDt = Math.min(MAX_FRAME_DT, (timestamp - lastTimestamp) / MS_PER_SECOND || 0)
    lastTimestamp = timestamp
    store.game.advance(realDt)
    renderer?.draw(realDt, store.boardView())
    store.syncHud()
  }

  function fitBoard() {
    const bounds = stageElement.value!.getBoundingClientRect()
    renderer?.resize(bounds.width, bounds.height)
  }

  /**
   * Окно перетащили на другой монитор или поменяли масштаб в настройках системы:
   * размер области прежний, а пикселей в CSS-пикселе стало больше или меньше.
   * ResizeObserver этого не замечает, поэтому следим за devicePixelRatio сами.
   * Запрос «ровно такой масштаб» срабатывает один раз — после него заводим новый
   */
  function watchPixelRatio() {
    pixelRatioQuery?.removeEventListener('change', onPixelRatioChange)
    pixelRatioQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    pixelRatioQuery.addEventListener('change', onPixelRatioChange)
  }

  function onPixelRatioChange() {
    fitBoard()
    watchPixelRatio()
  }

  onMounted(() => {
    renderer = createRenderer(boardCanvas.value!, store.game)
    resizeObserver = new ResizeObserver(fitBoard)
    resizeObserver.observe(stageElement.value!)
    watchPixelRatio()
    animationFrameId = requestAnimationFrame(runFrame)
  })

  onUnmounted(() => {
    cancelAnimationFrame(animationFrameId)
    resizeObserver?.disconnect()
    pixelRatioQuery?.removeEventListener('change', onPixelRatioChange)
    renderer?.dispose()
  })
}
