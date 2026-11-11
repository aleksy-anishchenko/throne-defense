// Все типы игры в одном месте. Единица длины везде — одна клетка поля.

import type { Emit } from './core/events.ts'
import type { Path } from './core/path.ts'

/** Точка на поле или клетка: [x, y] или [столбец, строка] */
export type Point = readonly [x: number, y: number]

/** Как броня врага режет урон: phys — полностью, pierce — наполовину, magic — никак */
export type DamageKind = 'phys' | 'magic' | 'pierce'

// ---------------------------------------------------------------- Описания (данные)

/** Характеристики башни на одном уровне */
export interface TowerStats {
  /** Урон за попадание */
  dmg: number
  /** Пауза между выстрелами, с */
  rate: number
  /** Дальность, клеток */
  range: number
  /** Радиус взрыва */
  splash?: number
  /** Замедление: 0.35 — враг идёт на 35% медленнее */
  slow?: number
  /** Сколько длится замедление, с */
  dur?: number
  /** Сколько врагов пробивает снаряд */
  pierce?: number
}

/** Какие характеристики можно показать в панели башни */
export type StatKey = 'dmg' | 'range' | 'rate' | 'slow' | 'splash' | 'pierce'

/** Описание типа башни. Новая башня = новый объект TowerDef + рисунок в apps/web */
export interface TowerDef {
  id: string
  name: string
  /** Короткое описание для магазина, с маленькой буквы */
  desc: string
  cost: number
  /** Цена улучшений: upgrades[0] — с I на II уровень, upgrades[1] — со II на III и т.д. */
  upgrades: readonly number[]
  /** Характеристики по уровням. Уровней на один больше, чем улучшений */
  levels: readonly TowerStats[]
  /** Какие характеристики показывать в панели башни */
  display: readonly StatKey[]
  /** Что делает башня, когда стреляет по цели */
  fire(world: World, tower: Tower, target: Enemy, stats: TowerStats): void
}

/** Описание типа врага */
export interface EnemyDef {
  id: string
  /** Формы слова для «1 бунтовщик», «2 бунтовщика», «5 бунтовщиков» */
  name: readonly [one: string, few: string, many: string]
  /** Здоровье на 1-й волне (дальше растёт, см. balance.ts) */
  hp: number
  /** Скорость, клеток в секунду */
  speed: number
  armor: number
  /** Золото за убийство */
  reward: number
  /** Сколько жизней трона отнимает, если дошёл */
  dmg: number
  /** Радиус, клеток */
  r: number
  /** Сопротивление замедлению: 0.5 — замедляется вдвое слабее */
  slowResist?: number
}

/** Группа врагов в волне: кто, сколько, пауза между ними (с), задержка начала (с) */
export type WaveGroup = readonly [enemy: string, count: number, gap: number, delay: number]

/** Описание уровня (карты) */
export interface LevelDef {
  id: string
  name: string
  cols: number
  rows: number
  /** Точки ковра от двери до трона. Враги идут по прямым между ними */
  path: readonly Point[]
  /** Где стоит трон (центр) */
  throne: Point
  /** Клетки, где нельзя строить, кроме самого ковра (например, помост с троном) */
  blocked: readonly Point[]
  startGold: number
  startLives: number
  /** Волны. Их количество — сколько нужно отбить для победы */
  waves: readonly (readonly WaveGroup[])[]
  /** Волны бесконечного режима после победы */
  endless(wave: number): readonly WaveGroup[]
}

/** Уровень, готовый к игре: описание + рассчитанный путь и занятые клетки */
export interface Level {
  def: LevelDef
  path: Path
  /** Клетки, где нельзя строить, в виде ключей "столбец,строка" */
  blocked: ReadonlySet<string>
  maxWave: number
}

// ---------------------------------------------------------------- Состояние партии

export interface Tower {
  id: number
  def: TowerDef
  c: number
  r: number
  x: number
  y: number
  /** Уровень с нуля: 0 — это «I» */
  lv: number
  /** Сколько секунд до следующего выстрела */
  cd: number
  /** Куда смотрит, радианы */
  aim: number
}

export interface Enemy {
  id: number
  def: EnemyDef
  hp: number
  maxHp: number
  /** Сколько клеток прошёл по ковру */
  d: number
  x: number
  y: number
  /** Сколько ещё секунд замедлен */
  slowT: number
  /** Сила замедления */
  slowF: number
  dead: boolean
}

/** Снаряд, который летит за целью (стрела, огненный шар) */
export interface HomingShot {
  kind: 'homing'
  /** Как выглядит — подсказка для рисования */
  look: string
  x: number
  y: number
  aim: number
  target: Enemy
  /** Последняя известная позиция цели: если цель умрёт, снаряд долетит сюда */
  tx: number
  ty: number
  speed: number
  dmg: number
  damage: DamageKind
  /** Радиус взрыва; 0 — бьёт только цель */
  splash: number
  done: boolean
}

/** Снаряд, который летит по прямой и пробивает врагов (болт баллисты) */
export interface LineShot {
  kind: 'line'
  look: string
  x: number
  y: number
  aim: number
  dx: number
  dy: number
  speed: number
  /** Сколько клеток ещё пролетит */
  left: number
  dmg: number
  damage: DamageKind
  /** Сколько ещё врагов может пробить */
  pierce: number
  hit: Set<Enemy>
  done: boolean
}

export type Shot = HomingShot | LineShot

/**
 * idle — партия не начата (на экране меню),
 * build — между волнами, wave — идёт волна,
 * over — трон пал, won — все волны отбиты.
 */
export type Phase = 'idle' | 'build' | 'wave' | 'over' | 'won'

export interface GameState {
  phase: Phase
  /** Номер текущей (или следующей) волны */
  wave: number
  /** Сколько волн отбито */
  cleared: number
  gold: number
  lives: number
  score: number
  kills: number
  endless: boolean
  paused: boolean
  /** Скорость игры: 1, 2 или 3 */
  speed: number
  /** Игровое время, с. Стоит на паузе, ускоряется вместе с игрой */
  time: number
  towers: Tower[]
  /** Башни по клеткам: ключ "столбец,строка" */
  grid: Map<string, Tower>
  enemies: Enemy[]
  shots: Shot[]
  /** Кто ещё выйдет в этой волне; отсортировано так, что ближайший — в конце */
  queue: { t: number; enemy: string }[]
  /** Сколько секунд идёт текущая волна */
  waveT: number
  nextId: number
}

// ---------------------------------------------------------------- События

/** События, которые игра сообщает наружу (звук, эффекты, интерфейс) */
export interface GameEvents {
  reset: void
  build: Tower
  upgrade: Tower
  sell: { tower: Tower; refund: number }
  waveStart: number
  waveCleared: { wave: number; bonus: number }
  fire: { tower: Tower; stats: TowerStats }
  hit: Enemy
  kill: Enemy
  splash: { x: number; y: number; radius: number }
  leak: Enemy
  victory: void
  defeat: void
}

/** То, с чем работают системы игры: состояние, уровень и способ сообщить о событии */
export interface World {
  state: GameState
  level: Level
  emit: Emit<GameEvents>
}
