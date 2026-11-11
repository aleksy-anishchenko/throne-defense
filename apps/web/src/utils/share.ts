import { fmt, plural } from './format'

/**
 * Поделиться результатом: системное меню «Поделиться» (телефоны),
 * иначе — скопировать в буфер, иначе — показать текст в окне.
 * Возвращает 'copied', если текст скопирован (чтобы показать подсказку).
 */
export async function shareResult(
  cleared: number,
  score: number,
): Promise<'shared' | 'copied' | 'shown'> {
  const url =
    location.origin && location.origin !== 'null' ? location.origin + location.pathname : ''
  const waves = plural(cleared, ['волну', 'волны', 'волн'])
  const text =
    `Мой трон выдержал ${cleared} ${waves} в «Защите трона», счёт ${fmt(score)}. Побьёшь? ${url}`.trim()

  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared'
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    window.prompt('Скопируйте результат и отправьте друзьям:', text)
    return 'shown'
  }
}
