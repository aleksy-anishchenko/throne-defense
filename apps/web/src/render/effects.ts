// Визуальные эффекты: искры, всплывающее «+6», кольца мороза, взрывы, тряска экрана.
// Логика игры про них ничего не знает — эффекты появляются в ответ на её события.

import { fireRateBonusOf, towerStats, type Enemy, type Game, type Tower } from '@throne/game'
import { getEnemyArt } from './enemies'
import { GOLD, circle, drawNet, prefersReducedMotion, type Canvas2D } from './shapes'
import { BELL_SWING_SPEED, BUFF_RGB, FIRE_RGB } from './statuses'
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

/**
 * Частица эффекта на враге: искорка огня летит вверх, снежинка мороза сыплется вниз.
 * Летит ровно (без тяжести, в отличие от искр при гибели) и гаснет, см. STATUS_PARTICLES
 */
interface MoteEffect {
  kind: 'mote'
  look: MoteLook
  x: number
  y: number
  vx: number
  vy: number
  timeLeft: number
  duration: number
}

export type Effect =
  TextEffect | SparkEffect | RingEffect | BoomEffect | SteamEffect | NetEffect | MoteEffect

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
/** Сгоревшая сеть: искры, их цвет, насколько разбегается огненное кольцо (клеток) и сколько, с */
const NET_BURN_SPARK_COUNT = 8
const NET_BURN_SPARK_COLOR = '#ffb347'
const NET_BURN_RING_GROWTH = 0.3
const NET_BURN_DURATION = 0.35
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

/** Как выглядит и летит частица эффекта */
interface MoteLook {
  /** Цвет в начале жизни и к концу */
  youngColor: string
  oldColor: string
  /** Точка, снежинка-крестик или нотка (у башен под Звонарём) */
  shape: 'dot' | 'flake' | 'note'
  /** Размер в начале, клеток */
  size: number
}

/**
 * Частицы эффектов на враге (общие правила — в statuses.ts). Движение глаз замечает
 * раньше цвета: так эффект видно даже на маленьком экране
 */
interface StatusParticles {
  isActive(enemy: Enemy): boolean
  look: MoteLook
  /** Сколько частиц в секунду от одного врага (в среднем) */
  rate: number
  /** Откуда вылетает: по высоте, в долях радиуса от центра врага (минус — выше), [от, до] */
  spawnY: readonly [number, number]
  /** Скорость по вертикали, клеток/с (минус — вверх), [от, до] */
  speedY: readonly [number, number]
  /** Размах качания вбок, клеток/с */
  drift: number
  /** Сколько живёт, с, [от, до] */
  lifetime: readonly [number, number]
}

const STATUS_PARTICLES: readonly StatusParticles[] = [
  {
    // Огонь: искорки летят вверх
    isActive: (enemy) => enemy.burnTimeLeft > 0,
    look: { youngColor: '#fff0a8', oldColor: '#ffb347', shape: 'dot', size: 0.06 },
    rate: 10,
    spawnY: [-1.2, -0.6],
    speedY: [-0.8, -0.45],
    drift: 0.25,
    lifetime: [0.45, 0.75],
  },
  {
    // Мороз: снежинки сыплются с врага вниз
    isActive: (enemy) => enemy.slowTimeLeft > 0,
    look: { youngColor: '#ffffff', oldColor: '#bfe9ff', shape: 'flake', size: 0.05 },
    rate: 6,
    spawnY: [-0.6, 0.2],
    speedY: [0.15, 0.3],
    drift: 0.2,
    lifetime: [0.6, 0.9],
  },
]

/** Нотка над башней, которую ускоряет Звонарь: золотая, медленно всплывает */
const NOTE_LOOK: MoteLook = { youngColor: GOLD, oldColor: '#f2d48a', shape: 'note', size: 0.1 }
/** Сколько ноток в секунду над ускоренной башней (в среднем) */
const NOTE_RATE = 0.8
/** Скорость нотки вверх, клеток/с, и сколько она живёт, с */
const NOTE_RISE = 0.35
const NOTE_LIFETIME = 1.1
/** Золотая волна от колокола: раз за полный размах; сколько расходится, с */
const BELL_WAVE_DURATION = 0.7
/** С какого радиуса начинается волна колокола, клеток */
const BELL_WAVE_START_RADIUS = 0.3

/** Случайное число в промежутке [from, to] */
const randomBetween = ([from, to]: readonly [number, number]) => from + Math.random() * (to - from)

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

  /** Частица гаснет и уменьшается, к концу жизни меняет цвет */
  function drawMote(ctx: Canvas2D, mote: MoteEffect, lifeShare: number) {
    const { look } = mote
    const size = look.size * (0.4 + 0.6 * lifeShare)
    ctx.globalAlpha = Math.min(1, lifeShare * 1.6)
    if (look.shape === 'note') {
      // нотка ♪: головка-овал, штиль вверх и флажок. Сначала тёмный «контур» потолще,
      // потом золото поверх — видно и на полу, и на ковре
      const color = lifeShare > 0.3 ? look.youngColor : look.oldColor
      ctx.lineCap = 'round'
      for (const [strokeColor, extra] of [
        ['rgba(8,9,18,.7)', size * 0.18],
        [color, 0],
      ] as const) {
        ctx.fillStyle = strokeColor
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = size * 0.26 + extra
        ctx.beginPath()
        ctx.ellipse(
          mote.x,
          mote.y,
          size * 0.55 + extra / 2,
          size * 0.4 + extra / 2,
          -0.4,
          0,
          Math.PI * 2,
        )
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(mote.x + size * 0.48, mote.y - size * 0.1)
        ctx.lineTo(mote.x + size * 0.48, mote.y - size * 1.5)
        ctx.quadraticCurveTo(
          mote.x + size * 1.1,
          mote.y - size * 1.2,
          mote.x + size,
          mote.y - size * 0.6,
        )
        ctx.stroke()
      }
    } else if (look.shape === 'dot') {
      ctx.fillStyle = lifeShare > 0.3 ? look.youngColor : look.oldColor
      circle(ctx, mote.x, mote.y, size)
      ctx.fill()
    } else {
      // снежинка — крестик из двух палочек и «х» поменьше
      ctx.strokeStyle = lifeShare > 0.3 ? look.youngColor : look.oldColor
      ctx.lineWidth = size * 0.45
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(mote.x - size, mote.y)
      ctx.lineTo(mote.x + size, mote.y)
      ctx.moveTo(mote.x, mote.y - size)
      ctx.lineTo(mote.x, mote.y + size)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  /** От врагов под эффектами летят частицы — случайно, в среднем rate в секунду, не все разом */
  function spawnStatusParticles(simDt: number) {
    if (prefersReducedMotion || simDt <= 0) return
    for (const enemy of game.state.enemies) {
      if (enemy.isDead) continue
      const radius = enemy.def.radius
      for (const particles of STATUS_PARTICLES) {
        if (!particles.isActive(enemy) || Math.random() >= particles.rate * simDt) continue
        const timeLeft = randomBetween(particles.lifetime)
        add({
          kind: 'mote',
          look: particles.look,
          x: enemy.x + (Math.random() - 0.5) * radius * 1.4,
          y: enemy.y + radius * randomBetween(particles.spawnY),
          vx: (Math.random() - 0.5) * particles.drift,
          vy: randomBetween(particles.speedY),
          timeLeft,
          duration: timeLeft,
        })
      }
    }
  }

  /** Номер последнего «удара» каждого Звонаря — чтобы волна шла раз за размах */
  const bellStrikes = new WeakMap<Tower, number>()

  /**
   * Звонарь и его соседи: от колокола раз за размах расходится золотая волна до края радиуса,
   * над ускоренными башнями всплывают нотки. Только если Звонарь кого-то ускоряет
   */
  function spawnBellEffects(simDt: number) {
    if (prefersReducedMotion || simDt <= 0) return
    const towers = game.state.towers
    const buffed = towers.filter((tower) => fireRateBonusOf(towers, tower) > 0)
    if (buffed.length === 0) return
    const strike = Math.floor((gameTime() * BELL_SWING_SPEED) / (Math.PI * 2))
    for (const tower of towers) {
      const range = towerStats(tower).range
      if (!(towerStats(tower).fireRateBonus ?? 0)) continue
      if (bellStrikes.get(tower) === strike) continue
      bellStrikes.set(tower, strike)
      const reachesSomeone = buffed.some(
        (other) => (other.x - tower.x) ** 2 + (other.y - tower.y) ** 2 <= range ** 2,
      )
      if (!reachesSomeone) continue
      add({
        kind: 'ring',
        x: tower.x,
        y: tower.y,
        startRadius: BELL_WAVE_START_RADIUS,
        endRadius: range,
        rgb: BUFF_RGB,
        timeLeft: BELL_WAVE_DURATION,
        duration: BELL_WAVE_DURATION,
      })
    }
    for (const tower of buffed) {
      if (Math.random() >= NOTE_RATE * simDt) continue
      add({
        kind: 'mote',
        look: NOTE_LOOK,
        x: tower.x + (Math.random() - 0.5) * 0.4,
        y: tower.y - 0.25,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -NOTE_RISE,
        timeLeft: NOTE_LIFETIME,
        duration: NOTE_LIFETIME,
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
    // Огонь растопил лёд — облачко пара, без числа: урона нет
    game.on('thaw', (enemy) =>
      add({
        kind: 'steam',
        x: enemy.x,
        y: enemy.y,
        timeLeft: STEAM_DURATION,
        duration: STEAM_DURATION,
      }),
    ),
    // Сеть сгорела — оранжевые искры и огненное кольцо разбегается от врага
    game.on('netBurn', (enemy) => {
      spawnSparks(enemy.x, enemy.y, NET_BURN_SPARK_COLOR, NET_BURN_SPARK_COUNT)
      add({
        kind: 'ring',
        x: enemy.x,
        y: enemy.y,
        startRadius: enemy.def.radius,
        endRadius: enemy.def.radius + NET_BURN_RING_GROWTH,
        rgb: FIRE_RGB,
        timeLeft: NET_BURN_DURATION,
        duration: NET_BURN_DURATION,
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
        } else if (effect.kind === 'mote') {
          effect.x += effect.vx * simDt
          effect.y += effect.vy * simDt
        } else if (effect.kind === 'text') {
          effect.y -= TEXT_RISE_SPEED * simDt
        }
      }
      spawnStatusParticles(simDt)
      spawnBellEffects(simDt)
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
        } else if (effect.kind === 'mote') {
          drawMote(ctx, effect, lifeShare)
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
