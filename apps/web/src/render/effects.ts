// Визуальные эффекты: искры, всплывающее «+6», кольца мороза, взрывы, тряска экрана.
// Логика игры про них ничего не знает — эффекты появляются в ответ на её события.

import type { Enemy, Game, Tower } from '@throne/game'
import { enemyArt } from './enemies'
import { GOLD, circle, reduceMotion } from './shapes'
import { TOWER_ART } from './towers'

type Ctx = CanvasRenderingContext2D

export type Fx =
  | { k: 'text'; x: number; y: number; str: string; life: number; max: number }
  | {
      k: 'spark'
      x: number
      y: number
      vx: number
      vy: number
      color: string
      life: number
      max: number
    }
  | { k: 'ring'; x: number; y: number; r0: number; r1: number; life: number; max: number }
  | { k: 'boom'; x: number; y: number; r1: number; life: number; max: number }

export interface FxApi {
  add(f: Fx): void
}

export interface Effects extends FxApi {
  /** Тряска экрана, с (идёт в реальном времени) */
  readonly shake: number
  /** Красная вспышка ранения трона, с */
  readonly hurt: number
  update(simDt: number, realDt: number): void
  /** Сколько ещё длится «подпрыгивание» башни после постройки/улучшения */
  popOf(t: Tower): number
  /** Белая вспышка врага от удара */
  flashOf(e: Enemy): boolean
  /** Сдвиг фазы покачивания, чтобы враги шагали не в ногу */
  phaseOf(e: Enemy): number
  draw(c: Ctx): void
  /** Надписи рисуются в пикселях, а не в клетках — так шрифт не мылится */
  drawTexts(c: Ctx, tilePx: number): void
  dispose(): void
}

const MAX_FX = 260

export function createEffects(game: Game): Effects {
  let fx: Fx[] = []
  let shake = 0
  let hurt = 0
  // До какого игрового времени длится эффект. WeakMap — чтобы не мешать сборщику мусора
  const popUntil = new WeakMap<Tower, number>()
  const flashUntil = new WeakMap<Enemy, number>()
  const phases = new WeakMap<Enemy, number>()

  const add = (f: Fx) => {
    if (fx.length < MAX_FX) fx.push(f)
  }

  function burst(x: number, y: number, color: string, n: number) {
    if (reduceMotion) return
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 0.8 + Math.random() * 1.8
      const life = 0.3 + Math.random() * 0.3
      add({
        k: 'spark',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.6,
        life,
        max: life,
        color,
      })
    }
  }

  const now = () => game.state.time
  const pop = (t: Tower) => popUntil.set(t, now() + 0.25)

  const unsubscribe = [
    game.on('reset', () => {
      fx = []
      shake = 0
      hurt = 0
    }),
    game.on('build', pop),
    game.on('upgrade', pop),
    game.on('hit', (e) => flashUntil.set(e, now() + 0.09)),
    game.on('kill', (e) => {
      add({ k: 'text', x: e.x, y: e.y - e.def.r, str: '+' + e.def.reward, life: 0.8, max: 0.8 })
      const art = enemyArt(e.def.id)
      burst(e.x, e.y, art.color, art.sparks)
    }),
    game.on('fire', ({ tower, stats }) => TOWER_ART[tower.def.id]?.onFire?.({ add }, tower, stats)),
    game.on('splash', ({ x, y, radius }) =>
      add({ k: 'boom', x, y, r1: radius, life: 0.3, max: 0.3 }),
    ),
    game.on('leak', () => {
      shake = 0.35
      hurt = 0.5
    }),
  ]

  return {
    add,
    get shake() {
      return shake
    },
    get hurt() {
      return hurt
    },

    update(simDt, realDt) {
      if (shake > 0) shake -= realDt
      if (hurt > 0) hurt -= realDt
      for (const f of fx) {
        f.life -= simDt
        if (f.k === 'spark') {
          f.x += f.vx * simDt
          f.y += f.vy * simDt
          f.vy += 2.5 * simDt
        } else if (f.k === 'text') {
          f.y -= 0.7 * simDt
        }
      }
      if ((fx.length && fx[0].life <= 0) || fx.length > 40) fx = fx.filter((f) => f.life > 0)
    },

    popOf: (t) => (popUntil.get(t) ?? 0) - now(),
    flashOf: (e) => (flashUntil.get(e) ?? 0) > now(),
    phaseOf(e) {
      let p = phases.get(e)
      if (p === undefined) {
        p = Math.random() * Math.PI * 2
        phases.set(e, p)
      }
      return p
    },

    draw(c) {
      for (const f of fx) {
        if (f.life <= 0) continue
        const a = f.life / f.max
        if (f.k === 'ring') {
          c.strokeStyle = `rgba(170,230,255,${a * 0.8})`
          c.lineWidth = 0.05
          circle(c, f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - a))
          c.stroke()
        } else if (f.k === 'boom') {
          c.fillStyle = `rgba(255,140,50,${a * 0.45})`
          circle(c, f.x, f.y, f.r1 * (1 - a * 0.6))
          c.fill()
        } else if (f.k === 'spark') {
          c.globalAlpha = a
          c.fillStyle = f.color
          c.fillRect(f.x - 0.035, f.y - 0.035, 0.07, 0.07)
          c.globalAlpha = 1
        }
      }
    },

    drawTexts(c, tilePx) {
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = `800 ${Math.round(tilePx * 0.34)}px "Alegreya Sans",system-ui,sans-serif`
      for (const f of fx) {
        if (f.k !== 'text' || f.life <= 0) continue
        c.globalAlpha = Math.min(1, (f.life / f.max) * 2)
        c.fillStyle = 'rgba(8,9,18,.8)'
        c.fillText(f.str, f.x * tilePx + 1, f.y * tilePx + 1)
        c.fillStyle = GOLD
        c.fillText(f.str, f.x * tilePx, f.y * tilePx)
      }
      c.globalAlpha = 1
    },

    dispose() {
      unsubscribe.forEach((off) => off())
    },
  }
}
