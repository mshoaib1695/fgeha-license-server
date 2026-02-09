import { getRedis, verify, isEnabled } from './lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const token = (req.query.token || '').trim();
  if (!token) return res.status(401).json({ valid: false });
  try {
    const clientId = verify(token);
    if (!clientId) return res.status(401).json({ valid: false });
    const redis = await getRedis();
    const ok = await isEnabled(redis, clientId);
    if (!ok) return res.status(401).json({ valid: false });
    res.json({ valid: true });
  } catch (e) {
    console.error(e);
    res.status(401).json({ valid: false });
  }
}
