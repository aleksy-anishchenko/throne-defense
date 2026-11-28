// Урон, снаряды и «выстрелы-ауры». Башни (data/towers.ts) собираются из этих кирпичиков.

import { rollCombatChance } from '../core/random.ts'
import { BOILING_OIL, WALL_RESIN } from '../data/balance.ts'
import { ICE_NEEDLES } from '../data/rewards.ts'
import type {
  DamageKind,
  Enemy,
  HomingShot,
  LineShot,
  OilPuddle,
  Tower,
  TowerStats,
  World,
} from '../types.ts'
import { advanceBurning, applyBurn, burnTimeRemaining } from './burning.ts'
import { bannerArmorOf, queueSplit } from './enemies.ts'
import { towerStats } from './towers.ts'
import { effectiveTowerStats, rewardStats } from './rewards.ts'

/** Какая доля брони врага всё ещё режет пробивающий урон (0.5 = половина брони; физический урон режется всей бронёй, магический — не режется вовсе) */
const PIERCING_ARMOR_FACTOR = 0.5

// Огонь и лёд не уживаются: холод тушит горящего (пар), огонь растапливает лёд (замедление
// снимается). Их выгодно разводить по ковру. Зато по отдельности огневик и Морозко сильные
// (см. data/towers.ts). Огонь и сеть: горящая сеть держит лишь пятую часть времени и сгорает

/**
 * Горящая сеть держит лишь эту долю своего времени, потом сгорает: 0.2 — пятую часть.
 * И когда сеть упала на горящего, и когда пойманный загорелся
 */
export const NET_ON_FIRE_SHARE = 0.2

/**
 * Огонь по замороженному: часть силы уходит на то, чтобы растопить лёд — поджог даёт
 * эту долю огня. (Наоборот, холод по горящему, огонь просто гасит — см. extinguishWithSteam)
 */
export const THAW_BURN_MULTIPLIER = 0.75

/** Запас на попадание для снаряда, летящего по прямой (болт баллисты), в клетках: чуть щедрее радиуса врага */
const LINE_SHOT_HIT_MARGIN = 0.1

/** Скорость ледяных игл, клеток в секунду. */
const ICE_NEEDLE_SPEED = 8

/** Какую долю радиуса врага добавляем к радиусу взрыва, в долях радиуса (0.5 = половину) */
const SPLASH_ENEMY_RADIUS_SHARE = 0.5

/**
 * Сколько секунд после сети враг рвёт новые сети сразу. Без этого несколько Ловчих бросали бы
 * сети по очереди, и волна стояла бы на месте вечно
 */
export const ROOT_IMMUNITY_SECONDS = 2

/** Настройки снаряда, который летит за целью */
export interface HomingShotOptions {
  /** Как рисовать снаряд (см. SHOT_ART в apps/web). */
  look: string
  /** Скорость полёта, клеток в секунду */
  speed: number
  /** Смещение точки старта поперёк выстрела, клеток. */
  originOffset?: number
  damage: number
  damageKind: DamageKind
  /** Радиус взрыва в клетках; без него снаряд бьёт только цель */
  splashRadius?: number
  /** Следовать за целью; по умолчанию да. */
  tracksTarget?: boolean
  /** Доля урона у края взрыва; по умолчанию 1. */
  splashEdgeDamageShare?: number
  /** Сколько урона добавить горением каждому, кого задел; без него не поджигает */
  burnDamage?: number
  /** За сколько секунд догорает поджог */
  burnDuration?: number
  mageAspect?: HomingShot['mageAspect']
  /** Сеть: сколько секунд держит всех, кого накрыла (вместе с splashRadius — радиус сети) */
  rootDuration?: number
}

/** Настройки снаряда, который летит по прямой */
export interface LineShotOptions {
  /** Как рисовать снаряд (см. SHOT_ART в apps/web). */
  look: string
  /** Скорость полёта, клеток в секунду */
  speed: number
  damage: number
  damageKind: DamageKind
  /** Сколько врагов снаряд пробивает насквозь */
  pierceCount: number
  /** Сколько клеток снаряд пролетит, прежде чем исчезнуть */
  maxDistance: number
  /** Дополнительный урон по каждому задетому исполину. */
  giantDamageBonus?: number
  /** Длительность снятия брони после попадания. */
  armorBreakDuration?: number
  armorBreakChance?: number
  iceNeedles?: boolean
}

function armorWithBanner(world: World, enemy: Enemy): number {
  return enemy.def.armor + bannerArmorOf(world.state.enemies, enemy)
}

/** Нанести урон врагу с учётом брони. Если враг погиб — награда и событие kill */
export function damageEnemy(
  world: World,
  enemy: Enemy,
  damage: number,
  damageKind: DamageKind,
): void {
  if (enemy.isDead) return
  const armor =
    enemy.armorBreakTimeLeft > 0 || damageKind === 'magic' ? 0 : armorWithBanner(world, enemy)
  let effectiveDamage = damage
  if (damageKind === 'physical') effectiveDamage = Math.max(1, damage - armor)
  else if (damageKind === 'piercing')
    effectiveDamage = Math.max(1, damage - armor * PIERCING_ARMOR_FACTOR)
  effectiveDamage *= rewardStats(world.state).damageMultiplier
  world.emit('hit', enemy)
  loseHp(world, enemy, effectiveDamage)
}

export function incomingDamageMultiplier(enemy: Enemy): number {
  const curse = enemy.curseTimeLeft > 0 ? 1 + enemy.curseAmount : 1
  const resin = enemy.resinTimeLeft ? 1 + WALL_RESIN.damageBonus : 1
  return curse * resin
}

/**
 * Отнять здоровье без брони и без события hit (его слушает белая вспышка: горение
 * мигало бы врагом каждый кадр). Если враг погиб — награда, распад и событие kill
 */
function loseHp(world: World, enemy: Enemy, amount: number): void {
  enemy.hp -= amount * incomingDamageMultiplier(enemy)
  if (enemy.hp <= 0) {
    const state = world.state
    const rewards = rewardStats(state)
    enemy.isDead = true
    state.gold += enemy.def.reward + rewards.killGoldBonus
    state.score += enemy.def.killScore
    state.kills++
    queueSplit(world, enemy)
    world.emit('kill', enemy)
  }
}

/** Плита бьёт в своей клетке. Кровотечение остаётся на враге даже после продажи плиты. */
export function updateSpikePlates(world: World, dt: number): void {
  const { enemies, towers, time } = world.state
  for (const enemy of enemies) {
    const bleed = enemy.bleeding
    if (!bleed || enemy.isDead) continue
    const elapsed = Math.min(dt, bleed.secondsLeft)
    loseHp(world, enemy, elapsed * bleed.damagePerSecond)
    bleed.secondsLeft -= elapsed
    if (bleed.secondsLeft <= 0) delete enemy.bleeding
  }

  const tower = towers.find((candidate) => candidate.def.id === 'spike-plate')
  if (!tower) return
  tower.cooldownLeft = Math.max(0, tower.cooldownLeft - dt)
  let strike = tower.spikeStrike
  if (tower.cooldownLeft > 1e-8 && (!strike || time >= strike.raisedUntil)) return
  const targets = enemies.filter(
    (enemy) =>
      !enemy.isDead && Math.floor(enemy.x) === tower.col && Math.floor(enemy.y) === tower.row,
  )
  if (!targets.length) return
  const stats = effectiveTowerStats(world.state, tower, towerStats(tower))
  if (tower.cooldownLeft <= 1e-8) {
    if (tower.aspectId === 'giant-stakes' && !targets.some((enemy) => enemy.def.isGiant)) return
    const duration = tower.aspectId === 'spiked-floor' ? 1 : 0
    strike = { at: time, raisedUntil: time + duration, hitIds: new Set() }
    tower.spikeStrike = strike
    tower.cooldownLeft = stats.cooldown
    world.emit('fire', { tower, stats })
  }
  if (!strike) return
  for (const enemy of targets) {
    if (strike.hitIds.has(enemy.id)) continue
    strike.hitIds.add(enemy.id)
    damageEnemy(world, enemy, stats.damage, 'physical')
    if (enemy.isDead) continue
    const share = enemy.def.id === 'boss' ? stats.bossBleedShare! : stats.bleedShare!
    enemy.bleeding = { secondsLeft: 3, damagePerSecond: (enemy.maxHp * share) / 3 }
  }
}

function nearbyEnemies(
  enemies: readonly Enemy[],
  origin: Enemy,
  radius: number,
  maxTargets: number,
): Enemy[] {
  return enemies
    .filter((enemy) => enemy !== origin && !enemy.isDead)
    .map((enemy) => ({
      enemy,
      distanceSquared: (enemy.x - origin.x) ** 2 + (enemy.y - origin.y) ** 2,
    }))
    .filter(({ distanceSquared }) => distanceSquared <= radius ** 2)
    .sort((a, b) => a.distanceSquared - b.distanceSquared || a.enemy.id - b.enemy.id)
    .slice(0, maxTargets)
    .map(({ enemy }) => enemy)
}

/** Снаряд, который летит за целью. С splashRadius > 0 взрывается и бьёт всех вокруг */
export function shootHoming(
  world: World,
  origin: Pick<Tower, 'x' | 'y' | 'aimAngle'>,
  target: Enemy,
  options: HomingShotOptions,
): void {
  const offset = options.originOffset ?? 0
  world.state.shots.push({
    kind: 'homing',
    look: options.look,
    x: origin.x - (offset ? Math.sin(origin.aimAngle) * offset : 0),
    y: origin.y + (offset ? Math.cos(origin.aimAngle) * offset : 0),
    angle: origin.aimAngle,
    target,
    targetX: target.x,
    targetY: target.y,
    tracksTarget: options.tracksTarget ?? true,
    splashEdgeDamageShare: options.splashEdgeDamageShare ?? 1,
    speed: options.speed,
    damage: options.damage,
    damageKind: options.damageKind,
    splashRadius: options.splashRadius ?? 0,
    burnDamage: options.burnDamage ?? 0,
    burnDuration: options.burnDuration ?? 0,
    mageAspect: options.mageAspect,
    rootDuration: options.rootDuration ?? 0,
    isDone: false,
  })
}

/** Снаряд, который летит по прямой на `maxDistance` клеток и пробивает `pierceCount` врагов */
export function shootLine(
  world: World,
  tower: Tower,
  target: Enemy,
  options: LineShotOptions,
): void {
  const distance = Math.hypot(target.x - tower.x, target.y - tower.y) || 1
  world.state.shots.push({
    kind: 'line',
    look: options.look,
    x: tower.x,
    y: tower.y,
    angle: tower.aimAngle,
    directionX: (target.x - tower.x) / distance,
    directionY: (target.y - tower.y) / distance,
    speed: options.speed,
    distanceLeft: options.maxDistance,
    damage: options.damage,
    damageKind: options.damageKind,
    giantDamageBonus: options.giantDamageBonus ?? 0,
    armorBreakDuration: options.armorBreakDuration ?? 0,
    armorBreakChance: options.armorBreakChance ?? 1,
    iceNeedles: options.iceNeedles ?? false,
    piercesLeft: options.pierceCount,
    hitEnemies: new Set(),
    isDone: false,
  })
}

/** Волна холода замедляет врагов и тушит их огонь без благословения «Лёд и пламя». */
export function frostPulse(world: World, tower: Tower, stats: TowerStats): void {
  const slowAmount = stats.slowAmount ?? 0
  const slowDuration = stats.slowDuration ?? 0
  const rangeSquared = stats.range * stats.range
  const { iceAndFire } = rewardStats(world.state)
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > rangeSquared) continue
    const slowFactor = slowAmount * (1 - (enemy.def.slowResistance ?? 0))
    if (enemy.slowTimeLeft <= 0 || slowFactor > enemy.slowFactor) {
      enemy.slowFactor = slowFactor
      enemy.slowTimeLeft = slowDuration
    } else if (slowFactor === enemy.slowFactor) {
      enemy.slowTimeLeft = Math.max(enemy.slowTimeLeft, slowDuration)
    }
    if (stats.damage > 0) damageEnemy(world, enemy, stats.damage, 'magic')
    if (!iceAndFire && burnTimeRemaining(enemy) > 0 && !enemy.isDead)
      extinguishWithSteam(world, enemy)
  }
}

/**
 * Проклятие Колдуна: все в радиусе башни какое-то время получают больше урона
 * и на ту же долю меньше лечения (см. updateHealers).
 * Действует сильнейшее проклятие. Повтор равной силы обновляет его срок.
 */
export function cursePulse(world: World, tower: Tower, stats: TowerStats): void {
  const curseAmount = stats.curseAmount ?? 0
  const curseDuration = stats.curseDuration ?? 0
  const rangeSquared = stats.range * stats.range
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > rangeSquared) continue
    if (enemy.curseTimeLeft <= 0 || curseAmount > enemy.curseAmount) {
      enemy.curseAmount = curseAmount
      enemy.curseTimeLeft = curseDuration
    } else if (curseAmount === enemy.curseAmount) {
      enemy.curseTimeLeft = Math.max(enemy.curseTimeLeft, curseDuration)
    }
  }
}

/**
 * Поймать врага в сеть на duration секунд — если он не рвёт сети после прошлой.
 * Крупных сеть держит меньше (controlResistance).
 * Горящего сеть держит лишь NET_ON_FIRE_SHARE своего времени, потом сгорает
 */
function rootEnemy(enemy: Enemy, duration: number): void {
  if (enemy.isDead || duration <= 0 || enemy.rootImmunityLeft > 0) return
  const fullTime = duration * (1 - (enemy.def.controlResistance ?? 0))
  const rootTime = burnTimeRemaining(enemy) > 0 ? fullTime * NET_ON_FIRE_SHARE : fullTime
  enemy.rootDuration = fullTime
  enemy.rootTimeLeft = rootTime
  enemy.rootImmunityLeft = rootTime + ROOT_IMMUNITY_SECONDS
}

/** «Пар»: волна холода тушит горящего врага — огонь погас, остаток огня пропадает */
function extinguishWithSteam(world: World, enemy: Enemy): void {
  enemy.burnDamageLeft = 0
  enemy.burnTimeLeft = 0
  enemy.wildfire = false
  enemy.oilBurn = undefined
  world.emit('steam', { x: enemy.x, y: enemy.y })
}

function firstLineHit(shot: LineShot, enemy: Enemy, travelDistance: number): number | null {
  const dx = enemy.x - shot.x
  const dy = enemy.y - shot.y
  const along = dx * shot.directionX + dy * shot.directionY
  const across = dx * shot.directionY - dy * shot.directionX
  const radius = enemy.def.radius + LINE_SHOT_HIT_MARGIN
  const halfChordSquared = radius * radius - across * across
  if (halfChordSquared < 0) return null
  const halfChord = Math.sqrt(halfChordSquared)
  const entry = along - halfChord
  if (along + halfChord < 0 || entry > travelDistance) return null
  return Math.max(entry, 0)
}

/** Сдвинуть все снаряды на dt секунд и нанести урон тем, в кого попали */
export function updateShots(world: World, dt: number): void {
  const { shots } = world.state
  // Иглы, появившиеся при попадании, начнут полёт на следующем шаге.
  const initialShotCount = shots.length
  for (let index = 0; index < initialShotCount; index++) {
    const shot = shots[index]
    if (shot.kind === 'line') updateLineShot(world, shot, dt)
    else updateHomingShot(world, shot, dt)
  }
}

/** Снаряд по прямой: бьёт всех, кого задел на этом шаге, пока не кончатся пробития или дальность */
function updateLineShot(world: World, shot: LineShot, dt: number): void {
  const travelDistance = Math.min(shot.speed * dt, shot.distanceLeft)
  const hits: { enemy: Enemy; distance: number }[] = []
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || shot.hitEnemies.has(enemy)) continue
    const distance = firstLineHit(shot, enemy, travelDistance)
    if (distance !== null) hits.push({ enemy, distance })
  }

  hits.sort((a, b) => a.distance - b.distance || a.enemy.id - b.enemy.id)
  let traveled = travelDistance
  for (const { enemy, distance } of hits) {
    if (enemy.isDead) continue
    shot.hitEnemies.add(enemy)
    if (
      shot.armorBreakDuration > 0 &&
      armorWithBanner(world, enemy) > 0 &&
      rollCombatChance(world.state, shot.armorBreakChance)
    ) {
      enemy.armorBreakTimeLeft = Math.max(enemy.armorBreakTimeLeft, shot.armorBreakDuration)
    }
    const damageMultiplier = enemy.def.isGiant ? 1 + shot.giantDamageBonus : 1
    damageEnemy(world, enemy, shot.damage * damageMultiplier, shot.damageKind)
    if (shot.iceNeedles && enemy.slowTimeLeft > 0 && enemy.slowFactor > 0) {
      shot.iceNeedles = false
      shootIceNeedles(world, shot, enemy)
    }
    shot.piercesLeft--
    if (shot.piercesLeft <= 0) {
      traveled = distance
      shot.isDone = true
      break
    }
  }
  shot.x += shot.directionX * traveled
  shot.y += shot.directionY * traveled
  shot.distanceLeft -= traveled
  if (shot.distanceLeft <= 0) shot.isDone = true
}

function shootIceNeedles(world: World, bolt: LineShot, origin: Enemy): void {
  for (const target of nearbyEnemies(
    world.state.enemies,
    origin,
    ICE_NEEDLES.radius,
    ICE_NEEDLES.targets,
  )) {
    const aimAngle = Math.atan2(target.y - origin.y, target.x - origin.x)
    shootHoming(world, { x: origin.x, y: origin.y, aimAngle }, target, {
      look: 'iceNeedle',
      speed: ICE_NEEDLE_SPEED,
      damage: bolt.damage * ICE_NEEDLES.damageShare,
      damageKind: bolt.damageKind,
    })
  }
}

/** Снаряд летит за целью либо в зафиксированную точку. */
function updateHomingShot(world: World, shot: HomingShot, dt: number): void {
  // Пока цель жива — следим за ней
  if (shot.tracksTarget && !shot.target.isDead) {
    shot.targetX = shot.target.x
    shot.targetY = shot.target.y
  }
  const deltaX = shot.targetX - shot.x
  const deltaY = shot.targetY - shot.y
  const distance = Math.hypot(deltaX, deltaY)
  const travelDistance = shot.speed * dt
  if (distance > travelDistance) {
    shot.x += (deltaX / distance) * travelDistance
    shot.y += (deltaY / distance) * travelDistance
    shot.angle = Math.atan2(deltaY, deltaX)
    return
  }

  // Долетел
  shot.isDone = true
  if (shot.splashRadius > 0) {
    for (const enemy of world.state.enemies) {
      if (enemy.isDead) continue
      const distance = Math.hypot(enemy.x - shot.targetX, enemy.y - shot.targetY)
      if (distance <= shot.splashRadius + enemy.def.radius * SPLASH_ENEMY_RADIUS_SHARE) {
        const fraction = Math.min(1, distance / shot.splashRadius)
        const damageShare = 1 - (1 - shot.splashEdgeDamageShare) * fraction
        hitWithShot(world, shot, enemy, damageShare)
      }
    }
    // Сеть падает, а не взрывается — у неё своё событие и своя картинка
    const area = { x: shot.targetX, y: shot.targetY, radius: shot.splashRadius }
    if (shot.mageAspect === 'boiling-oil') {
      const puddles = world.state.oilPuddles
      const existing = puddles.find(
        (puddle) => puddle.x === area.x && puddle.y === area.y && puddle.radius === area.radius,
      )
      if (existing) existing.timeLeft = BOILING_OIL.puddleDuration
      else
        puddles.push({
          ...area,
          pathDistance: shot.target.pathDistance,
          timeLeft: BOILING_OIL.puddleDuration,
        })
    }
    if (shot.rootDuration > 0) world.emit('net', area)
    else world.emit('splash', { ...area, look: shot.look })
  } else if (!shot.target.isDead) {
    hitWithShot(world, shot, shot.target)
  }
}

/** Всё, что снаряд делает с врагом при попадании: урон, огонь, сеть */
function hitWithShot(world: World, shot: HomingShot, enemy: Enemy, damageShare = 1): void {
  // Сеть не ранит: без этой проверки броня превратила бы урон 0 в 1 (Math.max(1, …))
  if (shot.damage > 0) damageEnemy(world, enemy, shot.damage * damageShare, shot.damageKind)
  if (shot.mageAspect === 'boiling-oil') enemy.oilTimeLeft = BOILING_OIL.coatDuration
  igniteEnemy(world, enemy, shot)
  rootEnemy(enemy, shot.rootDuration)
}

/**
 * Поджечь врага. Поджоги двух специализаций совместимы. Остальные конкурируют по урону в секунду.
 * Огонь растапливает лёд (замедление снимается, а огня — меньше, см. THAW_BURN_MULTIPLIER).
 * Пойманный в сеть загорелся — сеть догорает: держит не дольше NET_ON_FIRE_SHARE своего времени
 */
function igniteEnemy(world: World, enemy: Enemy, shot: HomingShot): void {
  const { burnDamage, burnDuration } = shot
  if (enemy.isDead || burnDamage <= 0 || burnDuration <= 0) return
  let burnShare = 1
  if (enemy.slowTimeLeft > 0 && !rewardStats(world.state).iceAndFire) {
    enemy.slowTimeLeft = 0
    enemy.slowFactor = 0
    burnShare = THAW_BURN_MULTIPLIER
    world.emit('thaw', enemy)
  }
  if (enemy.rootTimeLeft > 0) {
    const burningNetTime = Math.min(enemy.rootTimeLeft, enemy.rootDuration * NET_ON_FIRE_SHARE)
    // «Устойчивость» к сетям — по-прежнему ROOT_IMMUNITY_SECONDS после того, как вырвался
    enemy.rootImmunityLeft -= enemy.rootTimeLeft - burningNetTime
    enemy.rootTimeLeft = burningNetTime
  }
  applyBurn(enemy, shot.mageAspect, burnDamage * burnShare, burnDuration)
}

/** Расстояние учитывает край врага. Допуск хода нужен прогнозу для отбора достижимых луж. */
export function withinOilReach(enemy: Enemy, puddle: OilPuddle, travel = 0): boolean {
  const reach = puddle.radius + enemy.def.radius * SPLASH_ENEMY_RADIUS_SHARE + travel
  return (enemy.x - puddle.x) ** 2 + (enemy.y - puddle.y) ** 2 <= reach ** 2
}

/** Действующая часть шага в луже и две секунды покрытия после неё. */
export function coatFromPuddle(enemy: Enemy, puddle: OilPuddle, activeSeconds: number): void {
  if (activeSeconds > 0 && withinOilReach(enemy, puddle)) {
    enemy.oilTimeLeft = Math.max(enemy.oilTimeLeft, activeSeconds + BOILING_OIL.coatDuration)
  }
}

/** Новые враги пачкаются в оставленной луже даже после продажи Огневика. */
export function updateOilPuddles({ state }: World, dt: number): void {
  const puddles = state.oilPuddles
  if (!puddles.length) return
  for (const puddle of puddles) {
    const activeSeconds = Math.min(dt, puddle.timeLeft)
    for (const enemy of state.enemies) {
      if (!enemy.isDead) coatFromPuddle(enemy, puddle, activeSeconds)
    }
    puddle.timeLeft -= dt
  }
  if (puddles.some((puddle) => puddle.timeLeft <= 0)) {
    state.oilPuddles = puddles.filter((puddle) => puddle.timeLeft > 0)
  }
}

/** Горящие враги теряют здоровье: равными долями, так что запас огня догорает ровно к сроку */
export function updateBurning(world: World, dt: number): void {
  const damageMultiplier = rewardStats(world.state).damageMultiplier
  for (const enemy of world.state.enemies) {
    if (enemy.isDead) continue
    const damage = advanceBurning(enemy, dt)
    // Огонь — магия: броня его не режет
    if (damage > 0) loseHp(world, enemy, damage * damageMultiplier)
  }
}
