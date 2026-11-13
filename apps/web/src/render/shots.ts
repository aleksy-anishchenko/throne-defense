// Как выглядят снаряды. Ключ — поле `look`, которое задаёт башня при выстреле.

import type { Shot } from '@throne/game'
import { PARCHMENT, circle, drawNet, prefersReducedMotion, type Canvas2D } from './shapes'
import { FIRE_CORE, FIRE_MIDDLE, FIRE_OUTER, FIRE_OUTLINE } from './statuses'

/** Штрих-«хвост» за снарядом: от точки позади до самого снаряда (длина и толщина — в клетках) */
function drawStreak(ctx: Canvas2D, shot: Shot, length: number, color: string, lineWidth: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(shot.x - Math.cos(shot.angle) * length, shot.y - Math.sin(shot.angle) * length)
  ctx.lineTo(shot.x, shot.y)
  ctx.stroke()
}

/** На сколько клеток раздвинуты болты баллисты III — в полёте и заряженные на ложе */
export const TWIN_BOLT_OFFSET = 0.045

const BOLT_LENGTH = 0.5
const BOLT_COLOR = '#dfe5f2'
const BOLT_WIDTH = 0.055

/** Фаербол: радиус головы и длина хвоста, клеток */
const FIREBALL_RADIUS = 0.11
const FIREBALL_TAIL = 0.4

/**
 * Путь-капля: круглая голова радиусом radius в (0, 0) и хвост длиной tail назад, по оси -x.
 * wobble — насколько кончик хвоста качнулся вбок (в долях радиуса): пламя «пляшет» в полёте
 */
function fireballPath(ctx: Canvas2D, radius: number, tail: number, wobble: number) {
  ctx.beginPath()
  ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2)
  ctx.quadraticCurveTo(-tail * 0.45, radius * 1.05, -tail, wobble * radius)
  ctx.quadraticCurveTo(-tail * 0.45, -radius * 1.05, 0, -radius)
  ctx.closePath()
}

/**
 * Фаербол Огневика: те же цвета и тёмная обводка, что у пламени на горящем враге
 * (statuses.ts) — видно, что это тот самый огонь. Повёрнут по направлению полёта
 */
function drawFireball(ctx: Canvas2D, shot: Shot) {
  // Мерцание — от места в полёте (у снаряда нет своих часов), как вращение сети
  const phase = shot.x * 9 + shot.y * 9
  const flicker = prefersReducedMotion ? 1 : 0.85 + 0.15 * Math.sin(phase * 2.3)
  const wobble = prefersReducedMotion ? 0 : 0.5 * Math.sin(phase)
  ctx.translate(shot.x, shot.y)
  ctx.rotate(shot.angle)
  // мягкое свечение вокруг
  ctx.fillStyle = 'rgba(255,130,40,.28)'
  circle(ctx, 0, 0, FIREBALL_RADIUS * 1.9)
  ctx.fill()
  ctx.lineJoin = 'round'
  fireballPath(ctx, FIREBALL_RADIUS, FIREBALL_TAIL * flicker, wobble)
  ctx.fillStyle = FIRE_OUTER
  ctx.fill()
  ctx.strokeStyle = FIRE_OUTLINE
  ctx.lineWidth = 0.022
  ctx.stroke()
  fireballPath(ctx, FIREBALL_RADIUS * 0.7, FIREBALL_TAIL * 0.6 * flicker, wobble * 0.6)
  ctx.fillStyle = FIRE_MIDDLE
  ctx.fill()
  ctx.fillStyle = FIRE_CORE
  circle(ctx, FIREBALL_RADIUS * 0.15, 0, FIREBALL_RADIUS * 0.45)
  ctx.fill()
}

const SHOT_ART: Record<string, (ctx: Canvas2D, shot: Shot) => void> = {
  arrow: (ctx, shot) => drawStreak(ctx, shot, 0.24, PARCHMENT, 0.035),
  bolt: (ctx, shot) => drawStreak(ctx, shot, BOLT_LENGTH, BOLT_COLOR, BOLT_WIDTH),
  // Баллиста III: два болта рядом. В логике снаряд один — сдвигаем рисунок поперёк полёта
  twinBolt(ctx, shot) {
    const acrossX = -Math.sin(shot.angle) * TWIN_BOLT_OFFSET
    const acrossY = Math.cos(shot.angle) * TWIN_BOLT_OFFSET
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(acrossX * side, acrossY * side)
      drawStreak(ctx, shot, BOLT_LENGTH, BOLT_COLOR, BOLT_WIDTH * 0.85)
      ctx.restore()
    }
  },
  // Сеть Ловчего летит, раскручиваясь
  net(ctx, shot) {
    const spin = prefersReducedMotion ? 0 : shot.x * 4 + shot.y * 4
    drawNet(ctx, shot.x, shot.y, 0.17, spin, '#a9b4c6')
  },
  // Ядро Пушкаря: тёмный шар с бликом и дымным следом
  cannonball(ctx, shot) {
    drawStreak(ctx, shot, 0.3, 'rgba(200,195,185,.45)', 0.08)
    ctx.fillStyle = '#23252f'
    circle(ctx, shot.x, shot.y, 0.085)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.35)'
    circle(ctx, shot.x - 0.025, shot.y - 0.025, 0.03)
    ctx.fill()
  },
  // Огневик: фаербол — огненный шар с языками пламени, тянущимися назад
  orb: drawFireball,
}

export function drawShot(ctx: Canvas2D, shot: Shot): void {
  // Неизвестный вид снаряда рисуем как стрелу
  const drawLook = SHOT_ART[shot.look] ?? SHOT_ART['arrow']
  // save/restore: рисунок снаряда меняет настройки кисти (скруглённые концы линий),
  // и без этого они «протекали» бы на то, что рисуется после, — например, на пунктир дальности
  ctx.save()
  drawLook(ctx, shot)
  ctx.restore()
}
