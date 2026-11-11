// Рисует поле каждый кадр. Ничего не меняет в игре — только смотрит на game.state.

import { TOWERS, towerStats, type Game } from '@throne/game'
import type { BoardView } from '@/types'
import { createEffects } from './effects'
import { drawEnemy, enemyArt } from './enemies'
import { buildHall, drawThrone } from './hall'
import { GOLD, PARCH, circle, reduceMotion } from './shapes'
import { drawShot } from './shots'
import { drawTower } from './towers'

export interface Renderer {
  /** Подогнать поле под размер области (в CSS-пикселях) */
  resize(width: number, height: number): void
  draw(realDt: number, view: BoardView): void
  dispose(): void
}

export function createRenderer(canvas: HTMLCanvasElement, game: Game): Renderer {
  const ctx = canvas.getContext('2d')!
  const { cols, rows, throne } = game.level.def
  const effects = createEffects(game)

  let tilePx = 40 // размер клетки в CSS-пикселях
  let dpr = 1 // сколько настоящих пикселей экрана в одном CSS-пикселе
  let S = 40 // размер клетки в настоящих пикселях
  let hall: HTMLCanvasElement | null = null
  let lastTime = 0

  function drawRange(x: number, y: number, range: number, ok: boolean) {
    ctx.fillStyle = ok ? 'rgba(243,233,210,.07)' : 'rgba(240,90,70,.08)'
    circle(ctx, x, y, range)
    ctx.fill()
    ctx.strokeStyle = ok ? 'rgba(227,178,74,.75)' : 'rgba(240,110,80,.8)'
    ctx.lineWidth = 0.03
    ctx.setLineDash([0.14, 0.1])
    ctx.stroke()
    ctx.setLineDash([])
  }

  return {
    resize(width, height) {
      if (!width || !height) return
      dpr = Math.min(window.devicePixelRatio || 1, 3)
      tilePx = Math.max(16, Math.floor(Math.min((width - 10) / cols, (height - 10) / rows)))
      canvas.style.width = cols * tilePx + 'px'
      canvas.style.height = rows * tilePx + 'px'
      canvas.width = Math.round(cols * tilePx * dpr)
      canvas.height = Math.round(rows * tilePx * dpr)
      S = canvas.width / cols
      hall = buildHall(game.level, canvas.width, canvas.height, S)
    },

    draw(realDt, view) {
      const s = game.state
      const time = s.time
      const simDt = Math.max(0, time - lastTime)
      lastTime = time
      effects.update(simDt, realDt)

      // Тряска: всё поле сдвигается на случайные доли клетки
      let shx = 0
      let shy = 0
      if (effects.shake > 0 && !reduceMotion) {
        shx = (Math.random() - 0.5) * effects.shake * 0.5 * S
        shy = (Math.random() - 0.5) * effects.shake * 0.5 * S
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#171a28'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (hall) ctx.drawImage(hall, shx, shy)
      // Дальше рисуем в клетках: 1 единица = 1 клетка
      ctx.setTransform(S, 0, 0, S, shx, shy)

      const playing = s.phase === 'build' || s.phase === 'wave'

      // Точки на свободных плитах, когда выбираем, куда ставить
      if (playing && (view.armed || view.tile)) {
        ctx.fillStyle = 'rgba(227,178,74,.3)'
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (!game.isFree(c, r)) continue
            circle(ctx, c + 0.5, r + 0.5, 0.05)
            ctx.fill()
          }
        }
      }
      if (view.tile) {
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 0.05
        ctx.setLineDash([0.16, 0.1])
        ctx.strokeRect(view.tile.c + 0.07, view.tile.r + 0.07, 0.86, 0.86)
        ctx.setLineDash([])
      }
      const selected = view.selected && game.towerAt(view.selected.c, view.selected.r)
      if (selected) drawRange(selected.x, selected.y, towerStats(selected).range, true)

      drawThrone(ctx, throne, time, effects.hurt)

      for (const t of s.towers) {
        ctx.save()
        ctx.translate(t.x, t.y)
        const pop = effects.popOf(t)
        if (pop > 0 && !reduceMotion) ctx.scale(1 + pop * 0.8, 1 + pop * 0.8)
        drawTower(ctx, t.def.id, t.lv, t.aim, time, t.cd < towerStats(t).rate * 0.55)
        if (t === selected) {
          ctx.strokeStyle = GOLD
          ctx.lineWidth = 0.045
          circle(ctx, 0, 0, 0.41)
          ctx.stroke()
        }
        ctx.restore()
      }

      // Сначала обычные враги, потом большие — чтобы те были сверху
      for (const front of [false, true]) {
        for (const e of s.enemies) {
          if (!!enemyArt(e.def.id).front !== front) continue
          drawEnemy(ctx, e, time, effects.phaseOf(e), effects.flashOf(e))
        }
      }

      for (const shot of s.shots) drawShot(ctx, shot)
      effects.draw(ctx)

      // Полупрозрачная башня под курсором — «вот так встанет»
      const ghost = playing && view.armed ? (view.hover ?? view.cursor) : null
      if (ghost && view.armed && game.isFree(ghost.c, ghost.r)) {
        const def = TOWERS[view.armed]
        const ok = s.gold >= def.cost
        drawRange(ghost.c + 0.5, ghost.r + 0.5, def.levels[0].range, ok)
        ctx.save()
        ctx.translate(ghost.c + 0.5, ghost.r + 0.5)
        ctx.globalAlpha = ok ? 0.7 : 0.35
        drawTower(ctx, view.armed, 0, -Math.PI / 2, time, true)
        ctx.restore()
      }
      if (playing && view.cursor) {
        ctx.strokeStyle = PARCH
        ctx.lineWidth = 0.045
        ctx.strokeRect(view.cursor.c + 0.04, view.cursor.r + 0.04, 0.92, 0.92)
      }

      ctx.setTransform(dpr, 0, 0, dpr, shx, shy)
      effects.drawTexts(ctx, tilePx)

      // Красная виньетка, когда трон ранен
      if (effects.hurt > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        const w = canvas.width
        const h = canvas.height
        const gr = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.7)
        gr.addColorStop(0, 'rgba(200,30,40,0)')
        gr.addColorStop(1, `rgba(200,30,40,${Math.min(0.5, effects.hurt)})`)
        ctx.fillStyle = gr
        ctx.fillRect(0, 0, w, h)
      }
    },

    dispose() {
      effects.dispose()
    },
  }
}
