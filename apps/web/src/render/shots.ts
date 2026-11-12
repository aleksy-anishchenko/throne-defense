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

/** На сколько клеток раздвинуты болты баллисты III — в полёте и заряженные на ложе */
export const TWIN_BOLT_OFFSET = 0.045

const BOLT_LENGTH = 0.5
const BOLT_COLOR = '#dfe5f2'
const BOLT_WIDTH = 0.055

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
  const drawLook = SHOT_ART[shot.look] ?? SHOT_ART['arrow']
  // save/restore: рисунок снаряда меняет настройки кисти (скруглённые концы линий),
  // и без этого они «протекали» бы на то, что рисуется после, — например, на пунктир дальности
  ctx.save()
  drawLook(ctx, shot)
  ctx.restore()
}
