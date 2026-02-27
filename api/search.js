const https = require('https');

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://analyze-alpha.vercel.app',
  'http://localhost:3000',
]);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const MAX_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 8000;
const rateBuckets = new Map();

// Common company name aliases and misspellings → tickers/correct names
const ALIASES = {
  'rocketlab': 'RKLB', 'rocket lab': 'RKLB', 'rocket labs': 'RKLB',
  'tesla': 'TSLA', 'teslas': 'TSLA', 'teslsa': 'TSLA', 'telsa': 'TSLA',
  'apple': 'AAPL', 'appl': 'AAPL', 'aple': 'AAPL',
  'google': 'GOOGL', 'gogle': 'GOOGL', 'googl': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'amazn': 'AMZN', 'amzon': 'AMZN',
  'microsoft': 'MSFT', 'microsft': 'MSFT', 'mircosoft': 'MSFT', 'msft': 'MSFT',
  'nvidia': 'NVDA', 'nvidea': 'NVDA', 'nividia': 'NVDA', 'nvida': 'NVDA',
  'meta': 'META', 'facebook': 'META', 'fb': 'META',
  'netflix': 'NFLX', 'netflex': 'NFLX', 'netfilx': 'NFLX',
  'disney': 'DIS', 'disny': 'DIS', 'disnee': 'DIS',
  'palantir': 'PLTR', 'palanteer': 'PLTR', 'palentir': 'PLTR', 'plantir': 'PLTR',
  'coinbase': 'COIN', 'coinbse': 'COIN',
  'amd': 'AMD', 'advance micro': 'AMD', 'advanced micro': 'AMD',
  'gamestop': 'GME', 'game stop': 'GME', 'gamestock': 'GME',
  'berkshire': 'BRK-B', 'berkshire hathaway': 'BRK-B', 'birkshire': 'BRK-B',
  'jpmorgan': 'JPM', 'jp morgan': 'JPM', 'chase': 'JPM',
  'walmart': 'WMT', 'wal mart': 'WMT', 'wallmart': 'WMT',
  'spotify': 'SPOT', 'spotifi': 'SPOT', 'spotfy': 'SPOT',
  'airbnb': 'ABNB', 'air bnb': 'ABNB',
  'uber': 'UBER', 'snowflake': 'SNOW', 'crowdstrike': 'CRWD',
  'shopify': 'SHOP', 'shopfy': 'SHOP',
  'boeing': 'BA', 'boieng': 'BA', 'boing': 'BA',
  'intel': 'INTC', 'intle': 'INTC',
  'paypal': 'PYPL', 'paypl': 'PYPL', 'pay pal': 'PYPL',
  'robinhood': 'HOOD', 'robin hood': 'HOOD',
  'sofi': 'SOFI', 'so fi': 'SOFI', 'sofi technologies': 'SOFI',
  'rivian': 'RIVN', 'rivean': 'RIVN',
  'lucid': 'LCID', 'lucid motors': 'LCID',
  'plaid': 'PLTR',
  'supermicro': 'SMCI', 'super micro': 'SMCI',
  'broadcom': 'AVGO', 'brodcom': 'AVGO',
  'costco': 'COST', 'costko': 'COST',
  'starbucks': 'SBUX', 'starbuks': 'SBUX', 'starbux': 'SBUX',
  'snapchat': 'SNAP', 'snap': 'SNAP',
  'pinterest': 'PINS', 'pintrest': 'PINS',
  'doordash': 'DASH', 'door dash': 'DASH',
  'draft kings': 'DKNG', 'draftkings': 'DKNG',
  'block': 'XYZ', 'square': 'XYZ',
  'salesforce': 'CRM', 'sales force': 'CRM',
  'oracle': 'ORCL', 'oracl': 'ORCL',
  'ibm': 'IBM',
  'cisco': 'CSCO', 'cisko': 'CSCO',
  'qualcomm': 'QCOM', 'qualcom': 'QCOM',
  'micron': 'MU',
  'arm': 'ARM', 'arm holdings': 'ARM',
  'datadog': 'DDOG', 'data dog': 'DDOG',
  'twilio': 'TWLO',
  'zoom': 'ZM', 'zom': 'ZM',
  'nio': 'NIO',
  'byd': 'BYDDY',
  'alibaba': 'BABA', 'ali baba': 'BABA',
  'tencent': 'TCEHY',
  'baidu': 'BIDU',
  'bitcoin': 'BTC-USD', 'btc': 'BTC-USD',
  'ethereum': 'ETH-USD', 'eth': 'ETH-USD', 'etherium': 'ETH-USD', 'etherum': 'ETH-USD',
  'solana': 'SOL-USD', 'sol': 'SOL-USD',
  'dogecoin': 'DOGE-USD', 'doge': 'DOGE-USD',
  'spy': 'SPY', 'sp500': 'SPY', 's&p': 'SPY', 's&p 500': 'SPY', 'sp 500': 'SPY',
  'qqq': 'QQQ', 'nasdaq': 'QQQ',
  'dow': 'DIA', 'dow jones': 'DIA',
  'vanguard': 'VTI', 'vti': 'VTI',
  'gold': 'GLD', 'silver': 'SLV',
};

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

// Normalize query: lowercase, collapse whitespace, strip non-alphanumeric (except &-)
function normalizeQuery(q) {
  return q.toLowerCase().replace(/[^a-z0-9&\s-]/g, '').replace(/\s+/g, ' ').trim();
}

// Simple Levenshtein distance for short strings
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array(b.length + 1);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

// Try to resolve a query to a ticker via alias map (exact + fuzzy)
function resolveAlias(q) {
  const norm = normalizeQuery(q);
  // Exact match
  if (ALIASES[norm]) return ALIASES[norm];
  // Without spaces
  const noSpace = norm.replace(/\s/g, '');
  if (ALIASES[noSpace]) return ALIASES[noSpace];
  // Fuzzy match against alias keys (max distance 2 for short, 3 for longer)
  let bestKey = null;
  let bestDist = Infinity;
  for (const key of Object.keys(ALIASES)) {
    const maxDist = key.length <= 5 ? 1 : key.length <= 8 ? 2 : 3;
    const d = levenshtein(norm, key);
    if (d <= maxDist && d < bestDist) {
      bestDist = d;
      bestKey = key;
    }
    // Also try without spaces
    if (noSpace !== norm) {
      const d2 = levenshtein(noSpace, key.replace(/\s/g, ''));
      if (d2 <= maxDist && d2 < bestDist) {
        bestDist = d2;
        bestKey = key;
      }
    }
  }
  return bestKey ? ALIASES[bestKey] : null;
}

// Build list of query variations to try
function buildQueryVariations(q) {
  const queries = [q];
  const norm = normalizeQuery(q);
  if (norm !== q) queries.push(norm);
  // Without spaces
  const noSpace = norm.replace(/\s/g, '');
  if (noSpace !== norm && noSpace.length >= 2) queries.push(noSpace);
  // Check alias map
  const alias = resolveAlias(q);
  if (alias) queries.push(alias);
  // Deduplicate
  return [...new Set(queries)];
}

function fetchYahooSearch(query) {
  return new Promise((resolve, reject) => {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
    const apiReq = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    }, (apiRes) => {
      let data = '';
      let bytes = 0;
      apiRes.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          apiReq.destroy(new Error('Upstream response too large'));
          reject(new Error('Upstream response too large'));
          return;
        }
        data += chunk;
      });
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          const quotes = (json.quotes || []).map((item) => ({
            symbol: item.symbol,
            shortname: item.shortname,
            longname: item.longname,
            exchDisp: item.exchDisp,
            typeDisp: item.typeDisp,
            exchange: item.exchDisp || item.exchange || null,
            quoteType: item.quoteType || item.typeDisp || null,
          }));
          resolve(quotes);
        } catch (e) {
          reject(e);
        }
      });
    });
    apiReq.on('error', reject);
    apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      apiReq.destroy(new Error('Upstream timeout'));
      reject(new Error('Upstream timeout'));
    });
  });
}

module.exports = async (req, res) => {
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

  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });
  if (q.length > 64) return res.status(400).json({ error: 'Query too long' });

  try {
    const variations = buildQueryVariations(q);
    let bestResults = [];

    for (const query of variations) {
      try {
        const quotes = await fetchYahooSearch(query);
        if (quotes.length > bestResults.length) {
          bestResults = quotes;
        }
        // If we got good results, stop trying variations
        if (bestResults.length >= 3) break;
      } catch {
        // Try next variation
      }
    }

    // Deduplicate by symbol
    const seen = new Set();
    const deduped = [];
    for (const q of bestResults) {
      if (!seen.has(q.symbol)) {
        seen.add(q.symbol);
        deduped.push(q);
      }
    }

    return res.json({ quotes: deduped });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
