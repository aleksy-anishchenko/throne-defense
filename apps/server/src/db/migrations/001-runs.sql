-- Результаты партий — для общего топа (шаг 3.8).
-- Игрок пока — просто имя, введённое руками. После выбора площадки (этап 4) появится
-- таблица players, а сюда добавится ссылка на неё — новой миграцией, этот файл не меняем.
--
-- STRICT: SQLite проверяет типы колонок (без него в INTEGER молча ляжет и строка).
-- CHECK — последняя линия обороны: даже если проверка в коде пропустит мусор, база его не примет.
CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  -- Без пробелов по краям, от 1 до 20 символов (length считает буквы, а не байты — кириллица ок)
  player_name TEXT NOT NULL CHECK (
    player_name = trim(player_name) AND length(player_name) BETWEEN 1 AND 20
  ),
  -- id уровня из packages/game: 'throne-hall'
  level_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  -- Сколько волн отбито — как поле wave в рекорде браузера
  waves_cleared INTEGER NOT NULL CHECK (waves_cleared >= 0),
  -- BALANCE_VERSION на момент партии: рекорды разных версий баланса не смешиваются
  balance_version INTEGER NOT NULL CHECK (balance_version >= 1),
  -- Время сервера в UTC, ISO 8601: 2026-11-12T09:46:23.123Z
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Топ уровня и версии баланса, лучшие сверху — ровно запрос GET /api/leaderboard
CREATE INDEX runs_leaderboard ON runs (level_id, balance_version, score DESC);
