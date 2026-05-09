const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'alfa_tracker.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const PERSONS_PATH = path.join(__dirname, '..', 'persons.txt');

const BASE_META = [
  ['Массовый сегмент', 'Менеджер прямых продаж'],
  ['Массовый сегмент', 'Старший менеджер'],
  ['Розничный бизнес', 'Менеджер прямых продаж'],
  ['Премиум', 'Финансовый консультант'],
  ['Малый бизнес (МСБ)', 'Клиентский менеджер'],
  ['Массовый сегмент', 'Менеджер прямых продаж'],
  ['Зарплатные проекты', 'Клиентский менеджер'],
  ['Розничный бизнес', 'Старший менеджер'],
  ['Премиум', 'Финансовый консультант'],
  ['Массовый сегмент', 'Менеджер прямых продаж'],
  ['Малый бизнес (МСБ)', 'Клиентский менеджер'],
  ['Розничный бизнес', 'Менеджер прямых продаж'],
  ['Массовый сегмент', 'Руководитель группы продаж'],
  ['Премиум', 'Старший менеджер'],
  ['Зарплатные проекты', 'Менеджер прямых продаж'],
  ['Малый бизнес (МСБ)', 'Клиентский менеджер'],
  ['Массовый сегмент', 'Менеджер прямых продаж'],
  ['Розничный бизнес', 'Старший менеджер'],
  ['Массовый сегмент', 'Менеджер прямых продаж'],
  ['Премиум', 'Финансовый консультант'],
  ['Массовый сегмент', 'Менеджер прямых продаж'],
  ['Розничный бизнес', 'Старший менеджер'],
  ['Малый бизнес (МСБ)', 'Клиентский менеджер'],
  ['Зарплатные проекты', 'Менеджер прямых продаж'],
  ['Массовый сегмент', 'Менеджер прямых продаж'],
  ['Премиум', 'Старший менеджер'],
  ['Розничный бизнес', 'Менеджер прямых продаж'],
  ['Малый бизнес (МСБ)', 'Клиентский менеджер'],
  ['Массовый сегмент', 'Руководитель группы продаж'],
  ['Розничный бизнес', 'Менеджер прямых продаж'],
  ['Массовый сегмент', 'Старший менеджер'],
  ['Премиум', 'Финансовый консультант'],
  ['Розничный бизнес', 'Менеджер прямых продаж'],
  ['Малый бизнес (МСБ)', 'Клиентский менеджер'],
  ['Массовый сегмент', 'Менеджер прямых продаж'],
  ['Зарплатные проекты', 'Клиентский менеджер'],
  ['Премиум', 'Старший менеджер'],
  ['Розничный бизнес', 'Менеджер прямых продаж'],
  ['Массовый сегмент', 'Старший менеджер'],
  ['Малый бизнес (МСБ)', 'Руководитель группы продаж']
];

const MAP = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',
  о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',
  э:'e',ю:'yu',я:'ya'
};

function translit(s) {
  return String(s || '').toLowerCase().split('').map(c => MAP[c] !== undefined ? MAP[c] : c).join('').replace(/[^a-z0-9]/g, '');
}

function emailFromFio(fio) {
  const [familia, imya, otch] = fio.split(/\s+/);
  return `${translit(familia)}.${translit(imya).charAt(0)}${translit(otch).charAt(0)}@alfabank.ru`;
}

function loadPersons() {
  return fs.readFileSync(PERSONS_PATH, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function tableColumns(db, table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  } catch (_) {
    return [];
  }
}

function migrateUsersTable(db) {
  const cols = tableColumns(db, 'users');
  if (!cols.includes('password_hash') && !cols.includes('must_change')) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS users_new (
      id_sotrudnika TEXT PRIMARY KEY REFERENCES sotrudniki(id_sotrudnika),
      role TEXT NOT NULL DEFAULT 'employee',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO users_new (id_sotrudnika, role, created_at)
      SELECT id_sotrudnika, COALESCE(role, 'employee'), COALESCE(created_at, datetime('now')) FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
}

function ensureActiveColumn(db) {
  const cols = tableColumns(db, 'sotrudniki');
  if (!cols.length || cols.includes('active')) return;
  db.exec('ALTER TABLE sotrudniki ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

ensureActiveColumn(db);
migrateUsersTable(db);
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const persons = loadPersons();
const insertEmployee = db.prepare(`
  INSERT INTO sotrudniki (id_sotrudnika, fio, otdel, dolzhnost, email, active)
  VALUES (?, ?, ?, ?, ?, 1)
  ON CONFLICT(id_sotrudnika) DO UPDATE SET
    fio=excluded.fio,
    otdel=excluded.otdel,
    dolzhnost=excluded.dolzhnost,
    email=excluded.email,
    active=1
`);
const insertUser = db.prepare("INSERT OR IGNORE INTO users (id_sotrudnika, role) VALUES (?, 'employee')");

const tx = db.transaction(() => {
  persons.forEach((fio, idx) => {
    const id = `СОТР-${String(idx + 1).padStart(3, '0')}`;
    const [otdel, dolzhnost] = BASE_META[idx] || BASE_META[idx % BASE_META.length];
    insertEmployee.run(id, fio, otdel, dolzhnost, emailFromFio(fio));
    insertUser.run(id);
  });
  db.prepare("UPDATE users SET role='admin' WHERE id_sotrudnika='СОТР-002'").run();
});
tx();

const cntS = db.prepare('SELECT COUNT(*) AS c FROM sotrudniki WHERE active=1').get().c;
const cntU = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
console.log(`[init] schema applied`);
console.log(`[init] sotrudniki: ${cntS}, users: ${cntU}`);
console.log(`[init] admin: СОТР-002`);
console.log(`[init] DB ready at ${DB_PATH}`);
db.close();
