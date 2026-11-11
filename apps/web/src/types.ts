/** Клетка поля: столбец и строка */
export interface Cell {
  c: number
  r: number
}

/** Что сейчас выбрал игрок — нужно и интерфейсу, и рисованию поля */
export interface BoardView {
  /** Башня, выбранная в магазине («ставлю такую») */
  armed: string | null
  /** Клетка выбранной поставленной башни */
  selected: Cell | null
  /** Выбранная пустая плита («что сюда поставить?») */
  tile: Cell | null
  /** Клетка под мышью */
  hover: Cell | null
  /** Клавиатурный курсор (стрелки) */
  cursor: Cell | null
}
