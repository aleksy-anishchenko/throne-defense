// Башни (стража). Чтобы добавить новую:
// 1) опиши её здесь и добавь в TOWER_LIST;
// 2) нарисуй в apps/web/src/render/towers.ts (без рисунка будет простой кружок).
//
// У каждой башни своя работа (баланс v4):
// лучник — дешёвый и частый, огневик — против толпы и лат, Морозко — только замедляет,
// баллиста — против толстых, Звонарь — ускоряет стреляющих соседей, Казна — приносит золото.
// Баланс v5: Пушкарь — густая толпа издалека (с v7 без отброса), Ловчий — ловит в сеть,
// Колдун — проклинает (проклятые получают больше урона и меньше лечения)

import { cursePulse, frostPulse, shootHoming, shootLine } from '../systems/combat.ts'
import { rewardStats } from '../systems/rewards.ts'
import { towerAspect } from '../systems/towers.ts'
import type { Enemy, TowerDef } from '../types.ts'
import { BOILING_OIL, MAGE_BURN, WALL_HIT_LIMIT, WALL_RESIN } from './balance.ts'
import { DOUBLE_SHOT_INTERVAL } from './rewards.ts'

/** Болт баллисты летит дальше её радиуса обстрела: дальность полёта = range × 1.15 (множитель) */
const BALLISTA_REACH_FACTOR = 1.15

/**
 * С какой ступени (с нуля: 2 — «III») баллиста стреляет «двойным болтом». Только картинка:
 * снаряд всё равно один и бьёт как обычный (рисунок — 'twinBolt' в apps/web/src/render/shots.ts)
 */
const BALLISTA_TWIN_BOLT_TIER = 2

/** Поперечный отступ между стрелами одного залпа, клеток. */
const DOUBLE_SHOT_SPACING = 0.22

/** Враги рядом с основной целью для дополнительных стрел Рикошета. */
function ricochetTargets(
  enemies: readonly Enemy[],
  primary: Enemy,
  radius: number,
  count: number,
): Enemy[] {
  const radiusSquared = radius * radius
  return enemies
    .filter(
      (enemy) =>
        enemy !== primary &&
        !enemy.isDead &&
        (enemy.x - primary.x) ** 2 + (enemy.y - primary.y) ** 2 <= radiusSquared,
    )
    .sort(
      (a, b) =>
        (a.x - primary.x) ** 2 +
          (a.y - primary.y) ** 2 -
          ((b.x - primary.x) ** 2 + (b.y - primary.y) ** 2) || a.id - b.id,
    )
    .slice(0, count)
}

const ARCHER_ASPECT_COST = 140
const HUNTER_MARK = { damagePerStack: 0.1, maxStacks: 10 } as const
const RICOCHET_DAMAGE_SHARE = 0.6

const archer: TowerDef = {
  id: 'archer',
  name: 'Лучник',
  shortDescription: 'Часто стреляет',
  description: 'Высокая скорость атаки. Низкий урон по броне.',
  cost: 60,
  upgradeCosts: [50, 80],
  aspects: [
    {
      id: 'hunter-mark',
      name: 'Метка охотника',
      description: `Каждый повторный выстрел по той же цели даёт +${HUNTER_MARK.damagePerStack * 100}% урона (до +${HUNTER_MARK.damagePerStack * HUNTER_MARK.maxStacks * 100}%), а смена цели сбрасывает серию.`,
      cost: ARCHER_ASPECT_COST,
      hunterMark: HUNTER_MARK,
    },
    {
      id: 'ricochet',
      name: 'Рикошет',
      description: `Стрела наносит полный урон основной цели и по ${RICOCHET_DAMAGE_SHARE * 100}% урона ещё двум врагам поблизости.`,
      cost: ARCHER_ASPECT_COST,
      ricochet: { shares: [RICOCHET_DAMAGE_SHARE, RICOCHET_DAMAGE_SHARE], radius: 1.3 },
    },
  ],
  tiers: [
    { damage: 7, cooldown: 0.4, range: 1.9 },
    { damage: 12, cooldown: 0.36, range: 2.1 },
    { damage: 19, cooldown: 0.3, range: 2.3 },
  ],
  displayStats: ['damage', 'attackRate', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: true,
  fire: (world, tower, target, stats) => {
    const aspect = towerAspect(tower)
    let damage = stats.damage
    const hunter = aspect?.hunterMark
    if (hunter) {
      if (tower.hunterTargetId === target.id) {
        tower.hunterStacks = Math.min(hunter.maxStacks, tower.hunterStacks + 1)
      } else {
        tower.hunterTargetId = target.id
        tower.hunterStacks = 0
      }
      damage *= 1 + tower.hunterStacks * hunter.damagePerStack
    }
    const bonusArrows = rewardStats(world.state).doubleShotArrows
    let arrows = 1
    if (bonusArrows > 0) {
      tower.shotsSinceDouble++
      if (tower.shotsSinceDouble >= DOUBLE_SHOT_INTERVAL) {
        tower.shotsSinceDouble = 0
        arrows += bonusArrows
      }
    }
    const arrow = {
      look: 'arrow',
      speed: 13,
      damageKind: 'physical' as const,
    }
    for (let index = 0; index < arrows; index++) {
      shootHoming(world, tower, target, {
        ...arrow,
        damage,
        originOffset: (index - (arrows - 1) / 2) * DOUBLE_SHOT_SPACING,
      })
    }
    const ricochet = aspect?.ricochet
    if (!ricochet) return
    const extraTargets = ricochetTargets(
      world.state.enemies,
      target,
      ricochet.radius,
      ricochet.shares.length,
    )
    for (const [index, extra] of extraTargets.entries()) {
      shootHoming(world, tower, extra, {
        ...arrow,
        damage: stats.damage * ricochet.shares[index],
      })
    }
  },
}

const WILDFIRE_BURN = { damageBonus: 0.2, duration: 2 } as const

const mage: TowerDef = {
  id: 'mage',
  name: 'Огневик',
  shortDescription: 'Поджигает врагов',
  description: 'Поджигает цель и врагов рядом с ней. Горение игнорирует броню.',
  cost: 90,
  upgradeCosts: [80, 130],
  aspects: [
    {
      id: 'boiling-oil',
      name: 'Кипящее масло',
      description: `Оставляет лужу на ${BOILING_OIL.puddleDuration} с. Задетые враги и все, кто входит в лужу, получают ${BOILING_OIL.slowAmount * 100}% замедления и на ${BOILING_OIL.burnBonus * 100}% больше урона от горения. После выхода масло действует ещё ${BOILING_OIL.coatDuration} с.`,
      cost: 150,
    },
    {
      id: 'wildfire',
      name: 'Дикий огонь',
      description: `Синее пламя наносит на ${WILDFIRE_BURN.damageBonus * 100}% больше урона за поджог. Весь урон проходит за ${WILDFIRE_BURN.duration} с вместо ${MAGE_BURN.duration}.`,
      cost: 150,
      intenseBurn: WILDFIRE_BURN,
    },
  ],
  tiers: [
    // Урон Огневика полностью приходится на горение.
    { damage: 0, cooldown: 1.2, range: 1.5, splashRadius: 0.55 },
    { damage: 0, cooldown: 1.1, range: 1.7, splashRadius: 0.65 },
    { damage: 0, cooldown: 1, range: 1.9, splashRadius: 0.75 },
  ].map((stats, tier) => ({
    ...stats,
    burnDamage: MAGE_BURN.damageByTier[tier],
    burnDuration: MAGE_BURN.duration,
  })),
  displayStats: ['burnDamage', 'attackRate', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  preferUnburning: true,
  takesFireRateBonus: true,
  fire: (world, tower, target, stats) => {
    const id = tower.aspectId
    const mageAspect = id === 'boiling-oil' || id === 'wildfire' ? id : undefined
    shootHoming(world, tower, target, {
      look: mageAspect ?? 'orb',
      mageAspect,
      speed: 6.5,
      damage: stats.damage,
      damageKind: 'magic',
      splashRadius: stats.splashRadius,
      burnDamage: stats.burnDamage,
      burnDuration: stats.burnDuration,
    })
  },
}

const frost: TowerDef = {
  id: 'frost',
  name: 'Морозко',
  shortDescription: 'Замедляет врагов',
  description: 'Замедляет врагов вокруг себя волной холода.',
  interactionHint: 'Холод тушит огонь Огневика.',
  cost: 70,
  upgradeCosts: [60, 100],
  tiers: [
    // Баланс v4: урон был 3/5/8 — Морозко наносил урона на монету больше всех
    { damage: 0, cooldown: 1, range: 1.7, slowAmount: 0.3, slowDuration: 1.6 },
    { damage: 0, cooldown: 1, range: 1.9, slowAmount: 0.4, slowDuration: 2 },
    { damage: 0, cooldown: 1, range: 2.2, slowAmount: 0.5, slowDuration: 2.4 },
  ],
  displayStats: ['slowAmount', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: false,
  fire: (world, tower, _target, stats) => frostPulse(world, tower, stats),
}

const GIANT_SLAYER_BONUS = 0.4
const ARMOR_BREAK = { chance: 0.5, duration: 4 } as const

const ballista: TowerDef = {
  id: 'ballista',
  name: 'Баллиста',
  shortDescription: 'Пробивает броню',
  description: 'Болт пробивает до двух врагов и игнорирует половину брони. Долгая перезарядка.',
  cost: 160,
  upgradeCosts: [140, 210],
  aspects: [
    {
      id: 'giant-slayer',
      name: 'Сокрушитель',
      description: `Болт наносит на ${GIANT_SLAYER_BONUS * 100}% больше урона исполинам — ограм, Горынычам, генералам мятежников и Узурпатору.`,
      cost: 180,
      giantDamageBonus: GIANT_SLAYER_BONUS,
    },
    {
      id: 'armor-breaker',
      name: 'Раскол лат',
      description: `При каждом попадании болт с вероятностью ${ARMOR_BREAK.chance * 100}% снимает броню на ${ARMOR_BREAK.duration} с, включая защиту знамени. Повторное срабатывание обновляет срок.`,
      cost: 180,
      armorBreakDuration: ARMOR_BREAK.duration,
      armorBreakChance: ARMOR_BREAK.chance,
    },
  ],
  tiers: [
    // Баланс v4: было 50/80/125 урона раз в 2,2/2/1,8 с, пробивала 3/4/5 врагов —
    // и была выгоднее всех почти против всех. Теперь бьёт реже, но сильнее, а пробивает только двоих
    { damage: 75, cooldown: 3.2, range: 2.7, pierceCount: 2 },
    { damage: 125, cooldown: 3, range: 2.9, pierceCount: 2 },
    { damage: 195, cooldown: 2.8, range: 3.1, pierceCount: 2 },
  ],
  displayStats: ['damage', 'attackRate', 'range'],
  // Умение баллисты: игрок переключает «первый» ↔ «сильный». «Сильный» бьёт самого крупного
  // в радиусе. По умолчанию «первый»: боты с «сильным» с самого
  // начала падали на 1–2 волны раньше — на смешанных волнах латники проходили мимо
  defaultTargetMode: 'first',
  canChooseTarget: true,
  takesFireRateBonus: true,
  fire: (world, tower, target, stats) => {
    const aspect = towerAspect(tower)
    shootLine(world, tower, target, {
      look: tower.tier >= BALLISTA_TWIN_BOLT_TIER ? 'twinBolt' : 'bolt',
      speed: 18,
      damage: stats.damage,
      damageKind: 'piercing',
      pierceCount: stats.pierceCount ?? 1,
      maxDistance: stats.range * BALLISTA_REACH_FACTOR,
      giantDamageBonus: aspect?.giantDamageBonus,
      armorBreakDuration: aspect?.armorBreakDuration,
      armorBreakChance: aspect?.armorBreakChance,
      iceNeedles: rewardStats(world.state).iceNeedles,
    })
  },
}

const cannon: TowerDef = {
  id: 'cannon',
  name: 'Пушкарь',
  shortDescription: 'Бьёт по площади',
  description:
    'Бьёт ядрами по площади. В центре взрыва урон выше. Быстрые враги могут уйти из-под удара.',
  cost: 340,
  upgradeCosts: [160, 220],
  tiers: [
    // Роль — густая толпа издалека: чем плотнее идут враги, тем больше их накрывает взрыв.
    // Против одиночек (огры, редкие латники) — из худших: стреляет редко.
    // v7: отброса больше нет — вместе с Морозко и сетями он держал врагов у двери вечно
    // и отнимал роль у Ловчего. Взамен урон 21/35/56 → 30/50/80, взрыв 0,7/0,8/0,9 → 1/1,15/1,3
    { damage: 100, cooldown: 4.8, range: 2.9, splashRadius: 1 },
    { damage: 160, cooldown: 4.6, range: 3.2, splashRadius: 1.15 },
    { damage: 240, cooldown: 4.4, range: 3.4, splashRadius: 1.3 },
  ],
  displayStats: ['damage', 'attackRate', 'splashRadius', 'range'],
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
      tracksTarget: false,
      splashEdgeDamageShare: 0.5,
    }),
}

const trapper: TowerDef = {
  id: 'trapper',
  name: 'Ловчий',
  shortDescription: 'Ловит в сеть',
  description: 'Останавливает группу врагов сетью. На горящих врагах сеть быстро сгорает.',
  cost: 80,
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
  shortDescription: 'Ослабляет врагов',
  description: 'Проклинает врагов вокруг. Проклятые получают больше урона и меньше лечения.',
  cost: 100,
  upgradeCosts: [80, 120],
  tiers: [
    { damage: 0, cooldown: 1.5, range: 2.2, curseAmount: 0.2, curseDuration: 2 },
    { damage: 0, cooldown: 1.5, range: 2.4, curseAmount: 0.3, curseDuration: 2.5 },
    { damage: 0, cooldown: 1.5, range: 2.6, curseAmount: 0.4, curseDuration: 3 },
  ],
  displayStats: ['curseAmount', 'healingReduction', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  // Как у Морозко: проклятие держится дольше паузы между волнами проклятия — ускорять нечего
  takesFireRateBonus: false,
  fire: (world, tower, _target, stats) => cursePulse(world, tower, stats),
}

const bell: TowerDef = {
  id: 'bell',
  name: 'Звонарь',
  shortDescription: 'Ускоряет стрельбу',
  description: 'Ускоряет стрельбу стражей поблизости.',
  interactionHint: 'Если рядом несколько Звонарей, действует сильнейший бонус.',
  cost: 100,
  upgradeCosts: [80, 120],
  tiers: [
    // Каждая ступень достаёт новые клетки (центры клеток — на расстоянии 1; 1,41; 2; 2,24 …):
    // 1,5 — восемь соседних; 2,05 — ещё четыре через одну по прямой; 2,3 — ещё восемь «ходом коня».
    // До v6 на I и II было 1,5 — улучшение радиус не меняло
    { damage: 0, cooldown: 0, range: 1.5, fireRateBonus: 0.2 },
    { damage: 0, cooldown: 0, range: 2.05, fireRateBonus: 0.3 },
    { damage: 0, cooldown: 0, range: 2.3, fireRateBonus: 0.4 },
  ],
  displayStats: ['fireRateBonus', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: false,
}

const treasury: TowerDef = {
  id: 'treasury',
  name: 'Казна',
  shortDescription: 'Приносит золото',
  description:
    'Приносит золото после каждой отбитой волны. Каждая соседняя Казна даёт +10% к доходу, максимум +30%.',
  cost: 80,
  upgradeCosts: [70, 100],
  tiers: [
    { damage: 0, cooldown: 0, range: 0, goldPerWave: 12 },
    { damage: 0, cooldown: 0, range: 0, goldPerWave: 23 },
    { damage: 0, cooldown: 0, range: 0, goldPerWave: 38 },
  ],
  displayStats: ['goldPerWave'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: false,
}

const outpost: TowerDef = {
  id: 'outpost',
  name: 'Застава',
  shortDescription: 'Держит ковёр',
  description:
    'Одна на зал. Ставится на ковёр между волнами. Лучники стреляют, пока враги ломают щит. После волны щит восстанавливается.',
  cost: 75,
  upgradeCosts: [60, 100],
  aspects: [
    {
      id: 'reinforced-wall',
      name: 'Укреплённая стена',
      cost: 140,
      description: `За один удар стена теряет не больше ${WALL_HIT_LIMIT} прочности.`,
    },
    {
      id: 'machicolations',
      name: 'Навесные бойницы',
      cost: 140,
      description: `При ударе по стене из бойниц льётся смола на всех атакующих. На ${WALL_RESIN.duration} секунды они получают на ${WALL_RESIN.damageBonus * 100}% больше урона от всех защитников. Следующий разлив через ${WALL_RESIN.cooldown} секунд.`,
    },
  ],
  tiers: [
    { shieldHealth: 75, damage: 5, cooldown: 0.8, range: 1.5 },
    { shieldHealth: 130, damage: 9, cooldown: 0.8, range: 1.5 },
    { shieldHealth: 220, damage: 15, cooldown: 0.8, range: 1.5 },
  ],
  displayStats: ['shieldHealth', 'damage', 'attackRate', 'range'],
  defaultTargetMode: 'first',
  canChooseTarget: false,
  takesFireRateBonus: true,
  fire(world, tower, target, stats) {
    shootHoming(world, tower, target, {
      look: 'arrow',
      speed: 13,
      damageKind: 'physical',
      damage: stats.damage,
    })
  },
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
  outpost,
]

/** Все башни по id */
export const TOWERS: Readonly<Record<string, TowerDef>> = Object.fromEntries(
  TOWER_LIST.map((towerDef) => [towerDef.id, towerDef]),
)
