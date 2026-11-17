// Фиксированные планы v18: до снижения дохода Казны и удорожания атакующих башен.
// Пороги сохранены для диагностики: npm run test:balance:legacy.
import { describe, expect, it } from 'vitest'
import { PLAYABLE_LEVELS } from '@throne/game'
import { STRATEGIES, playBot, type Strategy } from './bot.ts'

const economy: Strategy = {
  name: 'Две Казны',
  opening: ['archer', 'archer', 'treasury', 'treasury', 'ballista'],
  loop: ['upgrade', 'treasury', 'ballista', 'upgrade', 'cannon', 'upgrade', 'frost', 'warlock'],
}
const anubis: Strategy = {
  name: 'Храм Анубиса',
  opening: ['archer', 'archer', 'treasury', 'ballista', 'frost'],
  loop: ['upgrade', 'ballista', 'upgrade', 'cannon', 'upgrade', 'trapper', 'warlock', 'bell'],
}

describe('архив v18: смешанные стратегии на компактных картах', () => {
  for (const level of PLAYABLE_LEVELS) {
    it(`${level.name}: выбранная смесь отбивает 18 волн и опережает моностратегии`, () => {
      const result = playBot(level, level.id === 'anubis-temple' ? anubis : economy)
      expect(result.outcome).not.toBe('stuck')
      expect(result.wavesCleared).toBeGreaterThanOrEqual(18)
      for (const mono of STRATEGIES.filter((candidate) => candidate.name.startsWith('Только '))) {
        const compared = playBot(level, mono)
        expect(compared.outcome, mono.name).not.toBe('stuck')
        expect(result.wavesCleared - compared.wavesCleared, mono.name).toBeGreaterThanOrEqual(2)
      }
    })
  }
})
