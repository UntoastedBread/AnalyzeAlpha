# AnalyzeAlpha

Quantitative stock analysis platform with live Yahoo Finance data, technical indicators, regime detection, valuation models, and market heatmaps.

**Live:** [UntoastedBread.github.io/AnalyzeAlpha](https://UntoastedBread.github.io/AnalyzeAlpha)

## Quick Start

```bash
npm install
npm start
```

This launches:
- **React app** on `http://localhost:3000`
- **Yahoo Finance proxy** on `http://localhost:3001`

The proxy is needed because Yahoo Finance blocks browser CORS requests. The React dev server forwards `/api/*` requests to the proxy automatically.

## Features

### Analysis
- **Technical Indicators** — RSI, MACD, Bollinger Bands, ADX, Stochastic Oscillator
- **Composite Recommendation Engine** — Weighted scoring across technical, statistical, regime, and valuation signals with buy/sell/hold output and confidence level
- **Market Regime Detection** — Trend direction/strength, volatility classification, and Hurst exponent
- **Risk Metrics** — Sharpe ratio, max drawdown, volatility, and risk-level classification

### Valuation
- **Stretch Index** — Composite over/undervaluation score using SMA deviation, Bollinger %B, RSI, and 52-week range position
- **Fair Value Estimation** — SMA-200 based fair value with valuation verdict
- **Valuation Model Toolkit** (Pro) — Adjustable assumptions for multi-model valuation analysis

### Financials (Pro)
- Company fundamentals aggregation with radar and cash/debt visualizations
- Multi-period financial statement analysis

### Charts
- Interactive price charts with toggleable technical overlays (SMA, Bollinger Bands, volume)
- Candlestick rendering and brush selection for zoom
- Expandable full-screen chart modal

### Heatmap (Pro)
- Treemap of S&P 20 stocks sized by market cap, colored by Sharpe ratio
- Parallel data fetching with risk and regime overlays

### Comparison (Pro)
- Multi-stock table with sortable columns across signals, risk, and valuation
- Sharpe ratio bar chart comparison

### Tools
- **Watchlist** — Track tickers with live price and recommendation
- **Price Alerts** — Set above/below price triggers per ticker

### Live Ticker
- Price polling every 15 seconds with animated sliding numbers
- Latency indicator and data source badge

## Tech Stack

- **Frontend** — React 18, Recharts
- **Backend** — Express proxy server (Node.js)
- **Data** — Yahoo Finance public API (no API key required)
- **Deployment** — GitHub Pages via `gh-pages`

## Architecture

```
├── server.js          # Express proxy for Yahoo Finance API
├── public/            # Static assets
│   └── index.html
└── src/
    ├── index.js       # React entry point
    ├── index.css      # Global styles + animations
    ├── App.js         # Full application (data, analysis, UI)
    └── App.css        # Component styles
```

## Deployment

Deploy to GitHub Pages:

```bash
npm run deploy
```

This runs `react-scripts build` followed by `gh-pages -d build`, publishing to the configured homepage.

## Notes

- All analysis is computed client-side in the browser
- No API keys required — Yahoo Finance public endpoints
- For educational purposes only — not financial advice
