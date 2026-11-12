// Как выглядит каждый враг. Новый враг в @throne/game → добавь его рисунок сюда.

import type { Enemy } from '@throne/game'
import { GOLD, circle, prefersReducedMotion } from './shapes'
import type { Canvas2D } from './shapes'

export interface EnemyArt {
  /** Нарисовать врага. (0, 0) — центр, radius — радиус */
  body(ctx: Canvas2D, radius: number): void
  /** Цвет искр, когда враг гибнет */
  sparkColor: string
  /** Сколько искр */
  sparkCount: number
  /** Насколько выше врага полоска здоровья */
  healthBarOffset?: number
  /** Рисовать поверх остальных (большие враги) */
  drawOnTop?: boolean
}

export const ENEMY_ART: Record<string, EnemyArt> = {
  rebel: {
    sparkColor: '#c98f55',
    sparkCount: 5,
    body(ctx, radius) {
      ctx.fillStyle = '#c98f55'
      ctx.strokeStyle = '#5a3b1f'
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#7a4f28'
      ctx.beginPath()
      ctx.arc(0, 0, radius, Math.PI, 0)
      ctx.closePath()
      ctx.fill()
      // вилы
      ctx.strokeStyle = '#d9d2c0'
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.moveTo(0.1, 0.16)
      ctx.lineTo(0.24, -0.2)
      ctx.moveTo(0.16, -0.22)
      ctx.lineTo(0.2, -0.1)
      ctx.lineTo(0.3, -0.14)
      ctx.stroke()
      ctx.fillStyle = '#2a1a0c'
      circle(ctx, -0.06, 0.05, 0.025)
      ctx.fill()
      circle(ctx, 0.05, 0.05, 0.025)
      ctx.fill()
    },
  },

  scout: {
    sparkColor: '#3a8a83',
    sparkCount: 5,
    body(ctx, radius) {
      ctx.fillStyle = '#2c6f69'
      ctx.strokeStyle = '#163d3a'
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // капюшон
      ctx.fillStyle = '#163d3a'
      ctx.beginPath()
      ctx.moveTo(-radius, -0.02)
      ctx.lineTo(0, -radius * 1.5)
      ctx.lineTo(radius, -0.02)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffe07a'
      circle(ctx, -0.05, 0.03, 0.028)
      ctx.fill()
      circle(ctx, 0.05, 0.03, 0.028)
      ctx.fill()
    },
  },

  armor: {
    sparkColor: '#a9b4c6',
    sparkCount: 5,
    body(ctx, radius) {
      ctx.fillStyle = '#a9b4c6'
      ctx.strokeStyle = '#4d566a'
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // забрало
      ctx.fillStyle = '#2a3040'
      ctx.fillRect(-radius * 0.62, -0.04, radius * 1.24, 0.07)
      ctx.fillRect(-0.025, -0.04, 0.05, radius * 0.7)
      // плюмаж
      ctx.fillStyle = '#c0392b'
      ctx.beginPath()
      ctx.moveTo(-0.05, -radius)
      ctx.quadraticCurveTo(0, -radius - 0.16, 0.09, -radius - 0.1)
      ctx.lineTo(0.05, -radius)
      ctx.closePath()
      ctx.fill()
    },
  },

  ogre: {
    sparkColor: '#86a24e',
    sparkCount: 10,
    body(ctx, radius) {
      ctx.fillStyle = '#86a24e'
      ctx.strokeStyle = '#42541f'
      ctx.lineWidth = 0.045
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // брови и глаза
      ctx.fillStyle = '#42541f'
      ctx.fillRect(-0.17, -0.12, 0.13, 0.04)
      ctx.fillRect(0.04, -0.12, 0.13, 0.04)
      ctx.fillStyle = '#1e2a0c'
      circle(ctx, -0.1, -0.05, 0.035)
      ctx.fill()
      circle(ctx, 0.1, -0.05, 0.035)
      ctx.fill()
      // клыки
      ctx.fillStyle = '#f1ead6'
      ctx.beginPath()
      ctx.moveTo(-0.15, 0.1)
      ctx.lineTo(-0.11, -0.02)
      ctx.lineTo(-0.06, 0.1)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(0.15, 0.1)
      ctx.lineTo(0.11, -0.02)
      ctx.lineTo(0.06, 0.1)
      ctx.closePath()
      ctx.fill()
    },
  },

  healer: {
    sparkColor: '#8fd17a',
    sparkCount: 6,
    body(ctx, radius) {
      // светлая ряса
      ctx.fillStyle = '#e8e1cc'
      ctx.strokeStyle = '#7d765f'
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // зелёный крест-оберег
      ctx.fillStyle = '#4f9a44'
      ctx.fillRect(-0.025, -radius * 0.65, 0.05, radius * 1.3)
      ctx.fillRect(-radius * 0.55, -0.025, radius * 1.1, 0.05)
      // посох с травами
      ctx.strokeStyle = '#8a5d30'
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.moveTo(-0.2, 0.2)
      ctx.lineTo(-0.26, -0.26)
      ctx.stroke()
      ctx.fillStyle = '#7fd16a'
      circle(ctx, -0.26, -0.28, 0.05)
      ctx.fill()
    },
  },

  gorynych: {
    sparkColor: '#4f8f3a',
    sparkCount: 14,
    healthBarOffset: 0.28,
    drawOnTop: true,
    body(ctx, radius) {
      // тело
      ctx.fillStyle = '#3f7a32'
      ctx.strokeStyle = '#1f3f18'
      ctx.lineWidth = 0.04
      circle(ctx, 0, 0.04, radius)
      ctx.fill()
      ctx.stroke()
      // брюхо
      ctx.fillStyle = '#b9c56a'
      circle(ctx, 0, 0.1, radius * 0.5)
      ctx.fill()
      // три головы на шеях
      for (const headX of [-0.22, 0, 0.22]) {
        const headY = headX === 0 ? -radius - 0.12 : -radius
        ctx.strokeStyle = '#3f7a32'
        ctx.lineWidth = 0.07
        ctx.beginPath()
        ctx.moveTo(headX * 0.5, -radius * 0.4)
        ctx.lineTo(headX, headY)
        ctx.stroke()
        ctx.fillStyle = '#4f9a3e'
        ctx.strokeStyle = '#1f3f18'
        ctx.lineWidth = 0.025
        circle(ctx, headX, headY, 0.1)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#ffcf4a'
        circle(ctx, headX - 0.035, headY - 0.015, 0.022)
        ctx.fill()
        circle(ctx, headX + 0.035, headY - 0.015, 0.022)
        ctx.fill()
      }
    },
  },

  snakelet: {
    sparkColor: '#6fb04f',
    sparkCount: 4,
    body(ctx, radius) {
      ctx.fillStyle = '#5c9c45'
      ctx.strokeStyle = '#2a4d1f'
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#ffcf4a'
      circle(ctx, -0.045, -0.02, 0.022)
      ctx.fill()
      circle(ctx, 0.045, -0.02, 0.022)
      ctx.fill()
    },
  },

  boss: {
    sparkColor: '#7a45b8',
    sparkCount: 22,
    healthBarOffset: 0.32,
    drawOnTop: true,
    body(ctx, radius) {
      ctx.fillStyle = '#4a2478'
      circle(ctx, 0, 0.04, radius)
      ctx.fill()
      ctx.fillStyle = '#7a45b8'
      ctx.strokeStyle = '#2f1650'
      ctx.lineWidth = 0.045
      circle(ctx, 0, 0, radius * 0.8)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#ff5a4a'
      circle(ctx, -0.1, 0, 0.04)
      ctx.fill()
      circle(ctx, 0.1, 0, 0.04)
      ctx.fill()
      // корона
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.moveTo(-0.22, -0.2)
      ctx.lineTo(-0.24, -0.44)
      ctx.lineTo(-0.11, -0.32)
      ctx.lineTo(0, -0.48)
      ctx.lineTo(0.11, -0.32)
      ctx.lineTo(0.24, -0.44)
      ctx.lineTo(0.22, -0.2)
      ctx.closePath()
      ctx.fill()
    },
  },
}

const FALLBACK_ENEMY_ART: EnemyArt = {
  sparkColor: '#d8394a',
  sparkCount: 5,
  body(ctx, radius) {
    ctx.fillStyle = '#d8394a'
    circle(ctx, 0, 0, radius)
    ctx.fill()
  },
}

export const getEnemyArt = (enemyId: string): EnemyArt => ENEMY_ART[enemyId] ?? FALLBACK_ENEMY_ART

// Полоска здоровья (размеры в клетках)
/** Минимальная ширина полоски */
const MIN_HEALTH_BAR_WIDTH = 0.36
/** На сколько полоска выше врага, если у рисунка нет своего healthBarOffset */
const DEFAULT_HEALTH_BAR_OFFSET = 0.16
/** Доля здоровья, выше которой полоска зелёная */
const HEALTH_HIGH_THRESHOLD = 0.5
/** Доля здоровья, выше которой полоска золотая (ниже — оранжевая) */
const HEALTH_MEDIUM_THRESHOLD = 0.25

/** Цвет полоски здоровья: зелёный — здоров, золотой — ранен, оранжевый — при смерти */
function healthBarColor(healthFraction: number): string {
  if (healthFraction > HEALTH_HIGH_THRESHOLD) return '#7fd16a'
  if (healthFraction > HEALTH_MEDIUM_THRESHOLD) return GOLD
  return '#f0863a'
}

/** Враг целиком: тень, покачивание, сам враг, замедление, вспышка от удара, здоровье */
export function drawEnemy(
  ctx: Canvas2D,
  enemy: Enemy,
  time: number,
  bobPhase: number,
  isFlashing: boolean,
): void {
  const art = getEnemyArt(enemy.def.id)
  const radius = enemy.def.radius
  const bobOffset = prefersReducedMotion
    ? 0
    : Math.sin(time * 9 * enemy.def.speed + bobPhase) * 0.02

  ctx.save()
  ctx.translate(enemy.x, enemy.y + bobOffset)
  ctx.fillStyle = 'rgba(8,9,18,.35)'
  ctx.beginPath()
  ctx.ellipse(0, radius * 0.8, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.lineWidth = 0.035
  art.body(ctx, radius)

  if (enemy.slowTimeLeft > 0) {
    ctx.strokeStyle = 'rgba(170,230,255,.9)'
    ctx.lineWidth = 0.04
    circle(ctx, 0, 0, radius + 0.04)
    ctx.stroke()
  }
  if (isFlashing) {
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    circle(ctx, 0, 0, radius)
    ctx.fill()
  }
  if (enemy.hp < enemy.maxHp) {
    const barWidth = Math.max(MIN_HEALTH_BAR_WIDTH, radius * 2)
    const healthFraction = Math.max(0, enemy.hp / enemy.maxHp)
    const barY = -radius - (art.healthBarOffset ?? DEFAULT_HEALTH_BAR_OFFSET)
    ctx.fillStyle = 'rgba(8,9,18,.75)'
    ctx.fillRect(-barWidth / 2 - 0.015, barY - 0.015, barWidth + 0.03, 0.085)
    ctx.fillStyle = healthBarColor(healthFraction)
    ctx.fillRect(-barWidth / 2, barY, barWidth * healthFraction, 0.055)
  }
  ctx.restore()
}
