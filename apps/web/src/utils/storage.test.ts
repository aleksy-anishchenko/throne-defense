import { describe, expect, it } from 'vitest'
import { parseBest } from './storage'

describe('рекорд из localStorage', () => {
  it('читает нормальный рекорд', () => {
    expect(parseBest('{"score":12345,"wave":14}')).toEqual({ score: 12345, wave: 14 })
  })

  it('лишние поля отбрасывает', () => {
    expect(parseBest('{"score":1,"wave":2,"x":3}')).toEqual({ score: 1, wave: 2 })
  })

  it('пусто — рекорда нет', () => {
    expect(parseBest(null)).toBeNull()
    expect(parseBest('')).toBeNull()
  })

  it('мусор не роняет игру, а считается «рекорда нет»', () => {
    for (const raw of [
      '123',
      '"x"',
      'null',
      'true',
      '[]',
      '{}',
      '{"score":"много","wave":3}',
      '{"score":5}',
      'не json',
      '{"score":1e999,"wave":1}',
    ]) {
      expect(parseBest(raw), raw).toBeNull()
    }
  })
})
