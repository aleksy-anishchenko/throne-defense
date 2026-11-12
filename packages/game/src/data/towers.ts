// Башни (стража). Чтобы добавить новую:
// 1) опиши её здесь и добавь в TOWER_LIST;
// 2) нарисуй в apps/web/src/render/towers.ts (без рисунка будет простой кружок).
//
// У каждой башни своя работа (баланс v4):
// лучник — дешёвый и частый, огневик — против толпы и лат, Морозко — только замедляет,
// баллиста — против толстых, Звонарь — ускоряет стреляющих соседей, Казна — приносит золото.

import { frostPulse, shootHoming, shootLine } from '../systems/combat.ts'
import type { TowerDef } from '../types.ts'

/** Болт баллисты летит дальше её радиуса обстрела: дальность полёта = range × 1.15 (множитель) */
const BALLISTA_REACH_FACTOR = 1.15

/**
 * С какой ступени (с нуля: 2 — «III») баллиста стреляет «двойным болтом». Только картинка:
 * снаряд всё равно один и бьёт как обычный (рисунок — 'twinBolt' в apps/web/src/render/shots.ts)
 */
const BALLISTA_TWIN_BOLT_TIER = 2

const archer: TowerDef = {
  id: 'archer',
  name: 'Лучник',
  description: 'стреляет часто, слаб против лат',
  cost: 50,
  // Баланс v4: было 45/85 — улучшенный лучник давал меньше урона на монету, чем новый
  upgradeCosts: [40, 70],
  tiers: [
    { damage: 7, cooldown: 0.4, range: 2.4 },
    { damage: 12, cooldown: 0.36, range: 2.6 },
    { damage: 19, cooldown: 0.3, range: 2.9 },
  ],
  displayStats: ['damage', 'range'],
  canChooseTarget: true,
  takesFireRateBonus: true,
  fire: (world, tower, target, stats) =>
    shootHoming(world, tower, target, {
      look: 'arrow',
      speed: 13,
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
  canChooseTarget: true,
  takesFireRateBonus: true,
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
    // Баланс v4: урон был 3/5/8 — Морозко наносил урона на монету больше всех
    { damage: 1, cooldown: 1.1, range: 1.7, slowAmount: 0.4, slowDuration: 1.6 },
    { damage: 2, cooldown: 1.05, range: 1.9, slowAmount: 0.5, slowDuration: 2 },
    { damage: 3, cooldown: 1, range: 2.2, slowAmount: 0.6, slowDuration: 2.4 },
  ],
  displayStats: ['slowAmount', 'range'],
  // Волна холода бьёт всех вокруг разом — выбирать цель незачем
  canChooseTarget: false,
  takesFireRateBonus: false,
  fire: (world, tower, _target, stats) => frostPulse(world, tower, stats),
}

const ballista: TowerDef = {
  id: 'ballista',
  name: 'Баллиста',
  description: 'бьёт далеко и мощно, пробивает броню',
  cost: 130,
  upgradeCosts: [110, 180],
  tiers: [
    // Баланс v4: было 50/80/125 урона раз в 2,2/2/1,8 с, пробивала 3/4/5 врагов —
    // и была выгоднее всех почти против всех. Теперь бьёт реже, но сильнее, а пробивает только двоих
    { damage: 80, cooldown: 3, range: 3.4, pierceCount: 2 },
    { damage: 135, cooldown: 2.7, range: 3.6, pierceCount: 2 },
    { damage: 210, cooldown: 2.4, range: 3.9, pierceCount: 2 },
  ],
  displayStats: ['damage', 'range'],
  canChooseTarget: true,
  takesFireRateBonus: true,
  fire: (world, tower, target, stats) =>
    shootLine(world, tower, target, {
      look: tower.tier >= BALLISTA_TWIN_BOLT_TIER ? 'twinBolt' : 'bolt',
      speed: 18,
      damage: stats.damage,
      damageKind: 'piercing',
      pierceCount: stats.pierceCount ?? 1,
      maxDistance: stats.range * BALLISTA_REACH_FACTOR,
    }),
}

const bell: TowerDef = {
  id: 'bell',
  name: 'Звонарь',
  description: 'башни рядом стреляют чаще',
  cost: 100,
  upgradeCosts: [80, 120],
  tiers: [
    // Дальность 1,5 — восемь соседних клеток (до угловой — 1,41); 2,3 — ещё и через одну
    { damage: 0, cooldown: 0, range: 1.5, fireRateBonus: 0.15 },
    { damage: 0, cooldown: 0, range: 1.5, fireRateBonus: 0.25 },
    { damage: 0, cooldown: 0, range: 2.3, fireRateBonus: 0.35 },
  ],
  displayStats: ['fireRateBonus', 'range'],
  canChooseTarget: false,
  takesFireRateBonus: false,
}

const treasury: TowerDef = {
  id: 'treasury',
  name: 'Казна',
  description: 'приносит золото после каждой волны',
  cost: 80,
  upgradeCosts: [70, 100],
  tiers: [
    { damage: 0, cooldown: 0, range: 0, goldPerWave: 12 },
    { damage: 0, cooldown: 0, range: 0, goldPerWave: 22 },
    { damage: 0, cooldown: 0, range: 0, goldPerWave: 35 },
  ],
  displayStats: ['goldPerWave'],
  canChooseTarget: false,
  takesFireRateBonus: false,
}

/** Башни в порядке магазина (клавиши 1, 2, 3…) */
export const TOWER_LIST: readonly TowerDef[] = [archer, mage, frost, ballista, bell, treasury]

/** Все башни по id */
export const TOWERS: Readonly<Record<string, TowerDef>> = Object.fromEntries(
  TOWER_LIST.map((towerDef) => [towerDef.id, towerDef]),
)
