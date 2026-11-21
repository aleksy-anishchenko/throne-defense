import { afterEach, expect, it, vi } from 'vitest'
import { browserPlayerToken } from './playerIdentity'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('зависшее открытие профиля возвращает управление и допускает повтор', async () => {
  vi.useFakeTimers()
  const open = vi.fn(() => ({}))
  vi.stubGlobal('indexedDB', { open })

  const first = browserPlayerToken()
  expect(browserPlayerToken()).toBe(first)
  await vi.advanceTimersByTimeAsync(3000)
  await expect(first).resolves.toBeNull()

  const retry = browserPlayerToken()
  expect(open).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(3000)
  await expect(retry).resolves.toBeNull()
})
