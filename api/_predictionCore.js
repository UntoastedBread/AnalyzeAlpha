const https = require('https');

const MAX_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 45 * 1000;
const POLYMARKET_URL = 'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=180&order=volume24hr&ascending=false';
const ALLOWED_HOSTS = new Set(['gamma-api.polymarket.com']);

let cache = {
  ts: 0,
  payload: null,
};

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, toNumber(value, 0)));
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeText(value) {
  return String(value || '').trim();
}

function inferCategory(title, tags = []) {
  const joinedTags = Array.isArray(tags)
    ? tags.map(t => normalizeText(t).toLowerCase()).filter(Boolean)
    : [];
  const text = `${normalizeText(title)} ${joinedTags.join(' ')}`.toLowerCase();

  if (joinedTags.some(t => /politics?|election|geopolitics?|government/.test(t))) return 'Politics';
  if (joinedTags.some(t => /economy|macro|rates?|inflation|fed|finance/.test(t))) return 'Economy';
  if (joinedTags.some(t => /crypto|bitcoin|ethereum|defi|blockchain/.test(t))) return 'Crypto';
  if (joinedTags.some(t => /sports?|nfl|nba|mlb|nhl|football|soccer/.test(t))) return 'Sports';
  if (joinedTags.some(t => /tech|ai|science/.test(t))) return 'Tech';

  if (/\b(election|president|senate|house|prime minister|parliament|democrat|republican|campaign|vote|voting|trump|biden)\b/i.test(text)) return 'Politics';
  if (/\b(fed|fomc|cpi|inflation|gdp|recession|interest rate|rates|treasury|yield|jobs report|payroll|unemployment|economy)\b/i.test(text)) return 'Economy';
  if (/\b(bitcoin|btc|ethereum|eth|crypto|solana|xrp|doge|defi|stablecoin)\b/i.test(text)) return 'Crypto';
  if (/\b(nfl|nba|mlb|nhl|soccer|football|super bowl|championship|world cup|olympics|ufc|tennis|golf)\b/i.test(text)) return 'Sports';
  if (/\b(ai|openai|anthropic|google|microsoft|apple|tesla|nvidia|chip|semiconductor|iphone|android|tech)\b/i.test(text)) return 'Tech';

  return 'General';
}

function calcActivityScore(item) {
  const vol24 = toNumber(item.volume24h, 0);
  const totalVol = toNumber(item.volumeTotal, 0);
  const liq = toNumber(item.liquidity, 0);
  return Math.log10(1 + vol24) + (0.6 * Math.log10(1 + liq)) + (0.35 * Math.log10(1 + totalVol));
}

function normalizePolymarket(markets) {
  if (!Array.isArray(markets)) return [];
  const rows = [];

  for (const market of markets) {
    if (!market || !market.active || market.closed || market.archived) continue;

    const title = normalizeText(market.question);
    if (!title) continue;

    const outcomes = parseArray(market.outcomes).map(o => normalizeText(o));
    const prices = parseArray(market.outcomePrices).map(v => toNumber(v, NaN));
    if (!prices.length) continue;

    const yesIdx = outcomes.findIndex(o => o.toLowerCase() === 'yes');
    const noIdx = outcomes.findIndex(o => o.toLowerCase() === 'no');

    let probYes = NaN;
    let yesLabel = 'YES';
    let noLabel = 'NO';
    if (yesIdx >= 0 && Number.isFinite(prices[yesIdx])) {
      probYes = clamp01(prices[yesIdx]);
      if (noIdx >= 0 && outcomes[noIdx]) noLabel = outcomes[noIdx].toUpperCase().slice(0, 20);
    } else if (Number.isFinite(prices[0])) {
      probYes = clamp01(prices[0]);
      yesLabel = (outcomes[0] || 'OUTCOME 1').toUpperCase().slice(0, 20);
      noLabel = (outcomes[1] || 'OUTCOME 2').toUpperCase().slice(0, 20);
    }
    if (!Number.isFinite(probYes)) continue;

    const attachedEvents = Array.isArray(market.events) ? market.events : [];
    const primaryEvent = attachedEvents[0] || {};
    const eventSlug = normalizeText(primaryEvent.slug || market.eventSlug);
    const subtitle = normalizeText(primaryEvent.title);
    const image = normalizeText(market.image || market.icon || primaryEvent.image || primaryEvent.icon) || null;
    const eventTags = Array.isArray(primaryEvent.tags)
      ? primaryEvent.tags.map(tag => normalizeText(tag?.label || tag?.slug || tag?.name)).filter(Boolean)
      : [];
    const marketTags = Array.isArray(market.tags)
      ? market.tags.map(tag => normalizeText(tag?.label || tag?.slug || tag?.name)).filter(Boolean)
      : [];
    const tags = [...eventTags, ...marketTags];

    rows.push({
      id: `poly-${normalizeText(market.id || market.slug || title).toLowerCase()}`,
      source: 'Polymarket',
      title,
      subtitle: subtitle || null,
      category: inferCategory(title, tags),
      probYes,
      yesLabel,
      noLabel,
      volume24h: toNumber(market.volume24hr || primaryEvent.volume24hr, 0),
      volumeTotal: toNumber(market.volumeNum || market.volume || primaryEvent.volume, 0),
      liquidity: toNumber(market.liquidityNum || market.liquidity || primaryEvent.liquidity, 0),
      closeTime: normalizeText(market.endDateIso || market.endDate || primaryEvent.endDate) || null,
      url: eventSlug
        ? `https://polymarket.com/event/${encodeURIComponent(eventSlug)}`
        : 'https://polymarket.com',
      image,
      tags,
    });
  }

  rows.sort((a, b) => calcActivityScore(b) - calcActivityScore(a));
  return rows.slice(0, 120);
}

function dedupeMarkets(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${normalizeText(item.source).toLowerCase()}::${normalizeText(item.title).toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildStats(items, sourceStatus) {
  const bySourceMap = new Map();
  const categoryMap = new Map();

  for (const item of items) {
    const source = item.source || 'Unknown';
    const category = item.category || 'General';

    const sourceRow = bySourceMap.get(source) || {
      source,
      count: 0,
      volume24h: 0,
      volumeTotal: 0,
      liquidity: 0,
      unit: source === 'Polymarket' ? 'USD' : 'MANA',
    };

    sourceRow.count += 1;
    sourceRow.volume24h += toNumber(item.volume24h, 0);
    sourceRow.volumeTotal += toNumber(item.volumeTotal, 0);
    sourceRow.liquidity += toNumber(item.liquidity, 0);
    bySourceMap.set(source, sourceRow);

    categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
  }

  const avgConviction = items.length
    ? (items.reduce((sum, item) => sum + Math.abs(toNumber(item.probYes, 0.5) - 0.5), 0) / items.length) * 200
    : 0;

  const bySource = Array.from(bySourceMap.values())
    .sort((a, b) => b.count - a.count)
    .map(row => ({
      ...row,
      volume24h: Number(row.volume24h.toFixed(2)),
      volumeTotal: Number(row.volumeTotal.toFixed(2)),
      liquidity: Number(row.liquidity.toFixed(2)),
    }));

  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalMarkets: items.length,
    averageConviction: Number(avgConviction.toFixed(1)),
    bySource,
    categories,
    sources: sourceStatus,
  };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Invalid URL'));
      return;
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      reject(new Error('Blocked hostname'));
      return;
    }

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
      },
    }, (res) => {
      let data = '';
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          req.destroy(new Error('Upstream response too large'));
          return;
        }
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Upstream HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid upstream JSON'));
        }
      });
    });

    req.setTimeout(UPSTREAM_TIMEOUT_MS, () => req.destroy(new Error('Upstream timeout')));
    req.on('error', reject);
  });
}

async function fetchPredictionMarkets() {
  const now = Date.now();
  if (cache.payload && (now - cache.ts) < CACHE_TTL_MS) {
    return cache.payload;
  }

  const [polyRes] = await Promise.allSettled([
    fetchJson(POLYMARKET_URL),
  ]);

  const polyItems = polyRes.status === 'fulfilled' ? normalizePolymarket(polyRes.value) : [];

  let combined = dedupeMarkets([...polyItems]);
  if (!combined.length) {
    const polyError = polyRes.status === 'rejected' ? polyRes.reason?.message : null;
    throw new Error(polyError ? `Polymarket unavailable: ${polyError}` : 'Polymarket unavailable');
  }

  combined = combined.map((item) => {
    const activityScore = calcActivityScore(item);
    const convictionScore = Math.abs(toNumber(item.probYes, 0.5) - 0.5) * 2;
    const rankScore = (activityScore * 0.67) + (convictionScore * 0.33);
    return {
      ...item,
      activityScore: Number(activityScore.toFixed(6)),
      convictionScore: Number(convictionScore.toFixed(6)),
      rankScore: Number(rankScore.toFixed(6)),
    };
  });

  combined.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    if (b.activityScore !== a.activityScore) return b.activityScore - a.activityScore;
    return b.volume24h - a.volume24h;
  });
  const TARGET_COUNT = 80;
  const limited = combined.slice(0, TARGET_COUNT);
  const sourceStatus = [
    {
      source: 'Polymarket',
      ok: polyRes.status === 'fulfilled',
      count: polyItems.length,
      error: polyRes.status === 'rejected' ? normalizeText(polyRes.reason?.message) || 'Source unavailable' : null,
    },
  ];

  const payload = {
    updatedAt: new Date(now).toISOString(),
    items: limited,
    stats: buildStats(limited, sourceStatus),
  };

  cache = {
    ts: now,
    payload,
  };

  return payload;
}

module.exports = {
  fetchPredictionMarkets,
};
