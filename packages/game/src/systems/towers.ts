// Стража: выбор цели и выстрел. Сами башни — в data/towers.ts.

import { REFUND_RATE } from '../data/balance.ts'
import type { Enemy, StatKey, TargetMode, Tower, TowerDef, TowerStats, World } from '../types.ts'
import { effectiveTowerStats, rewardStats } from './rewards.ts'

export const towerStats = (tower: Tower): TowerStats => tower.def.tiers[tower.tier]

/** Данные выбранной специализации или null, если башня ещё без аспекта. */
export const towerAspect = (tower: Tower) =>
  tower.def.aspects?.find((aspect) => aspect.id === tower.aspectId) ?? null

/** Снижение лечения — второе действие той же силы проклятия, отдельного числа в балансе нет. */
export const displayStatValue = (stats: TowerStats, key: StatKey): number | undefined =>
  key === 'healingReduction' ? stats.curseAmount : stats[key]

/** Все способы выбрать цель, в том порядке, в каком их перебирает кнопка в панели башни */
export const TARGET_MODES: readonly TargetMode[] = ['first', 'strongest']

/** Цена следующего улучшения или null, если ступень максимальная */
export function upgradeCost(tower: Tower, discountMultiplier = 1): number | null {
  if (tower.tier >= tower.def.tiers.length - 1) return null
  return Math.max(1, Math.round(tower.def.upgradeCosts[tower.tier] * discountMultiplier))
}

/** Сколько вложено в башню: постройка, все обычные улучшения и выбранный аспект. */
export function investedGold(def: TowerDef, tier: number, aspectId: string | null = null): number {
  let sum = def.cost
  for (let i = 0; i < tier; i++) sum += def.upgradeCosts[i]
  return sum + (def.aspects?.find((aspect) => aspect.id === aspectId)?.cost ?? 0)
}

/** Сколько золота реально вложено в конкретную башню с учётом скидки на улучшения. */
export function towerInvestedGold(tower: Tower): number {
  const aspect = tower.def.aspects?.find((candidate) => candidate.id === tower.aspectId)
  return tower.def.cost + tower.upgradeGoldPaid + (aspect?.cost ?? 0)
}

/**
 * Сколько вернут при продаже: золото, вложенное после начала последней волны, — целиком
 * (башня с ним ещё не была в бою — это «отмена»), остальное — с потерей (REFUND_RATE)
 */
export function refundFor(tower: Tower): number {
  const usedGold = towerInvestedGold(tower) - tower.goldSinceLastWave
  return Math.floor(usedGold * REFUND_RATE) + tower.goldSinceLastWave
}

/** Вернёт ли продажа всё вложенное: башню ещё ни разу не пускали в бой */
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

/**
 * Сильнейший Звонарь в радиусе. Несколько аур не складываются:
 * иначе пять колоколов вокруг одной баллисты превратили бы её в пулемёт.
 */
function strongestBellFor(tower: FireRateReceiver, bells: readonly Tower[]): Tower | null {
  let source: Tower | null = null
  let bonus = 0
  for (const bell of bells) {
    const stats = towerStats(bell)
    const isInRange = (bell.x - tower.x) ** 2 + (bell.y - tower.y) ** 2 <= stats.range ** 2
    const candidateBonus = stats.fireRateBonus ?? 0
    // При равном бонусе один устойчивый источник для картинки, а не две «суммирующиеся» связи.
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

function fireRateBonusFor(tower: FireRateReceiver, bells: readonly Tower[]): number {
  const source = strongestBellFor(tower, bells)
  return source ? (towerStats(source).fireRateBonus ?? 0) : 0
}

/** Звонари среди башен: у кого есть бонус к скорострельности соседей */
const bellsAmong = (towers: readonly Tower[]) =>
  towers.filter((tower) => (towerStats(tower).fireRateBonus ?? 0) > 0)

/** Звонарь, дающий фактический бонус. При равной силе для отображения выбирается первый по id. */
export function fireRateSourceOf(towers: readonly Tower[], tower: FireRateReceiver): Tower | null {
  return tower.def.takesFireRateBonus ? strongestBellFor(tower, bellsAmong(towers)) : null
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
export function fireRateBonusOf(towers: readonly Tower[], tower: FireRateReceiver): number {
  return tower.def.takesFireRateBonus ? fireRateBonusFor(tower, bellsAmong(towers)) : 0
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

    const bonus = tower.def.takesFireRateBonus ? fireRateBonusFor(tower, bells) : 0
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

/** Казны на соседних клетках, включая диагонали; сама башня не сосед. */
export function treasuryNeighbors(
  towers: readonly Tower[],
  tower: Pick<Tower, 'def' | 'col' | 'row'>,
): Tower[] {
  if (tower.def.id !== 'treasury') return []
  return towers.filter(
    (other) =>
      other !== tower &&
      other.def.id === 'treasury' &&
      Math.abs(other.col - tower.col) <= 1 &&
      Math.abs(other.row - tower.row) <= 1,
  )
}

/** Бонус за Казны рядом: по 10%, максимум 30%. */
export function treasuryBonusOf(
  towers: readonly Tower[],
  tower: Pick<Tower, 'def' | 'col' | 'row'>,
): number {
  return Math.min(3, treasuryNeighbors(towers, tower).length) * 0.1
}

/** Фактический доход за волну, округлённый вниз до целой монеты. */
export function treasuryIncomeOf(towers: readonly Tower[], tower: Tower): number {
  const base = towerStats(tower).goldPerWave ?? 0
  const count = Math.min(3, treasuryNeighbors(towers, tower).length)
  return Math.floor((base * (10 + count)) / 10)
}

/** Казна: выплата каждой башни учитывает её собственных соседей. */
export function payTowerIncome(world: World): void {
  for (const tower of world.state.towers) {
    const gold = treasuryIncomeOf(world.state.towers, tower)
    if (gold <= 0) continue
    world.state.gold += gold
    world.emit('income', { tower, gold })
  }
}
