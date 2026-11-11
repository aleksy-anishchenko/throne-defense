// Как выглядят снаряды. Ключ — поле `look`, которое задаёт башня при выстреле.

import type { Shot } from '@throne/game'
import { PARCHMENT, circle, type Canvas2D } from './shapes'

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

const SHOT_ART: Record<string, (ctx: Canvas2D, shot: Shot) => void> = {
  arrow: (ctx, shot) => drawStreak(ctx, shot, 0.24, PARCHMENT, 0.035),
  bolt: (ctx, shot) => drawStreak(ctx, shot, 0.5, '#dfe5f2', 0.055),
  orb(ctx, shot) {
    ctx.fillStyle = 'rgba(255,140,40,.35)'
    circle(ctx, shot.x, shot.y, 0.17)
    ctx.fill()
    ctx.fillStyle = '#ffc266'
    circle(ctx, shot.x, shot.y, 0.09)
    ctx.fill()
  },
}

export function drawShot(ctx: Canvas2D, shot: Shot): void {
  // Неизвестный вид снаряда рисуем как стрелу
  const drawLook = SHOT_ART[shot.look] ?? SHOT_ART.arrow
  drawLook(ctx, shot)
}
