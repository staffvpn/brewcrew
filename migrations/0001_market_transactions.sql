-- Apply before deploying the market transaction endpoints.
CREATE TABLE IF NOT EXISTS market_accounts (
  tg_id INTEGER PRIMARY KEY,
  franchises INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  roster TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS market_operations (
  operation_id TEXT PRIMARY KEY,
  tg_id INTEGER NOT NULL,
  franchises INTEGER NOT NULL,
  request TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  applied_at INTEGER
);
CREATE INDEX IF NOT EXISTS market_pending_operations ON market_operations(tg_id, applied_at);
ALTER TABLE market ADD COLUMN staff_id TEXT;
ALTER TABLE market ADD COLUMN seller_run INTEGER NOT NULL DEFAULT 0;
UPDATE market SET seller_run = COALESCE((SELECT franchises FROM players WHERE players.tg_id = market.seller), 0);
CREATE UNIQUE INDEX IF NOT EXISTS market_one_open_staff ON market(seller, seller_run, staff_id) WHERE status = 'open' AND staff_id IS NOT NULL;
INSERT OR IGNORE INTO market_accounts(tg_id, franchises) SELECT tg_id, COALESCE(franchises, 0) FROM players;
-- Old deployed clients may create a listing during the deployment handover.
CREATE TRIGGER IF NOT EXISTS market_legacy_run AFTER INSERT ON market
WHEN NEW.staff_id IS NULL
BEGIN
 UPDATE market SET seller_run=COALESCE((SELECT franchises FROM players WHERE tg_id=NEW.seller),0) WHERE id=NEW.id;
END;
