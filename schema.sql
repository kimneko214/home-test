-- Cloudflare D1 schema for Personal Dashboard visit log v10

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visited_at TEXT NOT NULL,
  ip TEXT NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  timezone TEXT,
  asn INTEGER,
  colo TEXT,
  user_agent TEXT,
  page TEXT,
  referrer TEXT,
  language TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_visited_at
  ON visits(visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_visits_ip
  ON visits(ip);
