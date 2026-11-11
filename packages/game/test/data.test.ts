import { describe, expect, it } from 'vitest'
import { TOWER_LIST } from '../src/index.ts'

// Целостность данных: опечатка в башне или волне должна ронять тест, а не игру посреди партии

describe('данные башен', () => {
  for (const def of TOWER_LIST) {
    it(`${def.name}: цен улучшений на одну меньше, чем ступеней`, () => {
      expect(def.tiers.length).toBe(def.upgradeCosts.length + 1)
    })

    it(`${def.name}: у каждой показываемой характеристики есть значение на каждой ступени`, () => {
      for (const [tier, stats] of def.tiers.entries()) {
        for (const statKey of def.displayStats) {
          expect(Number.isFinite(stats[statKey]), `${statKey}, ступень ${tier}`).toBe(true)
        }
      }
    })

    it(`${def.name}: цены — целые положительные числа`, () => {
      for (const cost of [def.cost, ...def.upgradeCosts]) {
        expect(Number.isInteger(cost) && cost > 0, String(cost)).toBe(true)
      }
    })
  }
})

// Что все враги из волн существуют (и в бесконечном режиме), проверяет сам createLevel —
// см. «все уровни игры проходят проверку» в level.test.ts
