# AnalyzeAlpha

## Architecture
- **Frontend:** React (JSX), built with Vite, outputs to `dist/`
- **Deployment:** Vercel — serverless functions live in `api/` directory
- **Local dev server:** `server.js` (Express) — mirrors all API routes; any new route must exist in both `server.js` and `api/` for production
- **Routing:** `vercel.json` has rewrite rules for dynamic routes (e.g., `/api/chart/:ticker` → `/api/chart/[ticker]`)

## API Endpoints

### `/api/chart/[ticker]` — Stock chart data
- **Source:** Yahoo Finance v8 (`query1.finance.yahoo.com/v8/finance/chart/`)
- **No crumb required**
- Passes through Yahoo response as-is
- `Cache-Control: s-maxage=300, stale-while-revalidate=600`

### `/api/summary/[ticker]` — Stock quote summary (iOS app)
- **Source:** Yahoo Finance v8 chart meta (`query1.finance.yahoo.com/v8/finance/chart/` with `range=1d&interval=1d`)
- **No crumb required** — v7/quote is now blocked ("Unauthorized"), v10/quoteSummary requires a crumb — both are unusable
- Extracts quote data from chart `meta` object, computes change/changePercent from price - previousClose
- Reshapes into nested `quoteSummary.result[0]` structure with `{ raw: value }` wrappers
- Maps: `price.*`, `summaryDetail.fiftyTwoWeekHigh/Low`, `financialData.currentPrice`; `marketCap` unavailable via v8
- `Cache-Control: s-maxage=15, stale-while-revalidate=30`

### `/api/search` — Ticker/company search
- **Source:** Yahoo Finance v1 (`query2.finance.yahoo.com/v1/finance/search`)
- Includes alias map for common company names/misspellings with fuzzy matching
- Returns both `exchDisp`/`typeDisp` (web) and `exchange`/`quoteType` (iOS) fields

### `/api/rss` — Market news
- **Source:** Investing.com RSS feed

### `/api/prediction` — Prediction markets
- **Source:** Polymarket API
- Core logic in `api/_predictionCore.js`

### `/api/health` — Connectivity check
- Returns `{ "ok": true }`

## iOS App API Contract
- The iOS app calls: `/api/summary/:ticker`, `/api/chart/:ticker`, `/api/search?q=...`
- All value fields use `{ "raw": number }` wrapper objects
- Tickers may contain dots or dashes (e.g., BRK.B, RDS-A)
- Client polls summary ~every 15 seconds

## Yahoo Finance API Notes
- **v8/finance/chart** does NOT require a crumb — use this for both chart data and quote data (via `meta` object)
- **v1/finance/search** does NOT require a crumb
- **v7/finance/quote** is now BLOCKED ("Unauthorized") — do NOT use
- **v10/finance/quoteSummary** REQUIRES a crumb — do NOT use

## Common Patterns
- All API routes: CORS, rate limiting (120 req/min/IP), input validation, 8s upstream timeout, 2MB response limit
- Vercel serverless functions use raw `https` module (no axios/fetch)
- `server.js` has in-memory cache (`apiCache` Map with TTL); Vercel relies on `Cache-Control` headers

## Workflow
- Always push changes to the repo after completing work so Vercel auto-deploys
- Use Claude in Chrome extension (browser automation MCP tools) to test the live site at analyze-alpha.vercel.app
