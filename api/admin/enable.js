import { getRedis, enable } from '../lib.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-admin-secret';

function addCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
}

function auth(req) {
  const secret = req.headers['x-admin-secret'] || req.query.secret || (req.body && req.body.secret) || '';
  return secret === ADMIN_SECRET;
}

export default async function handler(req, res) {
  addCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).end();
  if (!auth(req)) return res.status(403).json({ error: 'Forbidden' });
  const client = (req.body?.client || req.query.client || '').trim();
  if (!client) return res.status(400).json({ error: 'Missing client' });
  try {
    const redis = await getRedis();
    await enable(redis, client);
    res.json({ ok: true, client, enabled: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
}
