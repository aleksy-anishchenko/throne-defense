// Архив положительного результата v18: прежний доход Казны, цены и сила атакующих башен.
// npm run test:balance:legacy — сравнение с текущими числами, не обещание победы на v37.
import { describe, expect, it } from 'vitest'
import { LEVELS } from '@throne/game'
import { compactHall } from '../../packages/game/src/levels/compact-halls.ts'
import { playBot, type Strategy } from './bot.ts'
import { prepare } from './final-defense.ts'

const strategy: Strategy = {
  name: 'Две Казны с подготовкой к боссу',
  opening: ['archer', 'archer', 'treasury', 'treasury', 'ballista'],
  loop: ['upgrade', 'treasury', 'ballista', 'upgrade', 'cannon', 'upgrade', 'frost', 'warlock'],
}

describe('архив v18: подтверждённые партии без подмены состояния', () => {
  for (const id of ['throne-hall', 'marble-hall', 'svetlitsa', 'pharaoh-hall', 'colonnade']) {
    it(`${id}: все 20 волн отбиты с подготовкой к боссу`, () => {
      const level = compactHall(LEVELS.find((candidate) => candidate.id === id)!)
      const result = playBot(level, strategy, Infinity, (game) => prepare(game, 'продажа Казён'))
      expect(result.outcome).toBe('won')
      expect(result.wavesCleared).toBe(20)
      expect(result.waves.at(-1)?.lives).toBeGreaterThan(0)
    })
  }
})
