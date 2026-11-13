// Башни (стража). Чтобы добавить новую:
// 1) опиши её здесь и добавь в TOWER_LIST;
// 2) нарисуй в apps/web/src/render/towers.ts (без рисунка будет простой кружок).
//
// У каждой башни своя работа (баланс v4):
// лучник — дешёвый и частый, огневик — против толпы и лат, Морозко — только замедляет,
// баллиста — против толстых, Звонарь — ускоряет стреляющих соседей, Казна — приносит золото.
// Баланс v5: Пушкарь — густая толпа издалека (с v7 без отброса), Ловчий — ловит в сеть,
// Колдун — проклинает (проклятые получают больше урона ото всех)

import { cursePulse, frostPulse, shootHoming, shootLine } from '../systems/combat.ts'
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
  defaultTargetMode: 'first',
  canChooseTarget: false,
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
  description: 'поджигает толпу, огонь прожигает латы',
  cost: 90,
  upgradeCosts: [80, 130],
  tiers: [
    // Баланс v4: был взрыв на 16/27/44 сразу. Теперь ~20% урона — взрывом,
    // ~80% — горением за 3 с (запас огня: повторный поджог добавляет, а не перезапускает).
    // v6: горение +10% (19/33/53 → 21/36/58) — пар больше не наносит урона
    { damage: 5, cooldown: 1.2, range: 2.2, splashRadius: 0.9, burnDamage: 21, burnDuration: 3 },
    { damage: 9, cooldown: 1.1, range: 2.4, splashRadius: 1, burnDamage: 36, burnDuration: 3 },
    { damage: 14, cooldown: 1, range: 2.6, splashRadius: 1.15, burnDamage: 58, burnDuration: 3 },
  ],
  displayStats: ['damage', 'burnDamage', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: true,
  fire: (world, tower, target, stats) =>
    shootHoming(world, tower, target, {
      look: 'orb',
      speed: 6.5,
      damage: stats.damage,
      damageKind: 'magic',
      splashRadius: stats.splashRadius,
      burnDamage: stats.burnDamage,
      burnDuration: stats.burnDuration,
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
    { damage: 1, cooldown: 1.1, range: 1.7, slowAmount: 0.45, slowDuration: 1.6 },
    { damage: 2, cooldown: 1.05, range: 1.9, slowAmount: 0.55, slowDuration: 2 },
    { damage: 3, cooldown: 1, range: 2.2, slowAmount: 0.65, slowDuration: 2.4 },
  ],
  displayStats: ['slowAmount', 'range'],
  defaultTargetMode: 'first',
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
  // Умение баллисты: игрок переключает «первый» ↔ «сильный». «Сильный» бьёт самого крупного
  // в радиусе (огров, Горыныча, узурпатора). По умолчанию «первый»: боты с «сильным» с самого
  // начала падали на 1–2 волны раньше — на смешанных волнах латники проходили мимо
  defaultTargetMode: 'first',
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

const cannon: TowerDef = {
  id: 'cannon',
  name: 'Пушкарь',
  description: 'бьёт дальше всех, ядро разбивает толпу',
  cost: 140,
  upgradeCosts: [100, 140],
  tiers: [
    // Роль — густая толпа издалека: чем плотнее идут враги, тем больше их накрывает взрыв.
    // Против одиночек (огры, редкие латники) — из худших: стреляет редко.
    // v7: отброса больше нет — вместе с Морозко и сетями он держал врагов у двери вечно
    // и отнимал роль у Ловчего. Взамен урон 21/35/56 → 30/50/80, взрыв 0,7/0,8/0,9 → 1/1,15/1,3
    { damage: 30, cooldown: 3.2, range: 3.8, splashRadius: 1 },
    { damage: 50, cooldown: 3, range: 4.1, splashRadius: 1.15 },
    { damage: 80, cooldown: 2.8, range: 4.4, splashRadius: 1.3 },
  ],
  displayStats: ['damage', 'splashRadius', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: true,
  fire: (world, tower, target, stats) =>
    shootHoming(world, tower, target, {
      look: 'cannonball',
      speed: 9,
      damage: stats.damage,
      damageKind: 'physical',
      splashRadius: stats.splashRadius,
    }),
}

const trapper: TowerDef = {
  id: 'trapper',
  name: 'Ловчий',
  description: 'ловит врагов в сеть, они стоят на месте',
  cost: 110,
  upgradeCosts: [70, 100],
  tiers: [
    // Радиус сети — splashRadius. Вырвавшийся из сети пару секунд рвёт новые (ROOT_IMMUNITY_SECONDS),
    // поэтому пауза между сетями не короче «сеть + 2 с»: иначе часть сетей пропадала бы зря
    // Время в сети +0,3 с по просьбе владельца (было 1,5/2/2,5)
    { damage: 0, cooldown: 6, range: 2.4, splashRadius: 0.6, rootDuration: 1.8 },
    { damage: 0, cooldown: 5, range: 2.6, splashRadius: 0.7, rootDuration: 2.3 },
    { damage: 0, cooldown: 4.8, range: 2.8, splashRadius: 0.9, rootDuration: 2.8 },
  ],
  displayStats: ['rootDuration', 'cooldown', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: true,
  fire: (world, tower, target, stats) =>
    shootHoming(world, tower, target, {
      look: 'net',
      speed: 7,
      damage: 0,
      damageKind: 'physical',
      splashRadius: stats.splashRadius,
      rootDuration: stats.rootDuration,
    }),
}

const warlock: TowerDef = {
  id: 'warlock',
  name: 'Колдун',
  description: 'проклятые враги получают больше урона',
  cost: 100,
  upgradeCosts: [80, 120],
  tiers: [
    { damage: 0, cooldown: 1.5, range: 2.2, curseAmount: 0.35, curseDuration: 2 },
    { damage: 0, cooldown: 1.5, range: 2.4, curseAmount: 0.5, curseDuration: 2.5 },
    { damage: 0, cooldown: 1.5, range: 2.6, curseAmount: 0.65, curseDuration: 3 },
  ],
  displayStats: ['curseAmount', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  // Как у Морозко: проклятие держится дольше паузы между волнами проклятия — ускорять нечего
  takesFireRateBonus: false,
  fire: (world, tower, _target, stats) => cursePulse(world, tower, stats),
}

const bell: TowerDef = {
  id: 'bell',
  name: 'Звонарь',
  description: 'башни рядом стреляют чаще',
  cost: 100,
  upgradeCosts: [80, 120],
  tiers: [
    // Каждая ступень достаёт новые клетки (центры клеток — на расстоянии 1; 1,41; 2; 2,24 …):
    // 1,5 — восемь соседних; 2,05 — ещё четыре через одну по прямой; 2,3 — ещё восемь «ходом коня».
    // До v6 на I и II было 1,5 — улучшение радиус не меняло
    { damage: 0, cooldown: 0, range: 1.5, fireRateBonus: 0.15 },
    { damage: 0, cooldown: 0, range: 2.05, fireRateBonus: 0.25 },
    { damage: 0, cooldown: 0, range: 2.3, fireRateBonus: 0.35 },
  ],
  displayStats: ['fireRateBonus', 'range'],
  defaultTargetMode: 'first',
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
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: false,
}

/** Башни в порядке магазина (клавиши 1, 2, 3…) */
export const TOWER_LIST: readonly TowerDef[] = [
  archer,
  ballista,
  cannon,
  mage,
  frost,
  trapper,
  warlock,
  bell,
  treasury,
]

/** Все башни по id */
export const TOWERS: Readonly<Record<string, TowerDef>> = Object.fromEntries(
  TOWER_LIST.map((towerDef) => [towerDef.id, towerDef]),
)
