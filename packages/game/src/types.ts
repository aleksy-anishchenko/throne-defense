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
  /** Сколько урона враг получит за полный поджог после попадания, сверх damage. */
  burnDamage?: number
  /** За сколько секунд догорает этот урон */
  burnDuration?: number
  /** Звонарь: насколько быстрее стреляют башни в радиусе (0.2 — на 20% быстрее) */
  fireRateBonus?: number
  /** Казна: сколько золота приносит за каждую отбитую волну */
  goldPerWave?: number
  /** Ловчий: сколько секунд враги стоят в сети */
  rootDuration?: number
  /** Колдун: сила проклятия (0.2 — урон по врагу +20%, получаемое лечение −20%) */
  curseAmount?: number
  /** Колдун: сколько секунд держится проклятие */
  curseDuration?: number
}

/** Какие характеристики можно показать в панели башни */
export type StatKey =
  | 'damage'
  | 'range'
  | 'cooldown'
  | 'slowAmount'
  | 'splashRadius'
  | 'pierceCount'
  | 'burnDamage'
  | 'fireRateBonus'
  | 'goldPerWave'
  | 'rootDuration'
  | 'curseAmount'
  /** Вычисляется из curseAmount: сила снижения лечения равна силе проклятия */
  | 'healingReduction'

/**
 * Кого башня выбирает целью: first — того, кто ближе всех к трону,
 * strongest — самого крупного (больше всех полного здоровья), среди равных — первого
 */
export type TargetMode = 'first' | 'strongest'

/** Взаимоисключающая специализация после последней обычной ступени башни. */
export interface TowerAspectDef {
  id: string
  name: string
  description: string
  cost: number
  /** Дополнительный урон по исполинам: 0.6 — на 60% больше. */
  giantDamageBonus?: number
  /** Попадание снимает броню на столько секунд; повторное обновляет срок. */
  armorBreakDuration?: number
  /** Последовательные выстрелы по одной цели накапливают бонус к урону. */
  hunterMark?: {
    /** Прибавка к урону за каждый шаг серии: 0.1 — на 10%. */
    damagePerStack: number
    maxStacks: number
  }
  /** Дополнительные стрелы по врагам рядом с основной целью. */
  ricochet?: {
    /** Доли урона для каждой следующей стрелы. */
    shares: readonly number[]
    /** Радиус поиска дополнительных целей вокруг основной, клеток. */
    radius: number
  }
}

/** Описание типа башни. Новая башня = новый объект TowerDef + рисунок в apps/web */
export interface TowerDef {
  id: string
  name: string
  /** Короткое описание для магазина, с маленькой буквы */
  description: string
  /** Подсказка о взаимодействии с другими башнями — до и после покупки */
  interactionHint?: string
  /** Цена постройки, золота */
  cost: number
  /** Цена улучшений, золота: upgradeCosts[0] — с I на II ступень, upgradeCosts[1] — со II на III и т.д. */
  upgradeCosts: readonly number[]
  /** Характеристики по ступеням. Ступеней на одну больше, чем улучшений */
  tiers: readonly TowerStats[]
  /** Один аспект на конкретную башню; покупается между волнами после последней ступени. */
  aspects?: readonly TowerAspectDef[]
  /** Какие характеристики показывать в панели башни */
  displayStats: readonly StatKey[]
  /** Кого башня бьёт сразу после постройки */
  defaultTargetMode: TargetMode
  /**
   * Может ли игрок переключать цель — умение башни. Сейчас только у баллисты:
   * «первый» (кто ближе к трону) или «сильный» (огры, Горыныч, узурпатор)
   */
  canChooseTarget: boolean
  /** Сначала выбирать негорящих врагов, затем первого из горящих. */
  preferUnburning?: boolean
  /**
   * Ускоряет ли её Звонарь. Да — у тех, кто стреляет (лучник, огневик, баллиста).
   * Нет — у Морозко: его замедление и так держится дольше паузы между пульсами,
   * ускорение ничего бы не дало, и игрок зря тратил бы Звонаря
   */
  takesFireRateBonus: boolean
  /** Что делает башня, когда стреляет по цели. Нет — башня не стреляет (Звонарь, Казна) */
  fire?(world: World, tower: Tower, target: Enemy, stats: TowerStats): void
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
  /** Исполин. Категория не зависит от здоровья и номера волны. */
  isGiant?: boolean
  /** Сопротивление замедлению: 0.5 — замедляется вдвое слабее */
  slowResistance?: number
  /**
   * Устойчивость к сети Ловчего: 0.7 — сеть держит 30% времени.
   * Крупных (огр, Горыныч, узурпатор) остановить труднее
   */
  controlResistance?: number
  /** Лечит других врагов рядом (знахарь) */
  heal?: EnemyHeal
  /** Даёт броню бунтовщикам, лазутчикам и латникам поблизости */
  banner?: { radius: number; armor: number }
  /** Не получает лечение от знахарей (Узурпатор) */
  immuneToHealing?: boolean
  /** Погибая, распадается на нескольких врагов поменьше (Змей Горыныч) */
  splitInto?: EnemySplit
}

/** Постоянные и мгновенные эффекты благословений после рубежных волн */
export type RewardEffect =
  | { kind: 'gold' }
  | { kind: 'buyback' }
  | { kind: 'healToFull' }
  | { kind: 'damage'; amount: number }
  | { kind: 'fireRate'; amount: number }
  | { kind: 'killGold'; amount: number }
  | { kind: 'waveGold'; amount: number }
  | { kind: 'upgradeDiscount'; amount: number }
  | { kind: 'mageBurn'; amount: number }
  | { kind: 'control'; slowBonus: number; rootBonus: number }
  | { kind: 'lastStand'; damageBonus: number; rows: number }
  | { kind: 'enemySlow'; amount: number }
  | { kind: 'giantHealth'; amount: number }
  | { kind: 'enemyHealing'; amount: number }
  | { kind: 'doubleShot' }
  | { kind: 'twoBells'; amount: number }
  | { kind: 'iceAndFire' }
  | { kind: 'iceNeedles' }

export type RewardId =
  | 'war-chest'
  | 'field-medic'
  | 'sharpened-steel'
  | 'rapid-orders'
  | 'bounty'
  | 'royal-tax'
  | 'military-engineer'
  | 'wildfire'
  | 'control-master'
  | 'last-stand'
  | 'rasputitsa'
  | 'giant-diet'
  | 'empty-vials'
  | 'double-shot'
  | 'two-bells'
  | 'ice-and-fire'
  | 'buyback'
  | 'ice-needles'

export interface RewardPick {
  wave: number
  rewardId: RewardId
  /** Фактическая выплата мгновенного денежного благословения. */
  goldGranted?: number
}

export type PendingReward = {
  wave: number
  options: readonly RewardId[]
} & ({ kind: 'wave'; rerolls: number } | { kind: 'crown-gift' })

export interface RewardStats {
  damageMultiplier: number
  fireRateMultiplier: number
  killGoldBonus: number
  waveGoldMultiplier: number
  upgradeCostMultiplier: number
  mageBurnMultiplier: number
  frostSlowBonus: number
  trapperRootMultiplier: number
  lastStandDamageMultiplier: number
  lastStandRows: number
  enemySpeedMultiplier: number
  giantHealthMultiplier: number
  enemyHealingMultiplier: number
  doubleShotArrows: number
  secondBellShare: number
  iceAndFire: boolean
  iceNeedles: boolean
}

/** Как враг лечит соседей */
export interface EnemyHeal {
  /** Радиус лечения, клеток */
  radius: number
  /**
   * Сколько здоровья возвращает каждому соседу — в долях здоровья самого лечащего
   * (0.15 — 15% его здоровья). Так лечение растёт по волнам вместе со здоровьем
   */
  amount: number
  /** Пауза между лечениями, секунд */
  cooldown: number
}

/** На кого распадается враг, погибая */
export interface EnemySplit {
  /** id врага (EnemyDef) */
  enemyId: string
  /** Сколько их, штук */
  count: number
}

/** Группа врагов в волне: кто (id), сколько, пауза между ними (с), задержка начала (с) */
export type WaveGroup = readonly [enemyId: string, count: number, gap: number, delay: number]

/** Описание уровня (карты) */
/**
 * Что стоит на клетке-препятствии. Строить там нельзя; для игры все виды одинаковы —
 * вид нужен только картинке (apps/web/src/render/props.ts)
 */
export type PropKind =
  // античность
  | 'column'
  | 'fountain'
  | 'amphora'
  | 'pool'
  // тронный зал
  | 'brazier'
  | 'banner'
  | 'orb'
  | 'candelabrum'
  | 'weaponRack'
  // покои
  | 'vase'
  | 'birdcage'
  | 'globe'
  | 'lectern'
  | 'chessTable'
  | 'palm'
  | 'tree'
  | 'barrel'
  // Египет
  | 'papyrusColumn'
  | 'egyptObelisk'
  | 'sphinx'
  | 'anubis'
  | 'ankh'
  | 'lotusPool'

/** Препятствие на поле: вид и клетка [столбец, строка] */
export interface LevelProp {
  kind: PropKind
  cell: Point
}

export interface LevelDef {
  id: string
  name: string
  /**
   * Оформление зала (цвета пола и ковра) — только для картинки, игра его не читает.
   * Нет — обычный «тронный» вид
   */
  theme?: string
  /** Препятствия: колонны, статуи… На их клетках нельзя строить (как на blockedCells) */
  props?: readonly LevelProp[]
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
  /** Выбранная специализация; числовые характеристики остаются от последней обычной ступени. */
  aspectId: string | null
  /** Аспект уже участвовал в бою — отменить покупку больше нельзя. */
  aspectLocked: boolean
  /** Сколько секунд осталось до следующего выстрела */
  cooldownLeft: number
  /** Куда смотрит башня, радианы */
  aimAngle: number
  /** Кого выбирает целью */
  targetMode: TargetMode
  /**
   * Сколько золота вложено в башню между волнами, после начала последней волны (постройка,
   * улучшения, аспект). Башня с этим золотом ещё не была в бою — при продаже оно вернётся целиком
   */
  goldSinceLastWave: number
  /** Сколько золота реально заплачено за обычные улучшения с учётом скидок благословений */
  upgradeGoldPaid: number
  /** Сколько золота заплачено за выбранную специализацию с учётом скидки. */
  aspectGoldPaid?: number
  /** Текущая цель серии «Метки охотника», если аспект выбран */
  hunterTargetId: number | null
  /** Текущая длина серии «Метки охотника» */
  hunterStacks: number
  /** Сколько обычных атак Лучник сделал после последнего «Двойного выстрела». */
  shotsSinceDouble: number
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
  /** Сколько секунд до следующего лечения соседей (только у тех, кто лечит) */
  healCooldownLeft: number
  /** Сколько урона враг ещё получит от текущего горения. */
  burnDamageLeft: number
  /** За сколько секунд догорит весь запас огня */
  burnTimeLeft: number
  /** Сколько ещё секунд враг стоит в сети Ловчего */
  rootTimeLeft: number
  /**
   * Сколько секунд новая сеть его не возьмёт: считается с момента поимки и длится
   * дольше самой сети — вырвавшись, враг какое-то время рвёт сети сразу
   */
  rootImmunityLeft: number
  /**
   * Сколько держала бы текущая сеть целиком, с (с учётом устойчивости врага). Нужно, когда враг
   * загорается в сети: горящая сеть держит лишь долю этого времени (NET_ON_FIRE_SHARE)
   */
  rootDuration: number
  /** Сколько ещё секунд враг проклят Колдуном */
  curseTimeLeft: number
  /** Сила проклятия: 0.3 — получает на 30% больше урона и на 30% меньше лечения */
  curseAmount: number
  /** Сколько секунд броня снята «Расколом лат». Само описание врага не меняется. */
  armorBreakTimeLeft: number
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
  /** Обновлять точку при движении цели; иначе выстрел направлен в исходную точку. */
  tracksTarget: boolean
  /** Доля урона у края взрыва; 1 — одинаковый урон по всей площади. */
  splashEdgeDamageShare: number
  /** Скорость полёта, клеток в секунду */
  speed: number
  /** Урон за попадание, единиц здоровья */
  damage: number
  /** Вид урона: от него зависит, как действует броня */
  damageKind: DamageKind
  /** Радиус взрыва, клеток; 0 — бьёт только цель */
  splashRadius: number
  /** Сколько урона добавит горением каждому, кого задел; 0 — не поджигает */
  burnDamage: number
  /** За сколько секунд догорает поджог, секунд */
  burnDuration: number
  /** Сеть: сколько секунд держит всех, кого накрыла; 0 — снаряд не сеть */
  rootDuration: number
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
  /** Бонус по исполинам сохраняется в болте при выстреле и проверяется для каждого попадания. */
  giantDamageBonus: number
  /** На сколько секунд попадание снимает броню; 0 — обычный болт. */
  armorBreakDuration: number
  /** При первом попадании по врагу под морозом можно выпустить иглы. */
  iceNeedles: boolean
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
 * build — между волнами, wave — идёт волна, reward — выбор благословения,
 * lost — трон пал, won — все волны отбиты.
 */
export type Phase = 'idle' | 'build' | 'wave' | 'reward' | 'lost' | 'won'

/** Один ещё не вышедший враг в очереди волны */
export interface SpawnEntry {
  /** На какой секунде волны враг выходит */
  spawnTime: number
  /** Какой это враг (id из EnemyDef) */
  enemyId: string
}

/** Враг, который появится в конце шага на месте погибшего (на кого распался Горыныч) */
export interface SplitSpawn {
  enemyId: string
  /** С какого места ковра он пойдёт, клеток от двери */
  pathDistance: number
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
  /** Полный запас жизней трона для лечения между волнами */
  maxLives: number
  /** Последняя волна, на которой трон получил урон. Ноль до первого прорыва. */
  lastThroneDamageWave: number
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
  /** Кто появится в конце шага на месте погибших (см. EnemyDef.splitInto) */
  splitQueue: SplitSpawn[]
  /** Сколько секунд идёт текущая волна */
  waveTime: number
  /** Номер для следующей башни или врага */
  nextId: number
  /** Случайное число для розыгрыша благословений в этой партии */
  rewardSeed: number
  /** Карточки, ожидающие выбора после рубежной волны или сбора набора */
  pendingReward: PendingReward | null
  /** Уже выбранные благословения в порядке получения */
  selectedRewards: RewardPick[]
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
  /** Игроку предложены карточки благословений */
  rewardOffered: PendingReward
  /** Трон получил урон в отрезке, за который полагалось благословение. */
  rewardMissed: { firstWave: number; lastWave: number }
  rewardChosen: RewardPick
  /** Казна принесла золото за отбитую волну */
  income: { tower: Tower; gold: number }
  fire: { tower: Tower; stats: TowerStats }
  hit: Enemy
  kill: Enemy
  /** Взрыв снаряда по площади. look — вид снаряда: огненный шар горит, ядро поднимает пыль */
  splash: { x: number; y: number; radius: number; look: string }
  /** Волна холода потушила горящего врага: огонь погас, остаток огня пропал */
  steam: { x: number; y: number }
  /** Огонь растопил лёд: замедление с врага снято */
  thaw: Enemy
  /** Сеть на враге сгорела: горящая сеть продержалась свою долю времени (NET_ON_FIRE_SHARE) */
  netBurn: Enemy
  /** Знахарь лечит соседей */
  heal: { x: number; y: number; radius: number }
  /** Сеть Ловчего упала: всех в радиусе — в сеть (кого взяла — видно по rootTimeLeft) */
  net: { x: number; y: number; radius: number }
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
