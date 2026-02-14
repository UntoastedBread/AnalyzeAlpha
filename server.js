const express = require('express');
const https = require('https');

const app = express();

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://analyze-alpha.vercel.app',
  'http://localhost:3000',
]);
const ALLOWED_RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']);
const ALLOWED_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const MAX_MODULES_COUNT = 8;
const MAX_MODULES_LEN = 160;
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

app.use((req, res, next) => {
  setCors(req, res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.path.startsWith('/api/') && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  return next();
});

app.get('/api/chart/:ticker', (req, res) => {
  const ticker = normalizeParam(req.params.ticker);
  const range = normalizeParam(req.query.range) || '1y';
  const interval = normalizeParam(req.query.interval) || '1d';
  if (!ticker || !/^[A-Za-z0-9=^.\-]{1,12}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }
  if (!ALLOWED_RANGES.has(range)) {
    return res.status(400).json({ error: 'Invalid range' });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return res.status(400).json({ error: 'Invalid interval' });
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&includePrePost=false`;

  console.log(`[Proxy] Fetching: ${ticker} range=${range}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        console.log(`[Proxy] ✓ ${ticker} — ${apiRes.statusCode}`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ ${ticker} — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

app.get('/api/search', (req, res) => {
  const q = normalizeParam(req.query.q);
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });
  if (q.length > 64) return res.status(400).json({ error: 'Query too long' });

  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
  console.log(`[Proxy] Search: ${q}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        const json = JSON.parse(data);
        const quotes = (json.quotes || []).map(q => ({
          symbol: q.symbol,
          shortname: q.shortname,
          longname: q.longname,
          exchDisp: q.exchDisp,
          typeDisp: q.typeDisp,
        }));
        res.json({ quotes });
        console.log(`[Proxy] ✓ Search "${q}" — ${quotes.length} results`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ Search — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

app.get('/api/rss', (req, res) => {
  const rssUrl = 'https://finance.yahoo.com/news/rssindex';
  const parsed = new URL(rssUrl);
  if (!parsed.hostname.endsWith('yahoo.com')) {
    return res.status(403).json({ error: 'Blocked hostname' });
  }

  console.log('[Proxy] Fetching RSS feed');

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(data)) !== null) {
          const block = match[1];
          const get = (tag) => {
            const m = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([\\s\\S]*?)<\\/${tag}>`));
            return m ? (m[1] || m[2] || '').trim() : '';
          };
          const imageMatch = block.match(/<media:content[^>]+url=["']([^"']+)["']/);
          items.push({
            title: get('title'),
            link: get('link'),
            pubDate: get('pubDate'),
            description: get('description').replace(/<[^>]*>/g, '').slice(0, 200),
            source: get('source') || 'Yahoo Finance',
            image: imageMatch ? imageMatch[1] : null,
          });
        }
        res.json({ items: items.slice(0, 20) });
        console.log(`[Proxy] ✓ RSS — ${items.length} items`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ RSS — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

app.get('/api/summary/:ticker', (req, res) => {
  const ticker = normalizeParam(req.params.ticker);
  const modules = normalizeParam(req.query.modules) || 'price,financialData,defaultKeyStatistics,summaryDetail';
  if (!/^[A-Za-z0-9=^.\-]{1,12}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }
  if (!/^[A-Za-z0-9,]+$/.test(modules)) {
    return res.status(400).json({ error: 'Invalid modules' });
  }
  if (modules.length > MAX_MODULES_LEN) {
    return res.status(400).json({ error: 'Modules too long' });
  }
  const moduleList = modules.split(',').filter(Boolean);
  if (!moduleList.length || moduleList.length > MAX_MODULES_COUNT) {
    return res.status(400).json({ error: 'Too many modules' });
  }
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
  console.log(`[Proxy] Summary: ${ticker} modules=${modules}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        console.log(`[Proxy] ✓ Summary ${ticker} — ${apiRes.statusCode}`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ Summary ${ticker} — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

app.get('/api/recommendations/:ticker', (req, res) => {
  const ticker = normalizeParam(req.params.ticker);
  if (!/^[A-Za-z0-9=^.\-]{1,12}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }
  const url = `https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(ticker)}`;
  console.log(`[Proxy] Recommendations: ${ticker}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        const json = JSON.parse(data);
        const symbols = (json?.finance?.result?.[0]?.recommendedSymbols || [])
          .map(s => s?.symbol)
          .filter(Boolean);
        res.json({ symbols });
        console.log(`[Proxy] ✓ Recommendations ${ticker} — ${symbols.length} symbols`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ Recommendations ${ticker} — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

// ── Options chain ────────────────────────────────────────
app.get('/api/options/:ticker', (req, res) => {
  const ticker = normalizeParam(req.params.ticker);
  if (!/^[A-Za-z0-9=^.\-]{1,12}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}`,
    `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}`,
    `https://query2.finance.yahoo.com/v6/finance/options/${encodeURIComponent(ticker)}`,
  ];
  console.log(`[Proxy] Options: ${ticker}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  function tryUrl(index) {
    if (index >= urls.length) {
      return fail(404, 'Options data not available');
    }
    const url = urls[index];
    const apiReq = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
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
        if (apiRes.statusCode === 404 && index < urls.length - 1) {
          console.log(`[Proxy] Options ${ticker} — 404 on ${url}, trying fallback`);
          return tryUrl(index + 1);
        }
        try {
          res.setHeader('Content-Type', 'application/json');
          res.status(apiRes.statusCode).send(data);
          console.log(`[Proxy] ✓ Options ${ticker} — ${apiRes.statusCode}`);
        } catch (e) {
          fail(500, e.message);
        }
      });
    }).on('error', (e) => {
      if (index < urls.length - 1) {
        console.log(`[Proxy] Options ${ticker} — error on ${url}, trying fallback`);
        return tryUrl(index + 1);
      }
      console.error(`[Proxy] ✗ Options ${ticker} — ${e.message}`);
      fail(502, e.message);
    });
    apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      apiReq.destroy(new Error('Upstream timeout'));
      if (index < urls.length - 1) {
        return tryUrl(index + 1);
      }
      fail(504, 'Upstream timeout');
    });
  }

  tryUrl(0);
});

// ── Fundamentals (financial statements) ─────────────────
app.get('/api/fundamentals/:ticker', (req, res) => {
  const ticker = normalizeParam(req.params.ticker);
  if (!/^[A-Za-z0-9=^.\-]{1,12}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }
  const modules = 'incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory,earningsHistory,financialData,defaultKeyStatistics,summaryDetail';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
  console.log(`[Proxy] Fundamentals: ${ticker}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        console.log(`[Proxy] ✓ Fundamentals ${ticker} — ${apiRes.statusCode}`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ Fundamentals ${ticker} — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

// ── Earnings data ───────────────────────────────────────
app.get('/api/earnings/:ticker', (req, res) => {
  const ticker = normalizeParam(req.params.ticker);
  if (!/^[A-Za-z0-9=^.\-]{1,12}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }
  const modules = 'earningsHistory,earningsTrend,calendarEvents';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
  console.log(`[Proxy] Earnings: ${ticker}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        console.log(`[Proxy] ✓ Earnings ${ticker} — ${apiRes.statusCode}`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ Earnings ${ticker} — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

// ── Dividend history ────────────────────────────────────
app.get('/api/dividends/:ticker', (req, res) => {
  const ticker = normalizeParam(req.params.ticker);
  if (!/^[A-Za-z0-9=^.\-]{1,12}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=10y&interval=3mo&events=div`;
  console.log(`[Proxy] Dividends: ${ticker}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        console.log(`[Proxy] ✓ Dividends ${ticker} — ${apiRes.statusCode}`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ Dividends ${ticker} — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

// ── Institutional/insider holders ───────────────────────
app.get('/api/holders/:ticker', (req, res) => {
  const ticker = normalizeParam(req.params.ticker);
  if (!/^[A-Za-z0-9=^.\-]{1,12}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }
  const modules = 'insiderHolders,institutionOwnership,majorHoldersBreakdown';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
  console.log(`[Proxy] Holders: ${ticker}`);

  let responded = false;
  const fail = (status, message) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error: message });
  };

  const apiReq = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
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
        console.log(`[Proxy] ✓ Holders ${ticker} — ${apiRes.statusCode}`);
      } catch (e) {
        fail(500, e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ Holders ${ticker} — ${e.message}`);
    fail(502, e.message);
  });
  apiReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    apiReq.destroy(new Error('Upstream timeout'));
    fail(504, 'Upstream timeout');
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────┐`);
  console.log(`  │  Yahoo Finance proxy on :${PORT}        │`);
  console.log(`  │  React app will proxy /api/* here   │`);
  console.log(`  └─────────────────────────────────────┘\n`);
});
