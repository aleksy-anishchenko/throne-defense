// Оформление залов: плитка пола, узор ковра, помост, трон и чаши факелов — по теме зала
// (LevelDef.theme). Выбрано владельцем по эскизам.
//
// Правила: швы между плитами остаются заметными (игрок видит клетки, куда ставить башню);
// узоры пола и ковра тихие — враги и эффекты должны читаться поверх. Плитка, ковёр и помост
// рисуются один раз в фон (hall.ts), трон — каждый кадр (вспыхивает, когда его ранят)

import { CRIMSON, GOLD, cellNoise, circle, roundedRect } from './shapes'
import type { Canvas2D } from './shapes'

export interface HallTheme {
  /** Нарисовать плиту пола в клетке (col, row) */
  drawTile(ctx: Canvas2D, col: number, row: number): void
  /** Ковёр: основной цвет и тёмная середина */
  carpet: string
  carpetInner: string
  /** Узор на ковре — в координатах отрезка: x вдоль ковра, y поперёк, (0,0) — начало отрезка */
  carpetPattern: { step: number; draw(ctx: Canvas2D, along: number): void }[]
  /** Помост: основа, верх, полоса по краю */
  dais: { base: string; top: string; band: string }
  /** Трон, (0, 0) — его центр */
  drawThrone(ctx: Canvas2D): void
  /** Цвет чаш факелов у трона */
  torchBowl: string
}

/** Шум 0..1 для клетки — свой для каждого key (несколько независимых «случайностей» на клетку) */
const noise = (col: number, row: number, key: number) =>
  cellNoise(col * 1.7 + key * 13.1, row + key)

/** Светлый край сверху и тень снизу — плита выглядит чуть выпуклой */
function tileBevel(ctx: Canvas2D, col: number, row: number) {
  ctx.fillStyle = 'rgba(255,255,255,.04)'
  ctx.fillRect(col + 0.025, row + 0.025, 0.95, 0.04)
  ctx.fillStyle = 'rgba(0,0,0,.18)'
  ctx.fillRect(col + 0.025, row + 0.935, 0.95, 0.04)
}

// ——— Плитки ———

/** Синий камень «Тронного зала» — как было */
function stoneTile(ctx: Canvas2D, col: number, row: number) {
  const lightness = 22 + ((col + row) & 1) * 2.4 + (cellNoise(col, row) - 0.5) * 2.6
  ctx.fillStyle = `hsl(231,24%,${lightness}%)`
  ctx.fillRect(col + 0.025, row + 0.025, 0.95, 0.95)
  tileBevel(ctx, col, row)
}

/** Мрамор: тёплый серый с тонкими светлыми прожилками и тёмными ромбиками на стыках */
function marbleTile(ctx: Canvas2D, col: number, row: number) {
  const lightness = 30 + (noise(col, row, 1) - 0.5) * 3
  ctx.fillStyle = `hsl(38,7%,${lightness}%)`
  ctx.fillRect(col + 0.025, row + 0.025, 0.95, 0.95)
  ctx.save()
  ctx.beginPath()
  ctx.rect(col + 0.025, row + 0.025, 0.95, 0.95)
  ctx.clip()
  ctx.strokeStyle = 'rgba(235,228,212,.13)'
  ctx.lineWidth = 0.01
  for (let i = 0; i < 2; i++) {
    const startY = row + noise(col, row, i + 2) * 0.9
    const endY = row + noise(col, row, i + 5) * 0.9
    ctx.beginPath()
    ctx.moveTo(col, startY)
    ctx.bezierCurveTo(col + 0.35, startY + 0.25, col + 0.6, endY - 0.25, col + 1, endY)
    ctx.stroke()
  }
  ctx.restore()
  tileBevel(ctx, col, row)
  ctx.fillStyle = 'hsl(30,10%,17%)'
  ctx.beginPath()
  ctx.moveTo(col, row - 0.07)
  ctx.lineTo(col + 0.07, row)
  ctx.lineTo(col, row + 0.07)
  ctx.lineTo(col - 0.07, row)
  ctx.closePath()
  ctx.fill()
}

/** Доски: три в клетке, с волокнами и швами вразбежку */
function woodTile(ctx: Canvas2D, col: number, row: number) {
  for (let plank = 0; plank < 3; plank++) {
    const lightness = 20 + (noise(col, row, plank) - 0.5) * 4
    ctx.fillStyle = `hsl(26,30%,${lightness}%)`
    ctx.fillRect(col + plank / 3 + 0.01, row + 0.025, 1 / 3 - 0.02, 0.95)
    ctx.strokeStyle = 'rgba(0,0,0,.16)'
    ctx.lineWidth = 0.01
    ctx.beginPath()
    for (const grain of [0.3, 0.6]) {
      const x = col + plank / 3 + grain / 3
      ctx.moveTo(x, row + 0.05)
      ctx.quadraticCurveTo(x + 0.03, row + 0.5, x, row + 0.95)
    }
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(0,0,0,.3)'
  const seamPlank = noise(col, row, 9) < 0.5 ? 0 : 1
  ctx.fillRect(col + seamPlank / 3 + 0.01, row + 0.45, 1 / 3 - 0.02, 0.015)
  tileBevel(ctx, col, row)
}

/** Иероглифы на песчанике: глаз, анкх, птица */
function drawHieroglyph(ctx: Canvas2D, x: number, y: number, kind: number) {
  ctx.strokeStyle = 'rgba(60,40,15,.28)'
  ctx.lineWidth = 0.025
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (kind === 0) {
    ctx.ellipse(x, y, 0.12, 0.06, 0, 0, Math.PI * 2)
    ctx.moveTo(x + 0.03, y)
    ctx.arc(x, y, 0.03, 0, Math.PI * 2)
    ctx.moveTo(x - 0.04, y + 0.06)
    ctx.lineTo(x - 0.06, y + 0.16)
  } else if (kind === 1) {
    ctx.moveTo(x, y + 0.15)
    ctx.lineTo(x, y - 0.02)
    ctx.moveTo(x - 0.08, y - 0.02)
    ctx.lineTo(x + 0.08, y - 0.02)
    ctx.ellipse(x, y - 0.1, 0.05, 0.07, 0, 0, Math.PI * 2)
  } else {
    ctx.moveTo(x - 0.12, y + 0.1)
    ctx.quadraticCurveTo(x - 0.05, y - 0.12, x + 0.05, y - 0.05)
    ctx.lineTo(x + 0.12, y - 0.08)
    ctx.moveTo(x, y - 0.06)
    ctx.lineTo(x, y + 0.1)
  }
  ctx.stroke()
}

/** Песчаник: потёртости, на каждой третьей плите — выцветший иероглиф */
function sandstoneTile(ctx: Canvas2D, col: number, row: number) {
  const lightness = 28 + (noise(col, row, 1) - 0.5) * 3
  ctx.fillStyle = `hsl(38,28%,${lightness}%)`
  ctx.fillRect(col + 0.025, row + 0.025, 0.95, 0.95)
  ctx.fillStyle = 'rgba(0,0,0,.08)'
  for (let i = 0; i < 4; i++) {
    const x = col + 0.1 + noise(col, row, i + 1) * 0.8
    const y = row + 0.1 + noise(col, row, i + 7) * 0.8
    circle(ctx, x, y, 0.03 + noise(col, row, i + 11) * 0.03)
    ctx.fill()
  }
  if (noise(col, row, 13) < 0.33) {
    drawHieroglyph(ctx, col + 0.5, row + 0.5, Math.floor(noise(col, row, 17) * 3))
  }
  tileBevel(ctx, col, row)
}

// ——— Узоры ковров ———

/** Золотые ромбики посередине — «фирменный» ковёр */
const DIAMONDS = {
  step: 0.5,
  draw(ctx: Canvas2D, along: number) {
    ctx.fillStyle = 'rgba(227,178,74,.6)'
    ctx.beginPath()
    ctx.moveTo(along, -0.075)
    ctx.lineTo(along + 0.075, 0)
    ctx.lineTo(along, 0.075)
    ctx.lineTo(along - 0.075, 0)
    ctx.closePath()
    ctx.fill()
  },
}

/** Меандр по обоим краям: ступенька-крючок */
const MEANDER = {
  step: 0.2,
  draw(ctx: Canvas2D, along: number) {
    ctx.strokeStyle = 'rgba(227,178,74,.75)'
    ctx.lineWidth = 0.02
    for (const side of [-1, 1]) {
      const y = side * 0.26
      ctx.beginPath()
      ctx.moveTo(along - 0.1, y)
      ctx.lineTo(along - 0.1, y - side * 0.06)
      ctx.lineTo(along + 0.04, y - side * 0.06)
      ctx.lineTo(along + 0.04, y - side * 0.02)
      ctx.lineTo(along - 0.04, y - side * 0.02)
      ctx.stroke()
    }
  },
}

/** Цветочки: четыре золотых лепестка с красной серединкой, точки по краям */
const FLOWERS = {
  step: 0.5,
  draw(ctx: Canvas2D, along: number) {
    ctx.fillStyle = 'rgba(232,210,122,.7)'
    for (const [dx, dy] of [
      [0.05, 0],
      [-0.05, 0],
      [0, 0.05],
      [0, -0.05],
    ]) {
      circle(ctx, along + dx, dy, 0.035)
      ctx.fill()
    }
    ctx.fillStyle = '#c23b4a'
    circle(ctx, along, 0, 0.025)
    ctx.fill()
    ctx.fillStyle = 'rgba(232,210,122,.45)'
    for (const side of [-1, 1]) {
      circle(ctx, along + 0.25, side * 0.25, 0.02)
      ctx.fill()
    }
  },
}

/** Египет: золотой зигзаг посередине… */
const ZIGZAG = {
  step: 0.24,
  draw(ctx: Canvas2D, along: number) {
    ctx.strokeStyle = 'rgba(227,178,74,.75)'
    ctx.lineWidth = 0.025
    ctx.beginPath()
    ctx.moveTo(along - 0.12, 0.06)
    ctx.lineTo(along, -0.06)
    ctx.lineTo(along + 0.12, 0.06)
    ctx.stroke()
  },
}
/** …и бирюзовые лотосы-треугольники по краям */
const LOTUS_EDGES = {
  step: 0.3,
  draw(ctx: Canvas2D, along: number) {
    ctx.fillStyle = 'rgba(58,143,134,.85)'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(along - 0.05, side * 0.29)
      ctx.lineTo(along, side * 0.2)
      ctx.lineTo(along + 0.05, side * 0.29)
      ctx.closePath()
      ctx.fill()
    }
  },
}

// ——— Троны ———

/** Золотой трон «Тронного зала» — как был */
function goldThrone(ctx: Canvas2D) {
  ctx.fillStyle = '#a87a1f'
  ctx.beginPath()
  ctx.moveTo(-0.29, 0.3)
  ctx.lineTo(-0.29, -0.16)
  ctx.quadraticCurveTo(0, -0.56, 0.29, -0.16)
  ctx.lineTo(0.29, 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(-0.24, 0.3)
  ctx.lineTo(-0.24, -0.14)
  ctx.quadraticCurveTo(0, -0.48, 0.24, -0.14)
  ctx.lineTo(0.24, 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = CRIMSON
  ctx.beginPath()
  ctx.moveTo(-0.17, 0.14)
  ctx.lineTo(-0.17, -0.1)
  ctx.quadraticCurveTo(0, -0.34, 0.17, -0.1)
  ctx.lineTo(0.17, 0.14)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = GOLD
  roundedRect(ctx, -0.36, 0.1, 0.72, 0.17, 0.04)
  ctx.fill()
  ctx.fillStyle = '#a87a1f'
  ctx.fillRect(-0.36, 0.23, 0.72, 0.05)
  ctx.fillStyle = GOLD
  roundedRect(ctx, -0.4, -0.06, 0.11, 0.3, 0.04)
  ctx.fill()
  roundedRect(ctx, 0.29, -0.06, 0.11, 0.3, 0.04)
  ctx.fill()
  circle(ctx, -0.345, -0.08, 0.06)
  ctx.fill()
  circle(ctx, 0.345, -0.08, 0.06)
  ctx.fill()
  circle(ctx, 0, -0.37, 0.055)
  ctx.fill()
}

/** Мраморное кресло с лавровым венком на спинке */
function marbleThrone(ctx: Canvas2D) {
  ctx.fillStyle = '#d9d4c7'
  ctx.strokeStyle = '#3d3a34'
  ctx.lineWidth = 0.02
  roundedRect(ctx, -0.26, -0.44, 0.52, 0.58, 0.12)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#7a8a3a'
  ctx.lineWidth = 0.04
  ctx.beginPath()
  ctx.arc(0, -0.2, 0.13, Math.PI * 0.75, Math.PI * 2.25)
  ctx.stroke()
  ctx.fillStyle = '#9aaa4a'
  for (let share = 0.8; share < 2.3; share += 0.25) {
    const angle = share * Math.PI
    ctx.beginPath()
    ctx.ellipse(
      Math.cos(angle) * 0.13,
      -0.2 + Math.sin(angle) * 0.13,
      0.035,
      0.018,
      angle + 1.2,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  ctx.fillStyle = CRIMSON
  roundedRect(ctx, -0.3, 0.06, 0.6, 0.12, 0.04)
  ctx.fill()
  ctx.fillStyle = '#d9d4c7'
  ctx.strokeStyle = '#3d3a34'
  ctx.lineWidth = 0.02
  for (const side of [-1, 1]) {
    roundedRect(ctx, side * 0.36 - 0.06, -0.06, 0.12, 0.34, 0.03)
    ctx.fill()
    ctx.stroke()
  }
}

/** Резной деревянный трон с кокошником */
function woodenThrone(ctx: Canvas2D) {
  ctx.fillStyle = '#6b4626'
  ctx.strokeStyle = '#2a1a0c'
  ctx.lineWidth = 0.02
  ctx.beginPath()
  ctx.moveTo(-0.28, 0.3)
  ctx.lineTo(-0.28, -0.22)
  ctx.quadraticCurveTo(-0.2, -0.36, 0, -0.5)
  ctx.quadraticCurveTo(0.2, -0.36, 0.28, -0.22)
  ctx.lineTo(0.28, 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#74213d'
  ctx.beginPath()
  ctx.moveTo(-0.18, 0.12)
  ctx.lineTo(-0.18, -0.18)
  ctx.quadraticCurveTo(0, -0.38, 0.18, -0.18)
  ctx.lineTo(0.18, 0.12)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e8c56a'
  for (const [x, y] of [
    [0, -0.42],
    [-0.22, -0.24],
    [0.22, -0.24],
    [0, -0.22],
  ]) {
    circle(ctx, x, y, 0.03)
    ctx.fill()
  }
  ctx.fillStyle = '#7d5530'
  roundedRect(ctx, -0.36, 0.1, 0.72, 0.17, 0.04)
  ctx.fill()
  ctx.stroke()
}

/** Трон фараона: золото, лазурные полосы, солнечный диск на спинке, подлокотники-лапы */
function pharaohThrone(ctx: Canvas2D) {
  ctx.strokeStyle = '#7a5a12'
  ctx.lineWidth = 0.02
  ctx.fillStyle = '#e0b040'
  roundedRect(ctx, -0.22, -0.4, 0.44, 0.52, 0.04)
  ctx.fill()
  ctx.stroke()
  // Солнечный диск — на спинке: выше трона уже край поля
  ctx.fillStyle = '#c2452f'
  circle(ctx, 0, -0.3, 0.065)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#2b4f8f'
  for (const y of [-0.19, -0.1, -0.01]) ctx.fillRect(-0.18, y, 0.36, 0.045)
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#e0b040'
    roundedRect(ctx, side * 0.31 - 0.07, -0.04, 0.14, 0.3, 0.03)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#c99a3a'
    for (const dx of [-0.035, 0, 0.035]) {
      circle(ctx, side * 0.31 + dx, 0.27, 0.025)
      ctx.fill()
    }
  }
  ctx.fillStyle = '#e0b040'
  roundedRect(ctx, -0.26, 0.1, 0.52, 0.17, 0.04)
  ctx.fill()
  ctx.stroke()
}

const THEMES: Record<string, HallTheme> = {
  throne: {
    drawTile: stoneTile,
    carpet: CRIMSON,
    carpetInner: '#8c1826',
    carpetPattern: [DIAMONDS],
    dais: { base: '#4c5378', top: '#5f6790', band: GOLD },
    drawThrone: goldThrone,
    torchBowl: '#20233a',
  },
  antique: {
    drawTile: marbleTile,
    carpet: CRIMSON,
    carpetInner: '#8c1826',
    carpetPattern: [MEANDER],
    dais: { base: '#8f897b', top: '#b8b2a3', band: '#6e6a60' },
    drawThrone: marbleThrone,
    torchBowl: '#20233a',
  },
  chambers: {
    drawTile: woodTile,
    carpet: '#74213d',
    carpetInner: '#55162b',
    carpetPattern: [FLOWERS],
    dais: { base: '#4a3220', top: '#5e4128', band: '#a8823a' },
    drawThrone: woodenThrone,
    torchBowl: '#20233a',
  },
  egypt: {
    drawTile: sandstoneTile,
    carpet: '#2b4f8f',
    carpetInner: '#1f3b6e',
    carpetPattern: [ZIGZAG, LOTUS_EDGES],
    dais: { base: '#9a8250', top: '#b9a06a', band: '#2b4f8f' },
    drawThrone: pharaohThrone,
    torchBowl: '#6b4a1e',
  },
}

/** Оформление по id темы. Нет или неизвестное — тронное */
export const hallTheme = (themeId: string | undefined): HallTheme =>
  THEMES[themeId ?? 'throne'] ?? THEMES['throne']
