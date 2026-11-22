// Стража: выбор цели и выстрел. Сами башни — в data/towers.ts.

import { REFUND_RATE } from '../data/balance.ts'
import { REWARDS } from '../data/rewards.ts'
import type {
  Enemy,
  GameState,
  StatKey,
  TargetMode,
  Tower,
  TowerDef,
  TowerStats,
  World,
} from '../types.ts'
import { effectiveTowerStats, rewardStats } from './rewards.ts'

export const towerStats = (tower: Pick<Tower, 'def' | 'tier'>): TowerStats =>
  tower.def.tiers[tower.tier]

/** Данные выбранной специализации или null, если башня ещё без аспекта. */
export const towerAspect = (tower: Tower) =>
  tower.def.aspects?.find((aspect) => aspect.id === tower.aspectId) ?? null

/** Снижение лечения — второе действие той же силы проклятия, отдельного числа в балансе нет. */
export const displayStatValue = (stats: TowerStats, key: StatKey): number | undefined =>
  key === 'healingReduction' ? stats.curseAmount : stats[key]

/** Все способы выбрать цель, в том порядке, в каком их перебирает кнопка в панели башни */
export const TARGET_MODES: readonly TargetMode[] = ['first', 'strongest']

/** Округлить цену ступени или специализации после скидки. */
export function discountedUpgradePrice(price: number, discountMultiplier: number): number {
  return Math.max(1, Math.round(price * discountMultiplier))
}

/** Цена следующего улучшения или null, если ступень максимальная */
export function upgradeCost(tower: Tower, discountMultiplier = 1): number | null {
  if (tower.tier >= tower.def.tiers.length - 1) return null
  return discountedUpgradePrice(tower.def.upgradeCosts[tower.tier], discountMultiplier)
}

/** Сколько вложено в башню: постройка, все обычные улучшения и выбранный аспект. */
export function investedGold(def: TowerDef, tier: number, aspectId: string | null = null): number {
  let sum = def.cost
  for (let i = 0; i < tier; i++) sum += def.upgradeCosts[i]
  return sum + (def.aspects?.find((aspect) => aspect.id === aspectId)?.cost ?? 0)
}

/** Сколько золота реально вложено в конкретную башню с учётом скидки на улучшения. */
export function towerInvestedGold(tower: Tower): number {
  return tower.def.cost + tower.upgradeGoldPaid + paidAspectCost(tower)
}

/** В старых данных специализация всегда покупалась за полную цену. */
export const paidAspectCost = (tower: Tower): number =>
  tower.aspectGoldPaid ?? towerAspect(tower)?.cost ?? 0

/**
 * «Выкуп» между волнами возвращает всё. При обычной продаже свежие вложения
 * возвращаются целиком, а уже участвовавшие в бою — по базовой ставке.
 */
export function refundFor(
  tower: Tower,
  state?: Pick<GameState, 'phase' | 'selectedRewards'>,
): number {
  const invested = towerInvestedGold(tower)
  if (
    state?.phase === 'build' &&
    state.selectedRewards.some(({ rewardId }) => REWARDS[rewardId]?.effect.kind === 'buyback')
  ) {
    return invested
  }
  const usedGold = invested - tower.goldSinceLastWave
  return Math.floor(usedGold * REFUND_RATE) + tower.goldSinceLastWave
}

/** Можно ли подписать продажу как отмену постройки: башня ещё не участвовала в бою. */
export const isFullRefund = (tower: Tower): boolean =>
  tower.goldSinceLastWave === towerInvestedGold(tower)

/** Квадрат расстояния от башни до врага, клеток² */
const distanceSquared = (tower: Tower, enemy: Enemy) =>
  (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2

/**
 * Лучше ли враг candidate, чем best, как цель для режима mode.
 * «Сильный» — по ПОЛНОМУ здоровью (maxHp), а не по текущему: иначе баллиста в толпе
 * бунтовщиков стреляла бы по свежему в хвосте, а не по раненому у трона.
 * Так она выбирает самого крупного врага (огр, Горыныч, узурпатор), а среди равных — первого
 */
function isBetterTarget(mode: TargetMode, candidate: Enemy, best: Enemy): boolean {
  if (mode === 'strongest' && candidate.maxHp !== best.maxHp) return candidate.maxHp > best.maxHp
  return candidate.pathDistance > best.pathDistance
}

/** Цель башни: враг в радиусе, лучший для её режима (tower.targetMode). Нет цели — null */
function findTarget(world: World, tower: Tower, stats: TowerStats): Enemy | null {
  const rangeSquared = stats.range * stats.range
  let best: Enemy | null = null
  for (const enemy of world.state.enemies) {
    if (enemy.isDead || distanceSquared(tower, enemy) > rangeSquared) continue
    if (best && tower.def.preferUnburning) {
      const candidateBurns = enemy.burnTimeLeft > 0
      const bestBurns = best.burnTimeLeft > 0
      if (candidateBurns !== bestBurns) {
        if (!candidateBurns) best = enemy
        continue
      }
    }
    if (!best || isBetterTarget(tower.targetMode, enemy, best)) best = enemy
  }
  return best
}

/** Достаточно описания и позиции: предпросмотр ещё не построенной башни не создаёт сущность игры. */
type FireRateReceiver = Pick<Tower, 'def' | 'x' | 'y'>
type BellSource = FireRateReceiver & Pick<Tower, 'id' | 'tier'>

/** Сильнейший Звонарь в радиусе. При равной силе первым берём источник с меньшим id. */
function strongestBellFor<Source extends BellSource>(
  tower: FireRateReceiver,
  bells: readonly Source[],
  excluded?: Source,
): Source | null {
  let source: Source | null = null
  let bonus = 0
  for (const bell of bells) {
    if (bell === excluded) continue
    const stats = towerStats(bell)
    const isInRange = (bell.x - tower.x) ** 2 + (bell.y - tower.y) ** 2 <= stats.range ** 2
    const candidateBonus = stats.fireRateBonus ?? 0
    if (
      isInRange &&
      candidateBonus > 0 &&
      (candidateBonus > bonus || (candidateBonus === bonus && source && bell.id < source.id))
    ) {
      source = bell
      bonus = candidateBonus
    }
  }
  return source
}

function bellContributionsFor<Source extends BellSource>(
  tower: FireRateReceiver,
  bells: readonly Source[],
  secondBellShare: number,
) {
  if (!tower.def.takesFireRateBonus) return []
  const source = strongestBellFor(tower, bells)
  if (!source) return []
  const contributions = [{ source, bonus: towerStats(source).fireRateBonus ?? 0 }]
  const second = secondBellShare > 0 ? strongestBellFor(tower, bells, source) : null
  if (second) {
    contributions.push({
      source: second,
      bonus: (towerStats(second).fireRateBonus ?? 0) * secondBellShare,
    })
  }
  return contributions
}

function fireRateBonusFor(
  tower: FireRateReceiver,
  bells: readonly BellSource[],
  secondBellShare: number,
): number {
  return bellContributionsFor(tower, bells, secondBellShare).reduce(
    (sum, { bonus }) => sum + bonus,
    0,
  )
}

/** Звонари среди башен: у кого есть бонус к скорострельности соседей */
const bellsAmong = <Source extends BellSource>(towers: readonly Source[]) =>
  towers.filter((tower) => (towerStats(tower).fireRateBonus ?? 0) > 0)

/** Основной источник. При равной силе выбирается первый по id. */
export function fireRateSourceOf(towers: readonly Tower[], tower: FireRateReceiver): Tower | null {
  return tower.def.takesFireRateBonus ? strongestBellFor(tower, bellsAmong(towers)) : null
}

/** Источники и их доли ускорения. С «Двумя колоколами» учитывается и второй Звонарь. */
export function fireRateContributionsOf<Source extends BellSource>(
  towers: readonly Source[],
  tower: FireRateReceiver,
  secondBellShare = 0,
) {
  return bellContributionsFor(tower, bellsAmong(towers), secondBellShare)
}

/** Подходящие получатели в радиусе — в том числе те, кого уже ускоряет другой Звонарь. */
export function bellCoverage(
  towers: readonly Tower[],
  bell: Pick<Tower, 'def' | 'tier' | 'x' | 'y'>,
): Tower[] {
  const stats = bell.def.tiers[bell.tier]
  if (!(stats.fireRateBonus ?? 0)) return []
  return towers.filter(
    (tower) =>
      tower.def.takesFireRateBonus &&
      (tower.x - bell.x) ** 2 + (tower.y - bell.y) ** 2 <= stats.range ** 2,
  )
}

/**
 * Насколько Звонари рядом ускоряют башню: 0.2 — стреляет на 20% быстрее, 0 — не ускорена
 * (нет Звонаря рядом или её Звонарь не ускоряет). Для интерфейса и отрисовки
 */
export function fireRateBonusOf(
  towers: readonly BellSource[],
  tower: FireRateReceiver,
  secondBellShare = 0,
): number {
  return tower.def.takesFireRateBonus
    ? fireRateBonusFor(tower, bellsAmong(towers), secondBellShare)
    : 0
}

/** Каждая башня, у которой прошла перезарядка, стреляет в свою цель (см. findTarget) */
export function updateTowers(world: World, dt: number): void {
  const towers = world.state.towers
  const bells = bellsAmong(towers)
  const rewards = rewardStats(world.state)

  for (const tower of towers) {
    // Звонарь и Казна не стреляют
    const fire = tower.def.fire
    if (!fire) continue

    const bonus = fireRateBonusFor(tower, bells, rewards.secondBellShare)
    tower.cooldownLeft -= dt * (1 + bonus) * rewards.fireRateMultiplier
    if (tower.cooldownLeft > 0) continue

    const stats = effectiveTowerStats(world.state, tower, towerStats(tower))
    const target = findTarget(world, tower, stats)
    if (!target) {
      // Целей нет: башня готова и ждёт. Обнуляем остаток перезарядки, чтобы он не уходил
      // всё глубже в минус, пока никого нет; выстрелит она, как только появится враг в радиусе
      tower.cooldownLeft = 0
      continue
    }

    tower.cooldownLeft = stats.cooldown
    tower.aimAngle = Math.atan2(target.y - tower.y, target.x - tower.x)
    fire(world, tower, target, stats)
    world.emit('fire', { tower, stats })
  }
}
