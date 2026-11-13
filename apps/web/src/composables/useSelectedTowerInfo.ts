// Что показать про выбранную башню: название, характеристики, цены «Улучшить» и «Продать».
// Общее для панели башни на компьютере (TowerInfo) и меню башни на телефоне (TowerSheet).

import { TOWERS, type TargetMode } from '@throne/game'
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSelectionStore } from '@/stores/selection'
import { toRoman } from '@/utils/format'
import { formatStatLine } from '@/utils/towerStats'

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
    const nextStats = def.tiers[tier + 1]
    const upgradeCost = nextStats ? def.upgradeCosts[tier] : null
    const lines = def.displayStats.map((statKey) =>
      formatStatLine(statKey, def.tiers[tier], nextStats),
    )
    // Звонарь рядом — видно, что башня стреляет быстрее и насколько
    const bonus = selection.selected.fireRateBonus
    if (bonus > 0) lines.push(`Звонарь: стреляет на ${Math.round(bonus * 100)}% чаще`)
    return {
      title: `${def.name} ${toRoman(tier)}`,
      lines,
      upgradeCost,
      canAfford: upgradeCost !== null && store.hud.gold >= upgradeCost,
      refund: selection.selected.refund,
      // Башня ещё не была в бою — продажа возвращает всё, это «отмена» постройки
      sellLabel: selection.selected.isFullRefund ? 'Вернуть' : 'Продать',
      targetMode: def.canChooseTarget ? selection.selected.targetMode : null,
    }
  })
}
