// Что показать про выбранную башню: название, характеристики, цены «Улучшить» и «Продать».
// Общее для панели башни на компьютере (TowerInfo) и меню башни на телефоне (TowerSheet).

import {
  doubleShotDescription,
  ICE_NEEDLES,
  TOWERS,
  discountedUpgradePrice,
  type TargetMode,
} from '@throne/game'
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import { formatPercent, plural, toRoman } from '@/utils/format'
import { towerDescription } from '@/utils/towerStats'
import { statSources, towerStatRows } from '@/utils/towerStatRows'

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
  const sources = computed(() => statSources(store.receivedBlessings, store.blessingSetCounts))

  return computed(() => {
    const towerId = selection.selected.towerId
    const cell = selection.selectedTowerCell
    if (!towerId || !cell) return null
    const def = TOWERS[towerId]
    const tier = selection.selected.tier
    const aspect = def.aspects?.find((candidate) => candidate.id === selection.selected.aspectId)
    const hasAspects = tier === def.tiers.length - 1 && Boolean(def.aspects?.length)
    const upgradeCost = selection.selected.upgradeCost
    const effects = store.blessingEffects
    const stats = towerStatRows(def, tier, cell.row, effects, selection.selected, sources.value)
    const lines: string[] = []
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
      const { treasuryNeighbors, treasuryBonus } = selection.selected
      lines.push(`Соседние Казны: ${treasuryNeighbors}, бонус +${Math.round(treasuryBonus * 100)}%`)
    }
    if (aspect?.hunterMark) {
      const stacks = selection.selected.hunterStacks
      lines.push(
        `Серия по одной цели — ${stacks}/${aspect.hunterMark.maxStacks} (+${formatPercent(stacks * aspect.hunterMark.damagePerStack)} к урону)`,
      )
    }
    if (towerId === 'archer' && effects.doubleShotArrows) {
      lines.push(`Двойной выстрел. ${doubleShotDescription(effects.doubleShotArrows)}.`)
    }
    if (towerId === 'ballista' && effects.iceNeedles) {
      lines.push(
        `Ледяные иглы — при попадании по замедленной цели до ${ICE_NEEDLES.targets} игл по ${formatPercent(ICE_NEEDLES.damageShare)} урона болта`,
      )
    }
    return {
      title: `${def.name} ${toRoman(tier + (aspect ? 1 : 0))}`,
      description: towerDescription(def, effects),
      stats,
      showUpgradeCaption: upgradeCost !== null && stats.some((stat) => stat.details.length),
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
      canSpecialize: store.hud.phase === 'build' || store.hud.phase === 'wave',
      canUndoSpecialization:
        Boolean(aspect) && !selection.selected.aspectLocked && store.hud.phase === 'build',
      upgradeCost,
      canAfford: upgradeCost !== null && store.hud.gold >= upgradeCost,
      refund: selection.selected.refund,
      // Башня ещё не была в бою — продажа возвращает всё, это «отмена» постройки
      sellLabel: selection.selected.isFullRefund ? 'Вернуть' : 'Продать',
      targetMode: def.canChooseTarget ? selection.selected.targetMode : null,
    }
  })
}
