import { TOWERS, TREASURY_NEIGHBOR_REACH, type Game, type Tower } from '@throne/game'
import type { Cell } from '@/types'

type SupportField = Pick<Game, 'towerAt' | 'isCellFree'>
type SupportCell = Cell & { tower: Tower | undefined }

function eligibleCells(
  field: SupportField,
  origin: Cell,
  reach: number,
  accepts: (tower: Tower) => boolean,
): SupportCell[] {
  const cells: SupportCell[] = []
  for (let row = origin.row - reach; row <= origin.row + reach; row++) {
    for (let col = origin.col - reach; col <= origin.col + reach; col++) {
      if (col === origin.col && row === origin.row) continue
      const tower = field.towerAt(col, row)
      if (tower ? accepts(tower) : field.isCellFree(col, row)) cells.push({ col, row, tower })
    }
  }
  return cells
}

/** Одни и те же клетки используются для счётчика и подсветки Звонаря. */
export function bellReachCells(field: SupportField, origin: Cell, tier: number) {
  const tiers = TOWERS['bell'].tiers
  const currentRange = tiers[tier].range
  const nextRange = tiers[tier + 1]?.range ?? currentRange
  const current: SupportCell[] = []
  const afterUpgrade: SupportCell[] = []
  const eligible = eligibleCells(
    field,
    origin,
    Math.floor(nextRange),
    (tower) => tower.def.takesFireRateBonus,
  )
  for (const cell of eligible) {
    const distanceSquared = (cell.col - origin.col) ** 2 + (cell.row - origin.row) ** 2
    if (distanceSquared <= currentRange ** 2) current.push(cell)
    else if (distanceSquared <= nextRange ** 2) afterUpgrade.push(cell)
  }
  return { current, afterUpgrade }
}

/** Казна взаимодействует с соседними Казнами и свободными местами под них. */
export function treasuryReachCells(field: SupportField, origin: Cell): SupportCell[] {
  return eligibleCells(
    field,
    origin,
    TREASURY_NEIGHBOR_REACH,
    (tower) => tower.def.id === 'treasury',
  )
}
