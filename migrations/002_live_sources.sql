-- Harbor migration 002: administrator-approved live sources (issue #2).
-- openDb() applies this once, inside a transaction, while user_version < 2.
-- adapter 'fixture' replays bundled history; 'live' sources are polled only
-- when the server runs with LIVE_FETCH=enabled. For live sources,
-- snapshots.fixture_version and fetch_attempts.fixture_version hold the
-- per-source capture sequence number.
ALTER TABLE sources ADD COLUMN adapter TEXT NOT NULL DEFAULT 'fixture' CHECK(adapter IN ('fixture','live'));
ALTER TABLE sources ADD COLUMN approved_path_prefixes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE sources ADD COLUMN max_redirects INTEGER NOT NULL DEFAULT 2 CHECK(max_redirects BETWEEN 0 AND 5);
PRAGMA user_version = 2;
