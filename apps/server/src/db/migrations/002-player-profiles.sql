CREATE TABLE players (
  id TEXT PRIMARY KEY CHECK (length(id) = 64),
  player_name TEXT NOT NULL CHECK (
    player_name = trim(player_name) AND length(player_name) BETWEEN 1 AND 20
  )
) STRICT;

-- Старые партии сохраняют имя, под которым были сыграны.
ALTER TABLE runs ADD COLUMN player_id TEXT REFERENCES players(id);
CREATE INDEX runs_player_score ON runs (player_id, score DESC) WHERE player_id IS NOT NULL;
