// Визуальные эффекты: искры, всплывающее «+6», кольца мороза, взрывы, тряска экрана.
// Логика игры про них ничего не знает — эффекты появляются в ответ на её события.

import type { Enemy, Game, Tower } from '@throne/game'
import { getEnemyArt } from './enemies'
import { GOLD, circle, drawNet, prefersReducedMotion, type Canvas2D } from './shapes'
import { TOWER_ART } from './towers'

interface TextEffect {
  kind: 'text'
  x: number
  y: number
  text: string
  /** Цвет надписи. Нет — золотой, как у награды за убийство */
  color?: string
  /** Сколько эффекту осталось жить, с */
  timeLeft: number
  /** Сколько он живёт всего, с */
  duration: number
}

interface SparkEffect {
  kind: 'spark'
  x: number
  y: number
  vx: number
  vy: number
  color: string
  timeLeft: number
  duration: number
}

interface RingEffect {
  kind: 'ring'
  x: number
  y: number
  /** Радиус в начале, клеток */
  startRadius: number
  /** Радиус в конце, клеток */
  endRadius: number
  /** Цвет без прозрачности: «170,230,255». Нет — ледяной, как у Морозко */
  rgb?: string
  timeLeft: number
  duration: number
}

interface BoomEffect {
  kind: 'boom'
  x: number
  y: number
  /** Радиус взрыва, клеток */
  radius: number
  timeLeft: number
  duration: number
}

/** Сеть Ловчего упала: раскрывается на весь радиус и тает */
interface NetEffect {
  kind: 'net'
  x: number
  y: number
  /** Радиус сети, клеток */
  radius: number
  timeLeft: number
  duration: number
}

/** Облачко пара: Морозко потушил горящего врага */
interface SteamEffect {
  kind: 'steam'
  x: number
  y: number
  timeLeft: number
  duration: number
}

/** Искорка над горящим врагом: летит вверх и гаснет (без тяжести, в отличие от искр) */
interface EmberEffect {
  kind: 'ember'
  x: number
  y: number
  vx: number
  vy: number
  timeLeft: number
  duration: number
}

export type Effect =
  TextEffect | SparkEffect | RingEffect | BoomEffect | SteamEffect | NetEffect | EmberEffect

export interface EffectSink {
  add(effect: Effect): void
}

export interface Effects extends EffectSink {
  /** Тряска экрана, с (идёт в реальном времени) */
  readonly shakeTime: number
  /** Красная вспышка ранения трона, с */
  readonly throneHurtTime: number
  update(simDt: number, realDt: number): void
  /** Сколько ещё длится «подпрыгивание» башни после постройки/улучшения */
  popTimeLeft(tower: Tower): number
  /** Белая вспышка врага от удара */
  isFlashing(enemy: Enemy): boolean
  /** Сдвиг фазы покачивания, чтобы враги шагали не в ногу */
  bobPhase(enemy: Enemy): number
  draw(ctx: Canvas2D): void
  /** Надписи рисуются в пикселях, а не в клетках — так шрифт не мылится */
  drawTexts(ctx: Canvas2D, cellCssPx: number): void
  dispose(): void
}

/** Больше стольких эффектов одновременно не заводим */
const MAX_EFFECTS = 260
/** Сколько длится «подпрыгивание» башни после постройки/улучшения, с */
const POP_DURATION = 0.25
/** Сколько длится белая вспышка врага от удара, с */
const HIT_FLASH_DURATION = 0.09
/** Сколько живёт всплывающая надпись «+6», с */
const KILL_TEXT_DURATION = 0.8
/** Сколько расходится зелёное кольцо лечения знахаря, с */
const HEAL_RING_DURATION = 0.5
/** С какого радиуса начинается кольцо лечения, клеток */
const HEAL_RING_START_RADIUS = 0.2
/** Цвет кольца лечения */
const HEAL_RING_RGB = '127,209,106'
/** Цвет кольца по умолчанию — ледяной */
const DEFAULT_RING_RGB = '170,230,255'
/** Сколько живёт надпись дохода Казны «+12», с */
const INCOME_TEXT_DURATION = 1.4
/** Сколько тает облачко пара, с */
const STEAM_DURATION = 0.7
/** Как высоко поднимается пар за всё время, клеток */
const STEAM_RISE = 0.35
/** Клубы пара: [сдвиг по x, по y, радиус] в клетках */
const STEAM_PUFFS: readonly (readonly [number, number, number])[] = [
  [-0.12, 0, 0.11],
  [0.1, -0.03, 0.13],
  [0, -0.12, 0.12],
]
/** Цвет числа урона от пара: холодный белый, не путать с золотой наградой */
const STEAM_TEXT_COLOR = '#e4f6ff'
/** Сколько раскрывается и тает упавшая сеть, с */
const NET_DURATION = 0.45
/** Сколько расходится облачко пыли, когда ядро отбросило врага, с */
const KNOCKBACK_DUST_DURATION = 0.35
/** Цвет пыли от отброса */
const KNOCKBACK_DUST_RGB = '200,190,170'
/** Сколько длится взрыв, с */
const BOOM_DURATION = 0.3
/** Тряска экрана при потере жизни, с */
const LEAK_SHAKE_DURATION = 0.35
/** Красная вспышка при потере жизни, с */
const THRONE_HURT_DURATION = 0.5
/** Как быстро искры падают вниз, клеток/с² (прибавка скорости вниз) */
const SPARK_GRAVITY = 2.5
/** Как быстро надпись всплывает вверх, клеток/с */
const TEXT_RISE_SPEED = 0.7
/** Если эффектов больше стольких — убираем погасшие, даже если самый старый ещё не погас */
const COMPACTION_THRESHOLD = 40
/** Искры: самая малая скорость и разброс скорости, клеток/с */
const SPARK_MIN_SPEED = 0.8
const SPARK_SPEED_SPREAD = 1.8
/** Искры: самое малое время жизни и разброс, с */
const SPARK_MIN_LIFETIME = 0.3
const SPARK_LIFETIME_SPREAD = 0.3
/** Искры: подброс вверх в начале, клеток/с */
const SPARK_LIFT = 0.6
/** Размер шрифта надписи в долях клетки */
const TEXT_FONT_SHARE = 0.34
/** Сдвиг тени надписи, px */
const TEXT_SHADOW_OFFSET_PX = 1

/** Сколько искорок в секунду летит от горящего врага (от «мокрого» — вдвое меньше) */
const EMBER_RATE = 10
/** Сколько живёт искорка, с: самое малое и разброс */
const EMBER_MIN_LIFETIME = 0.45
const EMBER_LIFETIME_SPREAD = 0.3
/** Скорость искорки вверх, клеток/с: самая малая и разброс */
const EMBER_MIN_RISE = 0.45
const EMBER_RISE_SPREAD = 0.35
/** Размах качания искорки вбок, клеток/с */
const EMBER_DRIFT = 0.25
/** Размер искорки в начале, клеток */
const EMBER_SIZE = 0.06

/** Упавшая сеть: за первую треть жизни раскрывается до полного радиуса, потом тает */
function drawNetLanding(ctx: Canvas2D, effect: NetEffect, lifeShare: number) {
  const openShare = Math.min(1, (1 - lifeShare) * 3)
  ctx.globalAlpha = Math.min(1, lifeShare * 1.5)
  drawNet(ctx, effect.x, effect.y, effect.radius * (0.5 + 0.5 * openShare), 0.4, '#a9b4c6')
  ctx.globalAlpha = 1
}

export function createEffects(game: Game): Effects {
  let activeEffects: Effect[] = []
  let shakeTime = 0
  let throneHurtTime = 0
  // До какого игрового времени длится эффект. WeakMap — чтобы не мешать сборщику мусора
  const popEndTime = new WeakMap<Tower, number>()
  const flashEndTime = new WeakMap<Enemy, number>()
  // Случайная фаза покачивания каждого врага — чтобы шагали не в ногу
  const bobPhases = new WeakMap<Enemy, number>()

  const add = (effect: Effect) => {
    if (activeEffects.length < MAX_EFFECTS) activeEffects.push(effect)
  }

  function spawnSparks(x: number, y: number, color: string, count: number) {
    if (prefersReducedMotion) return
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = SPARK_MIN_SPEED + Math.random() * SPARK_SPEED_SPREAD
      const timeLeft = SPARK_MIN_LIFETIME + Math.random() * SPARK_LIFETIME_SPREAD
      add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - SPARK_LIFT,
        timeLeft,
        duration: timeLeft,
        color,
      })
    }
  }

  const gameTime = () => game.state.time
  const startPop = (tower: Tower) => popEndTime.set(tower, gameTime() + POP_DURATION)

  function drawRing(ctx: Canvas2D, ring: RingEffect, lifeShare: number) {
    ctx.strokeStyle = `rgba(${ring.rgb ?? DEFAULT_RING_RGB},${lifeShare * 0.8})`
    ctx.lineWidth = 0.05
    circle(
      ctx,
      ring.x,
      ring.y,
      ring.startRadius + (ring.endRadius - ring.startRadius) * (1 - lifeShare),
    )
    ctx.stroke()
  }

  function drawBoom(ctx: Canvas2D, boom: BoomEffect, lifeShare: number) {
    ctx.fillStyle = `rgba(255,140,50,${lifeShare * 0.45})`
    circle(ctx, boom.x, boom.y, boom.radius * (1 - lifeShare * 0.6))
    ctx.fill()
  }

  function drawSteam(ctx: Canvas2D, steam: SteamEffect, lifeShare: number) {
    // клубы растут и поднимаются, пока тают
    const grow = 1 + (1 - lifeShare) * 0.8
    const rise = (1 - lifeShare) * STEAM_RISE
    ctx.fillStyle = `rgba(235,245,255,${lifeShare * 0.75})`
    for (const [offsetX, offsetY, radius] of STEAM_PUFFS) {
      circle(ctx, steam.x + offsetX * grow, steam.y + offsetY - rise, radius * grow)
      ctx.fill()
    }
  }

  function drawSpark(ctx: Canvas2D, spark: SparkEffect, lifeShare: number) {
    ctx.globalAlpha = lifeShare
    ctx.fillStyle = spark.color
    ctx.fillRect(spark.x - 0.035, spark.y - 0.035, 0.07, 0.07)
    ctx.globalAlpha = 1
  }

  /** Искорка гаснет и уменьшается; жёлтая в начале, оранжевая к концу */
  function drawEmber(ctx: Canvas2D, ember: EmberEffect, lifeShare: number) {
    ctx.globalAlpha = Math.min(1, lifeShare * 1.6)
    ctx.fillStyle = lifeShare > 0.3 ? '#fff0a8' : '#ffb347'
    circle(ctx, ember.x, ember.y, EMBER_SIZE * (0.4 + 0.6 * lifeShare))
    ctx.fill()
    ctx.globalAlpha = 1
  }

  /**
   * От каждого горящего врага поднимаются искорки: движение глаз замечает раньше цвета.
   * Случайно, в среднем EMBER_RATE в секунду — так они не вылетают все разом
   */
  function spawnEmbers(simDt: number) {
    if (prefersReducedMotion || simDt <= 0) return
    for (const enemy of game.state.enemies) {
      if (enemy.burnTimeLeft <= 0 || enemy.isDead) continue
      const rate = enemy.slowTimeLeft > 0 ? EMBER_RATE / 2 : EMBER_RATE
      if (Math.random() >= rate * simDt) continue
      const radius = enemy.def.radius
      const timeLeft = EMBER_MIN_LIFETIME + Math.random() * EMBER_LIFETIME_SPREAD
      add({
        kind: 'ember',
        x: enemy.x + (Math.random() - 0.5) * radius * 1.4,
        y: enemy.y - radius * (0.6 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * EMBER_DRIFT,
        vy: -(EMBER_MIN_RISE + Math.random() * EMBER_RISE_SPREAD),
        timeLeft,
        duration: timeLeft,
      })
    }
  }

  const unsubscribers = [
    game.on('reset', () => {
      activeEffects = []
      shakeTime = 0
      throneHurtTime = 0
    }),
    game.on('build', startPop),
    game.on('upgrade', startPop),
    game.on('hit', (enemy) => flashEndTime.set(enemy, gameTime() + HIT_FLASH_DURATION)),
    game.on('kill', (enemy) => {
      add({
        kind: 'text',
        x: enemy.x,
        y: enemy.y - enemy.def.radius,
        text: '+' + enemy.def.reward,
        timeLeft: KILL_TEXT_DURATION,
        duration: KILL_TEXT_DURATION,
      })
      const art = getEnemyArt(enemy.def.id)
      spawnSparks(enemy.x, enemy.y, art.sparkColor, art.sparkCount)
    }),
    game.on('fire', ({ tower, stats }) => TOWER_ART[tower.def.id]?.onFire?.({ add }, tower, stats)),
    game.on('splash', ({ x, y, radius }) =>
      add({ kind: 'boom', x, y, radius, timeLeft: BOOM_DURATION, duration: BOOM_DURATION }),
    ),
    game.on('net', ({ x, y, radius }) =>
      add({ kind: 'net', x, y, radius, timeLeft: NET_DURATION, duration: NET_DURATION }),
    ),
    game.on('knockback', (enemy) =>
      add({
        kind: 'ring',
        x: enemy.x,
        y: enemy.y,
        startRadius: enemy.def.radius,
        endRadius: enemy.def.radius + 0.25,
        rgb: KNOCKBACK_DUST_RGB,
        timeLeft: KNOCKBACK_DUST_DURATION,
        duration: KNOCKBACK_DUST_DURATION,
      }),
    ),
    game.on('heal', ({ x, y, radius }) =>
      add({
        kind: 'ring',
        x,
        y,
        startRadius: HEAL_RING_START_RADIUS,
        endRadius: radius,
        rgb: HEAL_RING_RGB,
        timeLeft: HEAL_RING_DURATION,
        duration: HEAL_RING_DURATION,
      }),
    ),
    game.on('income', ({ tower, gold }) =>
      add({
        kind: 'text',
        x: tower.x,
        y: tower.y - 0.3,
        text: '+' + gold,
        timeLeft: INCOME_TEXT_DURATION,
        duration: INCOME_TEXT_DURATION,
      }),
    ),
    game.on('steam', ({ x, y, damage }) => {
      add({ kind: 'steam', x, y, timeLeft: STEAM_DURATION, duration: STEAM_DURATION })
      add({
        kind: 'text',
        x,
        // выше, чем «+награда» за убийство: пар часто добивает, и надписи не должны слипаться
        y: y - 0.65,
        text: String(Math.round(damage)),
        color: STEAM_TEXT_COLOR,
        timeLeft: KILL_TEXT_DURATION,
        duration: KILL_TEXT_DURATION,
      })
    }),
    game.on('leak', () => {
      shakeTime = LEAK_SHAKE_DURATION
      throneHurtTime = THRONE_HURT_DURATION
    }),
  ]

  return {
    add,
    get shakeTime() {
      return shakeTime
    },
    get throneHurtTime() {
      return throneHurtTime
    },

    update(simDt, realDt) {
      if (shakeTime > 0) shakeTime -= realDt
      if (throneHurtTime > 0) throneHurtTime -= realDt
      for (const effect of activeEffects) {
        effect.timeLeft -= simDt
        if (effect.kind === 'spark') {
          effect.x += effect.vx * simDt
          effect.y += effect.vy * simDt
          effect.vy += SPARK_GRAVITY * simDt
        } else if (effect.kind === 'ember') {
          effect.x += effect.vx * simDt
          effect.y += effect.vy * simDt
        } else if (effect.kind === 'text') {
          effect.y -= TEXT_RISE_SPEED * simDt
        }
      }
      spawnEmbers(simDt)
      if (
        (activeEffects.length && activeEffects[0].timeLeft <= 0) ||
        activeEffects.length > COMPACTION_THRESHOLD
      ) {
        activeEffects = activeEffects.filter((effect) => effect.timeLeft > 0)
      }
    },

    popTimeLeft: (tower) => (popEndTime.get(tower) ?? 0) - gameTime(),
    isFlashing: (enemy) => (flashEndTime.get(enemy) ?? 0) > gameTime(),
    bobPhase(enemy) {
      let phase = bobPhases.get(enemy)
      if (phase === undefined) {
        phase = Math.random() * Math.PI * 2
        bobPhases.set(enemy, phase)
      }
      return phase
    },

    draw(ctx) {
      for (const effect of activeEffects) {
        if (effect.timeLeft <= 0) continue
        // Доля оставшейся жизни: 1 — только появился, 0 — погас
        const lifeShare = effect.timeLeft / effect.duration
        if (effect.kind === 'ring') {
          drawRing(ctx, effect, lifeShare)
        } else if (effect.kind === 'boom') {
          drawBoom(ctx, effect, lifeShare)
        } else if (effect.kind === 'spark') {
          drawSpark(ctx, effect, lifeShare)
        } else if (effect.kind === 'steam') {
          drawSteam(ctx, effect, lifeShare)
        } else if (effect.kind === 'net') {
          drawNetLanding(ctx, effect, lifeShare)
        } else if (effect.kind === 'ember') {
          drawEmber(ctx, effect, lifeShare)
        }
      }
    },

    drawTexts(ctx, cellCssPx) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `800 ${Math.round(cellCssPx * TEXT_FONT_SHARE)}px "Alegreya Sans",system-ui,sans-serif`
      for (const effect of activeEffects) {
        if (effect.kind !== 'text' || effect.timeLeft <= 0) continue
        ctx.globalAlpha = Math.min(1, (effect.timeLeft / effect.duration) * 2)
        ctx.fillStyle = 'rgba(8,9,18,.8)'
        ctx.fillText(
          effect.text,
          effect.x * cellCssPx + TEXT_SHADOW_OFFSET_PX,
          effect.y * cellCssPx + TEXT_SHADOW_OFFSET_PX,
        )
        ctx.fillStyle = effect.color ?? GOLD
        ctx.fillText(effect.text, effect.x * cellCssPx, effect.y * cellCssPx)
      }
      ctx.globalAlpha = 1
    },

    dispose() {
      unsubscribers.forEach((off) => off())
    },
  }
}
