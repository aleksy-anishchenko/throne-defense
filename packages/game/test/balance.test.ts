import { describe, expect, it } from 'vitest'
import { hpMultiplier } from '../src/index.ts'

describe('рост здоровья врагов', () => {
  it('на первой волне — как в описании врага', () => {
    expect(hpMultiplier(1, 20)).toBe(1)
  })

  it('с каждой волной враги только крепче — при любой длине уровня', () => {
    for (const waveCount of [3, 5, 8, 10, 12, 20, 30]) {
      for (let waveNumber = 2; waveNumber <= waveCount + 15; waveNumber++) {
        expect(
          hpMultiplier(waveNumber, waveCount),
          `уровень на ${waveCount} волн, волна ${waveNumber}`,
        ).toBeGreaterThan(hpMultiplier(waveNumber - 1, waveCount))
      }
    }
  })

  it('до 30-й волны рост после колена линейный, затем здоровье растёт на 8% за волну', () => {
    const atKnee = 1.24 ** 9
    expect(hpMultiplier(10, 30)).toBeCloseTo(atKnee)
    expect(hpMultiplier(20, 30)).toBeCloseTo(atKnee + 2.2 * 10)
    expect(hpMultiplier(30, 30)).toBeCloseTo(atKnee + 2.2 * 20)
    expect(hpMultiplier(31, 30)).toBeCloseTo((atKnee + 2.2 * 20) * 1.08)
  })
})
