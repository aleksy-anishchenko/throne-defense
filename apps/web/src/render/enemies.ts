// Как выглядит каждый враг. Новый враг в @throne/game → добавь его рисунок сюда.

import type { Enemy } from '@throne/game'
import { GOLD, circle, reduceMotion } from './shapes'

type Ctx = CanvasRenderingContext2D

export interface EnemyArt {
  /** Нарисовать врага. (0, 0) — центр, r — радиус */
  body(c: Ctx, r: number): void
  /** Цвет искр, когда враг гибнет */
  color: string
  /** Сколько искр */
  sparks: number
  /** Насколько выше врага полоска здоровья */
  barOffset?: number
  /** Рисовать поверх остальных (большие враги) */
  front?: boolean
}

export const ENEMY_ART: Record<string, EnemyArt> = {
  rebel: {
    color: '#c98f55',
    sparks: 5,
    body(c, r) {
      c.fillStyle = '#c98f55'
      c.strokeStyle = '#5a3b1f'
      circle(c, 0, 0, r)
      c.fill()
      c.stroke()
      c.fillStyle = '#7a4f28'
      c.beginPath()
      c.arc(0, 0, r, Math.PI, 0)
      c.closePath()
      c.fill()
      // вилы
      c.strokeStyle = '#d9d2c0'
      c.lineWidth = 0.03
      c.beginPath()
      c.moveTo(0.1, 0.16)
      c.lineTo(0.24, -0.2)
      c.moveTo(0.16, -0.22)
      c.lineTo(0.2, -0.1)
      c.lineTo(0.3, -0.14)
      c.stroke()
      c.fillStyle = '#2a1a0c'
      circle(c, -0.06, 0.05, 0.025)
      c.fill()
      circle(c, 0.05, 0.05, 0.025)
      c.fill()
    },
  },

  scout: {
    color: '#3a8a83',
    sparks: 5,
    body(c, r) {
      c.fillStyle = '#2c6f69'
      c.strokeStyle = '#163d3a'
      circle(c, 0, 0, r)
      c.fill()
      c.stroke()
      // капюшон
      c.fillStyle = '#163d3a'
      c.beginPath()
      c.moveTo(-r, -0.02)
      c.lineTo(0, -r * 1.5)
      c.lineTo(r, -0.02)
      c.closePath()
      c.fill()
      c.fillStyle = '#ffe07a'
      circle(c, -0.05, 0.03, 0.028)
      c.fill()
      circle(c, 0.05, 0.03, 0.028)
      c.fill()
    },
  },

  armor: {
    color: '#a9b4c6',
    sparks: 5,
    body(c, r) {
      c.fillStyle = '#a9b4c6'
      c.strokeStyle = '#4d566a'
      circle(c, 0, 0, r)
      c.fill()
      c.stroke()
      // забрало
      c.fillStyle = '#2a3040'
      c.fillRect(-r * 0.62, -0.04, r * 1.24, 0.07)
      c.fillRect(-0.025, -0.04, 0.05, r * 0.7)
      // плюмаж
      c.fillStyle = '#c0392b'
      c.beginPath()
      c.moveTo(-0.05, -r)
      c.quadraticCurveTo(0, -r - 0.16, 0.09, -r - 0.1)
      c.lineTo(0.05, -r)
      c.closePath()
      c.fill()
    },
  },

  ogre: {
    color: '#86a24e',
    sparks: 10,
    body(c, r) {
      c.fillStyle = '#86a24e'
      c.strokeStyle = '#42541f'
      c.lineWidth = 0.045
      circle(c, 0, 0, r)
      c.fill()
      c.stroke()
      // брови и глаза
      c.fillStyle = '#42541f'
      c.fillRect(-0.17, -0.12, 0.13, 0.04)
      c.fillRect(0.04, -0.12, 0.13, 0.04)
      c.fillStyle = '#1e2a0c'
      circle(c, -0.1, -0.05, 0.035)
      c.fill()
      circle(c, 0.1, -0.05, 0.035)
      c.fill()
      // клыки
      c.fillStyle = '#f1ead6'
      c.beginPath()
      c.moveTo(-0.15, 0.1)
      c.lineTo(-0.11, -0.02)
      c.lineTo(-0.06, 0.1)
      c.closePath()
      c.fill()
      c.beginPath()
      c.moveTo(0.15, 0.1)
      c.lineTo(0.11, -0.02)
      c.lineTo(0.06, 0.1)
      c.closePath()
      c.fill()
    },
  },

  boss: {
    color: '#7a45b8',
    sparks: 22,
    barOffset: 0.32,
    front: true,
    body(c, r) {
      c.fillStyle = '#4a2478'
      circle(c, 0, 0.04, r)
      c.fill()
      c.fillStyle = '#7a45b8'
      c.strokeStyle = '#2f1650'
      c.lineWidth = 0.045
      circle(c, 0, 0, r * 0.8)
      c.fill()
      c.stroke()
      c.fillStyle = '#ff5a4a'
      circle(c, -0.1, 0, 0.04)
      c.fill()
      circle(c, 0.1, 0, 0.04)
      c.fill()
      // корона
      c.fillStyle = GOLD
      c.beginPath()
      c.moveTo(-0.22, -0.2)
      c.lineTo(-0.24, -0.44)
      c.lineTo(-0.11, -0.32)
      c.lineTo(0, -0.48)
      c.lineTo(0.11, -0.32)
      c.lineTo(0.24, -0.44)
      c.lineTo(0.22, -0.2)
      c.closePath()
      c.fill()
    },
  },
}

const FALLBACK: EnemyArt = {
  color: '#d8394a',
  sparks: 5,
  body(c, r) {
    c.fillStyle = '#d8394a'
    circle(c, 0, 0, r)
    c.fill()
  },
}

export const enemyArt = (id: string): EnemyArt => ENEMY_ART[id] ?? FALLBACK

/** Враг целиком: тень, покачивание, сам враг, замедление, вспышка от удара, здоровье */
export function drawEnemy(c: Ctx, e: Enemy, time: number, phase: number, flash: boolean): void {
  const art = enemyArt(e.def.id)
  const r = e.def.r
  const bob = reduceMotion ? 0 : Math.sin(time * 9 * e.def.speed + phase) * 0.02

  c.save()
  c.translate(e.x, e.y + bob)
  c.fillStyle = 'rgba(8,9,18,.35)'
  c.beginPath()
  c.ellipse(0, r * 0.8, r * 0.9, r * 0.35, 0, 0, Math.PI * 2)
  c.fill()

  c.lineWidth = 0.035
  art.body(c, r)

  if (e.slowT > 0) {
    c.strokeStyle = 'rgba(170,230,255,.9)'
    c.lineWidth = 0.04
    circle(c, 0, 0, r + 0.04)
    c.stroke()
  }
  if (flash) {
    c.fillStyle = 'rgba(255,255,255,.55)'
    circle(c, 0, 0, r)
    c.fill()
  }
  if (e.hp < e.maxHp) {
    const w = Math.max(0.36, r * 2)
    const f = Math.max(0, e.hp / e.maxHp)
    const y = -r - (art.barOffset ?? 0.16)
    c.fillStyle = 'rgba(8,9,18,.75)'
    c.fillRect(-w / 2 - 0.015, y - 0.015, w + 0.03, 0.085)
    c.fillStyle = f > 0.5 ? '#7fd16a' : f > 0.25 ? GOLD : '#f0863a'
    c.fillRect(-w / 2, y, w * f, 0.055)
  }
  c.restore()
}
