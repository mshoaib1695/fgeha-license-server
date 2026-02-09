import { getRedis, listEnabled } from '../lib.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-admin-secret';

function auth(req) {
  const secret = req.headers['x-admin-secret'] || req.query.secret || '';
  return secret === ADMIN_SECRET;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!auth(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const redis = await getRedis();
    const clients = await listEnabled(redis);
    res.json({ clients });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
}
