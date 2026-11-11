import { formatNumber, plural } from './format'

/**
 * Поделиться результатом: системное меню «Поделиться» (телефоны),
 * иначе — скопировать в буфер, иначе — показать текст в окне.
 * Возвращает 'copied', если текст скопирован (чтобы показать подсказку).
 */
export async function shareResult(
  wavesCleared: number,
  score: number,
): Promise<'shared' | 'copied' | 'shown'> {
  // Если игру открыли как файл (file://), origin равен строке 'null': ссылку в текст тогда не вставляем
  const pageUrl =
    location.origin && location.origin !== 'null' ? location.origin + location.pathname : ''
  const wavesWord = plural(wavesCleared, ['волну', 'волны', 'волн'])
  const text =
    `Мой трон выдержал ${wavesCleared} ${wavesWord} в «Защите трона», счёт ${formatNumber(score)}. Побьёшь? ${pageUrl}`.trim()

  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (error) {
      // Игрок сам закрыл окно «Поделиться»: это не ошибка, запасной вариант (буфер обмена) не нужен,
      // поэтому тоже возвращаем 'shared'
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
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
