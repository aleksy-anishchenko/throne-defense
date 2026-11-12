// Урон, снаряды и «выстрелы-ауры». Башни (data/towers.ts) собираются из этих кирпичиков.

import { SCORE } from '../data/balance.ts'
import type { DamageKind, Enemy, HomingShot, LineShot, Tower, TowerStats, World } from '../types.ts'
import { queueSplit } from './enemies.ts'

/** Какая доля брони врага всё ещё режет пробивающий урон (0.5 = половина брони; физический урон режется всей бронёй, магический — не режется вовсе) */
const PIERCING_ARMOR_FACTOR = 0.5

/** Запас на попадание для снаряда, летящего по прямой (болт баллисты), в клетках: чуть щедрее радиуса врага */
const LINE_SHOT_HIT_MARGIN = 0.1

/** Какую долю радиуса врага добавляем к радиусу взрыва, в долях радиуса (0.5 = половину) */
const SPLASH_ENEMY_RADIUS_SHARE = 0.5

/** Настройки снаряда, который летит за целью */
export interface HomingShotOptions {
  /** Как рисовать снаряд: 'arrow' | 'orb' | 'bolt' */
  look: string
  /** Скорость полёта, клеток в секунду */
  speed: number
  damage: number
  damageKind: DamageKind
  /** Радиус взрыва в клетках; без него снаряд бьёт только цель */
  splashRadius?: number
}

/** Настройки снаряда, который летит по прямой */
export interface LineShotOptions {
  /** Как рисовать снаряд: 'arrow' | 'orb' | 'bolt' */
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
  enemy.hp -= effectiveDamage
  world.emit('hit', enemy)
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

/** Волна холода: замедляет и ранит всех в радиусе башни */
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
  }
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
        damageEnemy(world, enemy, shot.damage, shot.damageKind)
      }
    }
    world.emit('splash', { x: shot.targetX, y: shot.targetY, radius: shot.splashRadius })
  } else if (!shot.target.isDead) {
    damageEnemy(world, shot.target, shot.damage, shot.damageKind)
  }
}
