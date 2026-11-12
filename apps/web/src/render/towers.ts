// Как выглядит каждая башня. Новая башня в @throne/game → добавь её рисунок сюда.
// Без рисунка башня тоже будет работать — нарисуется простым кружком.

import type { Tower, TowerStats } from '@throne/game'
import type { EffectSink } from './effects'
import {
  GOLD,
  PARCHMENT,
  TOWER_IDLE_AIM_ANGLE,
  circle,
  prefersReducedMotion,
  roundedRect,
} from './shapes'
import type { Canvas2D } from './shapes'
import { TWIN_BOLT_OFFSET } from './shots'

export interface TowerArt {
  /**
   * Нарисовать башню поверх общего постамента. (0, 0) — центр клетки, 1 — размер клетки.
   * tier — ступень с нуля: на II и III ступени башня выглядит богаче (см. TIER_* ниже)
   */
  body(ctx: Canvas2D, aimAngle: number, time: number, isReady: boolean, tier: number): void
  /** Эффект при выстреле */
  onFire?(effects: EffectSink, tower: Tower, stats: TowerStats): void
}

// Ступени с нуля, как tower.tier: 0 — «I», 1 — «II», 2 — «III».
// Общее правило: II — крупнее и с железом, III — золото и свечение
const TIER_II = 1
const TIER_III = 2

/** Во сколько раз крупнее пламя Огневика на ступенях I, II, III */
const MAGE_FLAME_SCALE = [1, 1.15, 1.3]
/** Длина лучей снежинки Морозко на ступенях I, II, III, клеток */
const FROST_ARM_LENGTH = [0.25, 0.27, 0.29]
/** Во сколько раз крупнее колокол Звонаря на ступенях I, II, III */
const BELL_SCALE = [1, 1.06, 1.1]

/** Цвет дерева лука: I — светлое дерево, II — тёмное морёное, III — золото */
const ARCHER_BOW_COLORS = ['#d6ab6c', '#9a6430', GOLD]

/** Наконечник стрелы с сиянием (лучник III): x — где остриё, клеток */
function drawGlowingArrowTip(ctx: Canvas2D, x: number) {
  ctx.fillStyle = 'rgba(255,224,138,.45)'
  circle(ctx, x, 0, 0.07)
  ctx.fill()
  ctx.fillStyle = '#fff1c2'
  ctx.beginPath()
  ctx.moveTo(x + 0.04, 0)
  ctx.lineTo(x - 0.03, -0.035)
  ctx.lineTo(x - 0.03, 0.035)
  ctx.closePath()
  ctx.fill()
}

/** Колчан со стрелами за спиной лучника (II и III) */
function drawQuiver(ctx: Canvas2D) {
  ctx.fillStyle = '#7a4f28'
  ctx.strokeStyle = '#3e2712'
  ctx.lineWidth = 0.015
  roundedRect(ctx, -0.27, -0.17, 0.08, 0.2, 0.02)
  ctx.fill()
  ctx.stroke()
  // оперение торчащих стрел
  ctx.fillStyle = '#e8e1cc'
  for (const offsetY of [-0.2, -0.16]) {
    ctx.beginPath()
    ctx.moveTo(-0.25, offsetY)
    ctx.lineTo(-0.2, offsetY - 0.04)
    ctx.lineTo(-0.2, offsetY + 0.02)
    ctx.closePath()
    ctx.fill()
  }
}

/** Пламя Огневика: три слоя, кверху острое и качается. coreColor — цвет сердцевины */
function drawFlame(ctx: Canvas2D, time: number, coreColor: string) {
  const flicker = prefersReducedMotion ? 0 : Math.sin(time * 9) * 0.02
  const sway = prefersReducedMotion ? 0 : Math.sin(time * 6) * 0.025
  // большой язык пламени: снизу широкий, кверху острый
  ctx.fillStyle = '#e0561f'
  ctx.beginPath()
  ctx.moveTo(-0.17, 0.08)
  ctx.quadraticCurveTo(-0.2, -0.1, -0.06, -0.18)
  ctx.quadraticCurveTo(-0.04, -0.08, sway, -0.3 - flicker)
  ctx.quadraticCurveTo(0.08, -0.12, 0.12, -0.16)
  ctx.quadraticCurveTo(0.2, -0.04, 0.17, 0.08)
  ctx.closePath()
  ctx.fill()
  // средний — оранжевый
  ctx.fillStyle = '#f59a33'
  ctx.beginPath()
  ctx.moveTo(-0.11, 0.08)
  ctx.quadraticCurveTo(-0.12, -0.06, sway * 0.6, -0.2 - flicker)
  ctx.quadraticCurveTo(0.12, -0.06, 0.11, 0.08)
  ctx.closePath()
  ctx.fill()
  // сердцевина
  ctx.fillStyle = coreColor
  ctx.beginPath()
  ctx.moveTo(-0.05, 0.08)
  ctx.quadraticCurveTo(-0.06, -0.02, sway * 0.3, -0.1 - flicker)
  ctx.quadraticCurveTo(0.06, -0.02, 0.05, 0.08)
  ctx.closePath()
  ctx.fill()
}

/** Искры над пламенем Огневика III: три точки поднимаются и гаснут по кругу */
function drawSparks(ctx: Canvas2D, time: number) {
  for (let i = 0; i < 3; i++) {
    // phase от 0 до 1: где искра на пути вверх
    const phase = prefersReducedMotion ? (i + 1) / 4 : (time * 0.9 + i / 3) % 1
    ctx.fillStyle = `rgba(255,214,120,${1 - phase})`
    circle(ctx, (i - 1) * 0.09, -0.28 - phase * 0.12, 0.018)
    ctx.fill()
  }
}

/** Ледяной кристалл-ромбик на конце луча снежинки (Морозко II и III) */
function drawIceCrystal(ctx: Canvas2D, x: number) {
  ctx.fillStyle = '#e9fbff'
  ctx.beginPath()
  ctx.moveTo(x + 0.04, 0)
  ctx.lineTo(x, -0.025)
  ctx.lineTo(x - 0.04, 0)
  ctx.lineTo(x, 0.025)
  ctx.closePath()
  ctx.fill()
}

/** Болт баллисты, заряженный на ложе: offsetY — сдвиг поперёк ложа, клеток */
function drawBolt(ctx: Canvas2D, offsetY: number) {
  ctx.strokeStyle = '#dfe5f2'
  ctx.lineWidth = 0.045
  ctx.beginPath()
  ctx.moveTo(-0.16, offsetY)
  ctx.lineTo(0.32, offsetY)
  ctx.stroke()
  ctx.fillStyle = '#dfe5f2'
  ctx.beginPath()
  ctx.moveTo(0.4, offsetY)
  ctx.lineTo(0.3, offsetY - 0.055)
  ctx.lineTo(0.3, offsetY + 0.055)
  ctx.closePath()
  ctx.fill()
}

/** Колокол: x, y — где верх колокола, scale — размер, color — цвет металла */
function drawBellShape(ctx: Canvas2D, x: number, y: number, scale: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = color
  ctx.strokeStyle = '#7a5a1e'
  ctx.lineWidth = 0.025
  ctx.beginPath()
  ctx.moveTo(-0.07, 0.03)
  ctx.quadraticCurveTo(-0.13, 0.12, -0.14, 0.26)
  ctx.quadraticCurveTo(-0.2, 0.34, -0.21, 0.38)
  ctx.lineTo(0.21, 0.38)
  ctx.quadraticCurveTo(0.2, 0.34, 0.14, 0.26)
  ctx.quadraticCurveTo(0.13, 0.12, 0.07, 0.03)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // блик и язычок
  ctx.fillStyle = 'rgba(255,240,190,.75)'
  ctx.fillRect(-0.08, 0.12, 0.03, 0.18)
  ctx.fillStyle = '#5a4012'
  circle(ctx, 0, 0.42, 0.045)
  ctx.fill()
  ctx.restore()
}

/** Монета: x, y — центр, radius — радиус */
function drawCoin(ctx: Canvas2D, x: number, y: number, radius: number) {
  ctx.fillStyle = '#f2cf6e'
  ctx.strokeStyle = '#a07a1e'
  ctx.lineWidth = 0.012
  circle(ctx, x, y, radius)
  ctx.fill()
  ctx.stroke()
}

/** Четырёхлучевой блеск (Казна III): x, y — центр, size — длина луча */
function drawTwinkle(ctx: Canvas2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#fff8dc'
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.lineTo(x + size * 0.25, y - size * 0.25)
  ctx.lineTo(x + size, y)
  ctx.lineTo(x + size * 0.25, y + size * 0.25)
  ctx.lineTo(x, y + size)
  ctx.lineTo(x - size * 0.25, y + size * 0.25)
  ctx.lineTo(x - size, y)
  ctx.lineTo(x - size * 0.25, y - size * 0.25)
  ctx.closePath()
  ctx.fill()
}

export const TOWER_ART: Record<string, TowerArt> = {
  archer: {
    body(ctx, aimAngle, _time, isReady, tier) {
      ctx.rotate(aimAngle)
      if (tier >= TIER_II) drawQuiver(ctx)
      ctx.fillStyle = '#3f8750'
      circle(ctx, -0.03, 0, 0.18)
      ctx.fill()
      ctx.fillStyle = '#5fae6b'
      circle(ctx, -0.05, 0, 0.12)
      ctx.fill()
      // лук: на II и III — толще и другого дерева. Радиус тот же: лук побольше
      // наезжал бы на обод постамента, и золотой лук III слился бы с золотым ободом
      const bowRadius = 0.25
      const bowWidth = tier >= TIER_II ? 0.06 : 0.05
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(0.02, 0, bowRadius, -1.15, 1.15)
      // тёмная обводка под луком: отделяет его от обода постамента
      ctx.strokeStyle = '#2a2e45'
      ctx.lineWidth = bowWidth + 0.025
      ctx.stroke()
      ctx.strokeStyle = ARCHER_BOW_COLORS[tier] ?? ARCHER_BOW_COLORS[0]
      ctx.lineWidth = bowWidth
      ctx.stroke()
      const bowTipX = 0.02 + Math.cos(1.15) * bowRadius
      const bowTipY = Math.sin(1.15) * bowRadius
      // железные накладки на концах лука (II)
      if (tier === TIER_II) {
        ctx.fillStyle = '#c3cbd9'
        circle(ctx, bowTipX, -bowTipY, 0.03)
        ctx.fill()
        circle(ctx, bowTipX, bowTipY, 0.03)
        ctx.fill()
      }
      // тетива и стрела
      ctx.strokeStyle = PARCHMENT
      ctx.lineWidth = 0.02
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
        if (tier >= TIER_III) drawGlowingArrowTip(ctx, 0.32)
      }
    },
  },

  mage: {
    body(ctx, _aimAngle, time, _isReady, tier) {
      // Каменная чаша-жаровня, в ней пляшет пламя; с каждой ступенью пламя выше
      const flameScale = MAGE_FLAME_SCALE[tier] ?? 1
      // отсвет огня
      const pulse = prefersReducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 5)
      ctx.fillStyle = `rgba(255,150,60,${0.15 + pulse * 0.15})`
      circle(ctx, 0, -0.04, 0.27 * flameScale)
      ctx.fill()
      // пламя растёт от края чаши (y = 0.08), а не от центра клетки
      ctx.save()
      ctx.translate(0, 0.08)
      ctx.scale(flameScale, flameScale)
      ctx.translate(0, -0.08)
      // III — сердцевина раскалена добела с голубым
      drawFlame(ctx, time, tier >= TIER_III ? '#e4f6ff' : '#ffe08a')
      ctx.restore()
      if (tier >= TIER_III) drawSparks(ctx, time)
      // чаша
      ctx.fillStyle = '#6b6f86'
      ctx.strokeStyle = '#2f3248'
      ctx.lineWidth = 0.025
      ctx.beginPath()
      ctx.moveTo(-0.22, 0.06)
      ctx.lineTo(0.22, 0.06)
      ctx.quadraticCurveTo(0.2, 0.22, 0, 0.22)
      ctx.quadraticCurveTo(-0.2, 0.22, -0.22, 0.06)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      // руны на чаше (II и III): на III — золотые
      if (tier >= TIER_II) {
        ctx.strokeStyle = tier >= TIER_III ? GOLD : '#a9b0c8'
        ctx.lineWidth = 0.015
        ctx.beginPath()
        for (const runeX of [-0.11, 0, 0.11]) {
          ctx.moveTo(runeX - 0.025, 0.1)
          ctx.lineTo(runeX, 0.16)
          ctx.lineTo(runeX + 0.025, 0.1)
        }
        ctx.stroke()
      }
    },
  },

  frost: {
    body(ctx, _aimAngle, time, _isReady, tier) {
      // ледяное сияние вокруг (III)
      if (tier >= TIER_III) {
        const pulse = prefersReducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3)
        ctx.fillStyle = `rgba(170,230,255,${0.15 + pulse * 0.15})`
        circle(ctx, 0, 0, 0.3)
        ctx.fill()
      }
      ctx.rotate(time * 0.5)
      const armLength = FROST_ARM_LENGTH[tier] ?? FROST_ARM_LENGTH[0]
      ctx.strokeStyle = tier >= TIER_III ? '#f2fcff' : '#cdeffc'
      ctx.lineWidth = 0.05
      ctx.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(armLength, 0)
        ctx.moveTo(armLength * 0.64, 0)
        ctx.lineTo(armLength * 0.88, 0.06)
        ctx.moveTo(armLength * 0.64, 0)
        ctx.lineTo(armLength * 0.88, -0.06)
        ctx.stroke()
        if (tier >= TIER_II) drawIceCrystal(ctx, armLength)
      }
      ctx.fillStyle = tier >= TIER_III ? '#e9fbff' : '#8fd8ee'
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
    body(ctx, aimAngle, _time, isReady, tier) {
      ctx.rotate(aimAngle)
      // ложе: на III — шире, под два болта, и с железной оковкой
      const stockHalfWidth = tier >= TIER_III ? 0.09 : 0.06
      ctx.fillStyle = '#8a5d30'
      roundedRect(ctx, -0.24, -stockHalfWidth, 0.5, stockHalfWidth * 2, 0.03)
      ctx.fill()
      if (tier >= TIER_III) {
        ctx.strokeStyle = '#8a95ab'
        ctx.lineWidth = 0.02
        ctx.stroke()
      }
      // плечи лука
      ctx.strokeStyle = '#c08a4c'
      ctx.lineWidth = 0.065
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0.08, -0.3)
      ctx.quadraticCurveTo(0.3, 0, 0.08, 0.3)
      ctx.stroke()
      // железные накладки на плечах (II и III)
      if (tier >= TIER_II) {
        ctx.strokeStyle = '#a9b4c6'
        ctx.lineWidth = 0.075
        ctx.lineCap = 'butt'
        ctx.beginPath()
        ctx.moveTo(0.1, -0.27)
        ctx.lineTo(0.14, -0.21)
        ctx.moveTo(0.1, 0.27)
        ctx.lineTo(0.14, 0.21)
        ctx.stroke()
      }
      // тетива
      ctx.strokeStyle = PARCHMENT
      ctx.lineWidth = 0.02
      ctx.beginPath()
      ctx.moveTo(0.08, -0.3)
      ctx.lineTo(isReady ? -0.16 : 0.1, 0)
      ctx.lineTo(0.08, 0.3)
      ctx.stroke()
      if (isReady) {
        if (tier >= TIER_III) {
          drawBolt(ctx, -TWIN_BOLT_OFFSET)
          drawBolt(ctx, TWIN_BOLT_OFFSET)
        } else {
          drawBolt(ctx, 0)
        }
      }
    },
  },

  bell: {
    body(ctx, _aimAngle, time, _isReady, tier) {
      // Колокол чуть качается — видно, что он «звонит»
      ctx.rotate(prefersReducedMotion ? 0 : Math.sin(time * 3) * 0.12)
      // перекладина: на III — шире, под маленькие колокольчики
      const beamHalfLength = tier >= TIER_III ? 0.27 : 0.2
      ctx.strokeStyle = '#8a5d30'
      ctx.lineWidth = 0.05
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-beamHalfLength, -0.22)
      ctx.lineTo(beamHalfLength, -0.22)
      ctx.stroke()
      // III — золотой колокол и два колокольчика по бокам
      const bellColor = tier >= TIER_III ? '#f2c94c' : '#c99a3a'
      if (tier >= TIER_III) {
        drawBellShape(ctx, -0.23, -0.2, 0.35, bellColor)
        drawBellShape(ctx, 0.23, -0.2, 0.35, bellColor)
      }
      drawBellShape(ctx, 0, -0.22, BELL_SCALE[tier] ?? 1, bellColor)
    },
  },

  treasury: {
    body(ctx, _aimAngle, time, _isReady, tier) {
      const isOpen = tier >= TIER_III
      // III — крышка откинута назад, видно кучу золота
      if (isOpen) {
        ctx.fillStyle = '#9a6a38'
        ctx.strokeStyle = '#3e2712'
        ctx.lineWidth = 0.025
        roundedRect(ctx, -0.23, -0.3, 0.46, 0.13, 0.05)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = GOLD
        ctx.fillRect(-0.15, -0.3, 0.04, 0.13)
        ctx.fillRect(0.11, -0.3, 0.04, 0.13)
      }
      // сундук
      ctx.fillStyle = '#7a4f28'
      ctx.strokeStyle = '#3e2712'
      ctx.lineWidth = 0.025
      roundedRect(ctx, -0.22, -0.08, 0.44, 0.26, 0.03)
      ctx.fill()
      ctx.stroke()
      if (isOpen) {
        // гора монет над краем сундука
        ctx.fillStyle = '#e8b93e'
        ctx.beginPath()
        ctx.moveTo(-0.21, -0.06)
        ctx.quadraticCurveTo(0, -0.26, 0.21, -0.06)
        ctx.closePath()
        ctx.fill()
        drawCoin(ctx, -0.1, -0.1, 0.045)
        drawCoin(ctx, 0.04, -0.15, 0.045)
        drawCoin(ctx, 0.13, -0.09, 0.04)
        // блеск мигает
        const twinkle = prefersReducedMotion ? 1 : 0.6 + 0.4 * Math.sin(time * 4)
        drawTwinkle(ctx, -0.02, -0.2, 0.05 * twinkle)
      } else {
        // крышка
        ctx.fillStyle = '#9a6a38'
        roundedRect(ctx, -0.23, -0.2, 0.46, 0.13, 0.05)
        ctx.fill()
        ctx.stroke()
      }
      // окованные полосы и замок
      ctx.fillStyle = GOLD
      ctx.fillRect(-0.15, isOpen ? -0.08 : -0.2, 0.04, isOpen ? 0.26 : 0.38)
      ctx.fillRect(0.11, isOpen ? -0.08 : -0.2, 0.04, isOpen ? 0.26 : 0.38)
      roundedRect(ctx, -0.045, isOpen ? -0.04 : -0.1, 0.09, 0.1, 0.02)
      ctx.fill()
      // монеты сверху на крышке: на II — горкой побольше
      if (!isOpen) {
        drawCoin(ctx, -0.05, -0.24, 0.05)
        drawCoin(ctx, 0.06, -0.25, 0.045)
        if (tier >= TIER_II) {
          drawCoin(ctx, -0.15, -0.23, 0.04)
          drawCoin(ctx, 0.01, -0.31, 0.04)
          drawCoin(ctx, 0.15, -0.23, 0.038)
        }
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

/** Цвет кольца вокруг постамента на ступенях II и III: серебро и золото (у I кольца нет) */
const TIER_RING_COLORS = ['', '#c3cbd9', GOLD]
/** Радиус кольца ступени, клеток: снаружи каменного обода (0.37) */
const TIER_RING_RADIUS = 0.395
/** Толщина кольца ступени и тёмного зазора вокруг него, клеток */
const TIER_RING_WIDTH = 0.028
const TIER_RING_GAP_WIDTH = 0.05

/**
 * Кольцо ступени вокруг постамента: серебряное (II) или золотое (III).
 * Снаружи и с тёмным зазором — чтобы золото рамки не сливалось с золотом самой башни
 * (колокол Звонаря, сундук Казны, лук лучника III)
 */
function drawTierRing(ctx: Canvas2D, tier: number) {
  ctx.strokeStyle = '#2a2e45'
  ctx.lineWidth = TIER_RING_GAP_WIDTH
  circle(ctx, 0, 0, TIER_RING_RADIUS)
  ctx.stroke()
  ctx.strokeStyle = TIER_RING_COLORS[tier] ?? GOLD
  ctx.lineWidth = TIER_RING_WIDTH
  circle(ctx, 0, 0, TIER_RING_RADIUS)
  ctx.stroke()
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
  // каменный обод — у всех ступеней одинаковый; ступень II и III видно по кольцу снаружи
  ctx.fillStyle = '#5a6186'
  circle(ctx, 0, 0, 0.37)
  ctx.fill()
  if (tier >= TIER_II) drawTierRing(ctx, tier)
  ctx.fillStyle = '#3b4162'
  circle(ctx, 0, 0, 0.3)
  ctx.fill()

  const art = TOWER_ART[towerId] ?? FALLBACK_TOWER_ART
  ctx.save()
  art.body(ctx, aimAngle, time, isReady, tier)
  ctx.restore()

  // точки ступени — с тёмной обводкой, чтобы не сливались с золотыми деталями башни
  ctx.fillStyle = GOLD
  ctx.strokeStyle = '#2a2e45'
  ctx.lineWidth = 0.015
  for (let i = 0; i <= tier; i++) {
    circle(ctx, (i - tier / 2) * 0.13, 0.32, 0.042)
    ctx.fill()
    ctx.stroke()
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
