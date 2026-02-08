const { getRedis, isEnabled, sign } = require('./lib');

module.exports = async function handler(req, res) {
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
};
