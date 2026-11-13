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

/** Ядро: радиус, клеток */
const CANNONBALL_RADIUS = 0.125
/** Клубы дыма за ядром: [на сколько позади — в долях радиуса, размер — в долях радиуса, прозрачность] */
const CANNON_SMOKE_PUFFS: readonly (readonly [number, number, number])[] = [
  [1.6, 0.75, 0.5],
  [2.8, 0.6, 0.35],
  [3.9, 0.45, 0.2],
]

/**
 * Ядро Пушкаря: чугунный шар со светлой обводкой (на тёмном полу не теряется), бликом
 * и клубами дыма позади. Повёрнуто по направлению полёта, как фаербол
 */
function drawCannonball(ctx: Canvas2D, shot: Shot) {
  const radius = CANNONBALL_RADIUS
  ctx.translate(shot.x, shot.y)
  ctx.rotate(shot.angle)
  // Дым позади — клубы чуть колышутся поперёк полёта
  const phase = shot.x * 9 + shot.y * 9
  CANNON_SMOKE_PUFFS.forEach(([behind, size, alpha], i) => {
    const sway = prefersReducedMotion ? 0 : Math.sin(phase + i * 1.9) * radius * 0.25
    ctx.fillStyle = `rgba(205,198,185,${alpha})`
    circle(ctx, -behind * radius, sway, size * radius)
    ctx.fill()
  })
  // Шар: тёмный чугун, светлая обводка
  ctx.fillStyle = '#515767'
  ctx.strokeStyle = 'rgba(214,220,232,.85)'
  ctx.lineWidth = 0.02
  circle(ctx, 0, 0, radius)
  ctx.fill()
  ctx.stroke()
  // Тень снизу и блик сверху — шар выглядит объёмным. Блик не крутится вместе с ядром
  ctx.rotate(-shot.angle)
  ctx.fillStyle = 'rgba(10,11,16,.45)'
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.85, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.55)'
  circle(ctx, -radius * 0.35, -radius * 0.35, radius * 0.28)
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
  // Пушкарь: чугунное ядро с дымным следом
  cannonball: drawCannonball,
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
