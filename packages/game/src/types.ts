// Все типы игры в одном месте. Единица длины везде — одна клетка поля.

import type { Emit } from './core/events.ts'
import type { Path } from './core/path.ts'

/** Точка на поле или клетка: [x, y] или [столбец, строка] */
export type Point = readonly [x: number, y: number]

/** Как броня врага режет урон: physical — полностью, piercing — наполовину, magic — никак */
export type DamageKind = 'physical' | 'magic' | 'piercing'

// ---------------------------------------------------------------- Описания (данные)

/** Характеристики башни на одной ступени улучшения */
export interface TowerStats {
  /** Урон за одно попадание, единиц здоровья */
  damage: number
  /** Пауза между выстрелами, секунд */
  cooldown: number
  /** Дальность стрельбы, клеток */
  range: number
  /** Радиус взрыва, клеток */
  splashRadius?: number
  /** Замедление: 0.35 — враг идёт на 35% медленнее */
  slowAmount?: number
  /** Сколько длится замедление, секунд */
  slowDuration?: number
  /** Сколько врагов пробивает снаряд насквозь, штук */
  pierceCount?: number
}

/** Какие характеристики можно показать в панели башни */
export type StatKey =
  'damage' | 'range' | 'cooldown' | 'slowAmount' | 'splashRadius' | 'pierceCount'

/** Описание типа башни. Новая башня = новый объект TowerDef + рисунок в apps/web */
export interface TowerDef {
  id: string
  name: string
  /** Короткое описание для магазина, с маленькой буквы */
  description: string
  /** Цена постройки, золота */
  cost: number
  /** Цена улучшений, золота: upgradeCosts[0] — с I на II ступень, upgradeCosts[1] — со II на III и т.д. */
  upgradeCosts: readonly number[]
  /** Характеристики по ступеням. Ступеней на одну больше, чем улучшений */
  tiers: readonly TowerStats[]
  /** Какие характеристики показывать в панели башни */
  displayStats: readonly StatKey[]
  /** Что делает башня, когда стреляет по цели */
  fire(world: World, tower: Tower, target: Enemy, stats: TowerStats): void
}

/** Описание типа врага */
export interface EnemyDef {
  id: string
  /** Формы слова для «1 бунтовщик», «2 бунтовщика», «5 бунтовщиков» */
  nameForms: readonly [one: string, few: string, many: string]
  /** Здоровье на 1-й волне (дальше растёт, см. balance.ts) */
  hp: number
  /** Скорость, клеток в секунду */
  speed: number
  /** Броня: сколько урона срезает с каждого попадания (зависит от вида урона) */
  armor: number
  /** Золото за убийство */
  reward: number
  /** Сколько жизней трона отнимает, если дошёл */
  throneDamage: number
  /** Радиус врага, клеток */
  radius: number
  /** Сопротивление замедлению: 0.5 — замедляется вдвое слабее */
  slowResistance?: number
}

/** Группа врагов в волне: кто (id), сколько, пауза между ними (с), задержка начала (с) */
export type WaveGroup = readonly [enemyId: string, count: number, gap: number, delay: number]

/** Описание уровня (карты) */
export interface LevelDef {
  id: string
  name: string
  /** Ширина поля, клеток */
  cols: number
  /** Высота поля, клеток */
  rows: number
  /** Точки ковра от двери до трона. Враги идут по прямым между ними */
  pathPoints: readonly Point[]
  /** Где стоит трон (центр) */
  throne: Point
  /** Клетки, где нельзя строить, кроме самого ковра (например, помост с троном) */
  blockedCells: readonly Point[]
  /** Золото в начале партии */
  startGold: number
  /** Жизни трона в начале партии */
  startLives: number
  /** Волны. Их количество — сколько нужно отбить для победы */
  waves: readonly (readonly WaveGroup[])[]
  /** Волны бесконечного режима после победы; waveNumber — номер волны */
  endlessWaveGroups(waveNumber: number): readonly WaveGroup[]
}

/** Уровень, готовый к игре: описание + рассчитанный путь и занятые клетки */
export interface Level {
  def: LevelDef
  path: Path
  /** Клетки, где нельзя строить, в виде ключей "столбец,строка" */
  blockedCellKeys: ReadonlySet<string>
  /** Сколько всего волн в уровне (без бесконечного режима) */
  waveCount: number
}

// ---------------------------------------------------------------- Состояние партии

/** Башня, стоящая на поле */
export interface Tower {
  /** Порядковый номер именно этой башни в партии (не путать с def.id — видом, например 'archer') */
  id: number
  def: TowerDef
  /** Столбец клетки, на которой стоит башня */
  col: number
  /** Строка клетки, на которой стоит башня */
  row: number
  /** Центр клетки по горизонтали, клеток */
  x: number
  /** Центр клетки по вертикали, клеток */
  y: number
  /** Ступень улучшения с нуля: 0 — это «I» */
  tier: number
  /** Сколько секунд осталось до следующего выстрела */
  cooldownLeft: number
  /** Куда смотрит башня, радианы */
  aimAngle: number
}

/** Враг, идущий по ковру */
export interface Enemy {
  /** Порядковый номер именно этого врага в партии (не путать с def.id — видом, например 'ogre') */
  id: number
  def: EnemyDef
  /** Текущее здоровье */
  hp: number
  /** Здоровье в начале (с учётом роста по волнам) */
  maxHp: number
  /** Сколько клеток прошёл по ковру */
  pathDistance: number
  x: number
  y: number
  /** Сколько ещё секунд враг замедлен */
  slowTimeLeft: number
  /** Сила текущего замедления: 0.35 — идёт на 35% медленнее */
  slowFactor: number
  /** Убит: такого врага уберут из списка в конце шага */
  isDead: boolean
}

/** Снаряд, который летит за целью (стрела, огненный шар) */
export interface HomingShot {
  kind: 'homing'
  /** Как выглядит — подсказка для рисования */
  look: string
  x: number
  y: number
  /** Куда повёрнут снаряд, радианы */
  angle: number
  target: Enemy
  /** Последняя известная позиция цели по горизонтали: если цель умрёт, снаряд долетит сюда */
  targetX: number
  /** Последняя известная позиция цели по вертикали */
  targetY: number
  /** Скорость полёта, клеток в секунду */
  speed: number
  /** Урон за попадание, единиц здоровья */
  damage: number
  /** Вид урона: от него зависит, как действует броня */
  damageKind: DamageKind
  /** Радиус взрыва, клеток; 0 — бьёт только цель */
  splashRadius: number
  /** Снаряд долетел или потерял смысл: его уберут в конце шага */
  isDone: boolean
}

/** Снаряд, который летит по прямой и пробивает врагов (болт баллисты) */
export interface LineShot {
  kind: 'line'
  /** Как выглядит — подсказка для рисования */
  look: string
  x: number
  y: number
  /** Куда повёрнут снаряд, радианы */
  angle: number
  /** Направление полёта по горизонтали (единичный вектор) */
  directionX: number
  /** Направление полёта по вертикали (единичный вектор) */
  directionY: number
  /** Скорость полёта, клеток в секунду */
  speed: number
  /** Сколько клеток ещё пролетит */
  distanceLeft: number
  /** Урон за попадание, единиц здоровья */
  damage: number
  /** Вид урона: от него зависит, как действует броня */
  damageKind: DamageKind
  /** Сколько ещё врагов может пробить, штук */
  piercesLeft: number
  /** Кого болт уже задел (одного врага дважды не бьёт) */
  hitEnemies: Set<Enemy>
  /** Снаряд улетел или пробил всё, что мог: его уберут в конце шага */
  isDone: boolean
}

export type Shot = HomingShot | LineShot

/**
 * idle — партия не начата (на экране меню),
 * build — между волнами, wave — идёт волна,
 * lost — трон пал, won — все волны отбиты.
 */
export type Phase = 'idle' | 'build' | 'wave' | 'lost' | 'won'

/** Один ещё не вышедший враг в очереди волны */
export interface SpawnEntry {
  /** На какой секунде волны враг выходит */
  spawnTime: number
  /** Какой это враг (id из EnemyDef) */
  enemyId: string
}

export interface GameState {
  phase: Phase
  /** НОМЕР текущей (или следующей) волны, считая с 1 */
  wave: number
  /** Сколько волн отбито */
  wavesCleared: number
  /** Золото игрока */
  gold: number
  /** Сколько жизней осталось у трона */
  lives: number
  score: number
  /** Сколько врагов убито */
  kills: number
  /** Идёт бесконечный режим (после победы) */
  isEndless: boolean
  /** Игра на паузе */
  isPaused: boolean
  /** Скорость игры: 1, 2 или 3 */
  speed: number
  /** Игровое время, с. Стоит на паузе, ускоряется вместе с игрой */
  time: number
  towers: Tower[]
  /** Башни по клеткам: ключ "столбец,строка" */
  towersByCell: Map<string, Tower>
  enemies: Enemy[]
  shots: Shot[]
  /** Кто ещё выйдет в этой волне; отсортировано так, что ближайший — в конце */
  spawnQueue: SpawnEntry[]
  /** Сколько секунд идёт текущая волна */
  waveTime: number
  /** Номер для следующей башни или врага */
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
