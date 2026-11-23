// Что показать про выбранную башню: название, характеристики, цены «Улучшить» и «Продать».
// Общее для панели башни на компьютере (TowerInfo) и меню башни на телефоне (TowerSheet).

import { TOWERS, discountedUpgradePrice, type TargetMode } from '@throne/game'
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import { plural, toRoman } from '@/utils/format'
import { formatStatLine, towerInteractionHint } from '@/utils/towerStats'

/** Как называть, кого башня выбирает целью */
export const TARGET_MODE_LABELS: Record<TargetMode, string> = {
  first: 'первый',
  strongest: 'сильный',
}

/** Подсказка для скринридера и всплывающая подсказка мыши: что значит каждый режим */
export const TARGET_MODE_HINTS: Record<TargetMode, string> = {
  first: 'бьёт того, кто ближе всех к трону',
  strongest: 'бьёт самого крупного: огров, Горыныча, узурпатора',
}

export function useSelectedTowerInfo() {
  const store = useGameStore()
  const selection = useSelectionStore()

  return computed(() => {
    const towerId = selection.selected.towerId
    if (!towerId) return null
    const def = TOWERS[towerId]
    const tier = selection.selected.tier
    const aspect = def.aspects?.find((candidate) => candidate.id === selection.selected.aspectId)
    const hasAspects = tier === def.tiers.length - 1 && Boolean(def.aspects?.length)
    const nextStats = def.tiers[tier + 1]
    const upgradeCost = selection.selected.upgradeCost
    const lines = def.displayStats.map((statKey) =>
      formatStatLine(statKey, def.tiers[tier], nextStats),
    )
    // Звонарь рядом — видно, что башня стреляет быстрее и насколько
    const bonus = selection.selected.fireRateBonus
    if (bonus > 0) {
      const label = selection.selected.fireRateSources > 1 ? 'Звонари' : 'Звонарь'
      lines.push(`${label}: стреляет на ${Math.round(bonus * 100)}% чаще`)
    }
    if (towerId === 'bell') {
      const count = selection.selected.bellBoostedTowers
      const covered = selection.selected.bellCoveredTowers
      const names = selection.selected.bellTargetNames
      lines.push(
        `Ускоряет ${count} ${plural(count, ['башню', 'башни', 'башен'])}${names ? ` · ${names}` : ''}`,
      )
      if (covered === 0) lines.push('Нет подходящих башен в радиусе')
      else if (covered > count)
        lines.push(`Другой Звонарь даёт не меньший бонус: ${covered - count}`)
    }
    if (towerId === 'treasury') {
      const { treasuryNeighbors, treasuryBonus, treasuryIncome } = selection.selected
      lines.push(`Соседние Казны: ${treasuryNeighbors}, бонус +${Math.round(treasuryBonus * 100)}%`)
      lines.push(`Итого за волну: ${treasuryIncome}`)
    }
    if (selection.selected.aspectId === 'hunter-mark') {
      lines.push(`серия ${selection.selected.hunterStacks}/${selection.selected.hunterMaxStacks}`)
    }
    return {
      title: `${def.name} ${toRoman(tier + (aspect ? 1 : 0))}`,
      description: def.description,
      lines,
      hasAspects,
      aspect,
      aspectGoldPaid: selection.selected.aspectGoldPaid,
      aspects: (hasAspects ? (def.aspects ?? []) : []).map((candidate) => {
        const cost = discountedUpgradePrice(
          candidate.cost,
          selection.selected.upgradeCostMultiplier,
        )
        return { ...candidate, cost, canAfford: store.hud.gold >= cost }
      }),
      canSpecialize: store.hud.phase === 'build',
      canUndoSpecialization:
        Boolean(aspect) && !selection.selected.aspectLocked && store.hud.phase === 'build',
      interactionHint: towerInteractionHint(def, store.blessingEffects),
      upgradeCost,
      canAfford: upgradeCost !== null && store.hud.gold >= upgradeCost,
      refund: selection.selected.refund,
      // Башня ещё не была в бою — продажа возвращает всё, это «отмена» постройки
      sellLabel: selection.selected.isFullRefund ? 'Вернуть' : 'Продать',
      targetMode: def.canChooseTarget ? selection.selected.targetMode : null,
    }
  })
}
