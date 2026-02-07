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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────┐`);
  console.log(`  │  Yahoo Finance proxy on :${PORT}        │`);
  console.log(`  │  React app will proxy /api/* here   │`);
  console.log(`  └─────────────────────────────────────┘\n`);
});
