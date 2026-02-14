const { fetchPredictionMarkets } = require('./_predictionCore');

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://analyze-alpha.vercel.app',
  'http://localhost:3000',
]);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const rateBuckets = new Map();

function getAllowedOrigins() {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = getAllowedOrigins();
  if (!allowed.has(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateBuckets.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  rateBuckets.set(ip, entry);
  if (rateBuckets.size > 5000) {
    for (const [key, value] of rateBuckets) {
      if (now - value.start > RATE_LIMIT_WINDOW_MS) rateBuckets.delete(key);
    }
  }
  return entry.count > RATE_LIMIT_MAX;
}

module.exports = (req, res) => {
  setCors(req, res);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  (async () => {
    try {
      const payload = await fetchPredictionMarkets();
      res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=40, stale-while-revalidate=120');
      return res.status(200).json(payload);
    } catch (e) {
      return res.status(502).json({ error: e.message || 'Prediction markets unavailable' });
    }
  })();

  return undefined;
};
