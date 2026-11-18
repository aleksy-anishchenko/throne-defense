import type { RewardId, RewardEffect } from '../types.ts'

/** Волны, после которых игрок выбирает благословение */
export const REWARD_WAVES = [5, 10, 15, 19] as const

export interface RewardDef {
  id: RewardId
  name: string
  description: string
  /** Короткий знак для карточки: не зависит от эмодзи-шрифта */
  mark: string
  effect: RewardEffect
}

export const REWARD_LIST: readonly RewardDef[] = [
  {
    id: 'war-chest',
    name: 'Военная казна',
    description: '+120 золота сразу',
    mark: '◇',
    effect: { kind: 'gold', amount: 120 },
  },
  {
    id: 'field-medic',
    name: 'Целебный обоз',
    description: '+2 жизни трона',
    mark: '✚',
    effect: { kind: 'lives', amount: 2 },
  },
  {
    id: 'sharpened-steel',
    name: 'Заточенные клинки',
    description: '+12% ко всему урону стражей',
    mark: '╱',
    effect: { kind: 'damage', amount: 0.12 },
  },
  {
    id: 'rapid-orders',
    name: 'Быстрые приказы',
    description: '+10% к скорости стрельбы',
    mark: '»',
    effect: { kind: 'fireRate', amount: 0.1 },
  },
  {
    id: 'bounty',
    name: 'Щедрая награда',
    description: '+1 золото за каждого убитого врага',
    mark: '¤',
    effect: { kind: 'killGold', amount: 1 },
  },
  {
    id: 'royal-tax',
    name: 'Военный налог',
    description: '+15% золота за отбитую волну',
    mark: '%',
    effect: { kind: 'waveGold', amount: 0.15 },
  },
]

export const REWARDS = Object.fromEntries(
  REWARD_LIST.map((reward) => [reward.id, reward]),
) as Readonly<Record<RewardId, RewardDef>>
