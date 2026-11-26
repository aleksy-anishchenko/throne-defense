// Как выглядят эффекты на враге: огонь, мороз, проклятие, сеть, раскол лат и паника.
//
// Общие правила — у каждого эффекта одни и те же «слои», отличаются только цвет и рисунок:
// 1. Кольца у ног — под телом. Ближнее — огонь или мороз, следующее — проклятие.
//    Когда «Лёд и пламя» совмещает огонь с морозом, огненное кольцо рисуем снаружи.
//    Сеть кольца не рисует — она сама круглая.
// 2. Оттенок тела — цветом эффекта, одной прозрачности.
// 3. Знак на модельке — поверх тела: иней, сеть, пламя.
// 4. Частицы (render/effects.ts): от огня искры летят вверх, с мороза сыплется снег.
// На врагах кольца обозначают вредящие им эффекты; у башен ускорение Звонаря голубое, доход Казны золотой.
//
// Новый эффект — новая запись в STATUS_LOOKS (и, если нужно, в STATUS_PARTICLES в effects.ts).

import { burnTimeRemaining, type Enemy } from '@throne/game'
import { circle, drawNet, prefersReducedMotion } from './shapes'
import type { Canvas2D } from './shapes'

/** Цвета эффектов (RGB для прозрачности) */
export const FIRE_RGB = '255,130,40'
export const FROST_RGB = '170,230,255'
export const CURSE_RGB = '190,120,255'

/** Цвета пламени: снаружи внутрь. Светлая сердцевина и тёмная обводка — видно на любом фоне */
export const FIRE = {
  rgb: FIRE_RGB,
  outer: '#ff6a1a',
  middle: '#ffc23a',
  core: '#fff4b8',
  outline: 'rgba(70,18,0,.85)',
}
export const WILDFIRE = {
  rgb: '74,147,255',
  outer: '#325de2',
  middle: '#49c7ff',
  core: '#f2ffff',
  outline: '#162d67',
}

/** Насколько кольцо у ног выходит за край врага, клеток. */
const RING_SLOT_MARGINS = [0.07, 0.14, 0.21] as const
/** Толщина кольца у ног — одна для всех эффектов, клеток */
const RING_WIDTH = 0.032
/** Прозрачность оттенка тела — одна для всех эффектов */
const TINT_ALPHA = 0.24
/** Насколько сеть на враге шире самого врага, в долях радиуса */
const ROOT_NET_SCALE = 1.25

interface RingLook {
  /** 0 — ближнее место, 1 — дальнее */
  slot: 0 | 1
  /** Пунктир — у «магии» (проклятие); сплошное — у стихий */
  isDashed?: boolean
  /** Мягкая заливка внутри кольца — свечение у ног */
  hasGlow?: boolean
  /**
   * Как «живёт» кольцо: яркость от 0 до 1 в момент time.
   * Огонь мерцает быстро, проклятие медленно пульсирует, лёд ровный
   */
  brightness(time: number): number
}

interface StatusLook {
  isActive(enemy: Enemy): boolean
  /** Цвет эффекта: кольцо и оттенок тела */
  rgb: string
  ring?: RingLook
  /** Красить ли тело оттенком эффекта */
  hasTint: boolean
  /** Знак на модельке, поверх тела. (0, 0) — центр врага */
  drawMark?(ctx: Canvas2D, radius: number, time: number, enemy: Enemy): void
}

const steady = () => 1
const flicker = (speed: number, depth: number) => (time: number) =>
  prefersReducedMotion ? 1 - depth / 2 : 1 - depth / 2 + (depth / 2) * Math.sin(time * speed)

/**
 * Эффекты в порядке рисования знаков: снизу вверх. Пламя последним — оно выше всех
 * и «съедает» сеть (горящего сеть не держит, но в момент поджога видно оба)
 */
const STATUS_LOOKS: readonly StatusLook[] = [
  {
    // Мороз: ровное голубое кольцо со свечением, голубой оттенок, иней на макушке
    isActive: (enemy) => enemy.slowTimeLeft > 0,
    rgb: FROST_RGB,
    ring: { slot: 0, hasGlow: true, brightness: steady },
    hasTint: true,
    drawMark: (ctx, radius) => drawFrostCrust(ctx, radius),
  },
  {
    // Проклятие: пунктирное фиолетовое кольцо (дальнее), блёклый фиолетовый оттенок
    isActive: (enemy) => enemy.curseTimeLeft > 0,
    rgb: CURSE_RGB,
    ring: { slot: 1, isDashed: true, brightness: flicker(6, 0.5) },
    hasTint: true,
  },
  {
    // Раскол лат: отдельный знак щита, без третьего кольца и лишнего оттенка.
    isActive: (enemy) => enemy.armorBreakTimeLeft > 0,
    rgb: '145,219,239',
    hasTint: false,
    drawMark: (ctx, radius) => drawBrokenArmor(ctx, radius),
  },
  {
    isActive: (enemy) => enemy.oilTimeLeft > 0,
    rgb: '192,144,84',
    hasTint: false,
    drawMark(ctx, radius) {
      ctx.save()
      ctx.translate(-0.72 * radius, 0.43 * radius)
      ctx.scale(radius, radius)
      ctx.fillStyle = '#251b24'
      ctx.strokeStyle = '#e6b378'
      ctx.lineWidth = 0.085
      ctx.beginPath()
      ctx.moveTo(0.04, -0.65)
      ctx.bezierCurveTo(0.04, -0.36, 0.34, -0.18, 0.28, 0.07)
      ctx.bezierCurveTo(0.21, 0.4, -0.31, 0.35, -0.29, 0.04)
      ctx.bezierCurveTo(-0.29, -0.18, -0.09, -0.36, 0.04, -0.65)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    },
  },
  {
    // Сеть: сама сеть поверх врага, чуть шире его; без кольца и оттенка.
    // Горит (враг в огне) — грузила тлеют оранжевым: сеть скоро сгорит
    isActive: (enemy) => enemy.rootTimeLeft > 0,
    rgb: '217,192,138',
    hasTint: false,
    drawMark: (ctx, radius, _time, enemy) =>
      drawNet(
        ctx,
        0,
        0,
        radius * ROOT_NET_SCALE,
        0.4,
        burnTimeRemaining(enemy) > 0 ? '#ff8a2a' : '#a9b4c6',
      ),
  },
  {
    // Огонь: мерцающее оранжевое кольцо со свечением, оранжевый оттенок, языки пламени
    isActive: (enemy) => burnTimeRemaining(enemy) > 0,
    rgb: FIRE_RGB,
    ring: { slot: 0, hasGlow: true, brightness: flicker(11, 0.5) },
    hasTint: true,
    drawMark: drawFlames,
  },
]

function shieldPath(ctx: Canvas2D) {
  ctx.beginPath()
  ctx.moveTo(-0.4, -0.35)
  ctx.lineTo(0.4, -0.35)
  ctx.lineTo(0.3, 0.2)
  ctx.lineTo(0, 0.5)
  ctx.lineTo(-0.3, 0.2)
  ctx.closePath()
}

function drawBrokenArmor(ctx: Canvas2D, radius: number) {
  ctx.save()
  ctx.translate(radius * 0.65, -radius * 0.7)
  ctx.scale(radius, radius)
  ctx.fillStyle = '#24374a'
  ctx.strokeStyle = '#91dbef'
  ctx.lineWidth = 0.09
  ctx.lineJoin = 'round'
  shieldPath(ctx)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0.1, -0.35)
  ctx.lineTo(-0.12, 0)
  ctx.lineTo(0.12, 0.12)
  ctx.lineTo(0, 0.45)
  ctx.stroke()
  ctx.restore()
}

/** Круг знамени рисуем под войском, чтобы граница читалась поверх ковра. */
export function drawBannerRange(ctx: Canvas2D, x: number, y: number, range: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(235, 168, 91, .12)'
  ctx.strokeStyle = '#f2ad60'
  ctx.lineWidth = 0.028
  ctx.setLineDash([0.14, 0.1])
  circle(ctx, x, y, range)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** Щит над получателем дополнительной брони. */
export function drawBannerShield(ctx: Canvas2D, x: number, y: number) {
  ctx.save()
  ctx.translate(x + 0.14, y - 0.74)
  ctx.scale(0.25, 0.25)
  ctx.fillStyle = '#f2ad60'
  ctx.strokeStyle = '#412633'
  ctx.lineWidth = 0.15
  ctx.lineJoin = 'round'
  shieldPath(ctx)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function statusRgb(look: StatusLook, enemy: Enemy) {
  return look.rgb === FIRE_RGB && enemy.wildfire ? WILDFIRE.rgb : look.rgb
}

/** Кольца у ног — до тела врага */
export function drawStatusRings(ctx: Canvas2D, enemy: Enemy, radius: number, time: number) {
  for (const look of STATUS_LOOKS) {
    const ring = look.ring
    if (!ring || !look.isActive(enemy)) continue
    const slot = look.rgb === FIRE_RGB && enemy.slowTimeLeft > 0 ? 2 : ring.slot
    const ringRadius = radius + RING_SLOT_MARGINS[slot]
    const rgb = statusRgb(look, enemy)
    if (ring.hasGlow) {
      ctx.fillStyle = `rgba(${rgb},.22)`
      circle(ctx, 0, 0, ringRadius)
      ctx.fill()
    }
    ctx.strokeStyle = `rgba(${rgb},${0.45 + 0.5 * ring.brightness(time)})`
    ctx.lineWidth = RING_WIDTH
    if (ring.isDashed) ctx.setLineDash([0.06, 0.05])
    circle(ctx, 0, 0, ringRadius)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/** Оттенки и знаки — после тела врага */
export function drawStatusMarks(ctx: Canvas2D, enemy: Enemy, radius: number, time: number) {
  for (const look of STATUS_LOOKS) {
    if (!look.hasTint || !look.isActive(enemy)) continue
    ctx.fillStyle = `rgba(${statusRgb(look, enemy)},${TINT_ALPHA})`
    circle(ctx, 0, 0, radius)
    ctx.fill()
  }
  for (const look of STATUS_LOOKS) {
    if (look.drawMark && look.isActive(enemy)) look.drawMark(ctx, radius, time, enemy)
  }
}

// ——— Мороз ———

/** Льдинки на враге: [угол, на сколько торчит наружу — в долях радиуса] */
const FROST_SHARDS: readonly (readonly [number, number])[] = [
  [Math.PI * 1.2, 0.3],
  [Math.PI * 1.4, 0.45],
  [Math.PI * 1.62, 0.35],
  [Math.PI * 1.82, 0.4],
  [Math.PI * 0.85, 0.22],
]

/**
 * Иней на модельке: белая «шапка» по верхнему краю и торчащие льдинки.
 * Не над врагом в воздухе, а на нём самом — видно, что замёрз именно он
 */
function drawFrostCrust(ctx: Canvas2D, radius: number) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // шапка инея по верхней дуге
  ctx.strokeStyle = 'rgba(236,250,255,.95)'
  ctx.lineWidth = radius * 0.2
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.92, Math.PI * 1.08, Math.PI * 1.92)
  ctx.stroke()
  // льдинки-кристаллы: треугольники, торчащие наружу из края
  ctx.fillStyle = '#e3f7ff'
  ctx.strokeStyle = 'rgba(70,140,190,.9)'
  ctx.lineWidth = radius * 0.06
  for (const [angle, length] of FROST_SHARDS) {
    const baseX = Math.cos(angle) * radius * 0.85
    const baseY = Math.sin(angle) * radius * 0.85
    const tipX = Math.cos(angle) * radius * (1 + length)
    const tipY = Math.sin(angle) * radius * (1 + length)
    const sideX = -Math.sin(angle) * radius * 0.16
    const sideY = Math.cos(angle) * radius * 0.16
    ctx.beginPath()
    ctx.moveTo(baseX - sideX, baseY - sideY)
    ctx.lineTo(tipX, tipY)
    ctx.lineTo(baseX + sideX, baseY + sideY)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

// ——— Огонь ———

/**
 * Путь-язык пламени: капля острым концом вверх. x, baseY — середина основания,
 * width — ширина, height — высота, sway — насколько кончик качнулся вбок (в долях ширины)
 */
function flamePath(
  ctx: Canvas2D,
  x: number,
  baseY: number,
  width: number,
  height: number,
  sway = 0,
) {
  const half = width / 2
  const tipX = x + sway * width
  ctx.beginPath()
  ctx.moveTo(x - half, baseY)
  ctx.bezierCurveTo(
    x - half,
    baseY - height * 0.45,
    tipX - half * 0.2,
    baseY - height * 0.7,
    tipX,
    baseY - height,
  )
  ctx.bezierCurveTo(
    tipX + half * 0.2,
    baseY - height * 0.7,
    x + half,
    baseY - height * 0.45,
    x + half,
    baseY,
  )
  // круглое донышко
  ctx.quadraticCurveTo(x + half, baseY + width * 0.45, x, baseY + width * 0.45)
  ctx.quadraticCurveTo(x - half, baseY + width * 0.45, x - half, baseY)
  ctx.closePath()
}

/**
 * Язык пламени в три слоя: тёмная обводка + оранжевый, жёлтый, почти белая сердцевина.
 * Обводка отделяет огонь от рыжего врага и красного ковра, сердцевина — самое яркое место на поле
 */
function drawFlame(
  ctx: Canvas2D,
  x: number,
  baseY: number,
  width: number,
  height: number,
  sway: number,
  outlineWidth: number,
  palette: typeof FIRE,
) {
  flamePath(ctx, x, baseY, width, height, sway)
  ctx.fillStyle = palette.outer
  ctx.fill()
  ctx.strokeStyle = palette.outline
  ctx.lineWidth = outlineWidth
  ctx.stroke()
  flamePath(ctx, x, baseY, width * 0.62, height * 0.68, sway * 0.6)
  ctx.fillStyle = palette.middle
  ctx.fill()
  flamePath(ctx, x, baseY, width * 0.3, height * 0.38, sway * 0.3)
  ctx.fillStyle = palette.core
  ctx.fill()
}

/**
 * Языки пламени на враге: [доля радиуса по x, где основание по y, ширина, высота — в долях радиуса].
 * Средний — высокий, выше макушки: силуэт врага меняется, огонь виден и на телефоне
 */
const BURN_TONGUES: readonly (readonly [number, number, number, number])[] = [
  [-0.55, 0.05, 0.55, 1.05],
  [0.55, 0.1, 0.5, 0.95],
  [0, -0.25, 0.75, 1.45],
]

/** Три пляшущих языка пламени поверх врага */
function drawFlames(ctx: Canvas2D, radius: number, time: number, enemy: Enemy) {
  ctx.lineJoin = 'round'
  BURN_TONGUES.forEach(([shareX, shareY, widthShare, heightShare], i) => {
    const palette = enemy.wildfire && (!enemy.oilBurn || shareX === 0) ? WILDFIRE : FIRE
    const flickerShare = prefersReducedMotion ? 1 : 0.85 + 0.15 * Math.sin(time * 14 + i * 2.1)
    const sway = prefersReducedMotion ? 0 : 0.18 * Math.sin(time * 9 + i * 1.7)
    drawFlame(
      ctx,
      shareX * radius,
      shareY * radius,
      widthShare * radius,
      heightShare * radius * flickerShare,
      sway,
      radius * 0.09,
      palette,
    )
  })
}

// ——— Баффы наших башен ———

/** Ускорение Звонаря — голубое; золото оставлено доходу Казны. */
export const BUFF_RGB = '157,218,255'
/** Радиус кольца у ускоренной башни, клеток: снаружи основания (кольцо выбора — 0,41, сплошное) */
const BUFF_RING_RADIUS = 0.47
/** Как быстро качается колокол Звонаря, рад/с: кольцо пульсирует в такт (см. towers.ts) */
export const BELL_SWING_SPEED = 3

/**
 * Башня, которую ускоряет Звонарь: голубое свечение у основания и пунктирное кольцо,
 * пульсирующее в такт колоколу. Пунктир — чтобы не спутать со сплошным кольцом выбора.
 * (0, 0) — центр башни; рисуется до самой башни
 */
export function drawBuffRing(ctx: Canvas2D, time: number) {
  const pulse = prefersReducedMotion ? 0.6 : 0.5 + 0.5 * Math.abs(Math.sin(time * BELL_SWING_SPEED))
  ctx.fillStyle = `rgba(${BUFF_RGB},${0.08 + 0.1 * pulse})`
  circle(ctx, 0, 0, BUFF_RING_RADIUS)
  ctx.fill()
  ctx.strokeStyle = `rgba(${BUFF_RGB},${0.45 + 0.5 * pulse})`
  ctx.lineWidth = RING_WIDTH
  ctx.setLineDash([0.05, 0.05])
  ctx.lineDashOffset = prefersReducedMotion ? 0 : -time * 0.15
  circle(ctx, 0, 0, BUFF_RING_RADIUS)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineDashOffset = 0
}
