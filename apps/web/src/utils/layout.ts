// Условие «есть боковая панель» — то же, что в src/styles/responsive.css (первый media-запрос).
// Меняешь одно — меняй и другое.
export const SIDE_PANEL_QUERY =
  '(min-width: 640px) and (min-aspect-ratio: 1/1), (min-width: 940px) and (min-aspect-ratio: 9/10)'
