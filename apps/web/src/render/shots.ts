// Как выглядят снаряды. Ключ — поле `look`, которое задаёт башня при выстреле.

import type { Shot } from '@throne/game'
import { PARCH, circle } from './shapes'

type Ctx = CanvasRenderingContext2D

function streak(c: Ctx, s: Shot, len: number, color: string, width: number) {
  c.strokeStyle = color
  c.lineWidth = width
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(s.x - Math.cos(s.aim) * len, s.y - Math.sin(s.aim) * len)
  c.lineTo(s.x, s.y)
  c.stroke()
}

const SHOT_ART: Record<string, (c: Ctx, s: Shot) => void> = {
  arrow: (c, s) => streak(c, s, 0.24, PARCH, 0.035),
  bolt: (c, s) => streak(c, s, 0.5, '#dfe5f2', 0.055),
  orb(c, s) {
    c.fillStyle = 'rgba(255,140,40,.35)'
    circle(c, s.x, s.y, 0.17)
    c.fill()
    c.fillStyle = '#ffc266'
    circle(c, s.x, s.y, 0.09)
    c.fill()
  },
}

export function drawShot(c: Ctx, s: Shot): void {
  ;(SHOT_ART[s.look] ?? SHOT_ART.arrow)(c, s)
}
