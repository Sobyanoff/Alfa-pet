# Alfa Tracker — Backend Architecture

## Context
Single-file SPA (`public/index.html`, vanilla JS, PWA). Extending with auth + backend + persistent storage.
- ~50 employees, pre-created by admin
- Platform: mobile PWA
- Auth: OTP via corporate email + trusted device cookie
- DB: SQLite (`server/data.db`)
- No external dependencies beyond listed npm packages

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Existing `index.html` (vanilla JS) — minimal additions |
| Backend | Node.js 20+ / Fastify |
| DB | SQLite via `better-sqlite3` |
| Email | Nodemailer + corporate SMTP (or Resend free) |
| Auth | Email OTP + HttpOnly cookies + JWT (access/refresh) |
| Hosting | VPS + Caddy (auto TLS) + pm2 |

**npm deps:** `fastify`, `@fastify/cookie`, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/cors`, `better-sqlite3`, `nodemailer`, `argon2`, `exceljs`

---

## File Structure

```
e:\AI\Alfa-project\
├── public\
│   ├── index.html        ← existing (add login screen + fetch wrapper)
│   └── sw.js             ← new: Service Worker (~30 lines)
├── server\
│   ├── server.js         ← Fastify app entry
│   ├── db.js             ← better-sqlite3 + migrations
│   ├── auth.js           ← OTP, JWT, middleware
│   ├── mail.js           ← Nodemailer
│   ├── routes\
│   │   ├── auth.js
│   │   ├── meetings.js
│   │   └── admin.js
│   ├── seed.js           ← create users from CSV (full_name,email)
│   └── data.db           ← gitignored
├── backups\              ← gitignored, daily cron copies of data.db
├── .env                  ← gitignored
├── .env.example
└── package.json
```

---

## .env Variables

```
JWT_SECRET=<32+ random bytes>
JWT_ACCESS_TTL=900          # 15 min
JWT_REFRESH_TTL=2592000     # 30 days
DEVICE_TRUST_TTL=7776000    # 90 days
OTP_TTL=600                 # 10 min
OTP_MAX_ATTEMPTS=5
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
ADMIN_EMAILS=user1@corp.ru,user2@corp.ru   # role=admin on seed
PORT=3000
```

---

## DB Schema (SQLite)

```sql
CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name       TEXT NOT NULL,
  full_name_norm  TEXT NOT NULL UNIQUE,   -- lower+trim+ё→е+collapse spaces
  email           TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL DEFAULT 'employee',  -- 'employee'|'admin'
  is_active       INTEGER NOT NULL DEFAULT 1,
  token_version   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

CREATE TABLE devices (
  id              TEXT PRIMARY KEY,        -- UUID v4, issued by server
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ua_hash         TEXT NOT NULL,           -- SHA-256(User-Agent + Accept-Language)
  label           TEXT,                    -- "iPhone Safari"
  is_trusted      INTEGER NOT NULL DEFAULT 0,
  trusted_until   TEXT,
  first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_ip         TEXT,
  revoked_at      TEXT
);
CREATE INDEX idx_devices_user ON devices(user_id);

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,        -- UUID
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  refresh_hash    TEXT NOT NULL,           -- argon2(refresh_token)
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_device ON sessions(device_id);

CREATE TABLE otp_codes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  code_hash       TEXT NOT NULL,           -- argon2(6-digit code)
  expires_at      TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  consumed_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_otp_user_device ON otp_codes(user_id, device_id);

CREATE TABLE meetings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_name     TEXT,
  total_earnings  REAL NOT NULL,           -- meeting.AV
  total_e         REAL,                    -- meeting.E
  total_aa        REAL,                    -- meeting.AA (for БС tier)
  mode            TEXT,                    -- meeting.AW
  status          TEXT NOT NULL DEFAULT 'COMPLETED',
  data            TEXT NOT NULL,           -- full meeting JSON (all fields F..L, AA, AV, AW, ...)
  occurred_on     TEXT NOT NULL,           -- 'YYYY-MM-DD'
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_meetings_user_date ON meetings(user_id, occurred_on);
CREATE INDEX idx_meetings_user_created ON meetings(user_id, created_at DESC);

CREATE TABLE audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_id       TEXT,
  event           TEXT NOT NULL,  -- 'otp_request'|'otp_fail'|'login_success'|'logout'|'admin_view'
  ip              TEXT,
  meta            TEXT,           -- JSON
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
```

---

## Auth Flow

### Trusted device (returning user)
```
GET / → has cookies device_id + refresh_token
→ POST /api/auth/refresh
  1. verify refresh_hash (argon2)
  2. check devices: is_trusted=1, trusted_until > now, revoked_at IS NULL
  3. check users: is_active=1
  4. check jwt token_version matches users.token_version
  5. rotate: revoke old session, create new
  6. return access_token (JWT, 15min) in JSON
→ frontend stores access_token in memory (NOT localStorage)
```

### New device / expired session
```
Step 1: POST /api/auth/request-otp { full_name }
  1. normalize full_name (lower, trim, ё→е, collapse spaces)
  2. lookup users.full_name_norm
  3. always return 200 (anti-enumeration)
  4. rate-limit: 1 OTP/30s per user, 5/hour per IP
  5. generate/upsert device record (UUID → Set-Cookie device_id HttpOnly)
  6. generate 6-digit code, store argon2(code) in otp_codes (TTL 10min)
  7. send email: "Ваш код: XXXXXX, действует 10 минут."
  → 200 { masked_email: "i****v@corp.ru", expires_in: 600 }

Step 2: POST /api/auth/verify-otp { full_name, code, remember_device }
  1. find otp_codes by (user_id, device_id), expires_at > now, consumed_at IS NULL
  2. attempts++; if > 5 → 429
  3. argon2.verify(code) → if fail → 401
  4. consumed_at = now
  5. if remember_device: is_trusted=1, trusted_until = now + 90d
  6. create session, set cookies:
     device_id: HttpOnly; Secure; SameSite=Lax; Max-Age=31536000; Path=/
     refresh_token: HttpOnly; Secure; SameSite=Lax; Max-Age=2592000; Path=/api/auth
  → 200 { access_token, user: {id, full_name, role} }
```

### Logout
```
POST /api/auth/logout { all_devices?: bool }
→ revoke session(s), clear cookies → 204
```

### Dismiss employee
```
PATCH /api/admin/users/:id { is_active: false }
→ is_active=0, token_version++, revoke all sessions + devices
```

---

## JWT Payload

```json
{
  "sub": 42,
  "role": "employee",
  "tv": 3,
  "did": "device-uuid",
  "iat": ...,
  "exp": ...
}
```

Auth middleware checks: signature → exp → users.is_active → users.token_version == tv

---

## Token Storage

| Token | Storage | Reason |
|---|---|---|
| device_id | HttpOnly cookie, 1yr | No JS access |
| refresh_token | HttpOnly cookie, 30d, Path=/api/auth | Scope-limited |
| access_token | JS memory (`window.__token`) | Not localStorage (XSS protection) |

---

## Security Headers

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
```

---

## API Endpoints

### Auth
```
POST /api/auth/request-otp     { full_name }
POST /api/auth/verify-otp      { full_name, code, remember_device }
POST /api/auth/refresh         (cookies only)
POST /api/auth/logout          { all_devices? }
GET  /api/auth/me              → { id, full_name, role, masked_email }
```

### Meetings (own data only, JWT required)
```
GET    /api/meetings?from=&to=&limit=&offset=
POST   /api/meetings           { ...meeting object with all fields }
DELETE /api/meetings/:id
GET    /api/meetings/stats?period=today|month|year
```

### Admin (role=admin, JWT required)
```
GET    /api/admin/users
GET    /api/admin/users/:id/meetings?from=&to=
GET    /api/admin/users/:id/stats?period=
GET    /api/admin/stats?period=
GET    /api/admin/export.xlsx?from=&to=&user_id=
PATCH  /api/admin/users/:id              { is_active }
POST   /api/admin/users/:id/revoke-sessions
GET    /api/admin/audit?user_id=&from=&to=
```

### Health
```
GET /api/health → { ok: true }
```

---

## Frontend Changes to index.html

1. Add `screen = 'login'` with stages: `enter_name` → `enter_otp`
2. `render()` dispatches to `renderLogin` first if no access_token
3. `saveMeeting(m)` → `POST /api/meetings` (offline queue in localStorage, sync on reconnect)
4. `history` → loaded from `GET /api/meetings` on start (localStorage cache + background refresh)
5. `monthlyBSTotal()` → computed from loaded history (unchanged logic)
6. If `user.role === 'admin'` → show "Админка" button in home → `screen = 'admin'`
7. Fetch wrapper: auto-refresh access_token via `/api/auth/refresh` on 401
8. **meeting object structure unchanged** — all F..L, AA, AV, AW fields preserved; backend stores full JSON in `meetings.data`

---

## seed.js Logic

```
Input: CSV (full_name,email)
For each row:
  - full_name_norm = normalize(full_name)
  - role = ADMIN_EMAILS.includes(email) ? 'admin' : 'employee'
  - INSERT OR IGNORE INTO users
```

---

## Implementation Phases

1. **Backend core**: package.json, Fastify, db.js (schema + migrations), server.js skeleton
2. **Auth routes**: request-otp, verify-otp, refresh, logout, me + nodemailer + argon2
3. **seed.js**: import employees from CSV
4. **Meetings routes**: CRUD + stats
5. **Admin routes**: list, history, stats, export xlsx, revoke
6. **Frontend integration**: login screen, fetch wrapper, replace localStorage with API
7. **Admin UI**: conditional render in index.html for role=admin
8. **PWA**: sw.js, offline queue
9. **Deploy**: VPS + Caddy + pm2 + daily backup cron
