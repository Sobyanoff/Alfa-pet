-- ============================================================
--  Alfa Tracker — Schema
--  SQLite 3.x
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
--  Сотрудники (справочник)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sotrudniki (
    id_sotrudnika   TEXT        PRIMARY KEY,   -- СОТР-001 ... СОТР-040
    fio             TEXT        NOT NULL,
    otdel           TEXT        NOT NULL,
    dolzhnost       TEXT        NOT NULL,
    email           TEXT        NOT NULL UNIQUE
);

-- ------------------------------------------------------------
--  Пользователи (авторизация)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id_sotrudnika   TEXT        PRIMARY KEY REFERENCES sotrudniki(id_sotrudnika),
    password_hash   TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'employee',  -- employee | admin
    must_change     INTEGER     NOT NULL DEFAULT 1,           -- 1 = смена пароля при первом входе
    created_at      TEXT        NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
--  Встречи (фактические данные из приложения)
--  Поля по буквам Excel-колонок объекта meeting в index.html.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vstrechi (
    id_vstrechi     TEXT        PRIMARY KEY,                  -- uuid / timestamp
    id_sotrudnika   TEXT        NOT NULL REFERENCES sotrudniki(id_sotrudnika),
    klient          TEXT        NOT NULL,                     -- clientName
    primary_type    TEXT,                                     -- ДК / КК1 / КК2 / КН / Х5 / DC ИНВ / Селфи ДК / Селфи КК / ДК+Детская
    aw              TEXT        NOT NULL DEFAULT 'OP',        -- тип встречи (OP)
    data_vstrechi   TEXT        NOT NULL,                     -- YYYY-MM-DD
    completed_at    TEXT        NOT NULL,                     -- ISO 8601
    status          TEXT        NOT NULL DEFAULT 'COMPLETED',
    f               REAL        NOT NULL DEFAULT 0,
    g               REAL        NOT NULL DEFAULT 0,
    h               REAL        NOT NULL DEFAULT 0,
    i               REAL        NOT NULL DEFAULT 0,
    j               REAL        NOT NULL DEFAULT 0,
    k               REAL        NOT NULL DEFAULT 0,
    l               REAL        NOT NULL DEFAULT 0,
    e               REAL        NOT NULL DEFAULT 0,           -- F+G+H+I+J+K+L
    o               REAL        NOT NULL DEFAULT 0,
    p               REAL        NOT NULL DEFAULT 0,
    aa              REAL        NOT NULL DEFAULT 0,           -- БС count
    ak              REAL        NOT NULL DEFAULT 0,
    av              REAL        NOT NULL DEFAULT 0,           -- итоговое вознаграждение (с НДФЛ)
    raw_json        TEXT        NOT NULL                       -- полный объект meeting
);

-- ------------------------------------------------------------
--  Индексы
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vstrechi_sotrudnik ON vstrechi(id_sotrudnika);
CREATE INDEX IF NOT EXISTS idx_vstrechi_data      ON vstrechi(data_vstrechi);
CREATE INDEX IF NOT EXISTS idx_vstrechi_primary   ON vstrechi(primary_type);
CREATE INDEX IF NOT EXISTS idx_sotrudniki_otdel   ON sotrudniki(otdel);

-- ------------------------------------------------------------
--  Представления (статистика)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS v_vstrechi_full;
CREATE VIEW v_vstrechi_full AS
    SELECT
        v.id_vstrechi,
        s.id_sotrudnika,
        s.fio,
        s.otdel,
        s.dolzhnost,
        v.klient,
        v.primary_type,
        v.data_vstrechi,
        v.completed_at,
        v.aa,
        v.av
    FROM vstrechi v
    JOIN sotrudniki s ON s.id_sotrudnika = v.id_sotrudnika;

DROP VIEW IF EXISTS v_stat_sotrudnik;
CREATE VIEW v_stat_sotrudnik AS
    SELECT
        s.id_sotrudnika,
        s.fio,
        s.otdel,
        COUNT(v.id_vstrechi)        AS vsego_vstrech,
        ROUND(COALESCE(SUM(v.av),0), 2) AS summa_voznagr,
        ROUND(COALESCE(SUM(v.aa),0), 2) AS summa_bs
    FROM sotrudniki s
    LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika
    GROUP BY s.id_sotrudnika;

DROP VIEW IF EXISTS v_stat_otdel;
CREATE VIEW v_stat_otdel AS
    SELECT
        s.otdel,
        COUNT(v.id_vstrechi)            AS vsego_vstrech,
        ROUND(COALESCE(SUM(v.av),0), 2) AS summa_voznagr
    FROM sotrudniki s
    LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika
    GROUP BY s.otdel
    ORDER BY vsego_vstrech DESC;
