import { describe, expect, it } from 'vitest'
import { hpMul } from '../src/index.ts'

describe('рост здоровья врагов', () => {
  it('на первой волне — как в описании врага', () => {
    expect(hpMul(1, 20)).toBe(1)
  })

  it('с каждой волной враги только крепче — при любой длине уровня', () => {
    for (const maxWave of [3, 5, 8, 10, 12, 20, 30]) {
      for (let w = 2; w <= maxWave + 15; w++) {
        expect(hpMul(w, maxWave), `уровень на ${maxWave} волн, волна ${w}`).toBeGreaterThan(
          hpMul(w - 1, maxWave),
        )
      }
    }
  })

  it('на «Тронном зале» (20 волн) числа не изменились', () => {
    const atKnee = 1.24 ** 9
    expect(hpMul(10, 20)).toBeCloseTo(atKnee)
    expect(hpMul(20, 20)).toBeCloseTo(atKnee + 2.2 * 10)
    expect(hpMul(21, 20)).toBeCloseTo((atKnee + 2.2 * 10) * 1.08)
    expect(hpMul(30, 20)).toBeCloseTo((atKnee + 2.2 * 10) * 1.08 ** 10)
  })
})
