import { describe, expect, it } from 'vitest'
import { TOWER_LIST, displayStatValue } from '../src/index.ts'

// Целостность данных: опечатка в башне или волне должна ронять тест, а не игру посреди партии

describe('данные башен', () => {
  for (const def of TOWER_LIST) {
    it(`${def.name}: цен улучшений на одну меньше, чем ступеней`, () => {
      expect(def.tiers.length).toBe(def.upgradeCosts.length + 1)
    })

    it(`${def.name}: у каждой показываемой характеристики есть значение на каждой ступени`, () => {
      for (const [tier, stats] of def.tiers.entries()) {
        for (const statKey of def.displayStats) {
          expect(
            Number.isFinite(displayStatValue(stats, statKey)),
            `${statKey}, ступень ${tier}`,
          ).toBe(true)
        }
      }
    })

    it(`${def.name}: цены — целые положительные числа`, () => {
      expect(Number.isInteger(def.cost)).toBe(true)
      expect(def.carpetFortification ? def.cost === 0 : def.cost > 0).toBe(true)
      for (const cost of def.upgradeCosts) {
        expect(Number.isInteger(cost) && cost > 0, String(cost)).toBe(true)
      }
    })
  }
})

// Что все враги из волн существуют (и в бесконечном режиме), проверяет сам createLevel —
// см. «все уровни игры проходят проверку» в level.test.ts
