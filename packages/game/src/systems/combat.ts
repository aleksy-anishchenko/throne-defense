// Урон, снаряды и «выстрелы-ауры». Башни (data/towers.ts) собираются из этих кирпичиков.

import { SCORE } from '../data/balance.ts'
import type { DamageKind, Enemy, Tower, TowerStats, World } from '../types.ts'

/** Нанести урон врагу с учётом брони. Если враг погиб — награда и событие kill */
export function hurt(w: World, e: Enemy, dmg: number, kind: DamageKind): void {
  if (e.dead) return
  let v = dmg
  if (kind === 'phys') v = Math.max(1, dmg - e.def.armor)
  else if (kind === 'pierce') v = Math.max(1, dmg - e.def.armor * 0.5)
  e.hp -= v
  w.emit('hit', e)
  if (e.hp <= 0) {
    const s = w.state
    e.dead = true
    s.gold += e.def.reward
    s.score += e.def.reward * SCORE.perGold
    s.kills++
    w.emit('kill', e)
  }
}

/** Снаряд, который летит за целью. С splash > 0 взрывается и бьёт всех вокруг */
export function shootHoming(
  w: World,
  t: Tower,
  target: Enemy,
  o: { look: string; speed: number; dmg: number; damage: DamageKind; splash?: number },
): void {
  w.state.shots.push({
    kind: 'homing',
    look: o.look,
    x: t.x,
    y: t.y,
    aim: t.aim,
    target,
    tx: target.x,
    ty: target.y,
    speed: o.speed,
    dmg: o.dmg,
    damage: o.damage,
    splash: o.splash ?? 0,
    done: false,
  })
}

/** Снаряд, который летит по прямой на `reach` клеток и пробивает `pierce` врагов */
export function shootLine(
  w: World,
  t: Tower,
  target: Enemy,
  o: {
    look: string
    speed: number
    dmg: number
    damage: DamageKind
    pierce: number
    reach: number
  },
): void {
  const dist = Math.hypot(target.x - t.x, target.y - t.y) || 1
  w.state.shots.push({
    kind: 'line',
    look: o.look,
    x: t.x,
    y: t.y,
    aim: t.aim,
    dx: (target.x - t.x) / dist,
    dy: (target.y - t.y) / dist,
    speed: o.speed,
    left: o.reach,
    dmg: o.dmg,
    damage: o.damage,
    pierce: o.pierce,
    hit: new Set(),
    done: false,
  })
}

/** Волна холода: замедляет и ранит всех в радиусе башни */
export function frostPulse(w: World, t: Tower, s: TowerStats): void {
  const slow = s.slow ?? 0
  const dur = s.dur ?? 0
  const r2 = s.range * s.range
  for (const e of w.state.enemies) {
    if (e.dead || (e.x - t.x) ** 2 + (e.y - t.y) ** 2 > r2) continue
    const f = slow * (1 - (e.def.slowResist ?? 0))
    e.slowF = e.slowT > 0 ? Math.max(e.slowF, f) : f
    e.slowT = Math.max(e.slowT, dur)
    hurt(w, e, s.dmg, 'magic')
  }
}

/** Расстояние от точки P до отрезка AB */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let f = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  f = Math.max(0, Math.min(1, f))
  return Math.hypot(px - ax - dx * f, py - ay - dy * f)
}

/** Сдвинуть все снаряды на dt секунд и нанести урон тем, в кого попали */
export function updateShots(w: World, dt: number): void {
  const { enemies } = w.state

  for (const s of w.state.shots) {
    if (s.kind === 'line') {
      const mv = Math.min(s.speed * dt, s.left)
      const nx = s.x + s.dx * mv
      const ny = s.y + s.dy * mv
      for (const e of enemies) {
        if (e.dead || s.hit.has(e)) continue
        if (distToSegment(e.x, e.y, s.x, s.y, nx, ny) <= e.def.r + 0.1) {
          s.hit.add(e)
          hurt(w, e, s.dmg, s.damage)
          if (--s.pierce <= 0) {
            s.done = true
            break
          }
        }
      }
      s.x = nx
      s.y = ny
      s.left -= mv
      if (s.left <= 0) s.done = true
      continue
    }

    // Снаряд за целью: пока цель жива — следим за ней
    if (!s.target.dead) {
      s.tx = s.target.x
      s.ty = s.target.y
    }
    const dx = s.tx - s.x
    const dy = s.ty - s.y
    const dist = Math.hypot(dx, dy)
    const mv = s.speed * dt
    if (dist > mv) {
      s.x += (dx / dist) * mv
      s.y += (dy / dist) * mv
      s.aim = Math.atan2(dy, dx)
      continue
    }

    // Долетел
    s.done = true
    if (s.splash > 0) {
      for (const e of enemies) {
        if (!e.dead && Math.hypot(e.x - s.tx, e.y - s.ty) <= s.splash + e.def.r * 0.5) {
          hurt(w, e, s.dmg, s.damage)
        }
      }
      w.emit('splash', { x: s.tx, y: s.ty, radius: s.splash })
    } else if (!s.target.dead) {
      hurt(w, s.target, s.dmg, s.damage)
    }
  }
}
