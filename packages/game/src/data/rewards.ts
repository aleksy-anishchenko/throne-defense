import type { RewardId, RewardEffect } from '../types.ts'

/** Рубежи, цены первого обновления и выплаты «Военной казны». */
export const REWARD_CHECKPOINTS = [
  { wave: 5, rerollCost: 60, warChestGold: 140 },
  { wave: 10, rerollCost: 80, warChestGold: 200 },
  { wave: 15, rerollCost: 100, warChestGold: 280 },
  { wave: 20, rerollCost: 120, warChestGold: 360 },
  { wave: 25, rerollCost: 140, warChestGold: 460 },
  { wave: 29, rerollCost: 160, warChestGold: 560 },
] as const

export const REWARD_WAVES: readonly number[] = REWARD_CHECKPOINTS.map(({ wave }) => wave)

/** Отрезок кампании, в котором сейчас идёт борьба за благословение. */
export function rewardSegmentForWave(wave: number) {
  const index = REWARD_WAVES.findIndex((checkpoint) => checkpoint >= wave)
  const lastWave = REWARD_WAVES[index]
  if (wave < 1 || lastWave === undefined) return null
  return { firstWave: (REWARD_WAVES[index - 1] ?? 0) + 1, lastWave }
}

export const REWARD_RARITIES = {
  common: { label: 'Обычное', weight: 60 },
  rare: { label: 'Редкое', weight: 25 },
  legendary: { label: 'Легендарное', weight: 15 },
} as const

export type RewardRarity = keyof typeof REWARD_RARITIES

export const REWARD_SET_SIZE = 2

export const REWARD_SETS = {
  arsenal: {
    name: 'Гнев стражи',
    description: '+10% ко всему урону стражей',
    effect: { kind: 'damage', amount: 0.1 },
  },
  supplies: {
    name: 'Дар короны',
    description: 'Ещё одно благословение на выбор из двух обычных',
    effect: { kind: 'crown-gift' },
  },
  watch: {
    name: 'Тяжёлый марш',
    description: 'Все враги идут на 5% медленнее',
    effect: { kind: 'enemySlow', amount: 0.05 },
  },
} satisfies Record<
  string,
  { name: string; description: string; effect: RewardEffect | { kind: 'crown-gift' } }
>

export type RewardSetId = keyof typeof REWARD_SETS

export const PANIC_IN_FORMATION = { targets: 3, radius: 2, slow: 0.35, duration: 3 }
export const DOUBLE_SHOT_INTERVAL = 5
const SECOND_BELL_SHARE = 0.5

export function panicDescription(targets = PANIC_IN_FORMATION.targets): string {
  const { radius, slow, duration } = PANIC_IN_FORMATION
  return `Гибель врага замедляет до ${targets} соседей в радиусе ${radius} клеток на ${Math.round(slow * 100)}% (${duration} с)`
}

export function doubleShotDescription(extraArrows = 1): string {
  const arrows =
    extraArrows === 1 ? 'ещё одну стрелу' : `ещё ${extraArrows} стрел${extraArrows < 5 ? 'ы' : ''}`
  return `Каждый ${DOUBLE_SHOT_INTERVAL}-й выстрел Лучника выпускает ${arrows} с полным уроном в ту же цель`
}

export function twoBellsDescription(share = SECOND_BELL_SHARE): string {
  return `Стражи получают весь бонус сильнейшего Звонаря и ${Math.round(share * 100)}% бонуса второго по силе`
}

export interface RewardDef {
  id: RewardId
  name: string
  description: string
  rarity: RewardRarity
  setId: RewardSetId
  effect: RewardEffect
}

export const REWARD_LIST: readonly RewardDef[] = [
  {
    id: 'war-chest',
    name: 'Военная казна',
    description: 'Мгновенно пополняет запас золота',
    rarity: 'common',
    setId: 'supplies',
    effect: { kind: 'gold' },
  },
  {
    id: 'field-medic',
    name: 'Целебный обоз',
    description: 'Полностью восстанавливает жизни трона',
    rarity: 'common',
    setId: 'watch',
    effect: { kind: 'healToFull' },
  },
  {
    id: 'sharpened-steel',
    name: 'Заточенные клинки',
    description: '+18% ко всему урону стражей',
    rarity: 'legendary',
    setId: 'arsenal',
    effect: { kind: 'damage', amount: 0.18 },
  },
  {
    id: 'rapid-orders',
    name: 'Быстрые приказы',
    description: '+15% к скорости стрельбы',
    rarity: 'rare',
    setId: 'arsenal',
    effect: { kind: 'fireRate', amount: 0.15 },
  },
  {
    id: 'bounty',
    name: 'Щедрая награда',
    description: '+1 золото за каждого убитого врага',
    rarity: 'rare',
    setId: 'supplies',
    effect: { kind: 'killGold', amount: 1 },
  },
  {
    id: 'royal-tax',
    name: 'Военный налог',
    description: '+20% золота за отбитую волну',
    rarity: 'rare',
    setId: 'supplies',
    effect: { kind: 'waveGold', amount: 0.2 },
  },
  {
    id: 'military-engineer',
    name: 'Военный инженер',
    description: 'Скидка 30% на обычные улучшения башен',
    rarity: 'legendary',
    setId: 'supplies',
    effect: { kind: 'upgradeDiscount', amount: 0.3 },
  },
  {
    id: 'wildfire',
    name: 'Дикий огонь',
    description: '+30% к урону Огневика горением',
    rarity: 'common',
    setId: 'arsenal',
    effect: { kind: 'mageBurn', amount: 0.3 },
  },
  {
    id: 'control-master',
    name: 'Мастер контроля',
    description:
      'Морозко замедляет ещё на 10 процентных пунктов, сеть Ловчего длится на 20% дольше',
    rarity: 'rare',
    setId: 'watch',
    effect: { kind: 'control', slowBonus: 0.1, rootBonus: 0.2 },
  },
  {
    id: 'last-stand',
    name: 'Последний рубеж',
    description: 'Башни в верхних четырёх рядах наносят +20% урона',
    rarity: 'common',
    setId: 'arsenal',
    effect: { kind: 'lastStand', damageBonus: 0.2, rows: 4 },
  },
  {
    id: 'rasputitsa',
    name: 'Распутица',
    description: 'Все враги идут на 20% медленнее',
    rarity: 'legendary',
    setId: 'watch',
    effect: { kind: 'enemySlow', amount: 0.2 },
  },
  {
    id: 'giant-diet',
    name: 'Разгрузочный день',
    description: 'У боссов и полубоссов на 20% меньше здоровья',
    rarity: 'legendary',
    setId: 'watch',
    effect: { kind: 'giantHealth', amount: 0.2 },
  },
  {
    id: 'throne-moat',
    name: 'Ров у трона',
    description: 'На последней четверти пути враги идут на 12% медленнее',
    rarity: 'common',
    setId: 'watch',
    effect: { kind: 'moatSlow', amount: 0.12 },
  },
  {
    id: 'empty-vials',
    name: 'Пустые склянки',
    description: 'Знахари восстанавливают врагам на 50% меньше здоровья',
    rarity: 'common',
    setId: 'watch',
    effect: { kind: 'enemyHealing', amount: 0.5 },
  },
  {
    id: 'panic-in-formation',
    name: 'Паника в строю',
    description: panicDescription(),
    rarity: 'legendary',
    setId: 'watch',
    effect: { kind: 'panic' },
  },
  {
    id: 'double-shot',
    name: 'Двойной выстрел',
    description: doubleShotDescription(),
    rarity: 'common',
    setId: 'arsenal',
    effect: { kind: 'doubleShot' },
  },
  {
    id: 'two-bells',
    name: 'Два колокола',
    description: twoBellsDescription(),
    rarity: 'rare',
    setId: 'supplies',
    effect: { kind: 'twoBells', amount: SECOND_BELL_SHARE },
  },
  {
    id: 'ice-and-fire',
    name: 'Лёд и пламя',
    description: 'Горение Огневика и замедление Морозко действуют на врага одновременно',
    rarity: 'rare',
    setId: 'watch',
    effect: { kind: 'iceAndFire' },
  },
]

export const REWARDS = Object.fromEntries(
  REWARD_LIST.map((reward) => [reward.id, reward]),
) as Readonly<Record<RewardId, RewardDef>>
