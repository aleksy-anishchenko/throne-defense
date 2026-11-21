// Фокус в меню телефона (ShopSheet, TowerSheet): меню объявлено модальным (aria-modal),
// поэтому Tab не должен уходить на кнопки и поле под ним, а после закрытия фокус возвращается
// на кнопку, которой меню открыли.
//
// Возвращаем фокус только если меню открыли с клавиатуры: после щелчка мышью фокус с кнопок
// намеренно снимается (useKeyboard.ts), иначе пробел нажимал бы кнопку вместо игры.

import { nextTick, onMounted, onUnmounted, watch, type Ref } from 'vue'

/** Удерживает клавиатурный фокус в открытом диалоге. */
export function keepDialogFocus(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== 'Tab' || event.defaultPrevented || !dialog) return
  const items = [
    ...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'),
  ].filter(
    (item) => item.tabIndex >= 0 && !item.matches(':disabled') && item.getClientRects().length > 0,
  )
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (!first || !last || !dialog.contains(active)) {
    event.preventDefault()
    const target = first ?? dialog
    target.focus()
  } else if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

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
    if (isOpen()) keepDialogFocus(event, dialog.value)
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
