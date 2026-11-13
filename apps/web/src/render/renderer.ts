// Рисует поле каждый кадр. Ничего не меняет в игре — только смотрит на game.state.

import {
  TOWERS,
  fireRateBonusOf,
  towerStats,
  type Game,
  type Tower,
  type TowerDef,
  type TowerStats,
} from '@throne/game'
import type { BoardView, Cell } from '@/types'
import { createEffects } from './effects'
import { drawEnemy, drawEnemyHealthBar, getEnemyArt } from './enemies'
import { buildHall, drawThrone } from './hall'
import {
  CELL_CENTER,
  FLOOR_COLOR,
  GOLD,
  PARCHMENT,
  TOWER_IDLE_AIM_ANGLE,
  circle,
  prefersReducedMotion,
} from './shapes'
import { drawShot } from './shots'
import { drawBuffRing } from './statuses'
import { drawTower } from './towers'
import { isAuraTower } from '@/utils/towerStats'

/** Больше стольких настоящих пикселей на один CSS-пиксель не рисуем (иначе тяжело) */
const MAX_PIXEL_RATIO = 3
/** Клетка не мельче этого размера, CSS-пикселей */
const MIN_CELL_CSS_PX = 16
/** Отступ вокруг поля, CSS-пикселей */
const BOARD_MARGIN_CSS_PX = 10
/** Дальность на высшей ступени, клеток */
const maxTierRange = (def: TowerDef): number => def.tiers[def.tiers.length - 1].range
/** Кольцо максимальной дальности не рисуем, если оно почти совпадает с текущим (клеток) */
const MIN_MAX_RANGE_DIFFERENCE = 0.01

/** Размер клетки до первого resize, CSS-пикселей */
const INITIAL_CELL_CSS_PX = 40
/** Башня рисуется «готовой к выстрелу», когда осталось меньше этой доли перезарядки */
const READY_COOLDOWN_SHARE = 0.55
/** Насколько башня «раздувается» при подпрыгивании (множитель к остатку подпрыгивания) */
const POP_SCALE = 0.8
/** Размах тряски поля, в долях клетки */
const SHAKE_AMPLITUDE = 0.5
/** Красная вспышка ранения при «уменьшить движение» в системе — во столько раз слабее */
const REDUCED_MOTION_HURT_SHARE = 0.35

export interface Renderer {
  /** Подогнать поле под размер области (в CSS-пикселях) */
  resize(width: number, height: number): void
  /**
   * Нарисовать кадр. Если с прошлого кадра ничего не поменялось (меню, пауза) — ничего не делает:
   * незачем перерисовывать то же самое 60 раз в секунду
   */
  draw(realDt: number, boardView: BoardView): void
  dispose(): void
}

export function createRenderer(canvas: HTMLCanvasElement, game: Game): Renderer {
  const ctx = canvas.getContext('2d')!
  // Размер поля и трон у всех залов одни (levels/hall-base.ts, проверяет тест) — читаем один раз
  const { cols, rows, throne } = game.level.def
  const effects = createEffects(game)

  let cellCssPx = INITIAL_CELL_CSS_PX // размер клетки в CSS-пикселях
  let pixelRatio = 1 // сколько настоящих пикселей экрана в одном CSS-пикселе
  let cellDevicePx = INITIAL_CELL_CSS_PX // размер клетки в настоящих пикселях
  let hallLayer: HTMLCanvasElement | null = null
  /** Для какого зала нарисован hallLayer: новая партия может начаться в другом зале */
  let hallLevel = game.level
  let lastGameTime = 0
  /** «Отпечаток» прошлого нарисованного кадра, см. frameFingerprint */
  let lastFingerprint = ''

  /**
   * Всё, от чего зависит картинка, одной строкой. Пока идёт бой, время меняется
   * каждый кадр, и отпечаток всегда новый. На паузе и в меню время стоит, и кадр
   * меняется, только если игрок что-то сделал: построил, навёл мышь, выбрал башню.
   * Тряска и красная вспышка идут в реальном времени — пока они есть, рисуем всегда
   */
  function frameFingerprint(boardView: BoardView): string | null {
    if (effects.shakeTime > 0 || effects.throneHurtTime > 0) return null
    const state = game.state
    return [
      game.level.def.id,
      state.time,
      state.phase,
      state.gold,
      state.lives,
      state.towers.length,
      state.enemies.length,
      state.shots.length,
      JSON.stringify(boardView),
    ].join('|')
  }

  /**
   * isAllowed = false — красная подсветка: поставить нельзя, не хватает золота.
   * maxRange — дальность на высшей ступени: рисуется бледным частым пунктиром под основным
   * кругом, чтобы было видно, насколько башня «вырастет» — у призрака стража «в руке» и у выбранной;
   * не больше текущей — не рисуется
   */
  function drawRange(x: number, y: number, range: number, isAllowed: boolean, maxRange = range) {
    if (maxRange - range > MIN_MAX_RANGE_DIFFERENCE) {
      circle(ctx, x, y, maxRange)
      ctx.strokeStyle = isAllowed ? 'rgba(227,178,74,.3)' : 'rgba(240,110,80,.3)'
      ctx.lineWidth = 0.025
      ctx.setLineDash([0.04, 0.1])
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.fillStyle = isAllowed ? 'rgba(243,233,210,.07)' : 'rgba(240,90,70,.08)'
    circle(ctx, x, y, range)
    ctx.fill()
    ctx.strokeStyle = isAllowed ? 'rgba(227,178,74,.75)' : 'rgba(240,110,80,.8)'
    ctx.lineWidth = 0.03
    ctx.setLineDash([0.14, 0.1])
    ctx.stroke()
    ctx.setLineDash([])
  }

  /** Отступ подсветки клетки ауры от краёв плиты, клеток */
  const AURA_CELL_INSET = 0.07

  /**
   * Дальность Звонаря — не круг, а клетки: он ускоряет башни, а башни стоят в центрах клеток,
   * и круг обманывал («пунктир заходит на башню, а она не ускорена»). Подсвечены плиты пола
   * (не ковёр), до центра которых он достаёт; бледной рамкой — те, что добавятся на высшей ступени.
   * x, y — центр Звонаря; isAllowed и maxRange — как у drawRange
   */
  function drawAuraCells(
    x: number,
    y: number,
    range: number,
    isAllowed: boolean,
    maxRange = range,
  ) {
    const ownCol = Math.floor(x)
    const ownRow = Math.floor(y)
    const size = 1 - AURA_CELL_INSET * 2
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const distanceSquared = (col - ownCol) ** 2 + (row - ownRow) ** 2
        if (distanceSquared === 0 || distanceSquared > maxRange ** 2) continue
        // Только плиты, где может стоять башня: ковёр и трон Звонарю ускорять нечего
        if (!game.isCellFree(col, row) && !game.towerAt(col, row)) continue
        const left = col + AURA_CELL_INSET
        const top = row + AURA_CELL_INSET
        if (distanceSquared <= range ** 2) {
          ctx.fillStyle = isAllowed ? 'rgba(227,178,74,.16)' : 'rgba(240,90,70,.12)'
          ctx.fillRect(left, top, size, size)
          ctx.strokeStyle = isAllowed ? 'rgba(227,178,74,.7)' : 'rgba(240,110,80,.75)'
          ctx.lineWidth = 0.03
          ctx.strokeRect(left, top, size, size)
        } else {
          ctx.fillStyle = isAllowed ? 'rgba(227,178,74,.05)' : 'rgba(240,90,70,.05)'
          ctx.fillRect(left, top, size, size)
          ctx.strokeStyle = isAllowed ? 'rgba(227,178,74,.5)' : 'rgba(240,110,80,.5)'
          ctx.lineWidth = 0.025
          ctx.setLineDash([0.06, 0.08])
          ctx.strokeRect(left, top, size, size)
          ctx.setLineDash([])
        }
      }
    }
  }

  /** Дальность башни: у Звонаря — клетками, у остальных — кругом */
  function drawReach(
    stats: TowerStats,
    x: number,
    y: number,
    range: number,
    isAllowed: boolean,
    maxRange = range,
  ) {
    if (isAuraTower(stats)) drawAuraCells(x, y, range, isAllowed, maxRange)
    else drawRange(x, y, range, isAllowed, maxRange)
  }

  /** Точки на свободных плитах, когда выбираем, куда ставить */
  function drawFreeCellDots() {
    ctx.fillStyle = 'rgba(227,178,74,.3)'
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!game.isCellFree(col, row)) continue
        circle(ctx, col + CELL_CENTER, row + CELL_CENTER, 0.05)
        ctx.fill()
      }
    }
  }

  function drawTowers(time: number, selectedTower: Tower | null | undefined) {
    const towers = game.state.towers
    for (const tower of towers) {
      ctx.save()
      ctx.translate(tower.x, tower.y)
      // Ускорена Звонарём — золотое кольцо у основания (до «подпрыгивания»: кольцо на полу)
      if (fireRateBonusOf(towers, tower) > 0) drawBuffRing(ctx, time)
      const popTimeLeft = effects.popTimeLeft(tower)
      if (popTimeLeft > 0 && !prefersReducedMotion) {
        ctx.scale(1 + popTimeLeft * POP_SCALE, 1 + popTimeLeft * POP_SCALE)
      }
      const isReady = tower.cooldownLeft < towerStats(tower).cooldown * READY_COOLDOWN_SHARE
      drawTower(ctx, tower.def.id, tower.tier, tower.aimAngle, time, isReady)
      if (tower === selectedTower) {
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 0.045
        circle(ctx, 0, 0, 0.41)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  /** Сначала обычные враги, потом большие — чтобы те были сверху */
  function drawEnemies(time: number) {
    for (const isTopLayer of [false, true]) {
      for (const enemy of game.state.enemies) {
        // У обычных врагов drawOnTop не задан (undefined) — это то же, что false.
        // Без «?? false» сравнение undefined с false не сошлось бы, и враг не нарисовался бы вовсе
        const drawOnTop = getEnemyArt(enemy.def.id).drawOnTop ?? false
        if (drawOnTop !== isTopLayer) continue
        drawEnemy(ctx, enemy, time, effects.bobPhase(enemy), effects.isFlashing(enemy))
      }
    }
  }

  /** Полоски здоровья — поверх всех врагов, искр и снарядов */
  function drawHealthBars(time: number) {
    for (const enemy of game.state.enemies) {
      drawEnemyHealthBar(ctx, enemy, time, effects.bobPhase(enemy))
    }
  }

  /** Полупрозрачная башня под курсором — «вот так встанет» */
  function drawGhostTower(armedTowerId: string, ghostCell: Cell, time: number) {
    const def = TOWERS[armedTowerId]
    const canAfford = game.state.gold >= def.cost
    drawReach(
      def.tiers[0],
      ghostCell.col + CELL_CENTER,
      ghostCell.row + CELL_CENTER,
      def.tiers[0].range,
      canAfford,
      maxTierRange(def),
    )
    ctx.save()
    ctx.translate(ghostCell.col + CELL_CENTER, ghostCell.row + CELL_CENTER)
    ctx.globalAlpha = canAfford ? 0.7 : 0.35
    drawTower(ctx, armedTowerId, 0, TOWER_IDLE_AIM_ANGLE, time, true)
    ctx.restore()
  }

  /** Рамка клавиатурного курсора */
  function drawCursor(cursorCell: Cell) {
    ctx.strokeStyle = PARCHMENT
    ctx.lineWidth = 0.045
    ctx.strokeRect(cursorCell.col + 0.04, cursorCell.row + 0.04, 0.92, 0.92)
  }

  /** Сила красной вспышки: при «уменьшить движение» в системе — приглушённая */
  const hurtIntensity = () =>
    effects.throneHurtTime * (prefersReducedMotion ? REDUCED_MOTION_HURT_SHARE : 1)

  /** Красная виньетка, когда трон ранен */
  function drawHurtVignette() {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const width = canvas.width
    const height = canvas.height
    const vignetteGradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      height * 0.25,
      width / 2,
      height / 2,
      height * 0.7,
    )
    vignetteGradient.addColorStop(0, 'rgba(200,30,40,0)')
    vignetteGradient.addColorStop(1, `rgba(200,30,40,${Math.min(0.5, hurtIntensity())})`)
    ctx.fillStyle = vignetteGradient
    ctx.fillRect(0, 0, width, height)
  }

  return {
    resize(width, height) {
      if (!width || !height) return
      pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      cellCssPx = Math.max(
        MIN_CELL_CSS_PX,
        Math.floor(
          Math.min((width - BOARD_MARGIN_CSS_PX) / cols, (height - BOARD_MARGIN_CSS_PX) / rows),
        ),
      )
      canvas.style.width = cols * cellCssPx + 'px'
      canvas.style.height = rows * cellCssPx + 'px'
      canvas.width = Math.round(cols * cellCssPx * pixelRatio)
      canvas.height = Math.round(rows * cellCssPx * pixelRatio)
      cellDevicePx = canvas.width / cols
      hallLevel = game.level
      hallLayer = buildHall(hallLevel, canvas.width, canvas.height, cellDevicePx)
      // Смена размера canvas стирает его — следующий кадр нужно нарисовать обязательно
      lastFingerprint = ''
    },

    draw(realDt, boardView) {
      // Новая партия в другом зале — фон зала рисуем заново (поле у всех залов одного размера)
      if (game.level !== hallLevel && hallLayer) {
        hallLevel = game.level
        hallLayer = buildHall(hallLevel, canvas.width, canvas.height, cellDevicePx)
      }
      const fingerprint = frameFingerprint(boardView)
      if (fingerprint !== null && fingerprint === lastFingerprint) return
      lastFingerprint = fingerprint ?? ''
      const state = game.state
      const time = state.time
      const simDt = Math.max(0, time - lastGameTime)
      lastGameTime = time
      effects.update(simDt, realDt)

      // Тряска: всё поле сдвигается на случайные доли клетки
      let shakeX = 0
      let shakeY = 0
      if (effects.shakeTime > 0 && !prefersReducedMotion) {
        shakeX = (Math.random() - 0.5) * effects.shakeTime * SHAKE_AMPLITUDE * cellDevicePx
        shakeY = (Math.random() - 0.5) * effects.shakeTime * SHAKE_AMPLITUDE * cellDevicePx
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = FLOOR_COLOR
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (hallLayer) ctx.drawImage(hallLayer, shakeX, shakeY)
      // Дальше рисуем в клетках: 1 единица = 1 клетка
      ctx.setTransform(cellDevicePx, 0, 0, cellDevicePx, shakeX, shakeY)

      const isPlaying = game.isPlaying()

      if (isPlaying && boardView.armedTowerId) drawFreeCellDots()
      const selectedTower =
        boardView.selectedTowerCell &&
        game.towerAt(boardView.selectedTowerCell.col, boardView.selectedTowerCell.row)
      if (selectedTower) {
        // Выбранная башня: подсветка всегда обычная (не красная). И бледно — дальность на высшей
        // ступени: видно, что даст улучшение (на высшей ступени совпадает и не рисуется)
        const stats = towerStats(selectedTower)
        drawReach(
          stats,
          selectedTower.x,
          selectedTower.y,
          stats.range,
          true,
          maxTierRange(selectedTower.def),
        )
      }

      drawThrone(ctx, throne, time, hurtIntensity())
      drawTowers(time, selectedTower)
      drawEnemies(time)

      for (const shot of state.shots) drawShot(ctx, shot)
      effects.draw(ctx)
      drawHealthBars(time)

      const ghostCell =
        isPlaying && boardView.armedTowerId ? (boardView.hoverCell ?? boardView.cursorCell) : null
      if (ghostCell && boardView.armedTowerId && game.isCellFree(ghostCell.col, ghostCell.row)) {
        drawGhostTower(boardView.armedTowerId, ghostCell, time)
      }
      if (isPlaying && boardView.cursorCell) drawCursor(boardView.cursorCell)

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, shakeX, shakeY)
      effects.drawTexts(ctx, cellCssPx)

      if (effects.throneHurtTime > 0) drawHurtVignette()
    },

    dispose() {
      effects.dispose()
    },
  }
}
