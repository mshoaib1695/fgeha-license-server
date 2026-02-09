import { getRedis, isEnabled, sign } from './lib.js';

function addCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
}

export default async function handler(req, res) {
  addCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).end();
  const client = (req.query.client || '').trim();
  if (!client) return res.status(400).json({ licensed: false });
  try {
    const redis = await getRedis();
    const ok = await isEnabled(redis, client);
    if (!ok) return res.json({ licensed: false });
    const accessToken = sign(client);
    res.json({ licensed: true, accessToken });
  } catch (e) {
    console.error(e);
    res.status(500).json({ licensed: false });
  }
}
