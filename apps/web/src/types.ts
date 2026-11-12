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
  /** Клетка под мышью */
  hoverCell: Cell | null
  /** Клавиатурный курсор (стрелки) */
  cursorCell: Cell | null
}

/** Какой экран поверх поля: меню, поражение, победа, таблица лучших или никакого */
export type OverlayScreen = 'menu' | 'defeat' | 'victory' | 'leaderboard' | 'settings' | null
