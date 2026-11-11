// Как выглядит каждая башня. Новая башня в @throne/game → добавь её рисунок сюда.
// Без рисунка башня тоже будет работать — нарисуется простым кружком.

import type { Tower, TowerStats } from '@throne/game'
import type { EffectSink } from './effects'
import { GOLD, PARCHMENT, TOWER_IDLE_AIM_ANGLE, circle, roundedRect } from './shapes'
import type { Canvas2D } from './shapes'

export interface TowerArt {
  /** Нарисовать башню поверх общего постамента. (0, 0) — центр клетки, 1 — размер клетки */
  body(ctx: Canvas2D, aimAngle: number, time: number, isReady: boolean): void
  /** Эффект при выстреле */
  onFire?(effects: EffectSink, tower: Tower, stats: TowerStats): void
}

export const TOWER_ART: Record<string, TowerArt> = {
  archer: {
    body(ctx, aimAngle, _time, isReady) {
      ctx.rotate(aimAngle)
      ctx.fillStyle = '#3f8750'
      circle(ctx, -0.03, 0, 0.18)
      ctx.fill()
      ctx.fillStyle = '#5fae6b'
      circle(ctx, -0.05, 0, 0.12)
      ctx.fill()
      // лук
      ctx.strokeStyle = '#d6ab6c'
      ctx.lineWidth = 0.05
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(0.02, 0, 0.25, -1.15, 1.15)
      ctx.stroke()
      // тетива и стрела
      ctx.strokeStyle = PARCHMENT
      ctx.lineWidth = 0.02
      const bowTipX = 0.02 + Math.cos(1.15) * 0.25
      const bowTipY = Math.sin(1.15) * 0.25
      ctx.beginPath()
      ctx.moveTo(bowTipX, -bowTipY)
      ctx.lineTo(isReady ? -0.02 : bowTipX, 0)
      ctx.lineTo(bowTipX, bowTipY)
      ctx.stroke()
      if (isReady) {
        ctx.lineWidth = 0.03
        ctx.beginPath()
        ctx.moveTo(-0.02, 0)
        ctx.lineTo(0.3, 0)
        ctx.stroke()
      }
    },
  },

  mage: {
    body(ctx, _aimAngle, time) {
      ctx.fillStyle = '#a34a1e'
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2
        const radius = i % 2 ? 0.12 : 0.25
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#d9702e'
      circle(ctx, 0, 0, 0.14)
      ctx.fill()
      const pulse = 0.5 + 0.5 * Math.sin(time * 5)
      ctx.fillStyle = `rgba(255,190,90,${0.25 + pulse * 0.25})`
      circle(ctx, 0, 0, 0.12 + pulse * 0.03)
      ctx.fill()
      ctx.fillStyle = '#ffd98a'
      circle(ctx, 0, 0, 0.07)
      ctx.fill()
    },
  },

  frost: {
    body(ctx, _aimAngle, time) {
      ctx.rotate(time * 0.5)
      ctx.strokeStyle = '#cdeffc'
      ctx.lineWidth = 0.05
      ctx.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(0.25, 0)
        ctx.moveTo(0.16, 0)
        ctx.lineTo(0.22, 0.06)
        ctx.moveTo(0.16, 0)
        ctx.lineTo(0.22, -0.06)
        ctx.stroke()
      }
      ctx.fillStyle = '#8fd8ee'
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3
        ctx.lineTo(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1)
      }
      ctx.closePath()
      ctx.fill()
    },
    onFire(effects, tower, stats) {
      effects.add({
        kind: 'ring',
        x: tower.x,
        y: tower.y,
        startRadius: 0.25,
        endRadius: stats.range,
        timeLeft: 0.45,
        duration: 0.45,
      })
    },
  },

  ballista: {
    body(ctx, aimAngle, _time, isReady) {
      ctx.rotate(aimAngle)
      ctx.fillStyle = '#8a5d30'
      roundedRect(ctx, -0.24, -0.06, 0.5, 0.12, 0.03)
      ctx.fill()
      ctx.strokeStyle = '#c08a4c'
      ctx.lineWidth = 0.065
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0.08, -0.3)
      ctx.quadraticCurveTo(0.3, 0, 0.08, 0.3)
      ctx.stroke()
      ctx.strokeStyle = PARCHMENT
      ctx.lineWidth = 0.02
      ctx.beginPath()
      ctx.moveTo(0.08, -0.3)
      ctx.lineTo(isReady ? -0.16 : 0.1, 0)
      ctx.lineTo(0.08, 0.3)
      ctx.stroke()
      if (isReady) {
        ctx.strokeStyle = '#dfe5f2'
        ctx.lineWidth = 0.045
        ctx.beginPath()
        ctx.moveTo(-0.16, 0)
        ctx.lineTo(0.32, 0)
        ctx.stroke()
        ctx.fillStyle = '#dfe5f2'
        ctx.beginPath()
        ctx.moveTo(0.4, 0)
        ctx.lineTo(0.3, -0.055)
        ctx.lineTo(0.3, 0.055)
        ctx.closePath()
        ctx.fill()
      }
    },
  },
}

const FALLBACK_TOWER_ART: TowerArt = {
  body(ctx) {
    ctx.fillStyle = '#c9c2ae'
    circle(ctx, 0, 0, 0.18)
    ctx.fill()
  },
}

/** Башня целиком: тень, постамент, сама башня, золотые точки ступени */
export function drawTower(
  ctx: Canvas2D,
  towerId: string,
  tier: number,
  aimAngle: number,
  time: number,
  isReady: boolean,
) {
  ctx.fillStyle = 'rgba(8,9,18,.45)'
  circle(ctx, 0, 0.05, 0.39)
  ctx.fill()
  ctx.fillStyle = '#5a6186'
  circle(ctx, 0, 0, 0.37)
  ctx.fill()
  ctx.fillStyle = '#3b4162'
  circle(ctx, 0, 0, 0.3)
  ctx.fill()

  const art = TOWER_ART[towerId] ?? FALLBACK_TOWER_ART
  ctx.save()
  art.body(ctx, aimAngle, time, isReady)
  ctx.restore()

  ctx.fillStyle = GOLD
  for (let i = 0; i <= tier; i++) {
    circle(ctx, (i - tier / 2) * 0.13, 0.32, 0.042)
    ctx.fill()
  }
}

// Масштаб и центр рисунка на холсте 96×96: башня размером в 1 клетку занимает 104 px,
// её центр стоит в точке (48, 46) px
const ICON_SCALE = 104
const ICON_CENTER_X = 48
const ICON_CENTER_Y = 46

/** Иконка башни для карточки магазина (canvas 96×96) */
export function drawTowerIcon(canvas: HTMLCanvasElement, towerId: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(ICON_SCALE, 0, 0, ICON_SCALE, ICON_CENTER_X, ICON_CENTER_Y)
  drawTower(ctx, towerId, 0, TOWER_IDLE_AIM_ANGLE, 0, true)
}
