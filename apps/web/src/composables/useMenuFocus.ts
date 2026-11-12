// Фокус в меню телефона (ShopSheet, TowerSheet): меню объявлено модальным (aria-modal),
// поэтому Tab не должен уходить на кнопки и поле под ним, а после закрытия фокус возвращается
// на кнопку, которой меню открыли.
//
// Возвращаем фокус только если меню открыли с клавиатуры: после щелчка мышью фокус с кнопок
// намеренно снимается (useKeyboard.ts), иначе пробел нажимал бы кнопку вместо игры.

import { nextTick, onMounted, onUnmounted, watch, type Ref } from 'vue'

export function useMenuFocus(isOpen: () => boolean, dialog: Readonly<Ref<HTMLElement | null>>) {
  let opener: HTMLElement | null = null
  let isLastInputPointer = false

  watch(isOpen, async (open) => {
    if (open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      dialog.value?.focus()
      return
    }
    const target = opener && document.contains(opener) ? opener : null
    opener = null
    if (!isLastInputPointer) target?.focus()
  })

  function onKeyDown(event: KeyboardEvent) {
    isLastInputPointer = false
    if (event.key !== 'Tab' || !isOpen() || !dialog.value) return
    const root = dialog.value
    const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled])')]
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) {
      event.preventDefault()
      root.focus()
      return
    }
    const active = document.activeElement
    if (!root.contains(active)) {
      event.preventDefault()
      first.focus()
    } else if (event.shiftKey && (active === first || active === root)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }
  const onPointerDown = () => {
    isLastInputPointer = true
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
  })
  onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('pointerdown', onPointerDown, true)
  })
}
