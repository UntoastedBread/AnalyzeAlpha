const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());

app.get('/api/chart/:ticker', (req, res) => {
  const { ticker } = req.params;
  const range = req.query.range || '1y';
  const interval = req.query.interval || '1d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&includePrePost=false`;

  console.log(`[Proxy] Fetching: ${ticker} range=${range}`);

  https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  }, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try {
        res.setHeader('Content-Type', 'application/json');
        res.status(apiRes.statusCode).send(data);
        console.log(`[Proxy] ✓ ${ticker} — ${apiRes.statusCode}`);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ ${ticker} — ${e.message}`);
    res.status(500).json({ error: e.message });
  });
});

app.get('/api/rss', (req, res) => {
  const rssUrl = 'https://finance.yahoo.com/news/rssindex';
  const parsed = new URL(rssUrl);
  if (!parsed.hostname.endsWith('yahoo.com')) {
    return res.status(403).json({ error: 'Blocked hostname' });
  }

  console.log('[Proxy] Fetching RSS feed');

  https.get(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  }, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
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
          items.push({
            title: get('title'),
            link: get('link'),
            pubDate: get('pubDate'),
            description: get('description').replace(/<[^>]*>/g, '').slice(0, 200),
            source: get('source') || 'Yahoo Finance',
          });
        }
        res.json({ items: items.slice(0, 12) });
        console.log(`[Proxy] ✓ RSS — ${items.length} items`);
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  }).on('error', (e) => {
    console.error(`[Proxy] ✗ RSS — ${e.message}`);
    res.status(500).json({ error: e.message });
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────┐`);
  console.log(`  │  Yahoo Finance proxy on :${PORT}        │`);
  console.log(`  │  React app will proxy /api/* here   │`);
  console.log(`  └─────────────────────────────────────┘\n`);
});
