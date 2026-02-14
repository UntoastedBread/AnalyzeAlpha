const https = require('https');

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://analyze-alpha.vercel.app',
  'http://localhost:3000',
]);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const MAX_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 8000;
const NEWS_IMAGE_BASE_TAGS = ['finance', 'stock-market', 'business', 'wall-street'];
const NEWS_IMAGE_STOP_WORDS = new Set([
  'about', 'after', 'ahead', 'amid', 'analyst', 'analysts', 'and', 'are', 'as', 'at',
  'be', 'by', 'for', 'from', 'has', 'have', 'in', 'into', 'its', 'market', 'markets',
  'news', 'new', 'on', 'of', 'or', 'out', 'over', 'says', 'stock', 'stocks', 'the',
  'their', 'this', 'to', 'today', 'under', 'update', 'vs', 'what', 'when', 'why', 'with',
]);
const NEWS_IMAGE_AI_MARKERS = [
  /midjourney/i,
  /stability\.ai/i,
  /stable[-_ ]?diffusion/i,
  /dall[-_ ]?e/i,
  /openai/i,
  /sora/i,
  /ideogram/i,
  /leonardo/i,
  /dreamstudio/i,
  /ai[-_ ]?(generated|art|image|render)/i,
  /(generated|synthetic)[-_ ]?(image|art)/i,
];
const RSS_NEWS_SOURCES = [
  { url: 'https://www.investing.com/rss/news_25.rss', defaultSource: 'Investing.com' },
  { url: 'https://finance.yahoo.com/news/rssindex', defaultSource: 'Yahoo Finance' },
];
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

function hashText(text) {
  let hash = 0;
  const str = String(text || '');
  for (let i = 0; i < str.length; i += 1) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function extractNewsKeywords(title) {
  const raw = String(title || '')
    .toLowerCase()
    .replace(/&amp;/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const unique = [];
  for (const word of raw) {
    if (word.length < 3) continue;
    if (!/[a-z]/.test(word)) continue;
    if (NEWS_IMAGE_STOP_WORDS.has(word)) continue;
    if (unique.includes(word)) continue;
    unique.push(word);
    if (unique.length >= 4) break;
  }
  return unique;
}

function buildTitleImageUrl(title) {
  const seed = hashText(title || 'market news');
  const hueA = seed % 360;
  const hueB = (hueA + 32) % 360;
  const keywords = extractNewsKeywords(title);
  const titleText = (keywords.length ? keywords : NEWS_IMAGE_BASE_TAGS.slice(0, 3))
    .join(' · ')
    .toUpperCase()
    .slice(0, 48);
  const bars = Array.from({ length: 8 }, (_, i) => {
    const h = 30 + ((seed >> (i % 12)) % 70);
    const x = 64 + i * 78;
    const y = 412 - h;
    return `<rect x="${x}" y="${y}" width="44" height="${h}" fill="rgba(255,255,255,0.24)" />`;
  }).join('');
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" role="img" aria-label="Market news placeholder">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueA}, 42%, 22%)"/>
      <stop offset="100%" stop-color="hsl(${hueB}, 48%, 14%)"/>
    </linearGradient>
  </defs>
  <rect width="800" height="500" fill="url(#bg)"/>
  <path d="M40 360 L160 312 L260 332 L360 250 L470 274 L570 206 L670 228 L760 164" fill="none" stroke="rgba(255,255,255,0.76)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  ${bars}
  <rect x="36" y="34" width="728" height="64" fill="rgba(0,0,0,0.26)"/>
  <text x="56" y="75" fill="rgba(255,255,255,0.95)" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${titleText || 'MARKET UPDATE'}</text>
</svg>
`.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function isLikelyAiImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return NEWS_IMAGE_AI_MARKERS.some((pattern) => pattern.test(url));
}

function getTagValue(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? (m[1] || m[2] || '').trim() : '';
}

function extractRssItems(xml, defaultSource) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const mediaMatch = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    const enclosureMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    const mediaThumbMatch = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    const descImgMatch = block.match(/<img[^>]+src=["']([^"']+)["']/i);
    const title = getTagValue(block, 'title');
    const description = getTagValue(block, 'description').replace(/<[^>]*>/g, '').slice(0, 200);
    const link = getTagValue(block, 'link');
    const source = getTagValue(block, 'source') || getTagValue(block, 'author') || defaultSource || 'Market News';
    const rawImage = (mediaMatch && mediaMatch[1]) || (enclosureMatch && enclosureMatch[1]) || (mediaThumbMatch && mediaThumbMatch[1]) || (descImgMatch && descImgMatch[1]) || '';
    const hasHttpImage = /^https?:\/\//i.test(rawImage);
    const image = hasHttpImage && !isLikelyAiImageUrl(rawImage)
      ? rawImage
      : buildTitleImageUrl(title || description || source);
    if (!title && !link) continue;
    items.push({
      title,
      link,
      pubDate: getTagValue(block, 'pubDate'),
      description,
      source,
      image,
    });
  }
  return items;
}

function fetchRssXml(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (!['investing.com', 'yahoo.com'].some((domain) => parsed.hostname.endsWith(domain))) {
      reject(new Error('Blocked hostname'));
      return;
    }
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    }, (apiRes) => {
      let data = '';
      let bytes = 0;
      apiRes.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          req.destroy(new Error('Upstream response too large'));
          return;
        }
        data += chunk;
      });
      apiRes.on('end', () => {
        if (apiRes.statusCode && apiRes.statusCode >= 400) {
          reject(new Error(`Upstream HTTP ${apiRes.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    req.setTimeout(UPSTREAM_TIMEOUT_MS, () => req.destroy(new Error('Upstream timeout')));
    req.on('error', reject);
  });
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
      for (const source of RSS_NEWS_SOURCES) {
        try {
          const xml = await fetchRssXml(source.url);
          const items = extractRssItems(xml, source.defaultSource);
          if (items.length > 0) {
            const deduped = [];
            const seen = new Set();
            for (const item of items) {
              const key = item.link || item.title;
              if (!key || seen.has(key)) continue;
              seen.add(key);
              deduped.push(item);
              if (deduped.length >= 20) break;
            }
            return res.status(200).json({ items: deduped });
          }
        } catch {
          // Try next source
        }
      }
      return res.status(502).json({ error: 'All RSS sources failed' });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  })();

  return undefined;
};
