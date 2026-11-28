// Рисует поле каждый кадр. Ничего не меняет в игре — только смотрит на game.state.

import {
  TOWERS,
  bannerArmorOf,
  forecastBurnDamage,
  rewardStats,
  towerStats,
  type Game,
  type RewardStats,
  type Tower,
  type TowerDef,
} from '@throne/game'
import type { BoardView, Cell } from '@/types'
import { createEffects } from './effects'
import { drawEnemy, drawEnemyHealthBar, getEnemyArt } from './enemies'
import { buildHall, drawOilPuddles, drawThrone } from './hall'
import {
  CELL_CENTER,
  FLOOR_COLOR,
  GOLD,
  PARCHMENT,
  TOWER_IDLE_AIM_ANGLE,
  circle,
  prefersReducedMotion,
} from './shapes'
import { drawPropFlames } from './props'
import { drawShot } from './shots'
import { BUFF_RGB, drawBannerRange, drawBannerShield, drawBuffRing } from './statuses'
import { drawAspectMark, drawTower } from './towers'
import { loadUnitSprites, unitSpritesLoaded } from './unitSprites'
import {
  drawBellConnections,
  drawBellIndicators,
  drawBellPreview,
  drawTowerBellPreview,
} from './bell'
import {
  bellBuffs,
  bellPlacementPreview,
  focusedBellBuffs,
  towerPlacementBellPreview,
} from '@/utils/bellSupport'
import { bellReachCells, treasuryReachCells } from '@/utils/supportReach'
import {
  drawTreasuryBonus,
  drawTreasuryBonuses,
  drawTreasuryNetwork,
  drawTreasuryPreviewLinks,
  treasuryPlacementPreview,
  treasurySynergy,
} from './treasury'

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
  let { cols, rows } = game.level.def
  const effects = createEffects(game)
  void loadUnitSprites()

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
      state.selectedRewards.length,
      unitSpritesLoaded(),
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

  /** Отступ подсветки зоны поддержки от краёв плиты, в клетках. */
  const SUPPORT_CELL_INSET = 0.07

  function drawSupportCell(
    cell: Cell,
    {
      fill,
      line,
      dashed = false,
      width = 0.03,
    }: {
      fill: string
      line: string
      dashed?: boolean
      width?: number
    },
  ) {
    const left = cell.col + SUPPORT_CELL_INSET
    const top = cell.row + SUPPORT_CELL_INSET
    const size = 1 - SUPPORT_CELL_INSET * 2
    ctx.fillStyle = fill
    ctx.fillRect(left, top, size, size)
    ctx.strokeStyle = line
    ctx.lineWidth = width
    ctx.setLineDash(dashed ? [0.1, 0.08] : [])
    ctx.strokeRect(left, top, size, size)
  }

  /** Сплошная рамка — текущая зона, пунктир — только клетки следующей ступени. */
  function drawBellCells(
    origin: Cell,
    tier: number,
    isAllowed: boolean,
    boosted: ReadonlySet<Tower> | undefined,
    isPreview: boolean,
  ) {
    const { current, afterUpgrade } = bellReachCells(game, origin, tier)
    const receivesBonus = (tower: Tower | undefined) => tower && boosted?.has(tower)
    ctx.save()
    for (const cell of afterUpgrade) {
      if (!isPreview && receivesBonus(cell.tower)) continue
      drawSupportCell(cell, {
        fill: isAllowed ? `rgba(${BUFF_RGB},.03)` : 'rgba(240,90,70,.05)',
        line: isAllowed ? 'rgba(192,204,218,.65)' : 'rgba(240,110,80,.5)',
        dashed: true,
      })
    }
    for (const cell of current) {
      const receives = receivesBonus(cell.tower)
      if (!isPreview && receives) continue
      drawSupportCell(cell, {
        fill: isAllowed ? `rgba(${BUFF_RGB},${receives ? 0.2 : 0.09})` : 'rgba(240,90,70,.1)',
        line: isAllowed ? `rgba(${BUFF_RGB},${receives ? 0.95 : 0.65})` : 'rgba(240,110,80,.75)',
        width: receives ? 0.05 : 0.03,
      })
    }
    ctx.restore()
  }

  /** Пунктир — свободное место для соседа, яркая рамка — существующая соседняя Казна. */
  function drawTreasuryCells(origin: Cell, isAllowed: boolean, isPreview: boolean) {
    ctx.save()
    for (const cell of treasuryReachCells(game, origin)) {
      drawSupportCell(cell, {
        fill: isAllowed ? `rgba(255,215,117,${cell.tower ? 0.2 : 0.06})` : 'rgba(240,110,80,.05)',
        line: isAllowed ? (cell.tower ? '#ffe297' : '#ad925e') : '#f0866a',
        dashed: !cell.tower || isPreview,
        width: cell.tower ? 0.055 : 0.03,
      })
    }
    ctx.restore()
  }

  /** Одна подсветка для поставленного стража и его предпросмотра, включая будущие улучшения. */
  function drawReach(
    def: TowerDef,
    tier: number,
    cell: Cell,
    {
      isAllowed = true,
      boosted,
      isPreview = false,
    }: {
      isAllowed?: boolean
      boosted?: ReadonlySet<Tower>
      isPreview?: boolean
    },
  ) {
    if (def.id === 'treasury') {
      drawTreasuryCells(cell, isAllowed, isPreview)
      return
    }
    if (def.id === 'bell') {
      drawBellCells(cell, tier, isAllowed, boosted, isPreview)
      return
    }
    const stats = def.tiers[tier]
    const x = cell.col + CELL_CENTER
    const y = cell.row + CELL_CENTER
    drawRange(x, y, stats.range, isAllowed, maxTierRange(def))
  }

  function drawSelectionRing() {
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 0.045
    circle(ctx, 0, 0, 0.41)
    ctx.stroke()
  }

  /** Точки на свободных плитах, когда выбираем, куда ставить */
  function drawFreeCellDots(towerId: string) {
    ctx.fillStyle = 'rgba(227,178,74,.3)'
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!game.isCellFree(col, row, towerId)) continue
        if (towerId === 'outpost') {
          const site = game.level.outpostSites.get(`${col},${row}`)!
          ctx.save()
          ctx.translate(col + CELL_CENTER, row + CELL_CENTER)
          ctx.rotate(site.angle)
          ctx.fillRect(-0.32, -0.045, 0.64, 0.09)
          ctx.restore()
          continue
        }
        circle(ctx, col + CELL_CENTER, row + CELL_CENTER, 0.05)
        ctx.fill()
      }
    }
  }

  function drawTowers(
    time: number,
    selectedTower: Tower | null | undefined,
    boosted: ReadonlySet<Tower>,
  ) {
    const towers = game.state.towers
    for (const tower of towers) {
      ctx.save()
      ctx.translate(tower.x, tower.y)
      // Ускорена Звонарём — голубое кольцо у основания, отличное от золота Казны.
      if (boosted.has(tower)) drawBuffRing(ctx, time)
      const popTimeLeft = effects.popTimeLeft(tower)
      if (popTimeLeft > 0 && !prefersReducedMotion) {
        ctx.scale(1 + popTimeLeft * POP_SCALE, 1 + popTimeLeft * POP_SCALE)
      }
      // Кольцо выбора лежит под фигуркой, оставляя свободными углы клетки.
      if (tower === selectedTower) drawSelectionRing()
      const wall = tower.barricade
      if (wall?.lastHitAt !== undefined && !prefersReducedMotion) {
        const progress = (time - wall.lastHitAt) / 0.22
        if (progress >= 0 && progress < 1) {
          const recoil = 0.085 * (1 - progress) * Math.cos(progress * Math.PI * 2)
          ctx.translate(Math.sin(wall.angle) * recoil, -Math.cos(wall.angle) * recoil)
        }
      }
      const isReady = tower.cooldownLeft < towerStats(tower).cooldown * READY_COOLDOWN_SHARE
      drawTower(
        ctx,
        tower.def.id,
        tower.tier,
        tower.aimAngle,
        time,
        isReady,
        tower.aspectId,
        effects.towerRecoil(tower),
        tower.barricade ? tower.barricade.hp / tower.barricade.maxHp : 1,
      )
      ctx.restore()
      // Значок закреплён в углу клетки и не увеличивается при улучшении стража.
      drawAspectMark(ctx, tower)
    }
  }

  /** Смола льётся поверх фигур у стены. Полоски здоровья остаются сверху. */
  function drawResinPour(time: number) {
    if (prefersReducedMotion) return
    const tower = game.state.towers.find((tower) => tower.barricade?.lastPourAt !== undefined)
    const wall = tower?.barricade
    if (!tower || !wall || wall.lastPourAt === undefined) return
    const progress = (time - wall.lastPourAt) / 0.72
    if (progress < 0 || progress >= 1) return
    ctx.save()
    ctx.translate(tower.x, tower.y)
    ctx.rotate(wall.angle)
    for (const [index, x] of [-0.193, 0, 0.193].entries()) {
      const phase = progress - index * 0.045
      if (phase <= 0) continue
      const reach = index === 1 ? 0.58 : 0.46
      const length = Math.min(1, phase / 0.48) * reach
      const neck = Math.max(0, 1 - Math.max(0, phase - 0.48) * 4.5)
      const width = 0.066 * Math.min(1, phase * 16) * neck
      const bend = Math.sin(phase * 9 + index) * 0.031
      ctx.save()
      ctx.translate(x, 0.04)
      ctx.fillStyle = '#54301e'
      ctx.strokeStyle = '#35232a'
      ctx.lineWidth = 0.014
      if (width > 0) {
        ctx.beginPath()
        ctx.moveTo(-width, 0)
        ctx.bezierCurveTo(
          -width * 1.45,
          length * 0.24,
          bend - width * 0.36,
          length * 0.55,
          bend - width,
          length * 0.84,
        )
        ctx.bezierCurveTo(
          bend - width * 1.9,
          length + width,
          bend + width * 1.6,
          length + width,
          bend + width,
          length * 0.84,
        )
        ctx.bezierCurveTo(bend + width * 0.4, length * 0.56, width * 1.45, length * 0.34, width, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#b97d43'
        ctx.beginPath()
        ctx.ellipse(
          bend - width * 0.35,
          length * 0.85,
          width * 0.25,
          width * 0.42,
          0.35,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      if (phase > 0.59) {
        const fall = (phase - 0.59) / 0.39
        ctx.globalAlpha = Math.max(0, 1 - fall * fall)
        ctx.fillStyle = '#704227'
        ctx.beginPath()
        ctx.ellipse(bend, reach + 0.06 + fall * fall * 0.19, 0.043, 0.061, 0.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.restore()
  }

  /** Сначала обычные враги, потом большие — чтобы те были сверху */
  function drawEnemies(time: number) {
    const enemies = game.state.enemies
    const generals = enemies.filter((enemy) => enemy.def.banner && !enemy.isDead)
    for (const general of generals) {
      const banner = general.def.banner
      if (banner) drawBannerRange(ctx, general.x, general.y, banner.radius)
    }
    for (const isTopLayer of [false, true]) {
      for (const enemy of enemies) {
        // У обычных врагов drawOnTop не задан (undefined) — это то же, что false.
        // Без «?? false» сравнение undefined с false не сошлось бы, и враг не нарисовался бы вовсе
        const drawOnTop = getEnemyArt(enemy.def.id).drawOnTop ?? false
        if (drawOnTop !== isTopLayer) continue
        drawEnemy(
          ctx,
          enemy,
          time,
          effects.bobPhase(enemy),
          effects.isFlashing(enemy),
          game.level.path,
        )
      }
    }
    if (generals.length > 0) {
      for (const enemy of enemies) {
        if (enemy.armorBreakTimeLeft <= 0 && bannerArmorOf(generals, enemy) > 0)
          drawBannerShield(ctx, enemy.x, enemy.y)
      }
    }
  }

  /** Полоски здоровья — поверх всех врагов, искр и снарядов */
  function drawHealthBars(rewards: RewardStats) {
    for (const enemy of game.state.enemies) {
      if (enemy.hp >= enemy.maxHp) continue
      const burn = forecastBurnDamage(enemy, game.level.path, game.state.oilPuddles, rewards)
      drawEnemyHealthBar(ctx, enemy, effects.bobPhase(enemy), burn)
    }
  }

  function placementPreview(view: BoardView, secondBellShare: number) {
    const cell = view.placementCell
    if (!view.armedTowerId || !cell || !game.isCellFree(cell.col, cell.row, view.armedTowerId))
      return null
    const def = TOWERS[view.armedTowerId]
    const { col, row } = cell
    const towers = game.state.towers
    return {
      def,
      cell,
      canAfford: game.state.gold >= def.cost,
      bellPreview:
        def.id === 'bell' ? bellPlacementPreview(towers, col, row, secondBellShare) : null,
      receivingBellPreview: towerPlacementBellPreview(towers, def.id, col, row, secondBellShare),
      treasuryPreview: def.id === 'treasury' ? treasuryPlacementPreview(towers, col, row) : null,
    }
  }

  function drawGhostTower(
    preview: NonNullable<ReturnType<typeof placementPreview>>,
    time: number,
    isTouchPlacement: boolean,
  ) {
    const { def, cell, canAfford, bellPreview, receivingBellPreview, treasuryPreview } = preview
    const position = { x: cell.col + CELL_CENTER, y: cell.row + CELL_CENTER }
    if (treasuryPreview) {
      drawTreasuryPreviewLinks(ctx, position, treasuryPreview.neighbors, canAfford)
    }
    ctx.save()
    ctx.translate(position.x, position.y)
    if (!canAfford) ctx.globalAlpha = 0.35
    else if (!isTouchPlacement) ctx.globalAlpha = 0.7
    if (receivingBellPreview && canAfford) drawBuffRing(ctx, time)
    if (isTouchPlacement) drawSelectionRing()
    drawTower(ctx, def.id, 0, TOWER_IDLE_AIM_ANGLE, time, true)
    ctx.restore()
    if (treasuryPreview) {
      drawTreasuryBonus(ctx, position, treasuryPreview.bonus, cellCssPx, true, canAfford)
    }
    if (bellPreview) {
      drawBellPreview(ctx, bellPreview, cellCssPx, canAfford)
    }
    if (receivingBellPreview) {
      drawTowerBellPreview(ctx, receivingBellPreview, cellCssPx, canAfford)
    }
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
      ;({ cols, rows } = game.level.def)
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
      // Новая партия в другом зале — фон зала рисуем заново.
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

      drawOilPuddles(ctx, game.level, state.oilPuddles)
      const rewards = rewardStats(state)
      const { secondBellShare } = rewards
      const preview = isPlaying ? placementPreview(boardView, secondBellShare) : null
      if (isPlaying && boardView.armedTowerId && !(preview && boardView.isTouchPlacement))
        drawFreeCellDots(boardView.armedTowerId)
      const selectedTower =
        boardView.selectedTowerCell &&
        game.towerAt(boardView.selectedTowerCell.col, boardView.selectedTowerCell.row)
      const bellSupport = bellBuffs(state.towers, secondBellShare)
      const boosted = new Set(bellSupport.map(({ tower }) => tower))
      const focusedSupport = focusedBellBuffs(bellSupport, selectedTower)
      if (selectedTower) {
        drawReach(selectedTower.def, selectedTower.tier, selectedTower, { boosted })
      } else if (preview) {
        drawReach(preview.def, 0, preview.cell, {
          isAllowed: preview.canAfford,
          boosted: preview.bellPreview
            ? new Set(preview.bellPreview.improved.map(({ tower }) => tower))
            : undefined,
          isPreview: true,
        })
      }

      drawThrone(ctx, game.level, time, hurtIntensity())
      // Живое пламя светцев и канделябров — каждый кадр, поверх неподвижного фона
      drawPropFlames(ctx, game.level.def.props ?? [], time)
      const treasuries = treasurySynergy(state.towers)
      drawTreasuryNetwork(ctx, treasuries.bonuses, treasuries.links, selectedTower)
      drawBellConnections(ctx, focusedSupport)
      drawTowers(time, selectedTower, boosted)
      drawEnemies(time)
      drawResinPour(time)

      for (const shot of state.shots) drawShot(ctx, shot)
      effects.draw(ctx)
      drawHealthBars(rewards)

      if (preview) drawGhostTower(preview, time, boardView.isTouchPlacement)
      // Плашки поверх предпросмотра клеток — подсветка не приглушает действующий процент.
      drawTreasuryBonuses(ctx, treasuries.bonuses, selectedTower, cellCssPx)
      drawBellIndicators(ctx, bellSupport, selectedTower, cellCssPx)
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
