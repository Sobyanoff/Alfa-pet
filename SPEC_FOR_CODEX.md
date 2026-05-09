# Alfa Tracker — техническое задание для Codex

> **Тип задачи:** превратить однофайловый SPA `index.html` в клиент-серверное приложение с БД, ФИО-авторизацией, ролью админа и админ-панелью со статистикой и экспортом в Excel.
>
> **Хостинг:** Ubuntu 22.04 VPS, домен, HTTPS (nginx + Let's Encrypt), pm2.
>
> **Важно:** часть инфраструктуры уже была реализована в коммите `9fb0f73` (далее «base-commit») и откатена `b41e98e`. Используй её как стартовый каркас, переноси оттуда `server.js`, `database/schema.sql`, `database/init.js`, `nginx.conf`, `deploy.sh`, `package.json`. Доделай недостающее (Excel, админ-панель, миграция localStorage) и устрани несоответствия со спецификацией ниже.

---

## 1. Что НЕ трогать (доменная логика)

Эти куски `index.html` остаются как есть, иначе ломается расчёт денег:

- `newMeeting()` — модель встречи, поля по буквам Excel-колонок (`F`–`L`, `E`, `O`, `P`, `AA`, `AK`, `AV`, `AW`).
- `bsRate(totalBS)` — ставка БС от месячного объёма (270 / 430 / 570).
- `monthlyBSTotal()` — сумма `AA` за текущий месяц.
- `calcEarnings(m, forceBSRate?)` — итоговая формула × `0.87` (НДФЛ).
- Правило: `meeting.E = F+G+H+I+J+K+L`, пересчёт в `completeMtg()`.
- `AV` сохраняется только при `status='COMPLETED'`.
- Все экраны (`renderHome`, `renderMeeting`, `renderResult`, `renderOP`, `renderListAll`, `renderActTR`, `renderAfterApp`) и UI-стили (`.btn.on`, `.hero`, `.acc`, `.tier-bar`, `.preview`, `.modeswitch`, `.progress`).

Менять только **источник данных** (вместо `localStorage` — серверное API) и **добавлять** новые экраны/функции.

---

## 2. Стек

| Слой       | Технология                              |
| ---------- | --------------------------------------- |
| Backend    | Node.js 20 LTS + Express 4              |
| БД         | SQLite 3 через `better-sqlite3` v12     |
| Auth       | JWT в httpOnly-cookie (`alfa_token`, TTL 30 дней) |
| Excel      | `exceljs` v4 (полное форматирование)    |
| Static     | тот же Express отдаёт `index.html` и admin-bundle |
| Reverse-proxy | nginx + Let's Encrypt (certbot)      |
| Process    | pm2, автозапуск при ребуте              |
| Backup     | cron, `sqlite3 .backup` каждые 6 часов, retention 14 дней |

`package.json` (полный список):

```json
{
  "name": "alfa-tracker",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "init-db": "node database/init.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "better-sqlite3": "^12.2.0",
    "jsonwebtoken": "^9.0.2",
    "cookie-parser": "^1.4.6",
    "exceljs": "^4.4.0"
  }
}
```

`bcryptjs` **не нужен** — пароль есть только у админа и сравнивается с переменной окружения `ADMIN_PASSWORD`.

---

## 3. Структура файлов

```
alfa-project/
├── index.html              # SPA + встроенный экран администратора
├── server.js               # Express, API, JWT, статика
├── package.json
├── .env.example            # шаблон env-файла
├── .gitignore              # alfa_tracker.db*, node_modules, *.env
├── database/
│   ├── schema.sql          # CREATE TABLE / VIEW
│   ├── init.js             # сидирование 40 ФИО + назначение admin
│   └── migrations/         # будущие миграции (для версионирования схемы)
├── deploy/
│   ├── deploy.sh           # idempotent-скрипт для свежей VPS
│   ├── nginx.conf          # шаблон с __DOMAIN__-плейсхолдером
│   └── backup.sh           # дамп + ротация 14 дней
└── SPEC_FOR_CODEX.md
```

---

## 4. Схема БД (`database/schema.sql`)

Берётся из base-commit `9fb0f73` без изменений плюс две правки:

1. Удалить колонки `password_hash` и `must_change` из `users` — паролей у сотрудников нет.
2. Добавить таблицу `audit_log` для трекинга админских действий (опционально, но полезно).

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sotrudniki (
  id_sotrudnika  TEXT PRIMARY KEY,        -- СОТР-001..СОТР-041
  fio            TEXT NOT NULL UNIQUE,
  otdel          TEXT NOT NULL,
  dolzhnost      TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id_sotrudnika  TEXT PRIMARY KEY REFERENCES sotrudniki(id_sotrudnika),
  role           TEXT NOT NULL DEFAULT 'employee',  -- employee | admin
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vstrechi (
  id_vstrechi    TEXT PRIMARY KEY,
  id_sotrudnika  TEXT NOT NULL REFERENCES sotrudniki(id_sotrudnika),
  klient         TEXT NOT NULL,
  primary_type   TEXT,                    -- ДК / КК1 / КК2 / КН / Х5 / DC ИНВ / Селфи ДК / Селфи КК / ДК+Детская
  aw             TEXT NOT NULL DEFAULT 'OP',
  data_vstrechi  TEXT NOT NULL,           -- YYYY-MM-DD
  completed_at   TEXT NOT NULL,           -- ISO 8601
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
  av REAL NOT NULL DEFAULT 0,             -- итоговое вознаграждение (с НДФЛ)
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vstrechi_sotrudnik ON vstrechi(id_sotrudnika);
CREATE INDEX IF NOT EXISTS idx_vstrechi_data      ON vstrechi(data_vstrechi);
CREATE INDEX IF NOT EXISTS idx_vstrechi_primary   ON vstrechi(primary_type);
CREATE INDEX IF NOT EXISTS idx_vstrechi_completed ON vstrechi(completed_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id TEXT,
  action TEXT NOT NULL,                   -- 'login', 'export_xlsx', 'delete_meeting', ...
  payload TEXT
);

-- Представления для статистики
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
```

---

## 5. Сидирование (`database/init.js`)

- Идемпотентно (`INSERT OR IGNORE`).
- Применяет `schema.sql`, затем вставляет 41 сотрудника (см. `persons.txt` или список из base-commit `init.js`).
- Email = `transliterate(familia).first_letter_of_imya + first_letter_of_otch + '@alfabank.ru'`.
- Назначить админом: `СОТР-002` (Бязров Сослан Эльбрусович) — `UPDATE users SET role='admin' WHERE id_sotrudnika='СОТР-002'`.
- Админский пароль **в БД не хранится** — он только в `process.env.ADMIN_PASSWORD` (default `'alfa2026'`).

Список 41 ФИО — `persons.txt` в корне репозитория. Отделы и должности взять из base-commit `init.js` (Массовый сегмент / Розничный бизнес / Премиум / Малый бизнес (МСБ) / Зарплатные проекты).

---

## 6. Авторизация

### Правила

- **Сотрудник:** логин по ФИО, без пароля. ФИО должно быть в таблице `sotrudniki`.
- **Админ:** логин по ФИО + пароль (сравнение с `ADMIN_PASSWORD`).
- При успехе сервер выдаёт JWT в httpOnly-cookie `alfa_token` (TTL 30 дней).
- На любой защищённый endpoint — middleware `authRequired`. Для `/api/admin/*` — дополнительно `adminOnly`.

### Эндпойнты

```
GET  /api/sotrudniki      → 200 [{fio}, ...]                       (public, для логин-формы)
POST /api/login           body: { fio, password? }
                          → 200 { id, fio, otdel, dolzhnost, role }
                          → 401 { error: 'unknown_employee'|'password_required'|'invalid_password' }
POST /api/logout          → 200 { ok: true }
GET  /api/me              → 200 { id, fio, role, otdel, dolzhnost } (auth)
```

JWT payload: `{ id, fio, role }`. Секрет — `JWT_SECRET` env (генерируется один раз в `deploy.sh`).

---

## 7. Эндпойнты для встреч (сотрудник)

```
GET    /api/vstrechi              → 200 [meeting, ...]              # все свои
POST   /api/vstrechi              body: meeting object
                                  → 200 { id, ok: true }
DELETE /api/vstrechi/:id          → 200 { ok: true, deleted: 1 }
GET    /api/stat                  → 200 { totals, today, month }
```

`meeting` сохраняется в БД дважды:
1. Распакованные поля (`f`, `g`, ..., `av`) — для агрегаций в SQL.
2. Полный JSON в `raw_json` — для воссоздания объекта на клиенте (frontend получает массив meeting-объектов, как раньше из `localStorage`).

Поле `data_vstrechi` = `completedAt.slice(0, 10)`.

`/api/stat` возвращает:
```js
{
  totals: { vsego_vstrech, summa_voznagr, summa_bs },
  today:  { vstrech, voznagr },
  month:  { vstrech, voznagr, bs }
}
```

---

## 8. Эндпойнты админ-панели

Все требуют `authRequired + adminOnly`.

```
GET  /api/admin/sotrudniki              → 200 [{id, fio, otdel, dolzhnost, vsego_vstrech, summa_voznagr, summa_bs}, ...]
                                          (data из v_stat_sotrudnik + фильтры query: ?from=YYYY-MM-DD&to=YYYY-MM-DD)
GET  /api/admin/sotrudniki/:id          → 200 { sotrudnik, vstrechi: [meeting...] }
GET  /api/admin/vstrechi                query: ?from&to&fio&primary_type
                                        → 200 [vstrecha_full, ...]
GET  /api/admin/stat/otdel              → 200 [{otdel, vsego, voznagr}, ...]
GET  /api/admin/export/xlsx             query: ?from&to&fio_id?
                                        → 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
                                          (см. раздел Excel)
DELETE /api/admin/vstrechi/:id          → 200 { ok: true }       # принудительное удаление любой встречи
```

---

## 9. Excel-экспорт (`exceljs`)

Файл: `alfa-tracker_<YYYY-MM-DD>_<HHmm>.xlsx`. Имя задаёт сервер в заголовке `Content-Disposition`.

### Листы

1. **«Сводка»** — таблица: `Отдел | ФИО | Должность | Встреч за период | Сумма вознаграждения | Сумма БС`. Итоговая строка снизу.
2. **«По отделам»** — `Отдел | Встреч | Сумма вознаграждения`. Сортировка по убыванию вознаграждения.
3. **«Детализация»** — все встречи за период, по строке на встречу: `Дата | ФИО | Отдел | Клиент | Тип (primary_type) | Тип встречи (AW) | F | G | H | I | J | K | L | E | O | P | AA | AK | AV (итог)`.
4. **Лист на каждого сотрудника** (опционально, при `?fio_id=`) — те же колонки, что в «Детализации», только по одному ФИО. Имя листа — фамилия + первая буква имени, не длиннее 31 символа (ограничение Excel).

### Форматирование (обязательное)

- Заголовок: жирный, фон Alfa Red `#EF3124`, белый текст, `frozen row`.
- Числовые колонки (`F..AV`): формат `# ##0.00 ₽` для денежных, `# ##0` для счётчиков.
- Дата: формат `dd.mm.yyyy`.
- Авто-ширина колонок (`worksheet.columns.forEach(c => c.width = ...)`, опираясь на `header.length` и max длину значений).
- Строка итогов: жирная, фон `#F7F7FA`.
- Фильтр (autoFilter) на заголовках.

### Логирование

Каждый успешный экспорт пишется в `audit_log`: `action='export_xlsx'`, `payload=JSON.stringify({from, to, fio_id})`.

---

## 10. Изменения в `index.html`

### 10.1. Новый слой данных (`api.js`-обёртка прямо в `<script>`)

Добавить в начале скрипта:

```js
const API = (typeof window !== 'undefined' && window.location.protocol !== 'file:')
  ? window.location.origin
  : 'http://localhost:3000';

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { currentUser = null; render(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(`api_${res.status}`);
  return res.json();
}
```

### 10.2. Заменить работу с `localStorage`

- `history` теперь подгружается из `GET /api/vstrechi` при логине и после каждого `completeMtg()` — `await apiFetch('/api/vstrechi', { method: 'POST', body: m })`, затем `history = await apiFetch('/api/vstrechi')`.
- Удаление встречи из истории: `DELETE /api/vstrechi/:id` → перерисовать.
- Ключ `alfa_h` в `localStorage` оставить **только для миграции** (см. 10.5). После успешной миграции — `localStorage.removeItem('alfa_h')`.
- Ключ `alfa_mode` остаётся в `localStorage` — это пользовательская настройка.

### 10.3. Экран `LOGIN`

Добавить новое значение `screen='login'` (по умолчанию, если `currentUser === null`). Render:

```
┌─ ALFA TRACKER ──────────────────┐
│ Выберите ФИО:                   │
│ [combobox с подсказками]        │
│                                  │
│ [пароль — показывается только    │
│  если выбран админ]              │
│                                  │
│ [Войти]                          │
└──────────────────────────────────┘
```

- Список ФИО — `GET /api/sotrudniki` (public).
- Поле «пароль» появляется только когда выбранное ФИО == админское (или просто всегда показывать при чек-боксе «вход как администратор» — на твой выбор; рекомендую: input "пароль (для админа)" с placeholder, сотрудники игнорируют).
- При успехе — сохранить `currentUser = {id, fio, role}` в памяти (не в `localStorage`) и `render()`.

### 10.4. Экран `ADMIN`

Доступен только если `currentUser.role === 'admin'`. На главной (hero) — кнопка `🛡 Админ-панель`. По клику `screen='admin'`.

Layout:

```
┌─ Админ-панель ───────────────────────────────────┐
│ Период: [from] [to]   [Применить] [Экспорт XLSX] │
├──────────────────────────────────────────────────┤
│ Сводка по отделам (бар-чарт через CSS divs)      │
├──────────────────────────────────────────────────┤
│ Таблица сотрудников:                              │
│ ФИО │ Отдел │ Встреч │ Σ вознагр. │ Σ БС │ [→]   │
│ ...                                               │
├──────────────────────────────────────────────────┤
│ При клике на строку → раскрывается список встреч │
│ этого сотрудника (modal или inline accordion)    │
└──────────────────────────────────────────────────┘
```

Источники данных:
- `GET /api/admin/sotrudniki?from=&to=` — таблица.
- `GET /api/admin/stat/otdel?from=&to=` — бар-чарт по отделам.
- `GET /api/admin/sotrudniki/:id?from=&to=` — детализация.
- Кнопка «Экспорт XLSX» делает `window.location = '/api/admin/export/xlsx?from=...&to=...'` (cookie-аутентификация, скачивание как файл).

UI следовать существующему дизайн-коду (палитра `#EF3124`/`#0A0A0F`/`#F7F7FA`, `--r-card: 18px`, `.btn`, `.acc`).

### 10.5. Миграция `localStorage` → сервер

При первом успешном логине **на любом устройстве**:

```js
async function migrateLocalIfNeeded() {
  const local = JSON.parse(localStorage.getItem('alfa_h') || '[]');
  if (!local.length) return;

  const server = await apiFetch('/api/vstrechi');
  const serverIds = new Set(server.map(m => m.id));
  const toUpload = local.filter(m => !serverIds.has(m.id));
  if (!toUpload.length) {
    localStorage.removeItem('alfa_h');
    return;
  }

  const ok = confirm(`Найдено ${toUpload.length} встреч в этом браузере. Перенести на сервер?`);
  if (!ok) return;

  for (const m of toUpload) {
    try { await apiFetch('/api/vstrechi', { method: 'POST', body: m }); }
    catch (e) { console.warn('migration: skipped', m.id, e); }
  }
  localStorage.setItem('alfa_h_migrated_at', new Date().toISOString());
  localStorage.removeItem('alfa_h');
}
```

Вызывать в `onLoginSuccess()` сразу после получения `currentUser`. Сервер обязан принимать чужие `id_vstrechi` (как ID пишется тот, что прислал клиент — см. `POST /api/vstrechi` в base-commit, поле `m.id || generateId()`).

---

## 11. Деплой (`deploy/deploy.sh`)

Берётся из base-commit `9fb0f73:deploy.sh` без существенных правок. Что обеспечивает:

- Ставит Node.js 20, nginx, pm2, certbot, ufw, unattended-upgrades.
- Создаёт пользователя `alfa`, кладёт код в `/opt/alfa-tracker`, БД в `/var/lib/alfa-tracker/alfa.db`.
- Генерит `/etc/alfa-tracker.env` (`JWT_SECRET` через `openssl rand -hex 32`, `ADMIN_PASSWORD=alfa2026`, `DB_PATH=/var/lib/alfa-tracker/alfa.db`, `NODE_ENV=production`, `PORT=3000`).
- Подкладывает `nginx.conf` в `/etc/nginx/sites-available/alfa-tracker`, заменяет `__DOMAIN__`.
- Запускает `npm ci --production`, `npm run init-db`, `pm2 start server.js --name alfa-tracker`, `pm2 save`, `pm2 startup`.
- `certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --non-interactive`.
- Cron: `0 */6 * * * /opt/alfa-tracker/deploy/backup.sh` (sqlite3 .backup → `/var/backups/alfa/alfa-YYYYMMDD-HHmm.db`, retention 14 дней через `find -mtime +14 -delete`).
- Идемпотентен: можно гонять повторно для обновления (`git pull && npm ci && pm2 reload alfa-tracker`).

Запуск:
```bash
DOMAIN=tracker.example.com REPO_URL=https://github.com/you/alfa.git EMAIL=admin@example.com bash deploy.sh
```

`nginx.conf` — обратный прокси на `127.0.0.1:3000`, certbot допишет 443-блок и редирект.

---

## 12. Переменные окружения (`.env.example`)

```
NODE_ENV=production
PORT=3000
JWT_SECRET=замени-на-случайную-строку-64-символа
ADMIN_PASSWORD=alfa2026
DB_PATH=/var/lib/alfa-tracker/alfa.db
```

`.gitignore` обязан содержать: `*.env`, `alfa_tracker.db*`, `node_modules/`, `package-lock.json` (опционально).

---

## 13. Acceptance criteria (чек-лист готовности)

Codex считает задачу выполненной, когда **все** пункты ниже воспроизводятся вручную:

### Backend
- [ ] `npm ci && npm run init-db && npm start` поднимает сервер на `:3000`.
- [ ] `GET /api/health` → 200.
- [ ] `GET /api/sotrudniki` без auth → массив из 41 ФИО.
- [ ] `POST /api/login {fio: "Бязров Сослан Эльбрусович"}` без пароля → 401 `password_required`.
- [ ] `POST /api/login {fio: "Бязров Сослан Эльбрусович", password: "alfa2026"}` → 200 + cookie.
- [ ] `POST /api/login {fio: "Бабин Георгий Владимирович"}` без пароля → 200 + cookie (employee).
- [ ] `POST /api/login {fio: "Несуществующий Иван"}` → 401 `unknown_employee`.
- [ ] Сотрудник `POST /api/vstrechi` → запись появляется только в его `GET /api/vstrechi`.
- [ ] Сотрудник `GET /api/admin/*` → 403 `forbidden`.
- [ ] Админ `GET /api/admin/sotrudniki` → массив из 41 строки с агрегатами.
- [ ] `GET /api/admin/export/xlsx?from=2026-05-01&to=2026-05-31` качает корректный `.xlsx` с 3+ листами и форматированием.

### Frontend (`index.html`)
- [ ] Без cookie экран = `LOGIN`. Главный/Meeting-экраны не открываются.
- [ ] После логина сотрудника главный экран показывает hero с цифрой за сегодня. Цифры берутся из `/api/stat`, не из `localStorage`.
- [ ] Создание встречи (`completeMtg`) делает `POST /api/vstrechi` и затем перезагружает историю из `/api/vstrechi`.
- [ ] Удаление встречи в истории — `DELETE /api/vstrechi/:id`.
- [ ] Если в `localStorage.alfa_h` есть данные — при первом логине показывается prompt и встречи переносятся на сервер, после чего ключ удаляется.
- [ ] У админа на главном экране есть кнопка `🛡 Админ-панель`, открывающая отдельный screen.
- [ ] Админ-панель: фильтр по дате, таблица сотрудников, бар-чарт по отделам, кнопка экспорта XLSX, drilldown по сотруднику.
- [ ] Logout (кнопка в шапке) → `POST /api/logout` → возврат на `LOGIN`.
- [ ] Доменная логика (расчёт `AV`, ставки БС, прогресс-бар) даёт те же значения, что и до изменений (тестировать на одной и той же встрече).

### Деплой
- [ ] `bash deploy/deploy.sh` на свежем Ubuntu 22.04 поднимает приложение под HTTPS.
- [ ] Повторный запуск `deploy.sh` не ломает БД и сохраняет данные.
- [ ] `pm2 list` показывает `alfa-tracker | online`.
- [ ] `curl https://$DOMAIN/api/health` → 200.
- [ ] Cron-бэкап создаёт файл в `/var/backups/alfa/`, старше 14 дней удаляются.

---

## 14. Что **не** делать

- Не вводить bcrypt и серверный список паролей для сотрудников — авторизация только по ФИО (требование заказчика, безопасность не критична).
- Не менять схему `meeting`-объекта — она уже намертво связана с UI и формулой `calcEarnings`.
- Не выносить компоненты в отдельные `.js`-файлы — текущий стиль проекта одно-файловый, оставить.
- Не подключать сторонних UI-библиотек (Bootstrap, Tailwind и т.п.) — есть собственная дизайн-система в `<style>`.
- Не использовать ORM (Prisma/Sequelize). Только raw-SQL через `better-sqlite3` — он синхронный, быстрый и совместим с резервными копиями.
- Не добавлять двойную авторизацию, OTP, refresh-tokens — JWT в cookie с TTL 30 дней достаточно.

---

## 15. Подсказка для Codex по работе с историей репо

В git уже есть готовые черновики тех файлов, которые нужно создать. Чтобы не писать с нуля:

```bash
git show 9fb0f73:server.js          > server.js
git show 9fb0f73:database/schema.sql > database/schema.sql
git show 9fb0f73:database/init.js    > database/init.js
git show 9fb0f73:package.json        > package.json
git show 9fb0f73:nginx.conf          > deploy/nginx.conf
git show 9fb0f73:deploy.sh           > deploy/deploy.sh
```

Затем привести их в соответствие со спецификацией:
- В `schema.sql` убрать `password_hash`/`must_change` из `users`, добавить `audit_log`.
- В `server.js` добавить `/api/admin/export/xlsx`, `/api/admin/stat/otdel`, `audit_log`-запись на экспорт.
- В `init.js` пересчитать на 41 ФИО (см. `persons.txt`), убрать `bcrypt`-импорт.
- В `package.json` убрать `bcryptjs`, добавить `exceljs`.

После этого править `index.html` по разделу 10 этого спека.
