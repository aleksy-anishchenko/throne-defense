// Башни (стража). Чтобы добавить новую:
// 1) опиши её здесь и добавь в TOWER_LIST;
// 2) нарисуй в apps/web/src/render/towers.ts (без рисунка будет простой кружок).

import { frostPulse, shootHoming, shootLine } from '../systems/combat.ts'
import type { TowerDef } from '../types.ts'

/** Болт баллисты летит дальше её радиуса обстрела: дальность полёта = range × 1.15 (множитель) */
const BALLISTA_REACH_FACTOR = 1.15

const archer: TowerDef = {
  id: 'archer',
  name: 'Лучник',
  description: 'быстрые стрелы, слаб против лат',
  cost: 50,
  upgradeCosts: [45, 85],
  tiers: [
    { damage: 9, cooldown: 0.55, range: 2.3 },
    { damage: 15, cooldown: 0.5, range: 2.5 },
    { damage: 24, cooldown: 0.42, range: 2.8 },
  ],
  displayStats: ['damage', 'range'],
  fire: (world, tower, target, stats) =>
    shootHoming(world, tower, target, {
      look: 'arrow',
      speed: 11,
      damage: stats.damage,
      damageKind: 'physical',
    }),
}

const mage: TowerDef = {
  id: 'mage',
  name: 'Огневик',
  description: 'взрыв по площади, прожигает латы',
  cost: 90,
  upgradeCosts: [80, 130],
  tiers: [
    { damage: 16, cooldown: 1.2, range: 2.2, splashRadius: 0.9 },
    { damage: 27, cooldown: 1.1, range: 2.4, splashRadius: 1 },
    { damage: 44, cooldown: 1, range: 2.6, splashRadius: 1.15 },
  ],
  displayStats: ['damage', 'range'],
  fire: (world, tower, target, stats) =>
    shootHoming(world, tower, target, {
      look: 'orb',
      speed: 6.5,
      damage: stats.damage,
      damageKind: 'magic',
      splashRadius: stats.splashRadius,
    }),
}

const frost: TowerDef = {
  id: 'frost',
  name: 'Морозко',
  description: 'замедляет всех вокруг, сам почти не ранит',
  cost: 70,
  upgradeCosts: [60, 100],
  tiers: [
    { damage: 3, cooldown: 1.1, range: 1.7, slowAmount: 0.35, slowDuration: 1.5 },
    { damage: 5, cooldown: 1.05, range: 1.9, slowAmount: 0.45, slowDuration: 1.8 },
    { damage: 8, cooldown: 1, range: 2.2, slowAmount: 0.55, slowDuration: 2.2 },
  ],
  displayStats: ['slowAmount', 'range'],
  fire: (world, tower, _target, stats) => frostPulse(world, tower, stats),
}

const ballista: TowerDef = {
  id: 'ballista',
  name: 'Баллиста',
  description: 'бьёт далеко, пронзает нескольких',
  cost: 130,
  upgradeCosts: [110, 180],
  tiers: [
    // Баланс v2: было 55/95/160 урона и 3,6/4/4,5 дальности — баллиста III была
    // в 2–2,5 раза выгоднее остальных башен (см. `npm run towers`)
    { damage: 50, cooldown: 2.2, range: 3.4, pierceCount: 3 },
    { damage: 80, cooldown: 2, range: 3.6, pierceCount: 4 },
    { damage: 125, cooldown: 1.8, range: 3.9, pierceCount: 5 },
  ],
  displayStats: ['damage', 'range'],
  fire: (world, tower, target, stats) =>
    shootLine(world, tower, target, {
      look: 'bolt',
      speed: 18,
      damage: stats.damage,
      damageKind: 'piercing',
      pierceCount: stats.pierceCount ?? 1,
      maxDistance: stats.range * BALLISTA_REACH_FACTOR,
    }),
}

/** Башни в порядке магазина (клавиши 1, 2, 3…) */
export const TOWER_LIST: readonly TowerDef[] = [archer, mage, frost, ballista]

/** Все башни по id */
export const TOWERS: Readonly<Record<string, TowerDef>> = Object.fromEntries(
  TOWER_LIST.map((towerDef) => [towerDef.id, towerDef]),
)
