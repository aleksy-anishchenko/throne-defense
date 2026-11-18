// Выбор игрока: какой страж «в руке», какая башня выбрана на поле, где курсор.
//
// Это отдельный стор рядом с игровым (stores/game.ts). Как два composable в Vue: игровой стор
// знает про партию, золото и экраны, а этот — про то, что игрок сейчас держит и на что смотрит.
// Зависимость идёт в одну сторону: выбор знает про игру, игра про выбор — нет.
// Поэтому сброс выбора при новой партии и при начале волны сделан через watch (внизу файла).
//
// Постройка — один сценарий: выбрал стража в магазине → нажал на свободную плиту.
// После постройки страж из «руки» убирается: нажатие на плиту «просто посмотреть» ничего не строит.

import {
  ENEMIES,
  TARGET_MODES,
  TOWERS,
  fireRateBonusOf,
  fireRateSourceOf,
  bellCoverage,
  treasuryBonusOf,
  treasuryIncomeOf,
  treasuryNeighbors,
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
import { plural } from '@/utils/format'
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
  /**
   * Какое меню открыто на телефоне: выбор стража (ShopSheet.vue) или действия с выбранной
   * башней (TowerSheet.vue). С боковой панелью меню нет — там всё лежит на панели
   */
  const openMenu = ref<'shop' | 'tower' | null>(null)
  const isShopOpen = computed(() => openMenu.value === 'shop')
  const isTowerMenuOpen = computed(() => openMenu.value === 'tower')

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
    /** Кого башня выбирает целью */
    targetMode: 'first' as TargetMode,
    /** Сколько вернут при продаже */
    refund: 0,
    /** Вернут ли всё вложенное: башня ещё не была в бою */
    isFullRefund: false,
    /** Насколько её ускоряет Звонарь рядом: 0.2 — на 20%, 0 — не ускоряет */
    fireRateBonus: 0,
    bellCoveredTowers: 0,
    bellBoostedTowers: 0,
    treasuryNeighbors: 0,
    treasuryBonus: 0,
    treasuryIncome: 0,
    upgradeCost: null as number | null,
    upgradeCostMultiplier: 1,
  })

  /** Снимок предпросмотра: игра не реактивна, как и снимок выбранной башни выше. */
  const bellPlacement = reactive({ isActive: false, covered: 0, improved: 0, bonus: 0 })
  const receivingBellPlacement = reactive({ isActive: false, bonus: 0 })

  const selectedTower = (): Tower | undefined =>
    selectedTowerCell.value
      ? game.towerAt(selectedTowerCell.value.col, selectedTowerCell.value.row)
      : undefined

  /** Вызывается каждый кадр вместе с syncHud */
  function sync() {
    const tower = selectedTower()
    // Так задумано: если выбранной башни уже нет (её продали), выбор снимается сам,
    // и меню действий с ней закрывается
    if (selectedTowerCell.value && !tower) selectedTowerCell.value = null
    if (!tower && openMenu.value === 'tower') openMenu.value = null
    selected.towerId = tower ? tower.def.id : null
    selected.tier = tower ? tower.tier : 0
    selected.aspectId = tower ? tower.aspectId : null
    selected.aspectLocked = tower ? tower.aspectLocked : false
    selected.targetMode = tower ? tower.targetMode : 'first'
    selected.refund = tower ? refundFor(tower) : 0
    selected.isFullRefund = tower ? isFullRefund(tower) : false
    selected.fireRateBonus = tower ? fireRateBonusOf(game.state.towers, tower) : 0
    const bellTargets = tower?.def.id === 'bell' ? bellCoverage(game.state.towers, tower) : []
    selected.bellCoveredTowers = bellTargets.length
    selected.bellBoostedTowers = bellTargets.filter(
      (target) => fireRateSourceOf(game.state.towers, target) === tower,
    ).length
    selected.treasuryNeighbors = tower ? treasuryNeighbors(game.state.towers, tower).length : 0
    selected.treasuryBonus = tower ? treasuryBonusOf(game.state.towers, tower) : 0
    selected.treasuryIncome = tower ? treasuryIncomeOf(game.state.towers, tower) : 0
    selected.upgradeCostMultiplier = rewardStats(game.state).upgradeCostMultiplier
    selected.upgradeCost = tower ? upgradeCost(tower, selected.upgradeCostMultiplier) : null

    const hover = hoverCell.value
    const placementCell = hover ?? cursorCell.value
    bellPlacement.isActive =
      armedTowerId.value === 'bell' &&
      placementCell !== null &&
      game.isCellFree(placementCell.col, placementCell.row)
    if (bellPlacement.isActive && placementCell) {
      const preview = bellPlacementPreview(game.state.towers, placementCell.col, placementCell.row)
      bellPlacement.covered = preview.covered.length
      bellPlacement.improved = preview.improved.length
      bellPlacement.bonus = preview.bonus
    }
    const receiverPreview =
      armedTowerId.value && placementCell && game.isCellFree(placementCell.col, placementCell.row)
        ? towerPlacementBellPreview(
            game.state.towers,
            armedTowerId.value,
            placementCell.col,
            placementCell.row,
          )
        : null
    receivingBellPlacement.isActive = receiverPreview !== null
    receivingBellPlacement.bonus = receiverPreview?.bonus ?? 0
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
    hoverCell: hoverCell.value,
    cursorCell: cursorCell.value,
  })

  function clearSelection() {
    armedTowerId.value = null
    selectedTowerCell.value = null
    openMenu.value = null
  }

  // Новая партия — выбор прошлой не нужен
  watch(() => gameStore.runCount, clearSelection, { flush: 'sync' })
  // Экран поверх поля (меню, итоги, настройки) закрывает и меню стражей
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
      if (phase === 'wave') armedTowerId.value = null
    },
    { flush: 'sync' },
  )

  // ---------------------------------------------------------------- Действия

  function openShop() {
    if (gameStore.isPlaying()) openMenu.value = 'shop'
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
  }

  /**
   * Нажали на карточку стража в магазине: взять его «в руку» (ещё раз — убрать).
   * Не хватает золота — в руку не берём: отказ сразу, а не после нажатия на плиту
   */
  function chooseShopTower(towerId: string) {
    if (!gameStore.isPlaying()) return
    if (armedTowerId.value === towerId) {
      armedTowerId.value = null
      selectedTowerCell.value = null
      openMenu.value = null
      return
    }
    const towerDef = TOWERS[towerId]
    if (game.state.gold < towerDef.cost) {
      gameStore.rejectAction(`Не хватает золота: ${towerDef.name} стоит ${towerDef.cost}`)
      return
    }
    armedTowerId.value = towerId
    selectedTowerCell.value = null
    // Выбрал в меню — меню закрывается, остаётся нажать на плиту
    openMenu.value = null
  }

  /**
   * Нажали на клетку поля. Башня — выбрать (или снять выбор); свободная плита при стороже
   * «в руке» — построить. keepArmed (Shift) — оставить стража «в руке», чтобы ставить подряд
   */
  function tapCell(col: number, row: number, keepArmed = false) {
    if (!gameStore.isPlaying() || !game.isInsideField(col, row)) return
    if (game.towerAt(col, row)) {
      selectedTowerCell.value = isSameCell(selectedTowerCell.value, col, row) ? null : { col, row }
      armedTowerId.value = null
      openTowerMenu()
      return
    }
    selectedTowerCell.value = null
    const towerId = armedTowerId.value
    if (!towerId || !game.isCellFree(col, row)) return
    // Не хватило золота — страж остаётся «в руке»: накопил и нажал ещё раз
    if (gameStore.tryBuild(towerId, col, row) && !keepArmed) armedTowerId.value = null
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
      gameStore.rejectAction(
        game.state.phase === 'build'
          ? 'Не удалось выбрать специализацию: проверьте уровень и золото'
          : 'Специализацию выбирают между волнами',
      )
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
    const current = cursorCell.value ?? { col: Math.floor(cols / 2), row: Math.floor(rows / 2) }
    cursorCell.value = {
      col: Math.max(0, Math.min(cols - 1, current.col + deltaCol)),
      row: Math.max(0, Math.min(rows - 1, current.row + deltaRow)),
    }
  }

  function confirmCursor(keepArmed = false) {
    if (cursorCell.value) tapCell(cursorCell.value.col, cursorCell.value.row, keepArmed)
  }

  // ---------------------------------------------------------------- Подсказка над магазином

  const describeTower = (towerId: string) =>
    `${TOWERS[towerId].name}: ${TOWERS[towerId].description}`

  /** Какие враги придут в волне waveNumber: «5 бунтовщиков, 2 разведчика» */
  function describeWave(waveNumber: number): string {
    const counts = new Map<string, number>()
    for (const [enemyId, count] of game.waveGroups(waveNumber)) {
      counts.set(enemyId, (counts.get(enemyId) ?? 0) + count)
    }
    return [...counts]
      .map(([enemyId, count]) => `${count} ${plural(count, ENEMIES[enemyId].nameForms)}`)
      .join(', ')
  }

  // Порядок проверок — это приоритет подсказок. Выбранная башня и страж «в руке» выше паузы:
  // иначе на паузе (когда как раз строят) не видно, что страж взят и плита что-то построит
  const hint = computed(() => {
    const hud = gameStore.hud
    if (selected.towerId) return describeTower(selected.towerId)
    if (armedTowerId.value && receivingBellPlacement.isActive) {
      return `${TOWERS[armedTowerId.value].name}: получит +${Math.round(receivingBellPlacement.bonus * 100)}% к скорострельности от Звонаря`
    }
    if (armedTowerId.value === 'bell' && bellPlacement.isActive) {
      if (bellPlacement.covered === 0) return 'Звонарь: нет подходящих башен в зоне'
      if (bellPlacement.improved === 0) return 'Звонарь: все цели уже получают не меньший бонус'
      const count = bellPlacement.improved
      return `Звонарь: ускорит ${count} ${plural(count, ['башню', 'башни', 'башен'])} на ${Math.round(bellPlacement.bonus * 100)}%`
    }
    if (armedTowerId.value) return describeTower(armedTowerId.value)
    if (hud.isPaused) return 'Пауза. Стражу можно ставить и улучшать'
    if (hud.phase === 'wave') return `Врагов осталось: ${hud.enemiesLeft}`
    if (hud.phase === 'lost' || hud.phase === 'won') return ''
    if (hud.phase === 'build' && hud.wave === 1 && hud.towerCount === 0) {
      return 'Выберите стража и нажмите на плиту у ковра'
    }
    return `Дальше: ${describeWave(hud.wave)}`
  })

  /**
   * Подсказка сейчас — описание стража «в руке». Там, где карточки магазина сами показывают
   * описания, оно повторялось бы дважды — SidePanel показывает вместо него, что делать дальше
   */
  const isArmedTowerHint = computed(
    () =>
      !selected.towerId &&
      armedTowerId.value !== null &&
      !receivingBellPlacement.isActive &&
      !(armedTowerId.value === 'bell' && bellPlacement.isActive),
  )

  return {
    armedTowerId,
    selectedTowerCell,
    cursorCell,
    hoverCell,
    openMenu,
    isShopOpen,
    isTowerMenuOpen,
    selected,
    isBoardClickable,
    hint,
    isArmedTowerHint,
    sync,
    boardView,
    clearSelection,
    openShop,
    openTowerMenu,
    closeMenu,
    syncMenuWithLayout,
    chooseShopTower,
    tapCell,
    upgradeSelected,
    specializeSelected,
    undoSpecializationSelected,
    sellSelected,
    cycleTargetMode,
    moveCursor,
    confirmCursor,
  }
})
