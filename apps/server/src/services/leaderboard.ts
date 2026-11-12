// Запросы к таблице runs для общего топа. Маршруты (routes/) зовут эти функции и не пишут SQL сами.
//
// Одно имя — одна строка: в таблице лучших у каждого имени его лучший результат.
// Иначе один упорный игрок занял бы все десять мест.

import type { LeaderboardEntry, SubmitRunRequest } from '@throne/contracts'
import type { DatabaseSync } from 'node:sqlite'

/** Таблица какого уровня и какой версии баланса */
export interface LeaderboardScope {
  levelId: string
  balanceVersion: number
}

/** Место в таблице и сколько в ней всего имён */
export interface PlayerPlace {
  rank: number
  playerCount: number
}

// Лучшая партия каждого имени. При равном счёте лучшая — более ранняя: кто первый набрал
// (по id — он растёт строго по порядку записи, а у времени бывают одинаковые миллисекунды).
// :level_id и :balance_version подставляет SQLite (параметры запроса) — так в SQL нельзя
// ничего подсунуть через имя или id уровня
const BEST_PER_PLAYER = `
  SELECT id, player_name, score, waves_cleared
  FROM (
    SELECT id, player_name, score, waves_cleared,
      ROW_NUMBER() OVER (PARTITION BY player_name ORDER BY score DESC, id ASC) AS position
    FROM runs
    WHERE level_id = :level_id AND balance_version = :balance_version
  )
  WHERE position = 1
`

export function insertRun(database: DatabaseSync, run: SubmitRunRequest): void {
  database
    .prepare(
      `INSERT INTO runs (player_name, level_id, score, waves_cleared, balance_version)
       VALUES (:player_name, :level_id, :score, :waves_cleared, :balance_version)`,
    )
    .run({
      player_name: run.playerName,
      level_id: run.levelId,
      score: run.score,
      waves_cleared: run.wavesCleared,
      balance_version: run.balanceVersion,
    })
}

/** Лучшие limit имён. RANK: у равных счетов одно место (1, 2, 2, 4) */
export function topPlayers(
  database: DatabaseSync,
  scope: LeaderboardScope,
  limit: number,
): LeaderboardEntry[] {
  const rows = database
    .prepare(
      `SELECT RANK() OVER (ORDER BY score DESC) AS rank, player_name, score, waves_cleared
       FROM (${BEST_PER_PLAYER})
       ORDER BY score DESC, id ASC
       LIMIT :limit`,
    )
    .all({ ...scopeParameters(scope), limit }) as {
    rank: number
    player_name: string
    score: number
    waves_cleared: number
  }[]
  return rows.map((row) => ({
    rank: row.rank,
    playerName: row.player_name,
    score: row.score,
    wavesCleared: row.waves_cleared,
  }))
}

export function countPlayers(database: DatabaseSync, scope: LeaderboardScope): number {
  const row = database
    .prepare(
      `SELECT count(DISTINCT player_name) AS count FROM runs
       WHERE level_id = :level_id AND balance_version = :balance_version`,
    )
    .get(scopeParameters(scope)) as { count: number }
  return row.count
}

/**
 * Место имени по его лучшему результату: 1 + сколько имён набрали строго больше.
 * null — у имени нет ни одной партии в этой таблице
 */
export function playerPlace(
  database: DatabaseSync,
  scope: LeaderboardScope,
  playerName: string,
): PlayerPlace | null {
  const best = database
    .prepare(
      `SELECT max(score) AS score FROM runs
       WHERE level_id = :level_id AND balance_version = :balance_version
         AND player_name = :player_name`,
    )
    .get({ ...scopeParameters(scope), player_name: playerName }) as { score: number | null }
  if (best.score === null) return null

  const ahead = database
    .prepare(`SELECT count(*) AS count FROM (${BEST_PER_PLAYER}) WHERE score > :score`)
    .get({ ...scopeParameters(scope), score: best.score }) as { count: number }
  return { rank: ahead.count + 1, playerCount: countPlayers(database, scope) }
}

function scopeParameters(scope: LeaderboardScope) {
  return { level_id: scope.levelId, balance_version: scope.balanceVersion }
}
