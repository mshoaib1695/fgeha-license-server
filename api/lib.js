import crypto from 'crypto';

const SECRET = process.env.SECRET || 'change-me-in-production';

function sign(clientId) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
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

async function getRedis() {
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const KEY = 'enabled';

async function isEnabled(redis, clientId) {
  return (await redis.sismember(KEY, clientId)) === 1;
}

async function enable(redis, clientId) {
  await redis.sadd(KEY, clientId);
}

async function disable(redis, clientId) {
  await redis.srem(KEY, clientId);
}

async function listEnabled(redis) {
  return await redis.smembers(KEY);
}

export { sign, verify, getRedis, isEnabled, enable, disable, listEnabled, KEY };
