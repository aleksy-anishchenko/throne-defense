// Запросы для общего топа. У профиля в каждой таблице одна строка с лучшим результатом.

import type { LeaderboardEntry, SubmitRunRequest } from '@throne/contracts'
import type { DatabaseSync } from 'node:sqlite'

/**
 * Таблица какого уровня и какой версии баланса. null — без отбора: levelId — все залы вместе,
 * balanceVersion — все версии правил (общий топ игры: рекорды не пропадают при смене баланса)
 */
export interface LeaderboardScope {
  levelId: string | null
  balanceVersion: number | null
}

/** Условие отбора по scope: уровень и версия — только если заданы */
const SCOPE_WHERE =
  '(:level_id IS NULL OR level_id = :level_id) AND (:balance_version IS NULL OR balance_version = :balance_version)'

/** Место в таблице и число игроков */
export interface PlayerPlace {
  rank: number
  playerCount: number
}

// Для старых партий без профиля используется прежняя группировка по имени.
const PLAYER_KEY = "COALESCE(player_id, 'legacy:' || player_name)"

// Лучшая партия каждого игрока. При равном счёте лучшая — более ранняя: кто первый набрал
// (по id — он растёт строго по порядку записи, а у времени бывают одинаковые миллисекунды).
// :level_id и :balance_version подставляет SQLite (параметры запроса) — так в SQL нельзя
// ничего подсунуть через имя или id уровня
const BEST_PER_PLAYER = `
  SELECT id, player_id, player_name, score, waves_cleared, level_id
  FROM (
    SELECT id, player_id, player_name, score, waves_cleared, level_id,
      ROW_NUMBER() OVER (PARTITION BY ${PLAYER_KEY} ORDER BY score DESC, id ASC) AS position
    FROM runs
    WHERE ${SCOPE_WHERE}
  )
  WHERE position = 1
`

/** Первая партия создаёт профиль. В остальных при записи берём актуальное имя из базы. */
export function insertRun(database: DatabaseSync, run: SubmitRunRequest, playerId: string): string {
  database.exec('BEGIN IMMEDIATE')
  try {
    database
      .prepare('INSERT INTO players (id, player_name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING')
      .run(playerId, run.playerName)
    const stored = database
      .prepare(
        `INSERT INTO runs (player_name, level_id, score, waves_cleared, balance_version, player_id)
         SELECT player_name, :level_id, :score, :waves_cleared, :balance_version, id
         FROM players WHERE id = :player_id
         RETURNING player_name`,
      )
      .get({
        player_id: playerId,
        level_id: run.levelId,
        score: run.score,
        waves_cleared: run.wavesCleared,
        balance_version: run.balanceVersion,
      }) as { player_name: string } | undefined
    if (!stored) throw new Error('Профиль для записи партии отсутствует')
    database.exec('COMMIT')
    return stored.player_name
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

/** Лучшие limit игроков. RANK: у равных счетов одно место (1, 2, 2, 4). */
export function topPlayers(
  database: DatabaseSync,
  scope: LeaderboardScope,
  limit: number,
): LeaderboardEntry[] {
  const rows = database
    .prepare(
      `SELECT RANK() OVER (ORDER BY best.score DESC) AS rank,
              best.player_id, COALESCE(players.player_name, best.player_name) AS player_name,
              best.score, best.waves_cleared, best.level_id
       FROM (${BEST_PER_PLAYER}) AS best
       LEFT JOIN players ON players.id = best.player_id
       ORDER BY best.score DESC, best.id ASC
       LIMIT :limit`,
    )
    .all({ ...scopeParameters(scope), limit }) as {
    rank: number
    player_id: string | null
    player_name: string
    score: number
    waves_cleared: number
    level_id: string
  }[]
  return rows.map((row) => ({
    rank: row.rank,
    playerId: row.player_id ?? undefined,
    playerName: row.player_name,
    score: row.score,
    wavesCleared: row.waves_cleared,
    levelId: row.level_id,
  }))
}

export function countPlayers(database: DatabaseSync, scope: LeaderboardScope): number {
  const row = database
    .prepare(
      `SELECT count(DISTINCT ${PLAYER_KEY}) AS count FROM runs
       WHERE ${SCOPE_WHERE}`,
    )
    .get(scopeParameters(scope)) as { count: number }
  return row.count
}

/**
 * Место профиля по его лучшему результату: 1 + сколько игроков набрали строго больше.
 * null — у профиля нет партии в этой таблице
 */
export function playerPlace(
  database: DatabaseSync,
  scope: LeaderboardScope,
  playerId: string,
): PlayerPlace | null {
  const best = database
    .prepare(
      `SELECT max(score) AS score FROM runs
       WHERE ${SCOPE_WHERE} AND player_id = :player_id`,
    )
    .get({ ...scopeParameters(scope), player_id: playerId }) as { score: number | null }
  if (best.score === null) return null

  const ahead = database
    .prepare(`SELECT count(*) AS count FROM (${BEST_PER_PLAYER}) WHERE score > :score`)
    .get({ ...scopeParameters(scope), score: best.score }) as { count: number }
  return { rank: ahead.count + 1, playerCount: countPlayers(database, scope) }
}

function scopeParameters(scope: LeaderboardScope) {
  return { level_id: scope.levelId, balance_version: scope.balanceVersion }
}
