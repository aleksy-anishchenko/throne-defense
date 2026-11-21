// Колокольчик виден всегда; проценты и связи — только у выбранного источника/получателя.
import type { Tower } from '@throne/game'
import {
  focusedBellBuffs,
  type BellBuff,
  type BellPreview,
  type TowerBellPreview,
} from '../utils/bellSupport'
import { TOWER_MARK_OFFSET, TOWER_MARK_RADIUS, circle, roundedRect, type Canvas2D } from './shapes'

const BELL_BLUE = '#9ddaff'
const REJECTED = '#f0866a'
type Position = { x: number; y: number }

/** Векторный значок, не зависящий от наличия emoji-шрифта. */
function drawBellGlyph(ctx: Canvas2D, x: number, y: number, size: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size, size)
  ctx.lineWidth = 0.17
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-0.65, 0.4)
  ctx.quadraticCurveTo(-0.45, 0.1, -0.45, -0.25)
  ctx.quadraticCurveTo(-0.45, -0.7, 0, -0.7)
  ctx.quadraticCurveTo(0.45, -0.7, 0.45, -0.25)
  ctx.quadraticCurveTo(0.45, 0.1, 0.65, 0.4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -0.7)
  ctx.lineTo(0, -0.9)
  ctx.stroke()
  circle(ctx, 0, 0.68, 0.14)
  ctx.fill()
  ctx.restore()
}

/** Колокольчик занимает нижний левый угол рядом с постаментом. */
function drawBellMark(ctx: Canvas2D, tower: Tower) {
  const x = tower.x - TOWER_MARK_OFFSET
  const y = tower.y + TOWER_MARK_OFFSET
  ctx.save()
  circle(ctx, x, y, TOWER_MARK_RADIUS)
  ctx.fillStyle = '#182b45'
  ctx.fill()
  ctx.strokeStyle = BELL_BLUE
  ctx.lineWidth = 0.016
  ctx.stroke()
  ctx.fillStyle = BELL_BLUE
  drawBellGlyph(ctx, x, y, 0.076)
  ctx.restore()
}

function drawBellLabel(
  ctx: Canvas2D,
  position: Position,
  bonus: number,
  cellCssPx: number,
  isPreview = false,
  isAllowed = true,
) {
  const text = `${isPreview ? '→ ' : ''}+${Math.round(bonus * 100)}%`
  ctx.save()
  const color = isAllowed ? BELL_BLUE : REJECTED
  const fontSize = Math.min(0.28, Math.max(0.21, 10 / cellCssPx))
  ctx.font = `800 ${fontSize}px "Alegreya Sans", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const width = Math.min(0.82, Math.max(0.68, ctx.measureText(text).width + 0.29))
  const height = fontSize + 0.08
  const left = position.x - width / 2
  const top = Math.max(0.02, position.y - 0.56)
  roundedRect(ctx, left, top, width, height, 0.07)
  ctx.fillStyle = '#182b45'
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = isPreview ? 0.018 : 0.025
  if (isPreview) ctx.setLineDash([0.05, 0.045])
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = color
  drawBellGlyph(ctx, left + 0.115, top + height / 2, 0.075)
  const textWidth = width - 0.27
  ctx.fillText(text, left + 0.22 + textWidth / 2, top + height / 2, textWidth)
  ctx.restore()
}

function drawBellLink(
  ctx: Canvas2D,
  from: Position,
  to: Position,
  isPreview = false,
  isAllowed = true,
) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  if (distance === 0) return
  const inset = 0.42 / distance
  const vertical = from.x === to.x
  const directionY = Math.sign(to.y - from.y)
  // Вертикальная связь сбоку от плашки с процентом.
  const startX = vertical ? from.x + 0.45 : from.x + (to.x - from.x) * inset
  const startY = vertical ? from.y + directionY * 0.18 : from.y + (to.y - from.y) * inset
  const endX = vertical ? to.x + 0.45 : to.x - (to.x - from.x) * inset
  const endY = vertical ? to.y - directionY * 0.18 : to.y - (to.y - from.y) * inset
  ctx.save()
  ctx.lineCap = 'round'
  if (isPreview) ctx.setLineDash([0.07, 0.07])
  ctx.beginPath()
  ctx.moveTo(startX, startY)
  ctx.lineTo(endX, endY)
  ctx.strokeStyle = 'rgba(12,22,40,.9)'
  ctx.lineWidth = 0.1
  ctx.stroke()
  ctx.strokeStyle = isAllowed ? BELL_BLUE : REJECTED
  ctx.lineWidth = isPreview ? 0.025 : 0.04
  ctx.stroke()
  ctx.restore()
}

export function drawBellConnections(ctx: Canvas2D, buffs: readonly BellBuff[]) {
  for (const { source, tower } of buffs) drawBellLink(ctx, source, tower)
}

export function drawBellIndicators(
  ctx: Canvas2D,
  buffs: readonly BellBuff[],
  selected: Tower | null | undefined,
  cellCssPx: number,
) {
  const focused = new Map<Tower, number>()
  for (const { tower, bonus } of focusedBellBuffs(buffs, selected)) {
    focused.set(tower, (focused.get(tower) ?? 0) + bonus)
  }
  for (const tower of new Set(buffs.map((buff) => buff.tower))) {
    const bonus = focused.get(tower)
    if (bonus !== undefined) drawBellLabel(ctx, tower, bonus, cellCssPx)
    else drawBellMark(ctx, tower)
  }
}

/** Только реальная прибавка: уже получающие не меньший бонус не получают фиктивную связь. */
export function drawBellPreview(
  ctx: Canvas2D,
  preview: BellPreview,
  cellCssPx: number,
  isAllowed: boolean,
) {
  for (const { tower, bonus } of preview.improved) {
    drawBellLink(ctx, preview.source, tower, true, isAllowed)
    drawBellLabel(ctx, tower, bonus, cellCssPx, true, isAllowed)
  }
}

/** Звонарь уже стоит, получатель ещё в «руке»: показываем будущий бонус, не действующий. */
export function drawTowerBellPreview(
  ctx: Canvas2D,
  preview: TowerBellPreview,
  cellCssPx: number,
  isAllowed: boolean,
) {
  for (const source of preview.sources) drawBellLink(ctx, source, preview.tower, true, isAllowed)
  drawBellLabel(ctx, preview.tower, preview.bonus, cellCssPx, true, isAllowed)
}
