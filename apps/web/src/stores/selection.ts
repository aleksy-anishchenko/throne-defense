// Выбор игрока: какой страж «в руке», какая башня выбрана на поле, где курсор.
//
// Это отдельный стор рядом с игровым (stores/game.ts). Как два composable в Vue: игровой стор
// знает про партию, золото и экраны, а этот — про то, что игрок сейчас держит и на что смотрит.
// Зависимость идёт в одну сторону: выбор знает про игру, игра про выбор — нет.
// Поэтому сброс выбора при новой партии и при начале волны сделан через watch (внизу файла).
//
// Мышью стража можно примерить наведением. На телефоне место выбирают касанием,
// а золото тратят отдельной кнопкой.

import {
  ENEMIES,
  TARGET_MODES,
  TOWERS,
  fireRateContributionsOf,
  bellCoverage,
  treasuryBonusOf,
  treasuryNeighbors,
  paidAspectCost,
  isFullRefund,
  refundFor,
  rewardStats,
  upgradeCost,
} from '@throne/game'
import type { TargetMode, Tower } from '@throne/game'
import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import type { BoardView, Cell } from '@/types'
import { SIDE_PANEL_QUERY } from '@/utils/layout'
import { formatPercent, plural } from '@/utils/format'
import { bellPlacementPreview, towerPlacementBellPreview } from '@/utils/bellSupport'
import { useGameStore } from './game'

const isSameCell = (cell: Cell | null, col: number, row: number) =>
  cell !== null && cell.col === col && cell.row === row

/**
 * Телефонная раскладка (нет боковой панели): действия с башней — во всплывающем меню.
 * matchMedia нет в тестах без браузера — там считаем, что панель есть
 */
const isPhoneLayout = () =>
  typeof matchMedia === 'function' && !matchMedia(SIDE_PANEL_QUERY).matches

export const useSelectionStore = defineStore('selection', () => {
  const gameStore = useGameStore()
  const game = gameStore.game

  /** Страж, выбранный в магазине («ставлю такого»): его id */
  const armedTowerId = ref<string | null>(null)
  /** Клетка выбранной поставленной башни */
  const selectedTowerCell = ref<Cell | null>(null)
  /** Клавиатурный курсор (стрелки) */
  const cursorCell = ref<Cell | null>(null)
  /** Клетка под мышью */
  const hoverCell = ref<Cell | null>(null)
  /** В этом режиме касания только выбирают место. До первого касания cell пуста. */
  const touchPlacement = ref<{ cell: Cell | null } | null>(null)
  const placementTower = computed(() =>
    touchPlacement.value && armedTowerId.value ? TOWERS[armedTowerId.value] : null,
  )
  const pendingPlacement = computed(() => {
    const cell = touchPlacement.value?.cell
    const tower = placementTower.value
    return cell && tower ? { cell, tower } : null
  })
  const placementCell = computed(() =>
    touchPlacement.value ? touchPlacement.value.cell : (hoverCell.value ?? cursorCell.value),
  )
  /**
   * Какое меню открыто поверх игры в мобильной раскладке.
   */
  const openMenu = ref<'shop' | 'tower' | 'rewards' | null>(null)
  const isShopOpen = computed(() => openMenu.value === 'shop')
  const isTowerMenuOpen = computed(() => openMenu.value === 'tower')
  const isRewardSheetOpen = computed(() => openMenu.value === 'rewards')

  /**
   * Сделает ли что-нибудь нажатие на клетку под мышью: выберет башню или построит стража.
   * От этого зависит курсор над полем (рука только там, где нажатие что-то делает).
   * Игра не реактивна, поэтому считается каждый кадр в sync, а не computed
   */
  const isBoardClickable = ref(false)

  /**
   * Снимок выбранной башни для интерфейса (как hud в игровом сторе): Vue не следит за самой
   * игрой, поэтому нужные числа копируем сюда каждый кадр (sync)
   */
  const selected = reactive({
    /** Тип выбранной башни (null — ничего не выбрано) */
    towerId: null as string | null,
    tier: 0,
    aspectId: null as string | null,
    aspectLocked: false,
    aspectGoldPaid: 0,
    /** Кого башня выбирает целью */
    targetMode: 'first' as TargetMode,
    /** Сколько вернут при продаже */
    refund: 0,
    /** Вернут ли всё вложенное: башня ещё не была в бою */
    isFullRefund: false,
    /** Суммарное ускорение Звонарей: 0.2 — на 20%. */
    fireRateBonus: 0,
    fireRateSources: 0,
    bellCoveredTowers: 0,
    bellBoostedTowers: 0,
    bellTargetNames: '',
    treasuryNeighbors: 0,
    treasuryBonus: 0,
    upgradeCost: null as number | null,
    upgradeCostMultiplier: 1,
    hunterStacks: 0,
  })

  /** Снимок предпросмотра: игра не реактивна, как и снимок выбранной башни выше. */
  const placementEffect = ref('')

  function describePlacement(cell: Cell | null, secondBellShare: number): string {
    const towerId = armedTowerId.value
    if (!towerId || !cell || !game.isCellFree(cell.col, cell.row)) return ''
    const towers = game.state.towers
    const { col, row } = cell
    if (towerId === 'bell') {
      const { covered, improved } = bellPlacementPreview(towers, col, row, secondBellShare)
      if (!covered.length) return 'В зоне нет стражей, которых можно ускорить.'
      if (!improved.length) return 'Все цели уже получают не меньший бонус.'
      if (improved.length === 1) {
        const { tower, bonus } = improved[0]
        return `${tower.def.name} будет стрелять на ${formatPercent(bonus)} чаще.`
      }
      const targets = improved.map(
        ({ tower, bonus }) => `${tower.def.name} +${formatPercent(bonus)}`,
      )
      return `Скорость стрельбы · ${targets.join(', ')}`
    }
    const def = TOWERS[towerId]
    if (towerId === 'treasury') {
      const bonus = treasuryBonusOf(towers, { def, col, row })
      return bonus
        ? `Соседние Казны дадут +${formatPercent(bonus)} к доходу этой Казны.`
        : `Рядом нет другой Казны. Доход за волну — ${def.tiers[0].goldPerWave} золота.`
    }
    const receiver = towerPlacementBellPreview(towers, towerId, col, row, secondBellShare)
    if (!receiver) {
      if (!touchPlacement.value || !towers.some((tower) => tower.def.id === 'bell')) return ''
      return def.takesFireRateBonus
        ? 'Эта плита вне зоны ускорения Звонаря.'
        : 'Звонарь не ускоряет этого стража.'
    }
    const sources = receiver.sources.length > 1 ? 'Звонарей' : 'Звонаря'
    return `${def.name} получит +${formatPercent(receiver.bonus)} к скорострельности от ${sources}.`
  }

  const selectedTower = (): Tower | undefined =>
    selectedTowerCell.value
      ? game.towerAt(selectedTowerCell.value.col, selectedTowerCell.value.row)
      : undefined

  /** Вызывается каждый кадр вместе с syncHud */
  function sync() {
    const tower = selectedTower()
    const { secondBellShare, upgradeCostMultiplier } = rewardStats(game.state)
    // Так задумано: если выбранной башни уже нет (её продали), выбор снимается сам,
    // и меню действий с ней закрывается
    if (selectedTowerCell.value && !tower) selectedTowerCell.value = null
    if (!tower && openMenu.value === 'tower') openMenu.value = null
    selected.towerId = tower ? tower.def.id : null
    selected.tier = tower ? tower.tier : 0
    selected.aspectId = tower ? tower.aspectId : null
    selected.aspectLocked = tower ? tower.aspectLocked : false
    selected.aspectGoldPaid = tower ? paidAspectCost(tower) : 0
    selected.targetMode = tower ? tower.targetMode : 'first'
    selected.refund = tower ? refundFor(tower, game.state) : 0
    selected.isFullRefund = tower ? isFullRefund(tower) : false
    const bellSupport = tower
      ? fireRateContributionsOf(game.state.towers, tower, secondBellShare)
      : []
    selected.fireRateBonus = bellSupport.reduce((sum, { bonus }) => sum + bonus, 0)
    selected.fireRateSources = bellSupport.length
    const bellTargets = tower?.def.id === 'bell' ? bellCoverage(game.state.towers, tower) : []
    selected.bellCoveredTowers = bellTargets.length
    const boosted = bellTargets.filter((target) =>
      fireRateContributionsOf(game.state.towers, target, secondBellShare).some(
        ({ source }) => source === tower,
      ),
    )
    selected.bellBoostedTowers = boosted.length
    selected.bellTargetNames = [...new Set(boosted.map((target) => target.def.name))].join(', ')
    selected.treasuryNeighbors = tower ? treasuryNeighbors(game.state.towers, tower).length : 0
    selected.treasuryBonus = tower ? treasuryBonusOf(game.state.towers, tower) : 0
    selected.upgradeCostMultiplier = upgradeCostMultiplier
    selected.upgradeCost = tower ? upgradeCost(tower, selected.upgradeCostMultiplier) : null
    selected.hunterStacks = tower?.hunterStacks ?? 0

    const hover = hoverCell.value
    const pending = touchPlacement.value?.cell
    if (pending && !game.isCellFree(pending.col, pending.row)) {
      touchPlacement.value = { cell: null }
    }
    placementEffect.value = describePlacement(placementCell.value, secondBellShare)
    isBoardClickable.value =
      hover !== null &&
      gameStore.isPlaying() &&
      game.isInsideField(hover.col, hover.row) &&
      (game.towerAt(hover.col, hover.row) !== undefined ||
        (armedTowerId.value !== null && game.isCellFree(hover.col, hover.row)))
  }

  /** Для рисования поля */
  const boardView = (): BoardView => ({
    armedTowerId: armedTowerId.value,
    selectedTowerCell: selectedTowerCell.value,
    placementCell: armedTowerId.value ? placementCell.value : null,
    isTouchPlacement: touchPlacement.value !== null,
    cursorCell: cursorCell.value,
  })

  function disarmTower() {
    armedTowerId.value = null
    touchPlacement.value = null
    placementEffect.value = ''
  }

  function clearSelection() {
    disarmTower()
    selectedTowerCell.value = null
    openMenu.value = null
  }

  // Новая партия — выбор прошлой не нужен
  watch(() => gameStore.runCount, clearSelection, { flush: 'sync' })
  // Полноэкранный диалог закрывает меню, открытое поверх поля.
  watch(
    () => gameStore.screen,
    (screen) => {
      if (screen !== null) closeMenu()
    },
  )
  // Страж «в руке» после начала волны — ловушка: в бою нажимаешь на поле, чтобы посмотреть,
  // а строишь. Панель уже выбранной башни оставляем — она ничего не строит
  watch(
    () => gameStore.hud.phase,
    (phase) => {
      if (phase === 'wave') disarmTower()
    },
    { flush: 'sync' },
  )

  // ---------------------------------------------------------------- Действия

  function openShop() {
    if (gameStore.isPlaying()) openMenu.value = 'shop'
  }

  function openRewards() {
    if (gameStore.screen === null && gameStore.isPlaying() && gameStore.rewards.selected.length) {
      openMenu.value = 'rewards'
    }
  }

  /**
   * Меню башни на телефоне. Открывается само при выборе башни: башню на телефоне выбирают,
   * чтобы с ней что-то сделать, отдельная кнопка «Действие» была лишним шагом
   */
  function openTowerMenu() {
    if (gameStore.isPlaying() && selectedTowerCell.value && isPhoneLayout()) {
      openMenu.value = 'tower'
    }
  }

  /**
   * Закрыть меню (крестик, нажатие мимо, Escape). Меню башни закрывается вместе с выбором:
   * на телефоне выбранная башня без меню ничего не даёт. Страж «в руке» остаётся
   */
  function closeMenu() {
    if (openMenu.value === 'tower') selectedTowerCell.value = null
    openMenu.value = null
  }

  /**
   * Сменилась раскладка (повернули телефон, растянули окно). Появилась боковая панель —
   * меню скрыты стилями, а «открыто» блокировало бы клавиши: закрываем, выбор оставляем
   * (башня теперь видна на панели). Пропала панель — выбранной башне нужно меню
   */
  function syncMenuWithLayout() {
    if (!isPhoneLayout()) openMenu.value = null
    else if (selectedTowerCell.value && openMenu.value === null) openTowerMenu()
    else if (armedTowerId.value && !touchPlacement.value) touchPlacement.value = { cell: null }
  }

  /**
   * Нажали на карточку стража в магазине: взять его «в руку» (ещё раз — убрать).
   * Не хватает золота — в руку не берём: отказ сразу, а не после нажатия на плиту
   */
  function chooseShopTower(towerId: string) {
    if (!gameStore.isPlaying()) return
    if (armedTowerId.value === towerId) {
      clearSelection()
      return
    }
    const towerDef = TOWERS[towerId]
    if (game.state.gold < towerDef.cost) {
      gameStore.rejectAction(`Не хватает золота: ${towerDef.name} стоит ${towerDef.cost}`)
      return
    }
    armedTowerId.value = towerId
    const useTouch =
      isPhoneLayout() ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    touchPlacement.value = useTouch ? { cell: null } : null
    placementEffect.value = ''
    selectedTowerCell.value = null
    // Выбрал в меню — меню закрывается, остаётся нажать на плиту
    openMenu.value = null
  }

  /**
   * Нажали на башню — открыть её сведения. Свободная плита — место для стража в руке.
   * Касание закрепляет предпросмотр, мышь и Enter подтверждают уже видимую позицию.
   */
  function tapCell(col: number, row: number, { keepArmed = false, previewOnly = false } = {}) {
    if (
      !gameStore.isPlaying() ||
      gameStore.screen ||
      openMenu.value ||
      !game.isInsideField(col, row)
    )
      return
    if (game.towerAt(col, row)) {
      selectedTowerCell.value = isSameCell(selectedTowerCell.value, col, row) ? null : { col, row }
      disarmTower()
      openTowerMenu()
      return
    }
    selectedTowerCell.value = null
    if (!armedTowerId.value) return
    if (previewOnly) {
      touchPlacement.value = { cell: game.isCellFree(col, row) ? { col, row } : null }
      sync()
      return
    }
    if (game.isCellFree(col, row)) buildArmedTower(col, row, keepArmed)
  }

  function buildArmedTower(col: number, row: number, keepArmed = false) {
    const id = armedTowerId.value
    if (id && gameStore.tryBuild(id, col, row) && !keepArmed) disarmTower()
  }

  function confirmPlacement() {
    const cell = touchPlacement.value?.cell
    if (!cell || !gameStore.isPlaying() || gameStore.screen || openMenu.value) return
    if (game.isCellFree(cell.col, cell.row)) buildArmedTower(cell.col, cell.row)
  }

  // Проверка «партия идёт» — как в chooseShopTower и tapCell: кнопки под экраном итогов
  // выключены (inert), но действие можно вызвать и не кнопкой
  function upgradeSelected() {
    const tower = selectedTower()
    if (!tower || !gameStore.isPlaying()) return
    if (
      !game.upgrade(tower.col, tower.row) &&
      upgradeCost(tower, selected.upgradeCostMultiplier) !== null
    ) {
      gameStore.rejectAction('Не хватает золота на улучшение')
    }
  }

  function sellSelected() {
    const tower = selectedTower()
    if (!tower || !gameStore.isPlaying()) return
    game.sell(tower.col, tower.row)
    selectedTowerCell.value = null
  }

  function specializeSelected(aspectId: string) {
    const tower = selectedTower()
    if (!tower || !gameStore.isPlaying()) return
    if (!game.specialize(tower.col, tower.row, aspectId)) {
      gameStore.rejectAction('Для покупки аспекта нужны III ступень и достаточно золота')
    }
    gameStore.syncHud()
    sync()
  }

  function undoSpecializationSelected() {
    const tower = selectedTower()
    if (!tower || !gameStore.isPlaying()) return
    game.undoSpecialization(tower.col, tower.row)
    gameStore.syncHud()
    sync()
  }

  /** Переключить цель выбранной башни (умение баллисты): первый ↔ сильный */
  function cycleTargetMode() {
    const tower = selectedTower()
    if (!tower || !gameStore.isPlaying() || !tower.def.canChooseTarget) return
    const nextIndex = (TARGET_MODES.indexOf(tower.targetMode) + 1) % TARGET_MODES.length
    game.setTargetMode(tower.col, tower.row, TARGET_MODES[nextIndex])
    sync()
  }

  function moveCursor(deltaCol: number, deltaRow: number) {
    const { cols, rows } = game.level.def
    const current = cursorCell.value ??
      touchPlacement.value?.cell ?? { col: Math.floor(cols / 2), row: Math.floor(rows / 2) }
    hoverCell.value = null
    const cell = {
      col: Math.max(0, Math.min(cols - 1, current.col + deltaCol)),
      row: Math.max(0, Math.min(rows - 1, current.row + deltaRow)),
    }
    cursorCell.value = cell
    if (touchPlacement.value) {
      touchPlacement.value.cell = game.isCellFree(cell.col, cell.row) ? cell : null
      sync()
    }
  }

  function confirmCursor(keepArmed = false) {
    if (cursorCell.value) tapCell(cursorCell.value.col, cursorCell.value.row, { keepArmed })
  }

  // ---------------------------------------------------------------- Подсказка у магазина

  /** Какие враги придут в волне waveNumber: «5 бунтовщиков, 2 разведчика» */
  function describeWave(waveNumber: number): string {
    const counts = new Map<string, number>()
    for (const [enemyId, count] of game.waveGroups(waveNumber)) {
      counts.set(enemyId, (counts.get(enemyId) ?? 0) + count)
    }
    const roster = [...counts]
      .map(([enemyId, count]) => `${count} ${plural(count, ENEMIES[enemyId].nameForms)}`)
      .join(', ')
    const banner = counts.has('general') ? ENEMIES['general'].banner : undefined
    return banner ? `${roster}. Знамя даёт бойцам рядом +${banner.armor} брони.` : roster
  }

  // При выборе башни подробности выводит её панель. Страж «в руке» важнее подсказки о паузе.
  const hint = computed(() => {
    const hud = gameStore.hud
    if (selected.towerId) return ''
    if (armedTowerId.value) {
      if (placementEffect.value) return placementEffect.value
      if (touchPlacement.value?.cell) return 'Можно выбрать другую плиту.'
      if (touchPlacement.value) return 'Выберите свободную плиту.'
      return 'Нажмите на свободную плиту'
    }
    if (hud.isPaused) return 'Пауза. Стражу можно ставить и улучшать'
    if (hud.phase === 'wave') return `Врагов осталось: ${hud.enemiesLeft}`
    if (hud.phase === 'lost' || hud.phase === 'won') return ''
    if (hud.phase === 'build' && hud.wave === 1 && hud.towerCount === 0) {
      return 'Выберите стража и нажмите на плиту у ковра'
    }
    return `Дальше: ${describeWave(hud.wave)}`
  })

  return {
    armedTowerId,
    placementTower,
    pendingPlacement,
    touchPlacement,
    selectedTowerCell,
    cursorCell,
    hoverCell,
    openMenu,
    isShopOpen,
    isTowerMenuOpen,
    isRewardSheetOpen,
    selected,
    isBoardClickable,
    hint,
    sync,
    boardView,
    clearSelection,
    openShop,
    openRewards,
    openTowerMenu,
    closeMenu,
    syncMenuWithLayout,
    chooseShopTower,
    tapCell,
    confirmPlacement,
    upgradeSelected,
    specializeSelected,
    undoSpecializationSelected,
    sellSelected,
    cycleTargetMode,
    moveCursor,
    confirmCursor,
  }
})
