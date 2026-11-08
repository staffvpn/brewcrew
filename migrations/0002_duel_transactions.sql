-- Existing games are retained; new stakes use market-account versions and receipts.
CREATE TABLE IF NOT EXISTS duel (
 id INTEGER PRIMARY KEY AUTOINCREMENT, a INTEGER NOT NULL, b INTEGER NOT NULL,
 a_cafe TEXT, b_cafe TEXT, stake INTEGER NOT NULL DEFAULT 0, seed INTEGER NOT NULL,
 status TEXT NOT NULL, created_at INTEGER NOT NULL, rematch INTEGER DEFAULT 0,
 a_score INTEGER DEFAULT 0,b_score INTEGER DEFAULT 0,a_det TEXT,b_det TEXT,
 a_at INTEGER,b_start INTEGER,done_at INTEGER,winner INTEGER DEFAULT 0,posted INTEGER
);
ALTER TABLE duel ADD COLUMN a_run INTEGER NOT NULL DEFAULT 0;
ALTER TABLE duel ADD COLUMN b_run INTEGER NOT NULL DEFAULT 0;
ALTER TABLE duel ADD COLUMN a_created INTEGER NOT NULL DEFAULT 0;
ALTER TABLE duel ADD COLUMN b_created INTEGER NOT NULL DEFAULT 0;
UPDATE duel SET
 a_run=COALESCE((SELECT franchises FROM players WHERE tg_id=duel.a),0),
 b_run=COALESCE((SELECT franchises FROM players WHERE tg_id=duel.b),0),
 a_created=COALESCE((SELECT created_at FROM players WHERE tg_id=duel.a),0),
 b_created=COALESCE((SELECT created_at FROM players WHERE tg_id=duel.b),0);
CREATE INDEX IF NOT EXISTS duel_active_players ON duel(a,b,status);
-- Preserve identities for rounds created by the previous deployment while 9.0 rolls out.
CREATE TRIGGER IF NOT EXISTS duel_legacy_identity AFTER INSERT ON duel
WHEN NEW.a_created=0 AND NEW.b_created=0
BEGIN
 UPDATE duel SET
 a_run=COALESCE((SELECT franchises FROM players WHERE tg_id=NEW.a),0),
 b_run=COALESCE((SELECT franchises FROM players WHERE tg_id=NEW.b),0),
 a_created=COALESCE((SELECT created_at FROM players WHERE tg_id=NEW.a),0),
 b_created=COALESCE((SELECT created_at FROM players WHERE tg_id=NEW.b),0)
 WHERE id=NEW.id;
END;
