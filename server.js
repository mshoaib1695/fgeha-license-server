/**
 * License server — you deploy this. Hot enable/disable clients by calling /admin/enable and /admin/disable.
 * Set env: SECRET (JWT/signature), ADMIN_SECRET (for enable/disable), optional ENABLED_CLIENTS=id1,id2 and DATA_FILE path.
 */
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3333;

const SECRET = process.env.SECRET || 'change-me-in-production';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-admin-secret';
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(process.cwd(), 'enabled-clients.json');

// In-memory set of enabled client IDs (hot-updated from file or admin API)
let enabledSet = new Set(
  (process.env.ENABLED_CLIENTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function loadFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      enabledSet = new Set(Array.isArray(data.clients) ? data.clients : []);
    }
  } catch (e) {
    console.warn('Could not load DATA_FILE:', e.message);
  }
}

function saveToFile() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ clients: [...enabledSet] }, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not save DATA_FILE:', e.message);
  }
}

// Token: base64(payload).signature; payload = { clientId, exp }
function sign(clientId) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = JSON.stringify({ clientId, exp });
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verify(token) {
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return payload.clientId;
  } catch {
    return null;
  }
}

// ----- Check (app + admin call this) -----
app.get('/check', (req, res) => {
  loadFromFile();
  const client = (req.query.client || '').trim();
  if (!client) {
    return res.status(400).json({ licensed: false });
  }
  if (!enabledSet.has(client)) {
    return res.json({ licensed: false });
  }
  const accessToken = sign(client);
  res.json({ licensed: true, accessToken });
});

// ----- Validate (their backend calls this on every request) -----
app.get('/validate', (req, res) => {
  loadFromFile();
  const token = (req.query.token || '').trim();
  if (!token) {
    return res.status(401).json({ valid: false });
  }
  const clientId = verify(token);
  if (!clientId || !enabledSet.has(clientId)) {
    return res.status(401).json({ valid: false });
  }
  res.json({ valid: true });
});

// ----- Hot enable/disable (you call these when payment received or lapsed) -----
function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret || '';
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

app.post('/admin/enable', requireAdmin, (req, res) => {
  const client = (req.body?.client || req.query.client || '').trim();
  if (!client) return res.status(400).json({ error: 'Missing client' });
  enabledSet.add(client);
  saveToFile();
  console.log('Enabled client:', client);
  res.json({ ok: true, client, enabled: true });
});

app.post('/admin/disable', requireAdmin, (req, res) => {
  const client = (req.body?.client || req.query.client || '').trim();
  if (!client) return res.status(400).json({ error: 'Missing client' });
  enabledSet.delete(client);
  saveToFile();
  console.log('Disabled client:', client);
  res.json({ ok: true, client, enabled: false });
});

app.get('/admin/status', requireAdmin, (req, res) => {
  loadFromFile();
  res.json({ clients: [...enabledSet] });
});

app.listen(PORT, () => {
  loadFromFile();
  console.log(`License server at http://0.0.0.0:${PORT}`);
  console.log('Endpoints: GET /check?client=ID, GET /validate?token=TOKEN, POST /admin/enable, POST /admin/disable');
});
