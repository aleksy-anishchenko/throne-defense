/** Клетка поля: столбец и строка */
export interface Cell {
  col: number
  row: number
}

/** Что сейчас выбрал игрок — нужно и интерфейсу, и рисованию поля */
export interface BoardView {
  /** Башня, выбранная в магазине («ставлю такую»): её id */
  armedTowerId: string | null
  /** Клетка выбранной поставленной башни */
  selectedTowerCell: Cell | null
  /** Плита для предпросмотра: под мышью, клавиатурным курсором или выбранная касанием. */
  placementCell: Cell | null
  /** После касания показываем стража с выделением до подтверждения покупки. */
  isTouchPlacement: boolean
  /** Клавиатурный курсор (стрелки) */
  cursorCell: Cell | null
}

/** Какой экран поверх поля: меню, итоги, награда, таблица лучших, настройки или никакого */
export type OverlayScreen =
  'menu' | 'defeat' | 'victory' | 'reward' | 'leaderboard' | 'settings' | 'surrender' | null
