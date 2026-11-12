// Выбор игрока: какой страж «в руке», какая башня выбрана на поле, где курсор.
//
// Это отдельный стор рядом с игровым (stores/game.ts). Как два composable в Vue: игровой стор
// знает про партию, золото и экраны, а этот — про то, что игрок сейчас держит и на что смотрит.
// Зависимость идёт в одну сторону: выбор знает про игру, игра про выбор — нет.
// Поэтому сброс выбора при новой партии и при начале волны сделан через watch (внизу файла).
//
// Постройка — один сценарий: выбрал стража в магазине → нажал на свободную плиту.
// После постройки страж из «руки» убирается: нажатие на плиту «просто посмотреть» ничего не строит.

import { ENEMIES, TARGET_MODES, TOWERS, isFullRefund, refundFor, upgradeCost } from '@throne/game'
import type { TargetMode, Tower } from '@throne/game'
import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import type { BoardView, Cell } from '@/types'
import { plural } from '@/utils/format'
import { useGameStore } from './game'

const isSameCell = (cell: Cell | null, col: number, row: number) =>
  cell !== null && cell.col === col && cell.row === row

export const useSelectionStore = defineStore('selection', () => {
  const gameStore = useGameStore()
  const game = gameStore.game
  const { cols, rows } = game.level.def

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
    /** Кого башня выбирает целью */
    targetMode: 'first' as TargetMode,
    /** Сколько вернут при продаже */
    refund: 0,
    /** Вернут ли всё вложенное: башня ещё не была в бою */
    isFullRefund: false,
  })

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
    selected.targetMode = tower ? tower.targetMode : 'first'
    selected.refund = tower ? refundFor(tower) : 0
    selected.isFullRefund = tower ? isFullRefund(tower) : false

    const hover = hoverCell.value
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
      if (screen !== null) openMenu.value = null
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

  function openTowerMenu() {
    if (gameStore.isPlaying() && selectedTowerCell.value) openMenu.value = 'tower'
  }

  /** Закрыть меню (выбор стража или башни остаётся) */
  function closeMenu() {
    openMenu.value = null
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
    if (!game.upgrade(tower.col, tower.row) && upgradeCost(tower) !== null) {
      gameStore.rejectAction('Не хватает золота на улучшение')
    }
  }

  function sellSelected() {
    const tower = selectedTower()
    if (!tower || !gameStore.isPlaying()) return
    game.sell(tower.col, tower.row)
    selectedTowerCell.value = null
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
  const isArmedTowerHint = computed(() => !selected.towerId && armedTowerId.value !== null)

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
    chooseShopTower,
    tapCell,
    upgradeSelected,
    sellSelected,
    cycleTargetMode,
    moveCursor,
    confirmCursor,
  }
})
