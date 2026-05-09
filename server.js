const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'alfa-tracker-dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'alfa2026';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'alfa_tracker.db');
const EXCEL_PATH = process.env.EXCEL_PATH || findReportWorkbook();
const ADMIN_PASSWORD_REQUIRED = process.env.ADMIN_PASSWORD_REQUIRED === '1';
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

function isSecureRequest(req) {
  if (!req) return false;
  if (req.secure) return true;
  const proto = req.headers && req.headers['x-forwarded-proto'];
  return typeof proto === 'string' && proto.split(',')[0].trim() === 'https';
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
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
    .replace(/[^\p{L}\s-]/gu, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j];
  }
  return prev[b.length];
}

function fioDistance(a, b) {
  const aa = normalizeFio(a);
  const bb = normalizeFio(b);
  if (aa === bb) return 0;
  if (aa.includes(bb) || bb.includes(aa)) return Math.abs(aa.length - bb.length);
  return levenshtein(aa, bb);
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

function rawNum(m, key) {
  return num(m && m[key]);
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

function findReportWorkbook() {
  try {
    const preferred = fs.readdirSync(__dirname)
      .filter(f => f.toLowerCase().endsWith('.xlsx'))
      .find(f => f.toLowerCase().includes('встреч'));
    return preferred ? path.join(__dirname, preferred) : null;
  } catch (_) {
    return null;
  }
}

function employeeSheetCandidates(fio) {
  const parts = String(fio || '').trim().split(/\s+/).filter(Boolean);
  const [last, first] = parts;
  return [
    last,
    first ? `${last}${first[0]}` : '',
    first ? `${last} ${first[0]}` : '',
    first ? `${last}${first[0]}.` : ''
  ].filter(Boolean);
}

function normalizedSheetName(value) {
  return normalizeFio(value).replace(/\s+/g, '').replace(/\./g, '');
}

function aggregateMeetings(rows) {
  const s = {};
  const add = (key, value) => { s[key] = (s[key] || 0) + num(value); };
  rows.forEach(row => {
    let m = {};
    try { m = JSON.parse(row.raw_json || '{}'); } catch (_) {}
    [
      'F','G','H','I','J','K','L','E','M','N','O','P','Q','R','S','T','U','V','W','X','Y',
      'Z','AA','AB','AC','AD','AE','AF','AG','AI','AJ','AK','AL','AM','AN','AO','AP','AQ',
      'AR','AS','AT','AU','CO','AV'
    ].forEach(key => add(key, rawNum(m, key)));
    if (!s.E) s.E = (s.F || 0) + (s.G || 0) + (s.H || 0) + (s.I || 0) + (s.J || 0) + (s.K || 0) + (s.L || 0);
  });
  const productTotal = [
    'E','O','P','S','T','U','X','Z','AA','AB','AC','AD','AE','AI','AJ','AK','AL','AM',
    'AN','AO','AP','AQ','AR','AS','AT','AU','CO'
  ].reduce((sum, key) => sum + (s[key] || 0), 0);
  return {
    4: productTotal,
    5: s.E || 0, 6: s.F || 0, 7: s.G || 0, 8: s.H || 0, 9: s.I || 0, 10: s.J || 0,
    11: s.K || 0, 12: s.L || 0, 13: s.M || 0, 14: s.N || 0, 15: s.O || 0, 16: s.P || 0,
    17: s.Q || 0, 18: s.R || 0, 19: s.S || 0, 20: s.U || 0, 21: s.T || 0, 22: s.V || 0,
    23: s.W || 0, 24: s.X || 0, 25: s.Y || 0, 26: s.Z || 0, 27: s.AA || 0, 28: s.AB || 0,
    29: s.AC || 0, 30: s.AD || 0, 31: s.AE || 0, 32: s.AF || 0, 33: s.AG || 0,
    34: s.AI || 0, 35: s.AR || 0, 36: s.AJ || 0, 37: s.AK || 0, 38: s.AL || 0,
    39: s.AM || 0, 40: s.AN || 0, 41: s.AO || 0, 42: (s.AP || 0) + (s.CO || 0),
    43: s.AQ || 0, 44: 0, 45: s.AS || 0, 46: s.AT || 0, 47: s.AU || 0, 48: 0,
    49: s.AV || 0
  };
}

function excelDateValue(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function detailValues(row) {
  let m = {};
  try { m = JSON.parse(row.raw_json || '{}'); } catch (_) {}
  return [
    row.id_vstrechi,
    excelDateValue(row.data_vstrechi),
    row.klient || m.clientName || '',
    m.primaryType || '',
    m.crossType || '',
    rawNum(m, 'F'), rawNum(m, 'G'), rawNum(m, 'H'), rawNum(m, 'I'), rawNum(m, 'J'), rawNum(m, 'K'), rawNum(m, 'L'),
    rawNum(m, 'M'), rawNum(m, 'N'), rawNum(m, 'O'), rawNum(m, 'P'), rawNum(m, 'Q'), rawNum(m, 'R'), rawNum(m, 'S'),
    rawNum(m, 'U'), rawNum(m, 'T'), rawNum(m, 'V'), rawNum(m, 'W'), rawNum(m, 'X'), rawNum(m, 'Y'), rawNum(m, 'Z'),
    rawNum(m, 'AA'), rawNum(m, 'AB'), rawNum(m, 'AC'), rawNum(m, 'AD'), rawNum(m, 'AE'), rawNum(m, 'AF'), rawNum(m, 'AG'),
    rawNum(m, 'AI'), rawNum(m, 'AR'), 0, rawNum(m, 'AK'), rawNum(m, 'AL'), rawNum(m, 'AM'), rawNum(m, 'AN'),
    rawNum(m, 'AO'), rawNum(m, 'AP') + rawNum(m, 'CO'), rawNum(m, 'AQ'), 0, rawNum(m, 'AS'), rawNum(m, 'AT'),
    rawNum(m, 'AU'), rawNum(m, 'AV'), row.status || m.AW || 'COMPLETED'
  ];
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attrValue(xml, attrName) {
  const m = xml.match(new RegExp(`\\b${attrName.replace(':', '\\:')}="([^"]*)"`));
  return m ? xmlUnescape(m[1]) : '';
}

function colNameToNumber(col) {
  return String(col || '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function numberToColName(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function excelSerial(dateKey) {
  const utc = Date.parse(`${dateKey}T00:00:00.000Z`);
  return Math.round(utc / 86400000 + 25569);
}

function rowXml(sheetXml, rowNumber) {
  const m = sheetXml.match(new RegExp(`<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*>[\\s\\S]*?<\\/row>`, 'i'));
  return m ? m[0] : '';
}

function cellRawValue(row, ref) {
  const m = row.match(new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*(?:>[\\s\\S]*?<\\/c>|\\/>)`, 'i'));
  if (!m) return '';
  const cell = m[0];
  const inline = cell.match(/<t[^>]*>([\s\S]*?)<\/t>/i);
  if (inline) return xmlUnescape(inline[1]);
  const v = cell.match(/<v>([\s\S]*?)<\/v>/i);
  return v ? xmlUnescape(v[1]) : '';
}

function numericCellXml(ref, value) {
  return `<c r="${ref}"><v>${Number(value) || 0}</v></c>`;
}

function stringCellXml(ref, value) {
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function cellXml(ref, value) {
  return typeof value === 'number' ? numericCellXml(ref, value) : stringCellXml(ref, value);
}

function setCell(sheetXml, rowNumber, colNumber, value) {
  const ref = `${numberToColName(colNumber)}${rowNumber}`;
  const replacement = typeof value === 'number' ? numericCellXml(ref, value) : stringCellXml(ref, value);
  const rowRe = new RegExp(`<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*>[\\s\\S]*?<\\/row>`, 'i');
  const row = sheetXml.match(rowRe);
  if (!row) {
    const newRow = `<row r="${rowNumber}">${replacement}</row>`;
    return sheetXml.replace('</sheetData>', `${newRow}</sheetData>`);
  }
  const cellRe = new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*(?:>[\\s\\S]*?<\\/c>|\\/>)`, 'i');
  const nextRow = cellRe.test(row[0])
    ? row[0].replace(cellRe, replacement)
    : row[0].replace('</row>', `${replacement}</row>`);
  return sheetXml.replace(rowRe, nextRow);
}

function findXmlDateColumn(sheetXml, dateRow, dateKey) {
  const wanted = excelSerial(dateKey);
  const row = rowXml(sheetXml, dateRow);
  const cellRe = new RegExp(`<c\\b[^>]*\\br="([A-Z]+)${dateRow}"[^>]*>[\\s\\S]*?<\\/c>`, 'gi');
  let m;
  while ((m = cellRe.exec(row))) {
    const value = Number((m[0].match(/<v>([\s\S]*?)<\/v>/i) || [])[1]);
    if (Math.round(value) === wanted) return colNameToNumber(m[1]);
  }
  return 0;
}

function setSummaryXml(sheetXml, dateRow, dateKey, summary) {
  const col = findXmlDateColumn(sheetXml, dateRow, dateKey);
  if (!col) return sheetXml;
  let next = sheetXml;
  for (let r = 4; r <= 49; r += 1) next = setCell(next, r, col, summary[r] || 0);
  return next;
}

function detailXmlValues(row) {
  return detailValues(row).map(value => {
    if (value instanceof Date) return excelSerial(value.toISOString().slice(0, 10));
    return value;
  });
}

function detailRowXml(rowNumber, row) {
  const values = detailXmlValues(row);
  const cells = values.map((value, idx) => cellXml(`${numberToColName(idx + 1)}${rowNumber}`, value)).join('');
  return `<row r="${rowNumber}">${cells}</row>`;
}

function findDetailRowNumber(sheetXml, meetingId) {
  for (let r = 56; r <= 1000; r += 1) {
    const row = rowXml(sheetXml, r);
    if (!row) return { found: 0, blank: r };
    const value = cellRawValue(row, `A${r}`);
    if (String(value).trim() === String(meetingId)) return { found: r, blank: 0 };
    if (!String(value).trim()) return { found: 0, blank: r };
  }
  return { found: 0, blank: 1001 };
}

function upsertDetailXml(sheetXml, row) {
  const pos = findDetailRowNumber(sheetXml, row.id_vstrechi);
  const rowNumber = pos.found || pos.blank;
  const replacement = detailRowXml(rowNumber, row);
  const rowRe = new RegExp(`<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*>[\\s\\S]*?<\\/row>`, 'i');
  if (rowRe.test(sheetXml)) return sheetXml.replace(rowRe, replacement);
  return sheetXml.replace('</sheetData>', `${replacement}</sheetData>`);
}

function clearDetailXml(sheetXml, meetingId) {
  const pos = findDetailRowNumber(sheetXml, meetingId);
  if (!pos.found) return sheetXml;
  const rowRe = new RegExp(`<row\\b(?=[^>]*\\br="${pos.found}")[^>]*>[\\s\\S]*?<\\/row>`, 'i');
  return sheetXml.replace(rowRe, '');
}

function parseWorkbookSheets(workbookXml, relsXml) {
  const rels = new Map();
  const relRe = /<Relationship\b[^>]*\/>/gi;
  let relMatch;
  while ((relMatch = relRe.exec(relsXml))) {
    const id = attrValue(relMatch[0], 'Id');
    const target = attrValue(relMatch[0], 'Target');
    if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const sheets = [];
  const sheetRe = /<sheet\b[^>]*\/>/gi;
  let sheetMatch;
  while ((sheetMatch = sheetRe.exec(workbookXml))) {
    const name = attrValue(sheetMatch[0], 'name');
    const id = attrValue(sheetMatch[0], 'r:id');
    const target = rels.get(id);
    if (name && target) sheets.push({ name, target });
  }
  return sheets;
}

function findSheetTarget(sheets, sheetName, exactSheet) {
  if (exactSheet) {
    const exact = sheets.find(s => normalizeFio(s.name) === normalizeFio(sheetName));
    return exact && exact.target;
  }
  const candidates = new Set(employeeSheetCandidates(sheetName).map(normalizedSheetName));
  const sheet = sheets.find(s => candidates.has(normalizedSheetName(s.name)));
  return sheet && sheet.target;
}

async function patchWorkbookXml(filePath, patches, dateKey) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheets = parseWorkbookSheets(workbookXml, relsXml);
  for (const patch of patches) {
    const target = findSheetTarget(sheets, patch.sheetName, patch.exactSheet);
    if (!target || !zip.file(target)) continue;
    let xml = await zip.file(target).async('string');
    xml = setSummaryXml(xml, patch.dateRow, dateKey, patch.summary);
    if (patch.detailRow) xml = upsertDetailXml(xml, patch.detailRow);
    if (patch.clearMeetingId) xml = clearDetailXml(xml, patch.clearMeetingId);
    zip.file(target, xml);
  }
  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(filePath, content);
}

let excelWriteQueue = Promise.resolve();

function queueExcelSync(userId, dateKey, meetingId) {
  if (!EXCEL_PATH) return Promise.resolve(false);
  excelWriteQueue = excelWriteQueue
    .catch(() => null)
    .then(() => syncExcel(userId, dateKey, meetingId));
  return excelWriteQueue;
}

async function syncExcel(userId, dateKey, meetingId) {
  if (!EXCEL_PATH || !fs.existsSync(EXCEL_PATH)) return false;
  const employee = currentUserById(userId);
  if (!employee) return false;
  const employeeRows = db.prepare(`
    SELECT * FROM vstrechi
    WHERE id_sotrudnika = ? AND data_vstrechi = ?
    ORDER BY completed_at
  `).all(userId, dateKey);
  const allRows = db.prepare(`
    SELECT * FROM vstrechi
    WHERE data_vstrechi = ?
    ORDER BY completed_at
  `).all(dateKey);
  await patchWorkbookXml(EXCEL_PATH, [
    {
      sheetName: employee.fio,
      dateRow: 1,
      summary: aggregateMeetings(employeeRows),
      detailRow: meetingId ? employeeRows.find(r => r.id_vstrechi === meetingId) : null,
      clearMeetingId: meetingId && !employeeRows.find(r => r.id_vstrechi === meetingId) ? meetingId : null
    },
    {
      sheetName: 'ОБЩИЕ',
      exactSheet: true,
      dateRow: 2,
      summary: aggregateMeetings(allRows)
    }
  ], dateKey);
  return true;
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
      const fuzzy = all
        .map(r => ({ row: r, score: fioDistance(fio, r.fio) }))
        .filter(x => x.score <= 2 || normalizeFio(x.row.fio).includes(needle) || needle.includes(normalizeFio(x.row.fio)))
        .sort((a, b) => a.score - b.score)
        .slice(0, 6);
      if (fuzzy.length === 1 || (fuzzy[0] && fuzzy[0].score < (fuzzy[1] ? fuzzy[1].score : 99))) row = fuzzy[0].row;
      else if (fuzzy.length > 1) return res.status(401).json({ error: 'ambiguous_employee', suggestions: fuzzy.map(x => publicEmployee(x.row)) });
    }
  }
  if (!row) return res.status(401).json({ error: 'unknown_employee' });
  if (ADMIN_PASSWORD_REQUIRED && row.role === 'admin') {
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

app.post('/api/vstrechi', authRequired, async (req, res, next) => {
  try {
    const id = saveMeeting(req.body || {}, req.user.id);
    const row = db.prepare('SELECT data_vstrechi FROM vstrechi WHERE id_vstrechi = ?').get(id);
    const excelSynced = row ? await queueExcelSync(req.user.id, row.data_vstrechi, id) : false;
    res.json({ id, ok: true, excelSynced: !!excelSynced });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/vstrechi/:id', authRequired, async (req, res, next) => {
  try {
    const existing = db.prepare('SELECT data_vstrechi FROM vstrechi WHERE id_vstrechi = ? AND id_sotrudnika = ?').get(req.params.id, req.user.id);
    const info = db.prepare('DELETE FROM vstrechi WHERE id_vstrechi = ? AND id_sotrudnika = ?').run(req.params.id, req.user.id);
    if (existing && info.changes) await queueExcelSync(req.user.id, existing.data_vstrechi, req.params.id);
    res.json({ ok: true, deleted: info.changes });
  } catch (err) {
    next(err);
  }
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

const PRODUCT_ROWS = [
  { name: 'Выдано продуктов', calc: m => productSum(m), bold: true },
  { name: 'ДК/RE/ЗПК/СИМ', calc: m => num(m.F)+num(m.G)+num(m.H)+num(m.I)+num(m.J), group: true },
  { name: 'ДК', calc: m => num(m.F) },
  { name: 'Х5', calc: m => num(m.G) },
  { name: 'ЗПК', calc: m => num(m.H) },
  { name: 'RE', calc: m => num(m.I) },
  { name: 'СИМ по заявке', calc: m => num(m.J) },
  { name: 'Семейная', calc: m => num(m.K) },
  { name: 'ДК+Детская', calc: m => num(m.L) },
  { name: 'Активация ДК/RE/ЗПК', calc: m => num(m.M), pctOf: 'ДК/RE/ЗПК/СИМ' },
  { name: 'Транзакция ДК/RE/ЗПК', calc: m => num(m.N), pctOf: 'ДК/RE/ЗПК/СИМ' },
  { name: 'КК1', calc: m => num(m.O) },
  { name: 'КК2', calc: m => num(m.P) },
  { name: 'Активация КК', calc: m => num(m.Q), pctOf: '__KK_TOTAL__' },
  { name: 'Транзакция КК', calc: m => num(m.R), pctOf: 'Активация КК' },
  { name: 'ФЗ КК1', calc: m => num(m.S), pctOf: 'КК1' },
  { name: 'КДК к КК', calc: () => 0, pctOf: '__BASE__' },
  { name: 'КДК к ДК', calc: m => num(m.T), pctOf: '__BASE__' },
  { name: 'Активация КДК', calc: m => num(m.V) },
  { name: 'Транзакция КДК', calc: m => num(m.W) },
  { name: 'КЛ/Кросс КК', calc: m => num(m.X), pctOf: '__BASE__' },
  { name: 'Транзакция КЛ/Кросс КК', calc: m => num(m.Y), pctOf: 'КЛ/Кросс КК' },
  { name: 'Инвест копилка', calc: m => num(m.Z), pctOf: '__BASE__' },
  { name: 'БС с пополнением', calc: m => num(m.AA), pctOf: '__BASE__' },
  { name: 'ЦП', calc: m => num(m.AB), pctOf: '__BASE__' },
  { name: 'Сэлфи ДК n2b', calc: m => num(m.AC) },
  { name: 'Сэлфи ДК', calc: m => num(m.AD) },
  { name: 'Сэлфи КК', calc: m => num(m.AE) },
  { name: 'Активация Сэлфи', calc: m => num(m.AF), pctOf: '__SELF_TOTAL__' },
  { name: 'Транзакция Сэлфи', calc: m => num(m.AG), pctOf: '__SELF_TOTAL__' },
  { name: 'Установка АМ', calc: m => num(m.AI) },
  { name: 'АМ по заявке', calc: m => num(m.AR) },
  { name: 'Кросс СИМ', calc: m => num(m.AJ) },
  { name: 'PIL (кредит наличными)', calc: m => num(m.AK) },
  { name: 'Кешбэк', calc: m => num(m.AL) },
  { name: 'Альфа-защитник', calc: m => num(m.AM) },
  { name: 'Кросс Детская', calc: m => num(m.AN), pctOf: '__BASE__' },
  { name: 'Вок на встрече', calc: m => num(m.AO) },
  { name: 'УП/Отказ банка', calc: m => num(m.AP) + num(m.CO) },
  { name: 'Альфа-Смарт', calc: m => num(m.AQ) },
  { name: 'Стратегия', calc: m => num(m.AS) },
  { name: 'ЖКУ', calc: m => num(m.AT) },
  { name: 'Пенсия', calc: m => num(m.AU) },
  { name: 'Комбо 1₽', calc: m => num(m.combo) },
  { name: 'НС с пополнением от 10 т.р.', calc: m => num(m.ns10) }
];

function productSum(m) {
  return ['F','G','H','I','J','K','L','O','P','T','X','Z','AA','AB','AC','AD','AE','AI','AR','AJ','AK','AL','AM','AN','AQ','AS','AT','AU']
    .reduce((sum, key) => sum + num(m[key]), 0);
}

function getMeetingsInRange(from, to) {
  return db.prepare(`
    SELECT data_vstrechi, raw_json FROM vstrechi
    WHERE data_vstrechi >= ? AND data_vstrechi <= ?
    ORDER BY data_vstrechi
  `).all(from, to);
}

function buildDayList(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = [];
  for (let d = 1; d <= last; d += 1) days.push(`${month}-${String(d).padStart(2, '0')}`);
  return days;
}

app.get('/api/admin/stat/products', authRequired, adminOnly, (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'invalid_month' });
  const days = buildDayList(month);
  const from = days[0];
  const to = days[days.length - 1];
  const rows = getMeetingsInRange(from, to);

  const meetingsByDay = new Map(days.map(d => [d, []]));
  rows.forEach(row => {
    let parsed = {};
    try { parsed = JSON.parse(row.raw_json || '{}'); } catch (_) {}
    const list = meetingsByDay.get(row.data_vstrechi);
    if (list) list.push(parsed);
  });

  const dayValues = days.map(d => {
    const meetings = meetingsByDay.get(d) || [];
    const obj = { date: d, count: meetings.length, values: {} };
    PRODUCT_ROWS.forEach(p => {
      obj.values[p.name] = meetings.reduce((s, m) => s + p.calc(m), 0);
    });
    return obj;
  });

  const monthTotals = {};
  PRODUCT_ROWS.forEach(p => {
    monthTotals[p.name] = dayValues.reduce((s, d) => s + (d.values[p.name] || 0), 0);
  });

  const baseTotal = monthTotals['ДК/RE/ЗПК/СИМ'] || 0;
  const kkTotal = (monthTotals['КК1'] || 0) + (monthTotals['КК2'] || 0);
  const selfTotal = (monthTotals['Сэлфи ДК n2b'] || 0) + (monthTotals['Сэлфи ДК'] || 0) + (monthTotals['Сэлфи КК'] || 0);

  function pctValue(p) {
    if (!p.pctOf) return null;
    const value = monthTotals[p.name] || 0;
    let denom = 0;
    if (p.pctOf === '__BASE__') denom = baseTotal;
    else if (p.pctOf === '__KK_TOTAL__') denom = kkTotal;
    else if (p.pctOf === '__SELF_TOTAL__') denom = selfTotal;
    else denom = monthTotals[p.pctOf] || 0;
    if (!denom) return null;
    return value / denom;
  }

  const productRows = PRODUCT_ROWS.map(p => ({
    name: p.name,
    bold: !!p.bold,
    group: !!p.group,
    days: dayValues.map(d => d.values[p.name] || 0),
    month: monthTotals[p.name] || 0,
    percent: pctValue(p)
  }));

  const totalCount = dayValues.reduce((s, d) => s + d.count, 0);

  res.json({
    month,
    days: dayValues.map(d => ({ date: d.date, count: d.count })),
    rows: productRows,
    totalMeetings: totalCount
  });
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

app.get('/api/admin/live-xlsx', authRequired, adminOnly, (req, res) => {
  if (!EXCEL_PATH || !fs.existsSync(EXCEL_PATH)) return res.status(404).json({ error: 'excel_not_found' });
  res.download(EXCEL_PATH);
});

app.delete('/api/admin/vstrechi/:id', authRequired, adminOnly, async (req, res, next) => {
  try {
    const existing = db.prepare('SELECT id_sotrudnika, data_vstrechi FROM vstrechi WHERE id_vstrechi = ?').get(req.params.id);
    const info = db.prepare('DELETE FROM vstrechi WHERE id_vstrechi = ?').run(req.params.id);
    if (existing && info.changes) await queueExcelSync(existing.id_sotrudnika, existing.data_vstrechi, req.params.id);
    audit(req.user.id, 'delete_meeting', { id: req.params.id, deleted: info.changes });
    res.json({ ok: true, deleted: info.changes });
  } catch (err) {
    next(err);
  }
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
