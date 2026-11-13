// Урон, снаряды и «выстрелы-ауры». Башни (data/towers.ts) собираются из этих кирпичиков.

import { SCORE } from '../data/balance.ts'
import type { DamageKind, Enemy, HomingShot, LineShot, Tower, TowerStats, World } from '../types.ts'
import { queueSplit } from './enemies.ts'

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

/** Какую долю радиуса врага добавляем к радиусу взрыва, в долях радиуса (0.5 = половину) */
const SPLASH_ENEMY_RADIUS_SHARE = 0.5

/**
 * Сколько секунд после сети враг рвёт новые сети сразу. Без этого несколько Ловчих бросали бы
 * сети по очереди, и волна стояла бы на месте вечно
 */
export const ROOT_IMMUNITY_SECONDS = 2

/** Настройки снаряда, который летит за целью */
export interface HomingShotOptions {
  /** Как рисовать снаряд: 'arrow' | 'orb' | 'bolt' | 'twinBolt' (см. SHOT_ART в apps/web) */
  look: string
  /** Скорость полёта, клеток в секунду */
  speed: number
  damage: number
  damageKind: DamageKind
  /** Радиус взрыва в клетках; без него снаряд бьёт только цель */
  splashRadius?: number
  /** Сколько урона добавить горением каждому, кого задел; без него не поджигает */
  burnDamage?: number
  /** За сколько секунд догорает поджог */
  burnDuration?: number
  /** Сеть: сколько секунд держит всех, кого накрыла (вместе с splashRadius — радиус сети) */
  rootDuration?: number
}

/** Настройки снаряда, который летит по прямой */
export interface LineShotOptions {
  /** Как рисовать снаряд: 'arrow' | 'orb' | 'bolt' | 'twinBolt' (см. SHOT_ART в apps/web) */
  look: string
  /** Скорость полёта, клеток в секунду */
  speed: number
  damage: number
  damageKind: DamageKind
  /** Сколько врагов снаряд пробивает насквозь */
  pierceCount: number
  /** Сколько клеток снаряд пролетит, прежде чем исчезнуть */
  maxDistance: number
}

/** Нанести урон врагу с учётом брони. Если враг погиб — награда и событие kill */
export function damageEnemy(
  world: World,
  enemy: Enemy,
  damage: number,
  damageKind: DamageKind,
): void {
  if (enemy.isDead) return
  let effectiveDamage = damage
  if (damageKind === 'physical') effectiveDamage = Math.max(1, damage - enemy.def.armor)
  else if (damageKind === 'piercing')
    effectiveDamage = Math.max(1, damage - enemy.def.armor * PIERCING_ARMOR_FACTOR)
  world.emit('hit', enemy)
  loseHp(world, enemy, effectiveDamage)
}

/**
 * Отнять здоровье без брони и без события hit (его слушает белая вспышка: горение
 * мигало бы врагом каждый кадр). Если враг погиб — награда, распад и событие kill
 */
function loseHp(world: World, enemy: Enemy, amount: number): void {
  // Проклятие Колдуна: весь урон — от стрел, огня, пара — больше
  const curseMultiplier = enemy.curseTimeLeft > 0 ? 1 + enemy.curseAmount : 1
  enemy.hp -= amount * curseMultiplier
  if (enemy.hp <= 0) {
    const state = world.state
    enemy.isDead = true
    state.gold += enemy.def.reward
    state.score += enemy.def.reward * SCORE.perGold
    state.kills++
    queueSplit(world, enemy)
    world.emit('kill', enemy)
  }
}

/** Снаряд, который летит за целью. С splashRadius > 0 взрывается и бьёт всех вокруг */
export function shootHoming(
  world: World,
  tower: Tower,
  target: Enemy,
  options: HomingShotOptions,
): void {
  world.state.shots.push({
    kind: 'homing',
    look: options.look,
    x: tower.x,
    y: tower.y,
    angle: tower.aimAngle,
    target,
    targetX: target.x,
    targetY: target.y,
    speed: options.speed,
    damage: options.damage,
    damageKind: options.damageKind,
    splashRadius: options.splashRadius ?? 0,
    burnDamage: options.burnDamage ?? 0,
    burnDuration: options.burnDuration ?? 0,
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
    piercesLeft: options.pierceCount,
    hitEnemies: new Set(),
    isDone: false,
  })
}

/** Волна холода: замедляет и ранит всех в радиусе башни, а горящих — тушит паром */
export function frostPulse(world: World, tower: Tower, stats: TowerStats): void {
  const slowAmount = stats.slowAmount ?? 0
  const slowDuration = stats.slowDuration ?? 0
  const rangeSquared = stats.range * stats.range
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > rangeSquared) continue
    const slowFactor = slowAmount * (1 - (enemy.def.slowResistance ?? 0))
    // Если враг уже замедлен — оставляем более сильное замедление; если прежнее замедление
    // кончилось — берём новое как есть. (Сила и длительность обновляются по отдельности —
    // так было в оригинале, баланс настроен с этим.)
    enemy.slowFactor = enemy.slowTimeLeft > 0 ? Math.max(enemy.slowFactor, slowFactor) : slowFactor
    enemy.slowTimeLeft = Math.max(enemy.slowTimeLeft, slowDuration)
    damageEnemy(world, enemy, stats.damage, 'magic')
    if (enemy.burnDamageLeft > 0 && !enemy.isDead) extinguishWithSteam(world, enemy)
  }
}

/**
 * Проклятие Колдуна: все в радиусе башни какое-то время получают больше урона.
 * Несколько Колдунов не складываются — действует самое сильное проклятие (как у Звонаря)
 */
export function cursePulse(world: World, tower: Tower, stats: TowerStats): void {
  const curseAmount = stats.curseAmount ?? 0
  const curseDuration = stats.curseDuration ?? 0
  const rangeSquared = stats.range * stats.range
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2 > rangeSquared) continue
    enemy.curseAmount =
      enemy.curseTimeLeft > 0 ? Math.max(enemy.curseAmount, curseAmount) : curseAmount
    enemy.curseTimeLeft = Math.max(enemy.curseTimeLeft, curseDuration)
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
  const rootTime = enemy.burnTimeLeft > 0 ? fullTime * NET_ON_FIRE_SHARE : fullTime
  enemy.rootDuration = fullTime
  enemy.rootTimeLeft = rootTime
  enemy.rootImmunityLeft = rootTime + ROOT_IMMUNITY_SECONDS
}

/** «Пар»: волна холода тушит горящего врага — огонь погас, остаток огня пропадает */
function extinguishWithSteam(world: World, enemy: Enemy): void {
  enemy.burnDamageLeft = 0
  enemy.burnTimeLeft = 0
  world.emit('steam', { x: enemy.x, y: enemy.y })
}

/**
 * Расстояние от точки P (px, py) до отрезка AB (ax, ay — начало, bx, by — конец).
 * Названия px/py/ax/ay/bx/by — обычные в геометрии.
 */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const segmentX = bx - ax
  const segmentY = by - ay
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
  // Где на отрезке ближайшая к P точка: 0 — это A, 1 — это B
  let along = segmentLengthSquared
    ? ((px - ax) * segmentX + (py - ay) * segmentY) / segmentLengthSquared
    : 0
  along = Math.max(0, Math.min(1, along))
  return Math.hypot(px - ax - segmentX * along, py - ay - segmentY * along)
}

/** Сдвинуть все снаряды на dt секунд и нанести урон тем, в кого попали */
export function updateShots(world: World, dt: number): void {
  for (const shot of world.state.shots) {
    if (shot.kind === 'line') updateLineShot(world, shot, dt)
    else updateHomingShot(world, shot, dt)
  }
}

/** Снаряд по прямой: бьёт всех, кого задел на этом шаге, пока не кончатся пробития или дальность */
function updateLineShot(world: World, shot: LineShot, dt: number): void {
  const travelDistance = Math.min(shot.speed * dt, shot.distanceLeft)
  const newX = shot.x + shot.directionX * travelDistance
  const newY = shot.y + shot.directionY * travelDistance
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || shot.hitEnemies.has(enemy)) continue
    if (
      distanceToSegment(enemy.x, enemy.y, shot.x, shot.y, newX, newY) <=
      enemy.def.radius + LINE_SHOT_HIT_MARGIN
    ) {
      shot.hitEnemies.add(enemy)
      damageEnemy(world, enemy, shot.damage, shot.damageKind)
      shot.piercesLeft--
      if (shot.piercesLeft <= 0) {
        shot.isDone = true
        break
      }
    }
  }
  shot.x = newX
  shot.y = newY
  shot.distanceLeft -= travelDistance
  if (shot.distanceLeft <= 0) shot.isDone = true
}

/** Снаряд за целью: летит к ней, а долетев — бьёт цель или взрывается */
function updateHomingShot(world: World, shot: HomingShot, dt: number): void {
  // Пока цель жива — следим за ней
  if (!shot.target.isDead) {
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
      if (
        !enemy.isDead &&
        Math.hypot(enemy.x - shot.targetX, enemy.y - shot.targetY) <=
          shot.splashRadius + enemy.def.radius * SPLASH_ENEMY_RADIUS_SHARE
      ) {
        hitWithShot(world, shot, enemy)
      }
    }
    // Сеть падает, а не взрывается — у неё своё событие и своя картинка
    const area = { x: shot.targetX, y: shot.targetY, radius: shot.splashRadius }
    if (shot.rootDuration > 0) world.emit('net', area)
    else world.emit('splash', { ...area, look: shot.look })
  } else if (!shot.target.isDead) {
    hitWithShot(world, shot, shot.target)
  }
}

/** Всё, что снаряд делает с врагом при попадании: урон, огонь, сеть */
function hitWithShot(world: World, shot: HomingShot, enemy: Enemy): void {
  // Сеть не ранит: без этой проверки броня превратила бы урон 0 в 1 (Math.max(1, …))
  if (shot.damage > 0) damageEnemy(world, enemy, shot.damage, shot.damageKind)
  igniteEnemy(world, enemy, shot.burnDamage, shot.burnDuration)
  rootEnemy(enemy, shot.rootDuration)
}

/**
 * Поджечь врага: добавить burnDamage в запас огня. Догорает весь запас за burnDuration
 * (если враг уже горит дольше — за оставшееся время).
 * Огонь растапливает лёд (замедление снимается, а огня — меньше, см. THAW_BURN_MULTIPLIER).
 * Пойманный в сеть загорелся — сеть догорает: держит не дольше NET_ON_FIRE_SHARE своего времени
 */
function igniteEnemy(world: World, enemy: Enemy, burnDamage: number, burnDuration: number): void {
  if (enemy.isDead || burnDamage <= 0 || burnDuration <= 0) return
  let burnShare = 1
  if (enemy.slowTimeLeft > 0) {
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
  enemy.burnDamageLeft += burnDamage * burnShare
  enemy.burnTimeLeft = Math.max(enemy.burnTimeLeft, burnDuration)
}

/** Горящие враги теряют здоровье: равными долями, так что запас огня догорает ровно к сроку */
export function updateBurning(world: World, dt: number): void {
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || enemy.burnTimeLeft <= 0) continue
    const share = Math.min(1, dt / enemy.burnTimeLeft)
    const burnDamage = enemy.burnDamageLeft * share
    enemy.burnDamageLeft -= burnDamage
    enemy.burnTimeLeft -= dt
    if (enemy.burnTimeLeft <= 0) {
      enemy.burnTimeLeft = 0
      enemy.burnDamageLeft = 0
    }
    // Огонь — магия: броня его не режет
    loseHp(world, enemy, burnDamage)
  }
}
