// Как выглядит каждая башня. Новая башня в @throne/game → добавь её рисунок сюда.
// Без рисунка башня тоже будет работать — нарисуется простым кружком.

import type { Tower, TowerStats } from '@throne/game'
import type { FxApi } from './effects'
import { GOLD, PARCH, circle, rr } from './shapes'

type Ctx = CanvasRenderingContext2D

export interface TowerArt {
  /** Нарисовать башню поверх общего постамента. (0, 0) — центр клетки, 1 — размер клетки */
  body(c: Ctx, aim: number, time: number, ready: boolean): void
  /** Эффект при выстреле */
  onFire?(fx: FxApi, tower: Tower, stats: TowerStats): void
}

export const TOWER_ART: Record<string, TowerArt> = {
  archer: {
    body(c, aim, _time, ready) {
      c.rotate(aim)
      c.fillStyle = '#3f8750'
      circle(c, -0.03, 0, 0.18)
      c.fill()
      c.fillStyle = '#5fae6b'
      circle(c, -0.05, 0, 0.12)
      c.fill()
      // лук
      c.strokeStyle = '#d6ab6c'
      c.lineWidth = 0.05
      c.lineCap = 'round'
      c.beginPath()
      c.arc(0.02, 0, 0.25, -1.15, 1.15)
      c.stroke()
      // тетива и стрела
      c.strokeStyle = PARCH
      c.lineWidth = 0.02
      const bx = 0.02 + Math.cos(1.15) * 0.25
      const by = Math.sin(1.15) * 0.25
      c.beginPath()
      c.moveTo(bx, -by)
      c.lineTo(ready ? -0.02 : bx, 0)
      c.lineTo(bx, by)
      c.stroke()
      if (ready) {
        c.lineWidth = 0.03
        c.beginPath()
        c.moveTo(-0.02, 0)
        c.lineTo(0.3, 0)
        c.stroke()
      }
    },
  },

  mage: {
    body(c, _aim, time) {
      c.fillStyle = '#a34a1e'
      c.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2
        const r = i % 2 ? 0.12 : 0.25
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      c.closePath()
      c.fill()
      c.fillStyle = '#d9702e'
      circle(c, 0, 0, 0.14)
      c.fill()
      const p = 0.5 + 0.5 * Math.sin(time * 5)
      c.fillStyle = `rgba(255,190,90,${0.25 + p * 0.25})`
      circle(c, 0, 0, 0.12 + p * 0.03)
      c.fill()
      c.fillStyle = '#ffd98a'
      circle(c, 0, 0, 0.07)
      c.fill()
    },
  },

  frost: {
    body(c, _aim, time) {
      c.rotate(time * 0.5)
      c.strokeStyle = '#cdeffc'
      c.lineWidth = 0.05
      c.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        c.rotate(Math.PI / 3)
        c.beginPath()
        c.moveTo(0, 0)
        c.lineTo(0.25, 0)
        c.moveTo(0.16, 0)
        c.lineTo(0.22, 0.06)
        c.moveTo(0.16, 0)
        c.lineTo(0.22, -0.06)
        c.stroke()
      }
      c.fillStyle = '#8fd8ee'
      c.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3
        c.lineTo(Math.cos(a) * 0.1, Math.sin(a) * 0.1)
      }
      c.closePath()
      c.fill()
    },
    onFire(fx, t, s) {
      fx.add({ k: 'ring', x: t.x, y: t.y, r0: 0.25, r1: s.range, life: 0.45, max: 0.45 })
    },
  },

  ballista: {
    body(c, aim, _time, ready) {
      c.rotate(aim)
      c.fillStyle = '#8a5d30'
      rr(c, -0.24, -0.06, 0.5, 0.12, 0.03)
      c.fill()
      c.strokeStyle = '#c08a4c'
      c.lineWidth = 0.065
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(0.08, -0.3)
      c.quadraticCurveTo(0.3, 0, 0.08, 0.3)
      c.stroke()
      c.strokeStyle = PARCH
      c.lineWidth = 0.02
      c.beginPath()
      c.moveTo(0.08, -0.3)
      c.lineTo(ready ? -0.16 : 0.1, 0)
      c.lineTo(0.08, 0.3)
      c.stroke()
      if (ready) {
        c.strokeStyle = '#dfe5f2'
        c.lineWidth = 0.045
        c.beginPath()
        c.moveTo(-0.16, 0)
        c.lineTo(0.32, 0)
        c.stroke()
        c.fillStyle = '#dfe5f2'
        c.beginPath()
        c.moveTo(0.4, 0)
        c.lineTo(0.3, -0.055)
        c.lineTo(0.3, 0.055)
        c.closePath()
        c.fill()
      }
    },
  },
}

const FALLBACK: TowerArt = {
  body(c) {
    c.fillStyle = '#c9c2ae'
    circle(c, 0, 0, 0.18)
    c.fill()
  },
}

/** Башня целиком: тень, постамент, сама башня, золотые точки уровня */
export function drawTower(
  c: Ctx,
  id: string,
  lv: number,
  aim: number,
  time: number,
  ready: boolean,
) {
  c.fillStyle = 'rgba(8,9,18,.45)'
  circle(c, 0, 0.05, 0.39)
  c.fill()
  c.fillStyle = '#5a6186'
  circle(c, 0, 0, 0.37)
  c.fill()
  c.fillStyle = '#3b4162'
  circle(c, 0, 0, 0.3)
  c.fill()

  c.save()
  ;(TOWER_ART[id] ?? FALLBACK).body(c, aim, time, ready)
  c.restore()

  c.fillStyle = GOLD
  for (let i = 0; i <= lv; i++) {
    circle(c, (i - lv / 2) * 0.13, 0.32, 0.042)
    c.fill()
  }
}

/** Иконка башни для карточки магазина (canvas 96×96) */
export function drawTowerIcon(canvas: HTMLCanvasElement, id: string): void {
  const c = canvas.getContext('2d')
  if (!c) return
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, canvas.width, canvas.height)
  c.setTransform(104, 0, 0, 104, 48, 46)
  drawTower(c, id, 0, -Math.PI / 2, 0, true)
}
