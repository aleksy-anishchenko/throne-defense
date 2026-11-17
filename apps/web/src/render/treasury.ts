// Постоянно — аура и монетка. Проценты и связи — при выборе, предпросмотр — пунктирный.
// Бонусы берём из правил игры, а не пересчитываем отдельной формулой для картинки.
import { TOWERS, treasuryBonusOf, treasuryNeighbors, type Tower } from '@throne/game'
import { circle, roundedRect, type Canvas2D } from './shapes'

type Position = { x: number; y: number }

export interface TreasuryLink {
  from: Tower
  to: Tower
}

export interface TreasuryBonus {
  tower: Tower
  bonus: number
}

export function treasurySynergy(towers: readonly Tower[]) {
  const treasuries = towers.filter((tower) => tower.def.id === 'treasury')
  return {
    bonuses: treasuries.map((tower) => ({ tower, bonus: treasuryBonusOf(treasuries, tower) })),
    links: treasuries.flatMap((from) =>
      treasuryNeighbors(treasuries, from)
        .filter((to) => from.id < to.id)
        .map((to) => ({ from, to })),
    ),
  }
}

/** Только непосредственные связи выбранной Казны, а не вся цепочка соседства. */
export function focusedTreasuryLinks(
  links: readonly TreasuryLink[],
  selected: Tower | null | undefined,
) {
  return selected?.def.id === 'treasury'
    ? links.filter(({ from, to }) => from === selected || to === selected)
    : []
}

export function focusedTreasuryBonuses(
  bonuses: readonly TreasuryBonus[],
  selected: Tower | null | undefined,
) {
  if (selected?.def.id !== 'treasury') return []
  const neighbors = new Set(
    treasuryNeighbors(
      bonuses.map(({ tower }) => tower),
      selected,
    ),
  )
  return bonuses.filter(({ tower }) => tower === selected || neighbors.has(tower))
}

export function treasuryPlacementPreview(towers: readonly Tower[], col: number, row: number) {
  const candidate = towers.find((tower) => tower.col === col && tower.row === row) ?? {
    def: TOWERS['treasury'],
    col,
    row,
  }
  return {
    neighbors: treasuryNeighbors(towers, candidate),
    bonus: treasuryBonusOf(towers, candidate),
  }
}

const LINK_GOLD = '#ffe297'
const PREVIEW_GOLD = '#f0d49a'
const REJECTED = '#f0866a'

/** Короткая связь между краями постаментов; монетка в середине — только у действующей связи. */
function drawLink(
  ctx: Canvas2D,
  from: Position,
  to: Position,
  isPreview: boolean,
  isAllowed = true,
) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  if (distance === 0) return
  const inset = 0.41 / distance
  // Вертикальную связь ведём сбоку: плашка над нижним сундуком не должна её закрывать.
  const isVertical = from.x === to.x
  const directionY = Math.sign(to.y - from.y)
  const startX = isVertical ? from.x + 0.445 : from.x + (to.x - from.x) * inset
  const startY = isVertical ? from.y + directionY * 0.18 : from.y + (to.y - from.y) * inset
  const endX = isVertical ? to.x + 0.445 : to.x - (to.x - from.x) * inset
  const endY = isVertical ? to.y - directionY * 0.18 : to.y - (to.y - from.y) * inset
  ctx.save()
  ctx.lineCap = 'round'
  if (isPreview) ctx.setLineDash([0.06, 0.07])
  ctx.beginPath()
  ctx.moveTo(startX, startY)
  ctx.lineTo(endX, endY)
  ctx.strokeStyle = 'rgba(32,22,10,.9)'
  ctx.lineWidth = 0.12
  ctx.stroke()
  ctx.strokeStyle = !isAllowed ? REJECTED : isPreview ? PREVIEW_GOLD : LINK_GOLD
  ctx.lineWidth = isPreview ? 0.035 : 0.055
  ctx.stroke()
  if (!isPreview) {
    circle(ctx, (startX + endX) / 2, (startY + endY) / 2, 0.055)
    ctx.fillStyle = LINK_GOLD
    ctx.fill()
    ctx.strokeStyle = '#72501e'
    ctx.lineWidth = 0.015
    ctx.stroke()
  }
  ctx.restore()
}

/** Аура видна всегда, а связи — только у выбранной Казны. Рисуется до башен. */
export function drawTreasuryNetwork(
  ctx: Canvas2D,
  bonuses: readonly TreasuryBonus[],
  links: readonly TreasuryLink[],
  selected: Tower | null | undefined = null,
) {
  ctx.save()
  for (const { tower, bonus } of bonuses) {
    if (bonus <= 0) continue
    circle(ctx, tower.x, tower.y, 0.46)
    ctx.fillStyle = 'rgba(255,207,101,.16)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,226,151,.8)'
    ctx.lineWidth = 0.03
    ctx.stroke()
  }
  for (const { from, to } of focusedTreasuryLinks(links, selected)) drawLink(ctx, from, to, false)
  ctx.restore()
}

/** Стопка монет с бликом: на малом размере не похожа на «0» или статус с цифрой. */
function drawTreasuryMark(ctx: Canvas2D, tower: Tower) {
  const x = tower.x - 0.28
  const y = tower.y - 0.27
  ctx.save()
  circle(ctx, x, y, 0.12)
  ctx.fillStyle = '#302211'
  ctx.fill()
  ctx.strokeStyle = LINK_GOLD
  ctx.lineWidth = 0.018
  ctx.stroke()
  ctx.strokeStyle = '#82551b'
  ctx.lineWidth = 0.014
  for (const offset of [0.036, 0.005, -0.026]) {
    ctx.beginPath()
    ctx.ellipse(x, y + offset, 0.077, 0.031, 0, 0, Math.PI * 2)
    ctx.fillStyle = offset === -0.026 ? '#ffe9a3' : '#e3b24a'
    ctx.fill()
    ctx.stroke()
  }
  ctx.strokeStyle = '#fff6d6'
  ctx.lineWidth = 0.012
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - 0.04, y - 0.032)
  ctx.lineTo(x - 0.018, y - 0.043)
  ctx.stroke()
  ctx.restore()
}

/** Контрастная плашка не смешивается с рисунком пола; у верхней границы не обрезается. */
export function drawTreasuryBonus(
  ctx: Canvas2D,
  position: Position,
  bonus: number,
  cellCssPx: number,
  isPreview = false,
  isAllowed = true,
) {
  const text = `${isPreview ? '→ ' : ''}+${Math.round(bonus * 100)}%`
  const color = !isAllowed ? REJECTED : bonus > 0 ? LINK_GOLD : '#c2beb2'
  ctx.save()
  const fontSize = Math.min(0.3, Math.max(0.22, 10 / cellCssPx))
  ctx.font = `800 ${fontSize}px "Alegreya Sans", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const width = Math.min(
    isPreview ? 0.94 : 0.82,
    Math.max(0.62, ctx.measureText(text).width + 0.16),
  )
  const height = fontSize + 0.08
  const top = Math.max(0.02, position.y - 0.56)
  roundedRect(ctx, position.x - width / 2, top, width, height, 0.07)
  ctx.fillStyle = bonus > 0 && isAllowed ? '#302211' : '#242936'
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = isPreview ? 0.018 : 0.025
  if (isPreview) ctx.setLineDash([0.05, 0.045])
  ctx.stroke()
  ctx.fillStyle = color
  ctx.fillText(text, position.x, top + height / 2, width - 0.1)
  ctx.restore()
}

export function drawTreasuryBonuses(
  ctx: Canvas2D,
  bonuses: readonly TreasuryBonus[],
  selected: Tower | null | undefined,
  cellCssPx: number,
) {
  const focused = new Set(focusedTreasuryBonuses(bonuses, selected))
  for (const entry of bonuses) {
    const { tower, bonus } = entry
    if (focused.has(entry)) drawTreasuryBonus(ctx, tower, bonus, cellCssPx)
    else if (bonus > 0) drawTreasuryMark(ctx, tower)
  }
}

export function drawTreasuryPreviewLinks(
  ctx: Canvas2D,
  position: Position,
  neighbors: readonly Tower[],
  isAllowed: boolean,
) {
  for (const neighbor of neighbors) drawLink(ctx, position, neighbor, true, isAllowed)
}
