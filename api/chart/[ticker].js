const https = require('https');

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://analyze-alpha.vercel.app',
  'http://localhost:3000',
]);
const ALLOWED_RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']);
const ALLOWED_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const MAX_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 8000;
const rateBuckets = new Map();

function getAllowedOrigins() {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
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

function normalizeParam(param) {
  if (Array.isArray(param)) return param[0];
  return param;
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

  const tickerRaw = normalizeParam(req.query.ticker);
  const range = normalizeParam(req.query.range) || '1y';
  const interval = normalizeParam(req.query.interval) || '1d';

  if (!tickerRaw || !/^[A-Za-z0-9=^.\-]{1,12}$/.test(tickerRaw)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }
  if (!ALLOWED_RANGES.has(range)) {
    return res.status(400).json({ error: 'Invalid range' });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return res.status(400).json({ error: 'Invalid interval' });
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerRaw)}?range=${range}&interval=${interval}&includePrePost=false`;

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  }, (apiRes) => {
    let data = '';
    let bytes = 0;
    apiRes.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        apiReq.destroy(new Error('Upstream response too large'));
        return fail(413, 'Upstream response too large');
      }
      data += chunk;
    });
    apiRes.on('end', () => {
      if (responded) return;
      try {
        res.setHeader('Content-Type', 'application/json');
        res.status(apiRes.statusCode).send(data);
      } catch (e) {
        fail(500, e.message);
      }
    });
  });

  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
  apiReq.on('error', (e) => {
    fail(502, e.message);
  });
};
