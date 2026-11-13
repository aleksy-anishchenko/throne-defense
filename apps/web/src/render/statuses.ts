// Как выглядят эффекты на враге: огонь, мороз, проклятие, сеть.
//
// Общие правила — у каждого эффекта одни и те же «слои», отличаются только цвет и рисунок:
// 1. Кольцо у ног — под телом. Колец два места («слота»), у всех одна толщина:
//    ближнее — огонь или мороз (вместе не бывают: огонь растапливает лёд, холод тушит огонь),
//    дальнее — проклятие. Так кольца разных эффектов не налезают друг на друга.
//    Сеть кольца не рисует — она сама круглая.
// 2. Оттенок тела — цветом эффекта, одной прозрачности.
// 3. Знак на модельке — поверх тела: иней, сеть, пламя.
// 4. Частицы (render/effects.ts): от огня искры летят вверх, с мороза сыплется снег.
// Цветные кольца — то, что вредит врагу. Золото — наше (бафф Звонаря у башен).
//
// Новый эффект — новая запись в STATUS_LOOKS (и, если нужно, в STATUS_PARTICLES в effects.ts).

import type { Enemy } from '@throne/game'
import { circle, drawNet, prefersReducedMotion } from './shapes'
import type { Canvas2D } from './shapes'

/** Цвета эффектов (RGB для прозрачности) */
export const FIRE_RGB = '255,130,40'
export const FROST_RGB = '170,230,255'
export const CURSE_RGB = '190,120,255'

/** Цвета пламени: снаружи внутрь. Светлая сердцевина и тёмная обводка — видно на любом фоне */
const FIRE_OUTER = '#ff6a1a'
const FIRE_MIDDLE = '#ffc23a'
const FIRE_CORE = '#fff4b8'
const FIRE_OUTLINE = 'rgba(70,18,0,.85)'

/** Насколько кольцо у ног выходит за край врага, клеток: [ближнее место, дальнее] */
const RING_SLOT_MARGINS = [0.07, 0.14] as const
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
        enemy.burnTimeLeft > 0 ? '#ff8a2a' : '#a9b4c6',
      ),
  },
  {
    // Огонь: мерцающее оранжевое кольцо со свечением, оранжевый оттенок, языки пламени
    isActive: (enemy) => enemy.burnTimeLeft > 0,
    rgb: FIRE_RGB,
    ring: { slot: 0, hasGlow: true, brightness: flicker(11, 0.5) },
    hasTint: true,
    drawMark: (ctx, radius, time) => drawFlames(ctx, radius, time),
  },
]

/** Кольца у ног — до тела врага */
export function drawStatusRings(ctx: Canvas2D, enemy: Enemy, radius: number, time: number) {
  for (const look of STATUS_LOOKS) {
    const ring = look.ring
    if (!ring || !look.isActive(enemy)) continue
    const ringRadius = radius + RING_SLOT_MARGINS[ring.slot]
    if (ring.hasGlow) {
      ctx.fillStyle = `rgba(${look.rgb},.22)`
      circle(ctx, 0, 0, ringRadius)
      ctx.fill()
    }
    ctx.strokeStyle = `rgba(${look.rgb},${0.45 + 0.5 * ring.brightness(time)})`
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
    ctx.fillStyle = `rgba(${look.rgb},${TINT_ALPHA})`
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
) {
  flamePath(ctx, x, baseY, width, height, sway)
  ctx.fillStyle = FIRE_OUTER
  ctx.fill()
  ctx.strokeStyle = FIRE_OUTLINE
  ctx.lineWidth = outlineWidth
  ctx.stroke()
  flamePath(ctx, x, baseY, width * 0.62, height * 0.68, sway * 0.6)
  ctx.fillStyle = FIRE_MIDDLE
  ctx.fill()
  flamePath(ctx, x, baseY, width * 0.3, height * 0.38, sway * 0.3)
  ctx.fillStyle = FIRE_CORE
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
function drawFlames(ctx: Canvas2D, radius: number, time: number) {
  ctx.lineJoin = 'round'
  BURN_TONGUES.forEach(([shareX, shareY, widthShare, heightShare], i) => {
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
    )
  })
}

// ——— Баффы наших башен ———

/** Цвет «нашего» эффекта — золото (RGB для прозрачности) */
export const BUFF_RGB = '227,178,74'
/** Радиус золотого кольца у ускоренной башни, клеток: снаружи основания (кольцо выбора — 0,41, сплошное) */
const BUFF_RING_RADIUS = 0.47
/** Как быстро качается колокол Звонаря, рад/с: кольцо пульсирует в такт (см. towers.ts) */
export const BELL_SWING_SPEED = 3

/**
 * Башня, которую ускоряет Звонарь: золотое свечение у основания и пунктирное кольцо,
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
