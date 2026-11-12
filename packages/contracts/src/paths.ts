// Адреса API и размеры — без TypeBox. Браузер берёт отсюда только константы,
// а схемы (TypeBox) нужны лишь серверу: благодаря "sideEffects": false в package.json
// сборщик сайта выбрасывает файлы со схемами, и библиотека не попадает в игру.

/** GET — «сервер жив» */
export const HEALTH_PATH = '/api/health'

/** POST — результат законченной партии в общий топ */
export const RUNS_PATH = '/api/runs'

/** GET ?level=throne-hall&balance=4 — лучшие для уровня и версии баланса */
export const LEADERBOARD_PATH = '/api/leaderboard'

/** Сколько строк в таблице лучших */
export const LEADERBOARD_SIZE = 10

/** id уровня и подобные: латиница, цифры, дефис */
export const ID_PATTERN = '^[a-z0-9-]{1,40}$'
