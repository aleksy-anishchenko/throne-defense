// Как выглядит каждый враг. Новый враг в @throne/game → добавь его рисунок сюда.

import type { Enemy } from '@throne/game'
import { GOLD, circle, drawNet, prefersReducedMotion } from './shapes'
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
      // полоски скорости позади: лазутчик — самый быстрый враг
      ctx.strokeStyle = 'rgba(243,233,210,.45)'
      ctx.lineWidth = 0.022
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (const [offsetY, length] of [
        [-0.06, 0.16],
        [0.03, 0.22],
        [0.11, 0.14],
      ]) {
        ctx.moveTo(radius * 1.15, offsetY)
        ctx.lineTo(radius * 1.15 + length, offsetY)
      }
      ctx.stroke()
      // кинжал в руке, слева
      ctx.strokeStyle = '#dfe5f2'
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.moveTo(-radius * 0.7, radius * 0.45)
      ctx.lineTo(-radius * 1.35, radius * 0.05)
      ctx.stroke()
      ctx.strokeStyle = '#5a3b1f'
      ctx.lineWidth = 0.025
      ctx.beginPath()
      ctx.moveTo(-radius * 0.85, radius * 0.25)
      ctx.lineTo(-radius * 0.6, radius * 0.7)
      ctx.stroke()
      // плащ
      ctx.fillStyle = '#2c6f69'
      ctx.strokeStyle = '#163d3a'
      ctx.lineWidth = 0.03
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // острый капюшон
      ctx.fillStyle = '#1f504c'
      ctx.beginPath()
      ctx.moveTo(-radius * 0.95, 0)
      ctx.quadraticCurveTo(-radius * 0.6, -radius * 1.1, 0, -radius * 1.6)
      ctx.quadraticCurveTo(radius * 0.6, -radius * 1.1, radius * 0.95, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      // лицо в тени капюшона и повязка-маска
      ctx.fillStyle = '#0e2422'
      circle(ctx, 0, 0.0, radius * 0.6)
      ctx.fill()
      ctx.fillStyle = '#ffe07a'
      circle(ctx, -0.04, -0.01, 0.022)
      ctx.fill()
      circle(ctx, 0.04, -0.01, 0.022)
      ctx.fill()
      ctx.fillStyle = '#163d3a'
      ctx.fillRect(-radius * 0.55, radius * 0.18, radius * 1.1, radius * 0.25)
    },
  },

  armor: {
    sparkColor: '#a9b4c6',
    sparkCount: 5,
    body(ctx, radius) {
      // меч за спиной, справа: клинок, гарда, рукоять
      ctx.strokeStyle = '#dfe5f2'
      ctx.lineWidth = 0.035
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(radius * 0.75, radius * 0.3)
      ctx.lineTo(radius * 1.2, -radius * 1.0)
      ctx.stroke()
      ctx.strokeStyle = '#8a5d30'
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.moveTo(radius * 0.55, radius * 0.2)
      ctx.lineTo(radius * 1.0, radius * 0.38)
      ctx.stroke()
      // шлем-ведро
      ctx.fillStyle = '#a9b4c6'
      ctx.strokeStyle = '#4d566a'
      ctx.lineWidth = 0.035
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // блик на металле
      ctx.fillStyle = '#d6dde9'
      circle(ctx, -radius * 0.35, -radius * 0.45, radius * 0.22)
      ctx.fill()
      // смотровая щель высоко, на уровне глаз, и прорезь для дыхания под ней
      ctx.fillStyle = '#1c2130'
      ctx.fillRect(-radius * 0.6, -radius * 0.42, radius * 1.2, 0.05)
      ctx.fillRect(-0.018, -radius * 0.42, 0.036, radius * 0.95)
      // заклёпки
      ctx.fillStyle = '#6b7488'
      circle(ctx, -radius * 0.7, radius * 0.25, 0.018)
      ctx.fill()
      circle(ctx, radius * 0.7, radius * 0.25, 0.018)
      ctx.fill()
      // плюмаж
      ctx.fillStyle = '#c0392b'
      ctx.beginPath()
      ctx.moveTo(-0.05, -radius)
      ctx.quadraticCurveTo(0, -radius - 0.16, 0.09, -radius - 0.1)
      ctx.lineTo(0.05, -radius)
      ctx.closePath()
      ctx.fill()
      // щит спереди слева — стальной, в цвет доспехов: сразу видно, что этот враг в броне
      ctx.save()
      ctx.translate(-radius * 0.7, radius * 0.45)
      ctx.fillStyle = '#8a95ab'
      ctx.strokeStyle = '#3d4456'
      ctx.lineWidth = 0.022
      ctx.beginPath()
      ctx.moveTo(-0.09, -0.09)
      ctx.lineTo(0.09, -0.09)
      ctx.lineTo(0.09, 0.02)
      ctx.quadraticCurveTo(0.08, 0.1, 0, 0.14)
      ctx.quadraticCurveTo(-0.08, 0.1, -0.09, 0.02)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      // умбон — выпуклая бляха посередине
      ctx.fillStyle = '#c3cbd9'
      circle(ctx, 0, 0, 0.032)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    },
  },

  ogre: {
    // Серо-бурый, а не зелёный: зелёные — Горыныч и змеёныши, их не спутать
    sparkColor: '#a08b6a',
    sparkCount: 10,
    body(ctx, radius) {
      // дубина на плече справа: рукоять тоньше, набалдашник толще, с шипами-сучками
      ctx.save()
      ctx.translate(radius * 0.8, radius * 0.3)
      ctx.rotate(0.6)
      ctx.fillStyle = '#7a4f28'
      ctx.strokeStyle = '#3e2712'
      ctx.lineWidth = 0.025
      ctx.beginPath()
      ctx.moveTo(-0.03, 0.06)
      ctx.lineTo(-0.075, -0.42)
      ctx.quadraticCurveTo(0, -0.52, 0.075, -0.42)
      ctx.lineTo(0.03, 0.06)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#5a3a1c'
      for (const [knotX, knotY] of [
        [-0.07, -0.33],
        [0.07, -0.27],
        [-0.05, -0.2],
      ]) {
        circle(ctx, knotX, knotY, 0.022)
        ctx.fill()
      }
      ctx.restore()
      // уши
      ctx.fillStyle = '#8c7856'
      ctx.strokeStyle = '#4a3c26'
      ctx.lineWidth = 0.03
      circle(ctx, -radius * 0.95, -0.04, 0.08)
      ctx.fill()
      ctx.stroke()
      circle(ctx, radius * 0.95, -0.04, 0.08)
      ctx.fill()
      ctx.stroke()
      // голова
      ctx.fillStyle = '#a08b6a'
      ctx.lineWidth = 0.045
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // сердитые брови — домиком к переносице
      ctx.strokeStyle = '#3a2e1c'
      ctx.lineWidth = 0.045
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-0.18, -0.15)
      ctx.lineTo(-0.04, -0.09)
      ctx.moveTo(0.18, -0.15)
      ctx.lineTo(0.04, -0.09)
      ctx.stroke()
      // маленькие злые глаза
      ctx.fillStyle = '#ffdf6a'
      circle(ctx, -0.1, -0.04, 0.035)
      ctx.fill()
      circle(ctx, 0.1, -0.04, 0.035)
      ctx.fill()
      ctx.fillStyle = '#1e140a'
      circle(ctx, -0.1, -0.04, 0.017)
      ctx.fill()
      circle(ctx, 0.1, -0.04, 0.017)
      ctx.fill()
      // широкий рот
      ctx.fillStyle = '#3a1a12'
      ctx.beginPath()
      ctx.moveTo(-0.17, 0.1)
      ctx.quadraticCurveTo(0, 0.24, 0.17, 0.1)
      ctx.quadraticCurveTo(0, 0.15, -0.17, 0.1)
      ctx.closePath()
      ctx.fill()
      // клыки торчат из нижней челюсти вверх, с обводкой — чтобы читались на любом фоне
      ctx.fillStyle = '#f4eedb'
      ctx.strokeStyle = '#4a3c26'
      ctx.lineWidth = 0.02
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(side * 0.15, 0.13)
        ctx.lineTo(side * 0.12, 0.0)
        ctx.lineTo(side * 0.08, 0.15)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    },
  },

  healer: {
    sparkColor: '#8fd17a',
    sparkCount: 6,
    body(ctx, radius) {
      // посох с травами — за спиной, слева; травы светятся: знахарь лечит
      ctx.strokeStyle = '#8a5d30'
      ctx.lineWidth = 0.03
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-radius * 0.9, radius * 0.9)
      ctx.lineTo(-radius * 1.2, -radius * 1.25)
      ctx.stroke()
      ctx.fillStyle = 'rgba(127,209,106,.35)'
      circle(ctx, -radius * 1.2, -radius * 1.35, 0.085)
      ctx.fill()
      ctx.fillStyle = '#7fd16a'
      circle(ctx, -radius * 1.2, -radius * 1.35, 0.045)
      ctx.fill()
      // светлая ряса с капюшоном
      ctx.fillStyle = '#e8e1cc'
      ctx.strokeStyle = '#7d765f'
      ctx.lineWidth = 0.035
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // лицо в глубине капюшона
      ctx.fillStyle = '#7d765f'
      circle(ctx, 0, -radius * 0.25, radius * 0.6)
      ctx.fill()
      ctx.fillStyle = '#e0b48a'
      circle(ctx, 0, -radius * 0.2, radius * 0.45)
      ctx.fill()
      // небольшая седая борода клинышком — только подбородок, не ниже лица
      ctx.fillStyle = '#f4f1e8'
      ctx.beginPath()
      ctx.moveTo(-radius * 0.3, -radius * 0.1)
      ctx.quadraticCurveTo(-radius * 0.28, radius * 0.15, 0, radius * 0.3)
      ctx.quadraticCurveTo(radius * 0.28, radius * 0.15, radius * 0.3, -radius * 0.1)
      ctx.quadraticCurveTo(0, radius * 0.05, -radius * 0.3, -radius * 0.1)
      ctx.closePath()
      ctx.fill()
      // усы — двумя маленькими завитками, чуть темнее бороды
      ctx.fillStyle = '#dcd5c3'
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.ellipse(
          side * radius * 0.1,
          -radius * 0.06,
          radius * 0.11,
          radius * 0.045,
          side * 0.35,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      // глаза
      ctx.fillStyle = '#2a1a0c'
      circle(ctx, -radius * 0.17, -radius * 0.3, 0.018)
      ctx.fill()
      circle(ctx, radius * 0.17, -radius * 0.3, 0.018)
      ctx.fill()
      // зелёный крест-оберег на рясе, сбоку от бороды
      ctx.fillStyle = '#4f9a44'
      ctx.fillRect(-radius * 0.62, radius * 0.1, 0.03, radius * 0.45)
      ctx.fillRect(-radius * 0.78, radius * 0.22, radius * 0.32, 0.03)
    },
  },

  gorynych: {
    sparkColor: '#4f8f3a',
    sparkCount: 14,
    healthBarOffset: 0.28,
    drawOnTop: true,
    body(ctx, radius) {
      // хвост: изгибается вниз и вбок, на конце — наконечник-стрелка
      ctx.strokeStyle = '#3f7a32'
      ctx.lineWidth = 0.08
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0, radius * 0.6)
      ctx.quadraticCurveTo(radius * 0.2, radius * 1.45, radius * 0.95, radius * 1.15)
      ctx.stroke()
      ctx.fillStyle = '#2f5f26'
      ctx.beginPath()
      ctx.moveTo(radius * 1.2, radius * 1.05)
      ctx.lineTo(radius * 0.85, radius * 0.95)
      ctx.lineTo(radius * 0.95, radius * 1.35)
      ctx.closePath()
      ctx.fill()
      // крылья-перепонки за спиной: три «пальца» с провисающей кожей между ними
      ctx.fillStyle = '#2f5f26'
      ctx.strokeStyle = '#1f3f18'
      ctx.lineWidth = 0.025
      for (const side of [-1, 1]) {
        const rootX = side * radius * 0.55
        const rootY = -radius * 0.25
        ctx.beginPath()
        ctx.moveTo(rootX, rootY)
        ctx.lineTo(side * radius * 1.55, -radius * 0.95)
        ctx.quadraticCurveTo(
          side * radius * 1.4,
          -radius * 0.45,
          side * radius * 1.65,
          -radius * 0.2,
        )
        ctx.quadraticCurveTo(
          side * radius * 1.3,
          -radius * 0.05,
          side * radius * 1.45,
          radius * 0.35,
        )
        ctx.quadraticCurveTo(side * radius * 1.0, radius * 0.25, side * radius * 0.7, radius * 0.35)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        // «кости» крыла
        ctx.beginPath()
        ctx.moveTo(rootX, rootY)
        ctx.lineTo(side * radius * 1.65, -radius * 0.2)
        ctx.moveTo(rootX, rootY)
        ctx.lineTo(side * radius * 1.45, radius * 0.35)
        ctx.stroke()
      }
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
        // ушки-рожки: рисуем до головы, чтобы их основание спряталось под ней
        for (const side of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(headX + side * 0.03, headY - 0.07)
          ctx.lineTo(headX + side * 0.11, headY - 0.15)
          ctx.lineTo(headX + side * 0.09, headY - 0.03)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
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
      // хвостик с наконечником, как у Горыныча: видно, что это его «осколок»
      ctx.strokeStyle = '#5c9c45'
      ctx.lineWidth = 0.05
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0, radius * 0.5)
      ctx.quadraticCurveTo(radius * 0.3, radius * 1.6, radius * 1.3, radius * 1.1)
      ctx.stroke()
      ctx.fillStyle = '#3f7a32'
      ctx.beginPath()
      ctx.moveTo(radius * 1.6, radius * 0.95)
      ctx.lineTo(radius * 1.15, radius * 0.85)
      ctx.lineTo(radius * 1.3, radius * 1.4)
      ctx.closePath()
      ctx.fill()
      // ушки-рожки, как у голов Горыныча
      ctx.fillStyle = '#5c9c45'
      ctx.strokeStyle = '#2a4d1f'
      ctx.lineWidth = 0.02
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(side * radius * 0.25, -radius * 0.75)
        ctx.lineTo(side * radius * 0.8, -radius * 1.35)
        ctx.lineTo(side * radius * 0.8, -radius * 0.45)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      // тело
      ctx.lineWidth = 0.035
      circle(ctx, 0, 0, radius)
      ctx.fill()
      ctx.stroke()
      // глаза
      ctx.fillStyle = '#ffcf4a'
      circle(ctx, -0.045, -0.03, 0.022)
      ctx.fill()
      circle(ctx, 0.045, -0.03, 0.022)
      ctx.fill()
    },
  },

  boss: {
    sparkColor: '#7a45b8',
    sparkCount: 22,
    healthBarOffset: 0.32,
    drawOnTop: true,
    body(ctx, radius) {
      // скипетр справа: золотое древко и держава с камнем
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 0.04
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(radius * 0.75, radius * 0.6)
      ctx.lineTo(radius * 1.05, -radius * 0.55)
      ctx.stroke()
      ctx.fillStyle = GOLD
      circle(ctx, radius * 1.08, -radius * 0.68, 0.07)
      ctx.fill()
      ctx.fillStyle = '#ff5a4a'
      circle(ctx, radius * 1.08, -radius * 0.68, 0.032)
      ctx.fill()
      // мантия
      ctx.fillStyle = '#4a2478'
      ctx.strokeStyle = '#2f1650'
      ctx.lineWidth = 0.045
      circle(ctx, 0, 0.04, radius)
      ctx.fill()
      ctx.stroke()
      // горностаевый воротник: белый мех с чёрными хвостиками
      ctx.fillStyle = '#f3efe4'
      ctx.beginPath()
      ctx.ellipse(0, radius * 0.22, radius * 0.72, radius * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#1c1a22'
      for (const spotX of [-0.5, -0.2, 0.2, 0.5]) {
        ctx.fillRect(radius * spotX - 0.012, radius * 0.2, 0.024, 0.045)
      }
      // лицо
      ctx.fillStyle = '#d9b394'
      ctx.strokeStyle = '#6b4a35'
      ctx.lineWidth = 0.025
      circle(ctx, 0, -radius * 0.12, radius * 0.48)
      ctx.fill()
      ctx.stroke()
      // злые брови и горящие красные глаза
      ctx.strokeStyle = '#231a24'
      ctx.lineWidth = 0.035
      ctx.beginPath()
      ctx.moveTo(-radius * 0.34, -radius * 0.34)
      ctx.lineTo(-radius * 0.08, -radius * 0.22)
      ctx.moveTo(radius * 0.34, -radius * 0.34)
      ctx.lineTo(radius * 0.08, -radius * 0.22)
      ctx.stroke()
      ctx.fillStyle = '#ff5a4a'
      circle(ctx, -radius * 0.18, -radius * 0.14, 0.03)
      ctx.fill()
      circle(ctx, radius * 0.18, -radius * 0.14, 0.03)
      ctx.fill()
      // сердито сжатый рот: уголки вниз
      ctx.strokeStyle = '#6b2a2a'
      ctx.lineWidth = 0.025
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-radius * 0.16, radius * 0.12)
      ctx.quadraticCurveTo(0, radius * 0.02, radius * 0.16, radius * 0.12)
      ctx.stroke()
      // корона с камнями
      ctx.fillStyle = GOLD
      ctx.strokeStyle = '#8a6420'
      ctx.lineWidth = 0.02
      ctx.beginPath()
      ctx.moveTo(-0.22, -0.2)
      ctx.lineTo(-0.25, -0.46)
      ctx.lineTo(-0.11, -0.33)
      ctx.lineTo(0, -0.5)
      ctx.lineTo(0.11, -0.33)
      ctx.lineTo(0.25, -0.46)
      ctx.lineTo(0.22, -0.2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#ff5a4a'
      circle(ctx, 0, -0.27, 0.03)
      ctx.fill()
      ctx.fillStyle = '#5ac8ff'
      circle(ctx, -0.13, -0.25, 0.022)
      ctx.fill()
      circle(ctx, 0.13, -0.25, 0.022)
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

/** Насколько ледяное свечение выходит за край врага, клеток */
const FROST_GLOW_MARGIN = 0.08
/** Где над врагом висят снежинки: [доля радиуса по x, по y] */
const FROST_FLAKE_SPOTS: readonly (readonly [number, number])[] = [
  [-0.75, -0.85],
  [0.1, -1.1],
  [0.8, -0.7],
]
/** Размер снежинки, клеток */
const FROST_FLAKE_SIZE = 0.045

/** Ледяное свечение под замедленным врагом */
function drawFrostGlow(ctx: Canvas2D, radius: number) {
  ctx.fillStyle = 'rgba(170,230,255,.35)'
  ctx.strokeStyle = 'rgba(170,230,255,.9)'
  ctx.lineWidth = 0.03
  circle(ctx, 0, 0, radius + FROST_GLOW_MARGIN)
  ctx.fill()
  ctx.stroke()
}

/** Поверх замедленного врага: голубой оттенок тела и три снежинки над ним */
function drawFrostOverlay(ctx: Canvas2D, radius: number) {
  ctx.fillStyle = 'rgba(150,215,255,.25)'
  circle(ctx, 0, 0, radius)
  ctx.fill()
  ctx.strokeStyle = '#eaf8ff'
  ctx.lineWidth = 0.014
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const [shareX, shareY] of FROST_FLAKE_SPOTS) {
    const x = shareX * radius
    const y = shareY * radius
    // снежинка из трёх палочек через 60°
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI) / 3
      const deltaX = Math.cos(angle) * FROST_FLAKE_SIZE
      const deltaY = Math.sin(angle) * FROST_FLAKE_SIZE
      ctx.moveTo(x - deltaX, y - deltaY)
      ctx.lineTo(x + deltaX, y + deltaY)
    }
  }
  ctx.stroke()
}

/** Где на враге пляшут язычки огня: [доля радиуса по x, по y, размер в долях радиуса] */
const BURN_FLAME_SPOTS: readonly (readonly [number, number, number])[] = [
  [-0.45, 0.1, 0.55],
  [0.1, -0.35, 0.7],
  [0.5, 0.25, 0.5],
]

/** Во сколько раз меньше язычки пламени на «мокром» (замедленном) враге: он горит хуже */
const WET_FLAME_SCALE = 0.6

/**
 * Горящий враг: оранжевый отсвет и три пляшущих язычка пламени поверх (огневик).
 * isWet — враг под замедлением, горит хуже: пламя меньше и бледнее, отсвета нет
 */
function drawBurning(ctx: Canvas2D, radius: number, time: number, isWet: boolean) {
  if (!isWet) {
    ctx.fillStyle = 'rgba(255,120,40,.22)'
    circle(ctx, 0, 0, radius)
    ctx.fill()
  }
  ctx.globalAlpha = isWet ? 0.75 : 1
  BURN_FLAME_SPOTS.forEach(([shareX, shareY, sizeShare], i) => {
    const flicker = prefersReducedMotion ? 1 : 0.8 + 0.2 * Math.sin(time * 14 + i * 2)
    const size = radius * sizeShare * flicker * (isWet ? WET_FLAME_SCALE : 1)
    const x = shareX * radius
    const y = shareY * radius
    ctx.fillStyle = '#f0863a'
    ctx.beginPath()
    ctx.moveTo(x - size * 0.45, y)
    ctx.quadraticCurveTo(x - size * 0.4, y - size * 0.6, x, y - size)
    ctx.quadraticCurveTo(x + size * 0.4, y - size * 0.6, x + size * 0.45, y)
    ctx.quadraticCurveTo(x, y + size * 0.3, x - size * 0.45, y)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffd36a'
    ctx.beginPath()
    ctx.moveTo(x - size * 0.2, y)
    ctx.quadraticCurveTo(x, y - size * 0.75, x + size * 0.2, y)
    ctx.closePath()
    ctx.fill()
  })
  ctx.globalAlpha = 1
}

/** Цвет проклятия Колдуна (RGB для прозрачности) — тот же, что у его шара */
const CURSE_RGB = '190,120,255'
/** Насколько сеть на враге шире самого врага, в долях радиуса */
const ROOT_NET_SCALE = 1.25

/**
 * Проклятый враг: фиолетовое кольцо у ног и тёмно-фиолетовый оттенок тела.
 * Рисуется до тела (кольцо) и после (оттенок) — как замедление
 */
function drawCurseRing(ctx: Canvas2D, radius: number, time: number) {
  const pulse = prefersReducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 6)
  ctx.strokeStyle = `rgba(${CURSE_RGB},${0.55 + pulse * 0.35})`
  ctx.lineWidth = 0.03
  ctx.setLineDash([0.06, 0.05])
  circle(ctx, 0, 0, radius + 0.06)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawCurseTint(ctx: Canvas2D, radius: number) {
  ctx.fillStyle = `rgba(${CURSE_RGB},.22)`
  circle(ctx, 0, 0, radius)
  ctx.fill()
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

  const isSlowed = enemy.slowTimeLeft > 0
  const isCursed = enemy.curseTimeLeft > 0
  if (isCursed) drawCurseRing(ctx, radius, time + bobPhase)
  // Замедление рисуется в два слоя: ледяное свечение — ПОД врагом (иначе оно перечёркивало бы
  // то, что торчит за край тела: дубину огра, крылья Горыныча, щит латника), а голубой
  // оттенок и снежинки — поверх. Так одно правило подходит любому врагу, без отдельного рисунка
  if (isSlowed) drawFrostGlow(ctx, radius)

  ctx.lineWidth = 0.035
  art.body(ctx, radius)

  if (isSlowed) drawFrostOverlay(ctx, radius)
  if (isCursed) drawCurseTint(ctx, radius)
  // В сети — сеть поверх врага, чуть шире его
  if (enemy.rootTimeLeft > 0) drawNet(ctx, 0, 0, radius * ROOT_NET_SCALE, 0.4, '#a9b4c6')
  if (enemy.burnTimeLeft > 0) drawBurning(ctx, radius, time + bobPhase, isSlowed)
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
