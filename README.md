# Stock Analyzer Pro

Quantitative stock analysis platform with live Yahoo Finance data, technical indicators, regime detection, valuation analysis, and market heatmaps.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the app (runs both React + Yahoo Finance proxy)
npm start
```

This launches:
- **React app** on `http://localhost:3000`
- **Yahoo Finance proxy** on `http://localhost:3001`

The proxy is needed because Yahoo Finance blocks browser CORS requests. The React dev server forwards `/api/*` requests to the proxy automatically.

## Features

- **Analysis** — RSI, MACD, Bollinger Bands, ADX, Stochastic + composite recommendation engine
- **Valuation** — Stretch Index (SMA deviation, Bollinger %B, RSI, 52-week range) for over/undervaluation detection
- **Charts** — Interactive price charts with toggleable technical overlays and brush selection
- **Heatmap** — Treemap of S&P 20 stocks sized by market cap, colored by Sharpe ratio
- **Comparison** — Multi-stock table with sortable columns and Sharpe bar chart
- **Tools** — Watchlist and price alert dropdown
- **Live Ticker** — Price polling every 15s with animated sliding numbers and latency indicator

## Architecture

```
stock-analyzer-pro/
├── server.js          # Express proxy for Yahoo Finance API
├── public/            # Static assets
│   └── index.html
└── src/
    ├── index.js       # React entry
    ├── index.css      # Global styles + animations
    ├── App.js         # Full application (data, analysis, UI)
    └── App.css
```

## Notes

- All analysis is computed client-side in the browser
- No API keys required — Yahoo Finance public endpoints
- For educational purposes only — not financial advice
