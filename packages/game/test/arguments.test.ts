import { describe, expect, it } from 'vitest'
import { newGame } from './helpers.ts'

// Скоро партии будет перепроверять сервер, а он получает аргументы от чужих браузеров.
// Поэтому публичные методы игры не должны верить ничему.

describe('игра не верит аргументам', () => {
  it('дробная клетка — не клетка: на ковёр так не построить', () => {
    const game = newGame()
    // (4, 10) — ковёр. Ключ "4.5,10.5" не совпадал с закрытой клеткой "4,10"
    expect(game.isCellFree(4, 10)).toBe(false)
    expect(game.build('archer', 4.5, 10.5)).toBeNull()
    expect(game.isInsideField(4.5, 10.5)).toBe(false)
    expect(game.state.towers).toHaveLength(0)
    expect(game.state.gold).toBe(150)
  })

  it('NaN и бесконечность вместо клетки ничего не строят', () => {
    const game = newGame()
    expect(game.build('archer', NaN, 11)).toBeNull()
    expect(game.build('archer', 5, Infinity)).toBeNull()
    expect(game.state.gold).toBe(150)
  })

  it('id из прототипа объекта (constructor, toString) — не башня', () => {
    const game = newGame()
    for (const towerId of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(game.build(towerId, 5, 11), towerId).toBeNull()
    }
    expect(game.state.gold).toBe(150)
    expect(game.state.towers).toHaveLength(0)
  })

  it("id башни — только строка: массив ['archer'] не башня", () => {
    const game = newGame()
    // Массив в типах не пройдёт, но сервер получит его от чужого браузера как угодно
    expect(game.build(['archer'] as unknown as string, 5, 11)).toBeNull()
    expect(game.state.towers).toHaveLength(0)
  })

  it("клетка строкой ('5') не находит башню на 5: улучшить и продать её так нельзя", () => {
    const game = newGame()
    game.build('archer', 5, 11)
    const col = '5' as unknown as number
    const row = '11' as unknown as number
    expect(game.towerAt(col, row)).toBeUndefined()
    expect(game.upgrade(col, row)).toBe(false)
    expect(game.sell(col, row)).toBeNull()
    expect(game.state.towers).toHaveLength(1)
  })

  it('step(NaN) и отрицательный шаг не ломают волну', () => {
    const game = newGame()
    game.build('archer', 5, 11)
    game.startWave()
    game.step(NaN)
    game.step(-5)
    expect(game.state.time).toBe(0)
    game.step(1 / 60)
    expect(game.state.time).toBeGreaterThan(0)
  })

  it('setSpeed(NaN) и setSpeed(Infinity) не меняют скорость', () => {
    const game = newGame()
    game.setSpeed(2)
    game.setSpeed(NaN)
    game.setSpeed(Infinity)
    expect(game.state.speed).toBe(2)
    game.advance(0.1)
    expect(game.state.time).toBeGreaterThan(0)
  })

  it('advance(NaN) и отрицательное время не замораживают партию', () => {
    const game = newGame()
    game.advance(NaN)
    game.advance(-5)
    game.advance(Infinity)
    expect(game.state.time).toBe(0)
    game.advance(0.1)
    expect(Math.round(game.state.time * 60)).toBe(6)
  })

  it('один огромный advance делает не больше 60 шагов', () => {
    const game = newGame()
    game.advance(1_000_000)
    // 59 или 60: после 60 вычитаний 1/60 из 1 остаётся чуть меньше шага (дробная погрешность,
    // её уберёт целый номер шага tick на этапе 5). Важно, что не миллионы
    const steps = Math.round(game.state.time * 60)
    expect(steps).toBeGreaterThanOrEqual(59)
    expect(steps).toBeLessThanOrEqual(60)
  })
})
