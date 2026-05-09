PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sotrudniki (
  id_sotrudnika  TEXT PRIMARY KEY,
  fio            TEXT NOT NULL UNIQUE,
  otdel          TEXT NOT NULL,
  dolzhnost      TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id_sotrudnika  TEXT PRIMARY KEY REFERENCES sotrudniki(id_sotrudnika),
  role           TEXT NOT NULL DEFAULT 'employee',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vstrechi (
  id_vstrechi    TEXT PRIMARY KEY,
  id_sotrudnika  TEXT NOT NULL REFERENCES sotrudniki(id_sotrudnika),
  klient         TEXT NOT NULL,
  primary_type   TEXT,
  aw             TEXT NOT NULL DEFAULT 'OP',
  data_vstrechi  TEXT NOT NULL,
  completed_at   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'COMPLETED',
  f REAL NOT NULL DEFAULT 0,
  g REAL NOT NULL DEFAULT 0,
  h REAL NOT NULL DEFAULT 0,
  i REAL NOT NULL DEFAULT 0,
  j REAL NOT NULL DEFAULT 0,
  k REAL NOT NULL DEFAULT 0,
  l REAL NOT NULL DEFAULT 0,
  e REAL NOT NULL DEFAULT 0,
  o REAL NOT NULL DEFAULT 0,
  p REAL NOT NULL DEFAULT 0,
  aa REAL NOT NULL DEFAULT 0,
  ak REAL NOT NULL DEFAULT 0,
  av REAL NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vstrechi_sotrudnik ON vstrechi(id_sotrudnika);
CREATE INDEX IF NOT EXISTS idx_vstrechi_data      ON vstrechi(data_vstrechi);
CREATE INDEX IF NOT EXISTS idx_vstrechi_primary   ON vstrechi(primary_type);
CREATE INDEX IF NOT EXISTS idx_vstrechi_completed ON vstrechi(completed_at);
CREATE INDEX IF NOT EXISTS idx_sotrudniki_otdel   ON sotrudniki(otdel);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id TEXT,
  action TEXT NOT NULL,
  payload TEXT
);

DROP VIEW IF EXISTS v_stat_sotrudnik;
CREATE VIEW v_stat_sotrudnik AS
SELECT s.id_sotrudnika, s.fio, s.otdel, s.dolzhnost,
       COUNT(v.id_vstrechi)            AS vsego_vstrech,
       ROUND(COALESCE(SUM(v.av),0), 2) AS summa_voznagr,
       ROUND(COALESCE(SUM(v.aa),0), 2) AS summa_bs
FROM sotrudniki s
LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika
GROUP BY s.id_sotrudnika;

DROP VIEW IF EXISTS v_stat_otdel;
CREATE VIEW v_stat_otdel AS
SELECT s.otdel,
       COUNT(v.id_vstrechi)            AS vsego_vstrech,
       ROUND(COALESCE(SUM(v.av),0), 2) AS summa_voznagr
FROM sotrudniki s
LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika
GROUP BY s.otdel;
