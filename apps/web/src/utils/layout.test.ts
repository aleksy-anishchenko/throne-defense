/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SIDE_PANEL_QUERY } from './layout'

// Условие «есть боковая панель» живёт и в CSS, и в JS. Этот тест не даёт им разойтись:
// иначе меню телефона остались бы открытыми под скрытой раскладкой и блокировали клавиши.
describe('SIDE_PANEL_QUERY', () => {
  it('совпадает с первым media-запросом в responsive.css', () => {
    const css = readFileSync(new URL('../styles/responsive.css', import.meta.url), 'utf8')
    const firstQuery = /@media\s+([^{]+)\{/.exec(css)?.[1]?.replace(/\s+/g, ' ').trim()
    expect(firstQuery).toBe(SIDE_PANEL_QUERY)
  })
})
