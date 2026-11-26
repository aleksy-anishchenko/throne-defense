import type { Path } from '../core/path.ts'
import { SIMULATION_STEP } from '../data/balance.ts'
import type { Enemy, OilPuddle, RewardStats } from '../types.ts'
import { advanceBurning, burnTimeRemaining, pendingBurnDamage } from './burning.ts'
import { coatFromPuddle, withinOilReach } from './combat.ts'
import { enemySpeedShare, enemyStepDistance } from './enemies.ts'

/** Сколько снимет уже наложенный огонь до его конца или прорыва к трону, без новых атак. */
export function forecastBurnDamage(
  enemy: Enemy,
  path: Path,
  puddles: readonly OilPuddle[],
  rewards: Pick<RewardStats, 'damageMultiplier' | 'enemySpeedMultiplier'>,
): number {
  const duration = burnTimeRemaining(enemy)
  if (enemy.isDead || duration <= 0) return 0
  const speed = enemy.def.speed * enemySpeedShare(rewards.enemySpeedMultiplier)
  const dt = SIMULATION_STEP
  const canReachThrone = enemy.pathDistance + speed * (duration + dt) >= path.length
  const nearby = puddles.filter((puddle) =>
    withinOilReach(enemy, puddle, speed * Math.min(puddle.timeLeft, duration)),
  )
  const lastPuddleEnd = nearby.reduce((end, puddle) => Math.max(end, puddle.timeLeft), 0)
  const projected = { ...enemy, oilBurn: enemy.oilBurn && { ...enemy.oilBurn } }
  let damage = 0
  for (let elapsed = 0; elapsed < duration; elapsed += dt) {
    const left = duration - elapsed
    const curseIsStable = projected.curseTimeLeft <= 0 || projected.curseTimeLeft > left + dt
    if (
      !canReachThrone &&
      curseIsStable &&
      (elapsed >= lastPuddleEnd || projected.oilTimeLeft >= left)
    ) {
      const curse = projected.curseTimeLeft > 0 ? 1 + projected.curseAmount : 1
      damage += pendingBurnDamage(projected, left) * curse
      break
    }

    // Тот же порядок, что в бою: контакт с лужей, движение и окончание контроля, затем урон.
    for (const puddle of nearby) {
      coatFromPuddle(projected, puddle, Math.min(dt, puddle.timeLeft - elapsed))
    }
    projected.pathDistance += enemyStepDistance(projected, dt, rewards.enemySpeedMultiplier)
    if (projected.pathDistance >= path.length) break
    const [x, y] = path.positionAt(projected.pathDistance)
    projected.x = x
    projected.y = y
    projected.rootTimeLeft -= dt
    projected.slowTimeLeft -= dt
    projected.curseTimeLeft -= dt
    const curse = projected.curseTimeLeft > 0 ? 1 + projected.curseAmount : 1
    damage += advanceBurning(projected, dt) * curse
  }
  return damage * rewards.damageMultiplier
}
