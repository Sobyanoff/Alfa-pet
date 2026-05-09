const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'alfa-tracker-dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'alfa2026';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'alfa_tracker.db');
const TOKEN_TTL = '30d';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  };
}

function authRequired(req, res, next) {
  const token = req.cookies && req.cookies.alfa_token;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    res.status(401).json({ error: 'invalid_token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}

function audit(actorId, action, payload) {
  try {
    db.prepare('INSERT INTO audit_log (actor_id, action, payload) VALUES (?, ?, ?)').run(
      actorId || null,
      action,
      payload ? JSON.stringify(payload) : null
    );
  } catch (_) {}
}

function currentUserById(id) {
  return db.prepare(`
    SELECT s.id_sotrudnika AS id, s.fio, s.otdel, s.dolzhnost, COALESCE(u.role, 'employee') AS role
    FROM sotrudniki s
    LEFT JOIN users u ON u.id_sotrudnika = s.id_sotrudnika
    WHERE s.id_sotrudnika = ? AND COALESCE(s.active, 1) = 1
  `).get(id);
}

function normalizeFio(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function publicEmployee(row) {
  return {
    id: row.id_sotrudnika || row.id,
    fio: row.fio,
    otdel: row.otdel,
    dolzhnost: row.dolzhnost,
    role: row.role || 'employee'
  };
}

function parseRuDate(s) {
  const m = String(s || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function meetingDate(m, completedAt) {
  return String(completedAt || '').slice(0, 10) || parseRuDate(m.date) || new Date().toISOString().slice(0, 10);
}

function completedAtFor(m) {
  if (m.completedAt) return String(m.completedAt);
  if (typeof m.id === 'number' || /^\d+$/.test(String(m.id || ''))) {
    const d = new Date(Number(m.id));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const ru = parseRuDate(m.date);
  if (ru) return `${ru}T00:00:00.000Z`;
  return new Date().toISOString();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function meetingId(m) {
  return String(m.id || `ВСТР-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
}

function normalizeMeeting(m, userId) {
  const completedAt = completedAtFor(m);
  const id = meetingId(m);
  const raw = { ...m, id, completedAt, AW: m.AW || 'COMPLETED', status: m.status || 'COMPLETED' };
  return {
    id,
    userId,
    klient: String(m.clientName || m.klient || 'Без имени клиента'),
    primaryType: m.primaryType || m.primary_type || null,
    aw: raw.AW,
    data: meetingDate(m, completedAt),
    completedAt,
    status: raw.status,
    f: num(m.F), g: num(m.G), h: num(m.H), i: num(m.I), j: num(m.J), k: num(m.K), l: num(m.L),
    e: num(m.E), o: num(m.O), p: num(m.P), aa: num(m.AA), ak: num(m.AK), av: num(m.AV),
    raw
  };
}

const insertMeeting = db.prepare(`
  INSERT INTO vstrechi (
    id_vstrechi, id_sotrudnika, klient, primary_type, aw,
    data_vstrechi, completed_at, status,
    f, g, h, i, j, k, l, e, o, p, aa, ak, av, raw_json
  ) VALUES (
    @id, @userId, @klient, @primaryType, @aw,
    @data, @completedAt, @status,
    @f, @g, @h, @i, @j, @k, @l, @e, @o, @p, @aa, @ak, @av, @rawJson
  )
  ON CONFLICT(id_vstrechi) DO UPDATE SET
    id_sotrudnika=excluded.id_sotrudnika,
    klient=excluded.klient,
    primary_type=excluded.primary_type,
    aw=excluded.aw,
    data_vstrechi=excluded.data_vstrechi,
    completed_at=excluded.completed_at,
    status=excluded.status,
    f=excluded.f, g=excluded.g, h=excluded.h, i=excluded.i, j=excluded.j, k=excluded.k, l=excluded.l,
    e=excluded.e, o=excluded.o, p=excluded.p, aa=excluded.aa, ak=excluded.ak, av=excluded.av,
    raw_json=excluded.raw_json
`);

function saveMeeting(m, userId) {
  const row = normalizeMeeting(m, userId);
  insertMeeting.run({ ...row, rawJson: JSON.stringify(row.raw) });
  return row.id;
}

function dateWhere(alias, query, params) {
  const parts = [];
  if (query.from) {
    parts.push(`${alias}.data_vstrechi >= @from`);
    params.from = query.from;
  }
  if (query.to) {
    parts.push(`${alias}.data_vstrechi <= @to`);
    params.to = query.to;
  }
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

function meetingFromRow(row) {
  const raw = JSON.parse(row.raw_json);
  raw.id = row.id_vstrechi;
  raw.fio = row.fio;
  raw.otdel = row.otdel;
  raw.dolzhnost = row.dolzhnost;
  raw.data_vstrechi = row.data_vstrechi;
  return raw;
}

app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, ts: new Date().toISOString() });
  } catch (_) {
    res.status(500).json({ ok: false, error: 'db_unavailable' });
  }
});

app.get('/api/sotrudniki', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id_sotrudnika, s.fio, s.otdel, s.dolzhnost, COALESCE(u.role, 'employee') AS role
    FROM sotrudniki s
    LEFT JOIN users u ON u.id_sotrudnika = s.id_sotrudnika
    WHERE COALESCE(s.active, 1) = 1
    ORDER BY s.fio
  `).all();
  res.json(rows.map(publicEmployee));
});

app.post('/api/login', (req, res) => {
  const id = String((req.body && req.body.id) || '').trim();
  const fio = String((req.body && req.body.fio) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!fio && !id) return res.status(400).json({ error: 'fio_required' });

  let row = null;
  const selectSql = `
    SELECT s.id_sotrudnika AS id, s.fio, s.otdel, s.dolzhnost, COALESCE(u.role, 'employee') AS role
    FROM sotrudniki s
    LEFT JOIN users u ON u.id_sotrudnika = s.id_sotrudnika
    WHERE COALESCE(s.active, 1) = 1
  `;
  if (id) row = db.prepare(`${selectSql} AND s.id_sotrudnika = ?`).get(id);
  if (!row && fio) row = db.prepare(`${selectSql} AND s.fio = ?`).get(fio);
  if (!row && fio) {
    const needle = normalizeFio(fio);
    const all = db.prepare(`${selectSql} ORDER BY s.fio`).all();
    const matches = all.filter(r => normalizeFio(r.fio) === needle);
    if (matches.length === 1) row = matches[0];
    else if (!matches.length) {
      const fuzzy = all.filter(r => normalizeFio(r.fio).includes(needle) || needle.includes(normalizeFio(r.fio))).slice(0, 6);
      if (fuzzy.length === 1) row = fuzzy[0];
      else if (fuzzy.length > 1) return res.status(401).json({ error: 'ambiguous_employee', suggestions: fuzzy.map(publicEmployee) });
    }
  }
  if (!row) return res.status(401).json({ error: 'unknown_employee' });
  if (row.role === 'admin') {
    if (!password) return res.status(401).json({ error: 'password_required' });
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'invalid_password' });
  }

  const token = signToken({ id: row.id, fio: row.fio, role: row.role });
  res.cookie('alfa_token', token, cookieOptions());
  audit(row.id, 'login', { role: row.role });
  res.json(row);
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('alfa_token', { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});

app.get('/api/me', authRequired, (req, res) => {
  const row = currentUserById(req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

app.get('/api/vstrechi', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT id_vstrechi, raw_json
    FROM vstrechi
    WHERE id_sotrudnika = ?
    ORDER BY completed_at DESC
  `).all(req.user.id);
  res.json(rows.map(r => {
    const m = JSON.parse(r.raw_json);
    m.id = r.id_vstrechi;
    return m;
  }));
});

app.post('/api/vstrechi', authRequired, (req, res) => {
  const id = saveMeeting(req.body || {}, req.user.id);
  res.json({ id, ok: true });
});

app.delete('/api/vstrechi/:id', authRequired, (req, res) => {
  const info = db.prepare('DELETE FROM vstrechi WHERE id_vstrechi = ? AND id_sotrudnika = ?').run(req.params.id, req.user.id);
  res.json({ ok: true, deleted: info.changes });
});

app.get('/api/stat', authRequired, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const totals = db.prepare(`
    SELECT COUNT(*) AS vsego_vstrech, ROUND(COALESCE(SUM(av),0), 2) AS summa_voznagr, ROUND(COALESCE(SUM(aa),0), 2) AS summa_bs
    FROM vstrechi WHERE id_sotrudnika = ?
  `).get(req.user.id);
  const dayStat = db.prepare(`
    SELECT COUNT(*) AS vstrech, ROUND(COALESCE(SUM(av),0), 2) AS voznagr
    FROM vstrechi WHERE id_sotrudnika = ? AND data_vstrechi = ?
  `).get(req.user.id, today);
  const monthStat = db.prepare(`
    SELECT COUNT(*) AS vstrech, ROUND(COALESCE(SUM(av),0), 2) AS voznagr, ROUND(COALESCE(SUM(aa),0), 2) AS bs
    FROM vstrechi WHERE id_sotrudnika = ? AND substr(data_vstrechi,1,7) = ?
  `).get(req.user.id, month);
  res.json({ totals, today: dayStat, month: monthStat });
});

app.get('/api/admin/sotrudniki', authRequired, adminOnly, (req, res) => {
  const params = {};
  const where = dateWhere('v', req.query, params);
  const rows = db.prepare(`
    SELECT s.id_sotrudnika AS id, s.fio, s.otdel, s.dolzhnost,
           COUNT(v.id_vstrechi) AS vsego_vstrech,
           ROUND(COALESCE(SUM(v.av),0), 2) AS summa_voznagr,
           ROUND(COALESCE(SUM(v.aa),0), 2) AS summa_bs
    FROM sotrudniki s
    LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika ${where}
    WHERE COALESCE(s.active, 1) = 1
    GROUP BY s.id_sotrudnika
    ORDER BY summa_voznagr DESC, s.fio
  `).all(params);
  res.json(rows);
});

app.get('/api/admin/sotrudniki/:id', authRequired, adminOnly, (req, res) => {
  const sotrudnik = db.prepare(`
    SELECT id_sotrudnika AS id, fio, otdel, dolzhnost, email
    FROM sotrudniki WHERE id_sotrudnika = ?
  `).get(req.params.id);
  if (!sotrudnik) return res.status(404).json({ error: 'not_found' });
  const params = { id: req.params.id };
  const where = dateWhere('v', req.query, params);
  const rows = db.prepare(`
    SELECT v.*, s.fio, s.otdel, s.dolzhnost
    FROM vstrechi v
    JOIN sotrudniki s ON s.id_sotrudnika = v.id_sotrudnika
    WHERE v.id_sotrudnika = @id ${where}
    ORDER BY v.completed_at DESC
  `).all(params);
  res.json({ sotrudnik, vstrechi: rows.map(meetingFromRow) });
});

app.get('/api/admin/vstrechi', authRequired, adminOnly, (req, res) => {
  const params = {};
  const parts = ['1=1'];
  if (req.query.from) { parts.push('v.data_vstrechi >= @from'); params.from = req.query.from; }
  if (req.query.to) { parts.push('v.data_vstrechi <= @to'); params.to = req.query.to; }
  if (req.query.fio) { parts.push('s.fio LIKE @fio'); params.fio = `%${req.query.fio}%`; }
  if (req.query.primary_type) { parts.push('v.primary_type = @primary_type'); params.primary_type = req.query.primary_type; }
  const rows = db.prepare(`
    SELECT v.*, s.fio, s.otdel, s.dolzhnost
    FROM vstrechi v
    JOIN sotrudniki s ON s.id_sotrudnika = v.id_sotrudnika
    WHERE ${parts.join(' AND ')}
    ORDER BY v.completed_at DESC
  `).all(params);
  res.json(rows.map(meetingFromRow));
});

app.get('/api/admin/stat/otdel', authRequired, adminOnly, (req, res) => {
  const params = {};
  const where = dateWhere('v', req.query, params);
  const rows = db.prepare(`
    SELECT s.otdel,
           COUNT(v.id_vstrechi) AS vsego,
           ROUND(COALESCE(SUM(v.av),0), 2) AS voznagr
    FROM sotrudniki s
    LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika ${where}
    WHERE COALESCE(s.active, 1) = 1
    GROUP BY s.otdel
    ORDER BY voznagr DESC
  `).all(params);
  res.json(rows);
});

app.delete('/api/admin/vstrechi/:id', authRequired, adminOnly, (req, res) => {
  const info = db.prepare('DELETE FROM vstrechi WHERE id_vstrechi = ?').run(req.params.id);
  audit(req.user.id, 'delete_meeting', { id: req.params.id, deleted: info.changes });
  res.json({ ok: true, deleted: info.changes });
});

function detailRows(query) {
  const params = {};
  const parts = ['1=1'];
  if (query.from) { parts.push('v.data_vstrechi >= @from'); params.from = query.from; }
  if (query.to) { parts.push('v.data_vstrechi <= @to'); params.to = query.to; }
  if (query.fio_id) { parts.push('v.id_sotrudnika = @fio_id'); params.fio_id = query.fio_id; }
  return db.prepare(`
    SELECT v.*, s.fio, s.otdel, s.dolzhnost
    FROM vstrechi v
    JOIN sotrudniki s ON s.id_sotrudnika = v.id_sotrudnika
    WHERE ${parts.join(' AND ')}
    ORDER BY v.data_vstrechi, s.fio
  `).all(params);
}

function setWorksheetStyle(ws, moneyCols = []) {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF3124' } };
    cell.alignment = { vertical: 'middle' };
  });
  moneyCols.forEach(i => ws.getColumn(i).numFmt = '# ##0.00 ₽');
  ws.columns.forEach(col => {
    let max = String(col.header || '').length;
    col.eachCell({ includeEmpty: true }, cell => {
      max = Math.max(max, String(cell.value == null ? '' : cell.value).length);
    });
    col.width = Math.min(Math.max(max + 2, 10), 34);
  });
}

function appendTotalRow(ws, values) {
  const row = ws.addRow(values);
  row.font = { bold: true };
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7FA' } };
  });
}

function safeSheetName(fio) {
  const [f, i] = String(fio || 'Сотрудник').split(/\s+/);
  return `${f || 'Сотрудник'} ${i ? i[0] + '.' : ''}`.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
}

app.get('/api/admin/export/xlsx', authRequired, adminOnly, async (req, res, next) => {
  try {
    const rows = detailRows(req.query);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Alfa Tracker';
    wb.created = new Date();

    const summary = db.prepare(`
      SELECT s.otdel, s.fio, s.dolzhnost, COUNT(v.id_vstrechi) AS count,
             ROUND(COALESCE(SUM(v.av),0), 2) AS av, ROUND(COALESCE(SUM(v.aa),0), 2) AS aa
      FROM sotrudniki s
      LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika
        ${req.query.from ? 'AND v.data_vstrechi >= @from' : ''}
        ${req.query.to ? 'AND v.data_vstrechi <= @to' : ''}
        ${req.query.fio_id ? 'AND v.id_sotrudnika = @fio_id' : ''}
      WHERE COALESCE(s.active, 1) = 1
      GROUP BY s.id_sotrudnika
      ORDER BY av DESC, s.fio
    `).all({ from: req.query.from, to: req.query.to, fio_id: req.query.fio_id });

    const ws1 = wb.addWorksheet('Сводка');
    ws1.columns = [
      { header: 'Отдел', key: 'otdel' }, { header: 'ФИО', key: 'fio' }, { header: 'Должность', key: 'dolzhnost' },
      { header: 'Встреч за период', key: 'count' }, { header: 'Сумма вознаграждения', key: 'av' }, { header: 'Сумма БС', key: 'aa' }
    ];
    summary.forEach(r => ws1.addRow(r));
    appendTotalRow(ws1, ['Итого', '', '', summary.reduce((s, r) => s + r.count, 0), summary.reduce((s, r) => s + r.av, 0), summary.reduce((s, r) => s + r.aa, 0)]);
    setWorksheetStyle(ws1, [5, 6]);

    const byDept = db.prepare(`
      SELECT s.otdel, COUNT(v.id_vstrechi) AS count, ROUND(COALESCE(SUM(v.av),0), 2) AS av
      FROM sotrudniki s
      LEFT JOIN vstrechi v ON v.id_sotrudnika = s.id_sotrudnika
        ${req.query.from ? 'AND v.data_vstrechi >= @from' : ''}
        ${req.query.to ? 'AND v.data_vstrechi <= @to' : ''}
        ${req.query.fio_id ? 'AND v.id_sotrudnika = @fio_id' : ''}
      WHERE COALESCE(s.active, 1) = 1
      GROUP BY s.otdel
      ORDER BY av DESC
    `).all({ from: req.query.from, to: req.query.to, fio_id: req.query.fio_id });
    const ws2 = wb.addWorksheet('По отделам');
    ws2.columns = [{ header: 'Отдел', key: 'otdel' }, { header: 'Встреч', key: 'count' }, { header: 'Сумма вознаграждения', key: 'av' }];
    byDept.forEach(r => ws2.addRow(r));
    setWorksheetStyle(ws2, [3]);

    const detailCols = [
      ['Дата', 'data_vstrechi'], ['ФИО', 'fio'], ['Отдел', 'otdel'], ['Клиент', 'klient'], ['Тип', 'primary_type'], ['Тип встречи', 'aw'],
      ['F', 'f'], ['G', 'g'], ['H', 'h'], ['I', 'i'], ['J', 'j'], ['K', 'k'], ['L', 'l'], ['E', 'e'], ['O', 'o'], ['P', 'p'], ['AA', 'aa'], ['AK', 'ak'], ['AV', 'av']
    ];
    const fillDetails = (ws, list) => {
      ws.columns = detailCols.map(([header, key]) => ({ header, key }));
      list.forEach(r => ws.addRow(r));
      setWorksheetStyle(ws, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    };
    fillDetails(wb.addWorksheet('Детализация'), rows);
    if (req.query.fio_id && rows[0]) fillDetails(wb.addWorksheet(safeSheetName(rows[0].fio)), rows);

    audit(req.user.id, 'export_xlsx', { from: req.query.from, to: req.query.to, fio_id: req.query.fio_id, rows: rows.length });
    const now = new Date();
    const stamp = `${now.toISOString().slice(0, 10)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="alfa-tracker_${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`Alfa Tracker server running on http://localhost:${PORT}`);
});
