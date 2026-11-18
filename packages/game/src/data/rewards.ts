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
  /** Если задано, награда предлагается только после этих волн */
  availableWaves?: readonly number[]
}

export const REWARD_LIST: readonly RewardDef[] = [
  {
    id: 'war-chest',
    name: 'Военная казна',
    description: '+140 золота сразу',
    mark: '◇',
    effect: { kind: 'gold', amount: 140 },
  },
  {
    id: 'field-medic',
    name: 'Целебный обоз',
    description: 'Полностью восстанавливает жизни трона',
    mark: '✚',
    effect: { kind: 'healToFull' },
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
    description: '+15% к скорости стрельбы',
    mark: '»',
    effect: { kind: 'fireRate', amount: 0.15 },
  },
  {
    id: 'bounty',
    name: 'Щедрая награда',
    description: '+1 золото за каждого убитого врага',
    mark: '¤',
    effect: { kind: 'killGold', amount: 1 },
    availableWaves: [5, 10],
  },
  {
    id: 'royal-tax',
    name: 'Военный налог',
    description: '+20% золота за отбитую волну',
    mark: '%',
    effect: { kind: 'waveGold', amount: 0.2 },
    availableWaves: [5, 10],
  },
  {
    id: 'military-engineer',
    name: 'Военный инженер',
    description: 'Улучшения башен стоят на 30% меньше; аспекты не дешевеют',
    mark: '⌂',
    effect: { kind: 'upgradeDiscount', amount: 0.3 },
  },
  {
    id: 'wildfire',
    name: 'Дикий огонь',
    description: '+30% к урону Огневика горением',
    mark: '♨',
    effect: { kind: 'mageBurn', amount: 0.3 },
  },
  {
    id: 'control-master',
    name: 'Мастер контроля',
    description: 'Морозко: +10 п.п. замедления; Ловчий: +20% длительности сети',
    mark: '⊂',
    effect: { kind: 'control', slowBonus: 0.1, rootBonus: 0.2 },
  },
  {
    id: 'last-stand',
    name: 'Последний рубеж',
    description: 'Башни в верхних четырёх рядах наносят +20% урона',
    mark: '⌃',
    effect: { kind: 'lastStand', damageBonus: 0.2, rows: 4 },
  },
  {
    id: 'rasputitsa',
    name: 'Распутица',
    description: 'Все враги идут на 15% медленнее',
    mark: '≈',
    effect: { kind: 'enemySlow', amount: 0.15 },
  },
  {
    id: 'giant-diet',
    name: 'Разгрузочный день',
    description: 'Огры и Горынычи появляются с −15% здоровья',
    mark: '◡',
    effect: { kind: 'miniBossHp', amount: 0.15 },
  },
]

export const REWARDS = Object.fromEntries(
  REWARD_LIST.map((reward) => [reward.id, reward]),
) as Readonly<Record<RewardId, RewardDef>>
