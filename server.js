/**
 * License server — you deploy this. Hot enable/disable clients by calling /admin/enable and /admin/disable.
 * Set env in .env: SECRET, ADMIN_SECRET, optional ENABLED_CLIENTS=id1,id2, DATA_FILE path, ENABLED_CACHE_TTL_MS.
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, uses Redis (so you see data in Upstash dashboard).
 */
import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Redis } from '@upstash/redis';

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
const PORT = process.env.PORT || 3333;

const SECRET = process.env.SECRET || 'change-me-in-production';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-admin-secret';
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(process.cwd(), 'enabled-clients.json');

const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = USE_REDIS
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const ENABLED_KEY = 'enabled';
const ENABLED_CACHE_TTL_MS = Number(process.env.ENABLED_CACHE_TTL_MS || 5 * 60 * 1000);
const enabledCache = new Map(); // clientId -> { enabled: boolean, expiresAt: number }

// In-memory set when not using Redis (hot-updated from file or admin API)
let enabledSet = new Set(
  (process.env.ENABLED_CLIENTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function loadFromFile() {
  if (USE_REDIS) return;
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
  if (USE_REDIS) return;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ clients: [...enabledSet] }, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not save DATA_FILE:', e.message);
  }
}

async function isEnabled(clientId) {
  if (USE_REDIS) {
    const now = Date.now();
    const cached = enabledCache.get(clientId);
    if (cached && cached.expiresAt > now) return cached.enabled;

    const enabled = (await redis.sismember(ENABLED_KEY, clientId)) === 1;
    enabledCache.set(clientId, { enabled, expiresAt: now + ENABLED_CACHE_TTL_MS });
    return enabled;
  }
  return enabledSet.has(clientId);
}

async function addEnabled(clientId) {
  if (USE_REDIS) await redis.sadd(ENABLED_KEY, clientId);
  else enabledSet.add(clientId);
  enabledCache.set(clientId, { enabled: true, expiresAt: Date.now() + ENABLED_CACHE_TTL_MS });
  saveToFile();
}

async function removeEnabled(clientId) {
  if (USE_REDIS) await redis.srem(ENABLED_KEY, clientId);
  else enabledSet.delete(clientId);
  enabledCache.set(clientId, { enabled: false, expiresAt: Date.now() + ENABLED_CACHE_TTL_MS });
  saveToFile();
}

async function listEnabled() {
  if (USE_REDIS) return await redis.smembers(ENABLED_KEY);
  return [...enabledSet];
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
app.get('/check', async (req, res) => {
  loadFromFile();
  const client = (req.query.client || '').trim();
  if (!client) return res.status(400).json({ licensed: false });
  if (!(await isEnabled(client))) return res.json({ licensed: false });
  const accessToken = sign(client);
  res.json({ licensed: true, accessToken });
});

// ----- Validate (their backend calls this on every request) -----
app.get('/validate', async (req, res) => {
  loadFromFile();
  const token = (req.query.token || '').trim();
  if (!token) return res.status(401).json({ valid: false });
  const clientId = verify(token);
  if (!clientId || !(await isEnabled(clientId))) return res.status(401).json({ valid: false });
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

app.post('/admin/enable', requireAdmin, async (req, res) => {
  const client = (req.body?.client || req.query.client || '').trim();
  if (!client) return res.status(400).json({ error: 'Missing client' });
  await addEnabled(client);
  console.log('Enabled client:', client);
  res.json({ ok: true, client, enabled: true });
});

app.post('/admin/disable', requireAdmin, async (req, res) => {
  const client = (req.body?.client || req.query.client || '').trim();
  if (!client) return res.status(400).json({ error: 'Missing client' });
  await removeEnabled(client);
  console.log('Disabled client:', client);
  res.json({ ok: true, client, enabled: false });
});

app.get('/admin/status', requireAdmin, async (req, res) => {
  loadFromFile();
  const clients = await listEnabled();
  res.json({ clients });
});

app.listen(PORT, async () => {
  loadFromFile();
  if (USE_REDIS) {
    const seed = (process.env.ENABLED_CLIENTS || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const c of seed) await redis.sadd(ENABLED_KEY, c);
    console.log('Using Upstash Redis for enabled clients. Seed:', seed);
  }
  console.log(`License server at http://0.0.0.0:${PORT}`);
  console.log('Endpoints: GET /check?client=ID, GET /validate?token=TOKEN, POST /admin/enable, POST /admin/disable');
});
