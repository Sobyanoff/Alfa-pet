// Alfa Tracker — Express + better-sqlite3 + JWT auth (httpOnly cookie)
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'alfa-tracker-dev-secret-change-me';
const TOKEN_TTL = '30d';
const DB_PATH = path.join(__dirname, 'alfa_tracker.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- Авторизация ----------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}
function authRequired(req, res, next) {
  const token = req.cookies && req.cookies.alfa_token;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}

// POST /api/login { fio, password }
app.post('/api/login', (req, res) => {
  const { fio, password } = req.body || {};
  if (!fio || !password) return res.status(400).json({ error: 'fio_password_required' });

  const row = db.prepare(`
    SELECT s.id_sotrudnika, s.fio, s.otdel, s.dolzhnost, u.password_hash, u.role, u.must_change
    FROM sotrudniki s JOIN users u ON u.id_sotrudnika = s.id_sotrudnika
    WHERE s.fio = ?
  `).get(fio.trim());

  if (!row) return res.status(401).json({ error: 'invalid_credentials' });
  if (!bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = signToken({ id: row.id_sotrudnika, fio: row.fio, role: row.role });
  res.cookie('alfa_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // включить true когда будет HTTPS
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({
    id: row.id_sotrudnika,
    fio: row.fio,
    otdel: row.otdel,
    dolzhnost: row.dolzhnost,
    role: row.role,
    must_change: !!row.must_change,
  });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('alfa_token');
  res.json({ ok: true });
});

// GET /api/me
app.get('/api/me', authRequired, (req, res) => {
  const row = db.prepare(`
    SELECT s.id_sotrudnika, s.fio, s.otdel, s.dolzhnost, u.role, u.must_change
    FROM sotrudniki s JOIN users u ON u.id_sotrudnika = s.id_sotrudnika
    WHERE s.id_sotrudnika = ?
  `).get(req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ ...row, must_change: !!row.must_change });
});

// POST /api/me/password { old_password, new_password }
app.post('/api/me/password', authRequired, (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'weak_password' });
  const u = db.prepare('SELECT password_hash FROM users WHERE id_sotrudnika = ?').get(req.user.id);
  if (!u || !bcrypt.compareSync(old_password || '', u.password_hash)) {
    return res.status(401).json({ error: 'invalid_old_password' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id_sotrudnika = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

// ---------- Встречи ----------

// GET /api/vstrechi — все встречи текущего сотрудника
app.get('/api/vstrechi', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT id_vstrechi, raw_json FROM vstrechi
    WHERE id_sotrudnika = ?
    ORDER BY completed_at DESC
  `).all(req.user.id);
  // Возвращаем массив meeting-объектов, как ожидает фронт
  const list = rows.map(r => {
    const m = JSON.parse(r.raw_json);
    m.id = r.id_vstrechi;
    return m;
  });
  res.json(list);
});

// POST /api/vstrechi — сохранить встречу. Тело: meeting object из index.html
app.post('/api/vstrechi', authRequired, (req, res) => {
  const m = req.body || {};
  if (!m.clientName) return res.status(400).json({ error: 'clientName_required' });

  const completedAt = m.completedAt || new Date().toISOString();
  const dataDate = completedAt.slice(0, 10);
  const id = m.id || `ВСТР-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const num = (v) => Number(v) || 0;

  db.prepare(`
    INSERT INTO vstrechi (
      id_vstrechi, id_sotrudnika, klient, primary_type, aw,
      data_vstrechi, completed_at, status,
      f, g, h, i, j, k, l, e, o, p, aa, ak, av, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.id, m.clientName, m.primaryType || null, m.AW || 'OP',
    dataDate, completedAt, m.status || 'COMPLETED',
    num(m.F), num(m.G), num(m.H), num(m.I), num(m.J), num(m.K), num(m.L),
    num(m.E), num(m.O), num(m.P), num(m.AA), num(m.AK), num(m.AV),
    JSON.stringify(m)
  );

  res.json({ id, ok: true });
});

// DELETE /api/vstrechi/:id
app.delete('/api/vstrechi/:id', authRequired, (req, res) => {
  const info = db.prepare(
    'DELETE FROM vstrechi WHERE id_vstrechi = ? AND id_sotrudnika = ?'
  ).run(req.params.id, req.user.id);
  res.json({ ok: true, deleted: info.changes });
});

// GET /api/stat — статистика по текущему сотруднику
app.get('/api/stat', authRequired, (req, res) => {
  const totals = db.prepare(`
    SELECT COUNT(*) AS vsego_vstrech,
           ROUND(COALESCE(SUM(av),0), 2) AS summa_voznagr,
           ROUND(COALESCE(SUM(aa),0), 2) AS summa_bs
    FROM vstrechi WHERE id_sotrudnika = ?
  `).get(req.user.id);

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const dayStat = db.prepare(`
    SELECT COUNT(*) AS vstrech, ROUND(COALESCE(SUM(av),0), 2) AS voznagr
    FROM vstrechi WHERE id_sotrudnika = ? AND data_vstrechi = ?
  `).get(req.user.id, today);

  const monthStat = db.prepare(`
    SELECT COUNT(*) AS vstrech,
           ROUND(COALESCE(SUM(av),0), 2) AS voznagr,
           ROUND(COALESCE(SUM(aa),0), 2) AS bs
    FROM vstrechi WHERE id_sotrudnika = ? AND substr(data_vstrechi,1,7) = ?
  `).get(req.user.id, month);

  res.json({ totals, today: dayStat, month: monthStat });
});

// GET /api/admin/vstrechi — все встречи (только admin)
app.get('/api/admin/vstrechi', authRequired, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT v.id_vstrechi, v.id_sotrudnika, s.fio, s.otdel,
           v.klient, v.primary_type, v.data_vstrechi, v.completed_at,
           v.aa, v.av
    FROM vstrechi v JOIN sotrudniki s ON s.id_sotrudnika = v.id_sotrudnika
    ORDER BY v.completed_at DESC
  `).all();
  res.json(rows);
});

// GET /api/sotrudniki — список ФИО для логин-формы (без auth)
app.get('/api/sotrudniki', (req, res) => {
  const rows = db.prepare('SELECT fio FROM sotrudniki ORDER BY fio').all();
  res.json(rows.map(r => r.fio));
});

// ---------- Статика ----------
app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`Alfa Tracker server running on http://localhost:${PORT}`);
});
