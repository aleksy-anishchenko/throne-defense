import { BOILING_OIL } from '../data/balance.ts'
import type { Burn, Enemy, MageAspectId } from '../types.ts'

export function burnTimeRemaining(enemy: Enemy): number {
  return Math.max(enemy.burnTimeLeft, enemy.oilBurn?.burnTimeLeft ?? 0)
}

/** Совместимы только поджоги двух разных специализаций. */
function competesWithMainBurn(enemy: Enemy, aspect: string | null | undefined): boolean {
  return aspect !== 'boiling-oil' || !enemy.wildfire
}

export function hasCompetingBurn(enemy: Enemy, aspect: string | null): boolean {
  return (
    (enemy.burnTimeLeft > 0 && competesWithMainBurn(enemy, aspect)) ||
    (enemy.oilBurn !== undefined && aspect !== 'wildfire')
  )
}

function isStronger(burn: Burn | undefined, damagePerSecond: number): boolean {
  // Малый допуск сохраняет обновление равного огня после округления на шагах симуляции.
  return (
    !!burn &&
    burn.burnTimeLeft > 0 &&
    burn.burnDamageLeft / burn.burnTimeLeft > damagePerSecond + 1e-9
  )
}

export function applyBurn(
  enemy: Enemy,
  aspect: MageAspectId | undefined,
  damage: number,
  duration: number,
): void {
  const rate = damage / duration
  if (competesWithMainBurn(enemy, aspect) && isStronger(enemy, rate)) return
  if (aspect !== 'wildfire' && isStronger(enemy.oilBurn, rate)) return

  if (aspect === 'boiling-oil') {
    enemy.oilBurn = { burnDamageLeft: damage, burnTimeLeft: duration }
    if (!enemy.wildfire) {
      enemy.burnDamageLeft = 0
      enemy.burnTimeLeft = 0
    }
  } else {
    enemy.wildfire = aspect === 'wildfire'
    if (!enemy.wildfire) enemy.oilBurn = undefined
    enemy.burnDamageLeft = damage
    enemy.burnTimeLeft = duration
  }
}

function burnDamageDuring(burn: Burn, seconds: number, oilTime: number): number {
  if (burn.burnTimeLeft <= 0) return 0
  const burning = Math.min(seconds, burn.burnTimeLeft)
  const oiled = Math.min(burning, oilTime)
  return (burn.burnDamageLeft / burn.burnTimeLeft) * (burning + oiled * BOILING_OIL.burnBonus)
}

/** Сумма урона уже наложенных поджогов за указанное время с учётом текущего покрытия маслом. */
export function pendingBurnDamage(enemy: Enemy, seconds = Infinity): number {
  const main = burnDamageDuring(enemy, seconds, enemy.oilTimeLeft)
  return main + (enemy.oilBurn ? burnDamageDuring(enemy.oilBurn, seconds, enemy.oilTimeLeft) : 0)
}

function advanceBurn(burn: Burn, dt: number): void {
  if (dt >= burn.burnTimeLeft) {
    burn.burnTimeLeft = 0
    burn.burnDamageLeft = 0
    return
  }
  burn.burnDamageLeft -= burn.burnDamageLeft * (dt / burn.burnTimeLeft)
  burn.burnTimeLeft -= dt
}

/** Один шаг горения и покрытия маслом, общий для боя и прогноза на полосе здоровья. */
export function advanceBurning(enemy: Enemy, dt: number): number {
  const damage = pendingBurnDamage(enemy, dt)
  enemy.oilTimeLeft = Math.max(0, enemy.oilTimeLeft - dt)
  if (enemy.burnTimeLeft > 0) {
    advanceBurn(enemy, dt)
    if (enemy.burnTimeLeft === 0) enemy.wildfire = false
  }
  if (enemy.oilBurn) {
    advanceBurn(enemy.oilBurn, dt)
    if (enemy.oilBurn.burnTimeLeft === 0) enemy.oilBurn = undefined
  }
  return damage
}
