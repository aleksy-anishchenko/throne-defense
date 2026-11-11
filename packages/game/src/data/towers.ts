// Башни (стража). Чтобы добавить новую:
// 1) опиши её здесь и добавь в TOWER_LIST;
// 2) нарисуй в apps/web/src/render/towers.ts (без рисунка будет простой кружок).

import { frostPulse, shootHoming, shootLine } from '../systems/combat.ts'
import type { TowerDef } from '../types.ts'

const archer: TowerDef = {
  id: 'archer',
  name: 'Лучник',
  desc: 'быстрые стрелы, слаб против лат',
  cost: 50,
  upgrades: [45, 85],
  levels: [
    { dmg: 9, rate: 0.55, range: 2.3 },
    { dmg: 15, rate: 0.5, range: 2.5 },
    { dmg: 24, rate: 0.42, range: 2.8 },
  ],
  display: ['dmg', 'range'],
  fire: (w, t, e, s) =>
    shootHoming(w, t, e, { look: 'arrow', speed: 11, dmg: s.dmg, damage: 'phys' }),
}

const mage: TowerDef = {
  id: 'mage',
  name: 'Огневик',
  desc: 'взрыв по площади, прожигает латы',
  cost: 90,
  upgrades: [80, 130],
  levels: [
    { dmg: 16, rate: 1.2, range: 2.2, splash: 0.9 },
    { dmg: 27, rate: 1.1, range: 2.4, splash: 1 },
    { dmg: 44, rate: 1, range: 2.6, splash: 1.15 },
  ],
  display: ['dmg', 'range'],
  fire: (w, t, e, s) =>
    shootHoming(w, t, e, {
      look: 'orb',
      speed: 6.5,
      dmg: s.dmg,
      damage: 'magic',
      splash: s.splash,
    }),
}

const frost: TowerDef = {
  id: 'frost',
  name: 'Морозко',
  desc: 'замедляет всех вокруг, сам почти не ранит',
  cost: 70,
  upgrades: [60, 100],
  levels: [
    { dmg: 3, rate: 1.1, range: 1.7, slow: 0.35, dur: 1.5 },
    { dmg: 5, rate: 1.05, range: 1.9, slow: 0.45, dur: 1.8 },
    { dmg: 8, rate: 1, range: 2.2, slow: 0.55, dur: 2.2 },
  ],
  display: ['slow', 'range'],
  fire: (w, t, _e, s) => frostPulse(w, t, s),
}

const ballista: TowerDef = {
  id: 'ballista',
  name: 'Баллиста',
  desc: 'бьёт далеко, пронзает нескольких',
  cost: 130,
  upgrades: [110, 180],
  levels: [
    // Баланс v2: было 55/95/160 урона и 3,6/4/4,5 дальности — баллиста III была
    // в 2–3 раза выгоднее остальных башен (см. `npm run towers`)
    { dmg: 50, rate: 2.2, range: 3.4, pierce: 3 },
    { dmg: 80, rate: 2, range: 3.6, pierce: 4 },
    { dmg: 125, rate: 1.8, range: 3.9, pierce: 5 },
  ],
  display: ['dmg', 'range'],
  fire: (w, t, e, s) =>
    shootLine(w, t, e, {
      look: 'bolt',
      speed: 18,
      dmg: s.dmg,
      damage: 'pierce',
      pierce: s.pierce ?? 1,
      reach: s.range * 1.15,
    }),
}

/** Башни в порядке магазина (клавиши 1, 2, 3…) */
export const TOWER_LIST: readonly TowerDef[] = [archer, mage, frost, ballista]

/** Все башни по id */
export const TOWERS: Readonly<Record<string, TowerDef>> = Object.fromEntries(
  TOWER_LIST.map((t) => [t.id, t]),
)
