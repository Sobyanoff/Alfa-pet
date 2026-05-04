-- ============================================================
--  Alfa Tracker — Schema
--  SQLite 3.x
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
--  Таблица сотрудников
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sotrudniki (
    id_sotrudnika   TEXT        PRIMARY KEY,   -- СОТР-001 ... СОТР-040
    fio             TEXT        NOT NULL,
    otdel           TEXT        NOT NULL,
    dolzhnost       TEXT        NOT NULL,
    email           TEXT        NOT NULL UNIQUE
);

-- ------------------------------------------------------------
--  Таблица встреч
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vstrechi (
    id_vstrechi         TEXT        PRIMARY KEY,   -- ВСТР-0001 ...
    id_sotrudnika       TEXT        NOT NULL REFERENCES sotrudniki(id_sotrudnika),
    klient              TEXT        NOT NULL,
    data_vstrechi       TEXT        NOT NULL,      -- ISO 8601: YYYY-MM-DD
    tip_vstrechi        TEXT        NOT NULL,
    kratkoe_opisanie    TEXT        NOT NULL,
    rezultat            TEXT        NOT NULL,
    ocenka              INTEGER     NOT NULL CHECK(ocenka BETWEEN 1 AND 10)
);

-- ------------------------------------------------------------
--  Индексы для быстрой аналитики
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vstrechi_sotrudnik ON vstrechi(id_sotrudnika);
CREATE INDEX IF NOT EXISTS idx_vstrechi_data      ON vstrechi(data_vstrechi);
CREATE INDEX IF NOT EXISTS idx_vstrechi_tip       ON vstrechi(tip_vstrechi);
CREATE INDEX IF NOT EXISTS idx_vstrechi_rezultat  ON vstrechi(rezultat);
CREATE INDEX IF NOT EXISTS idx_sotrudniki_otdel   ON sotrudniki(otdel);

-- ------------------------------------------------------------
--  Полезные представления (VIEW) для статистики
-- ------------------------------------------------------------

-- Все встречи с ФИО сотрудника
CREATE VIEW IF NOT EXISTS v_vstrechi_full AS
    SELECT
        v.id_vstrechi,
        s.fio,
        s.otdel,
        s.dolzhnost,
        v.klient,
        v.data_vstrechi,
        v.tip_vstrechi,
        v.kratkoe_opisanie,
        v.rezultat,
        v.ocenka
    FROM vstrechi v
    JOIN sotrudniki s ON s.id_sotrudnika = v.id_sotrudnika;

-- Кол-во встреч и средняя оценка по сотруднику
CREATE VIEW IF NOT EXISTS v_stat_sotrudnik AS
    SELECT
        s.id_sotrudnika,
        s.fio,
        s.otdel,
        COUNT(v.id_vstrechi)        AS vsego_vstrech,
        ROUND(AVG(v.ocenka), 1)     AS srednyaya_ocenka
    FROM sotrudniki s
    LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika
    GROUP BY s.id_sotrudnika;

-- Кол-во встреч по отделу
CREATE VIEW IF NOT EXISTS v_stat_otdel AS
    SELECT
        s.otdel,
        COUNT(v.id_vstrechi)        AS vsego_vstrech,
        ROUND(AVG(v.ocenka), 1)     AS srednyaya_ocenka
    FROM sotrudniki s
    LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika
    GROUP BY s.otdel
    ORDER BY vsego_vstrech DESC;

-- Топ продуктов по результатам встреч
CREATE VIEW IF NOT EXISTS v_stat_rezultaty AS
    SELECT
        rezultat,
        COUNT(*) AS kolichestvo
    FROM vstrechi
    GROUP BY rezultat
    ORDER BY kolichestvo DESC;
