# CLAUDE.md — AnalyzeAlpha

This file provides context for AI assistants working on the AnalyzeAlpha codebase.

## Project Overview

AnalyzeAlpha (`package.json` name: `stock-analyzer-pro`, v0.3.12) is a quantitative stock analysis platform. It fetches live data from the Yahoo Finance public API (no API key required) and computes all analysis client-side. It is live at [analyze-alpha.vercel.app](https://analyze-alpha.vercel.app).

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (port 3000) + Express proxy (port 3001) concurrently
npm run dev:client   # Vite only
npm run dev:server   # Express proxy only
npm run build        # Production Vite build → dist/
npm run preview      # Preview the production build
npm run deploy       # Build then publish to GitHub Pages via gh-pages
npm test             # Currently a no-op ("No tests configured")
```

The Vite dev server proxies all `/api/*` requests to `http://localhost:3001` (defined in `vite.config.js`). The Express proxy (`server.js`) handles those requests and forwards them to Yahoo Finance, bypassing browser CORS restrictions.

## Repository Structure

```
AnalyzeAlpha/
├── server.js                   # Express proxy server (port 3001, 892 lines)
├── vite.config.js              # Vite config: port 3000, /api proxy → 3001, outDir: dist
├── package.json
├── index.html                  # Vite entry HTML
├── nginx/
│   └── analyzealpha.conf       # Nginx reverse proxy config (self-hosted)
├── deploy.sh                   # Self-hosted deploy: git pull → npm install → build → pm2 restart
├── setup-pi.sh                 # Raspberry Pi initial setup script (Node, PM2, nginx)
├── api/                        # Vercel serverless functions (mirror of server.js routes)
│   ├── _predictionCore.js      # Shared Polymarket fetcher (used by server.js and api/prediction.js)
│   ├── prediction.js           # GET /api/prediction
│   ├── search.js               # GET /api/search?q=
│   ├── rss.js                  # GET /api/rss
│   └── chart/
│       └── [ticker].js         # GET /api/chart/:ticker
├── src/
│   ├── index.jsx               # React entry point
│   ├── index.css               # Global styles and CSS animations
│   ├── App.jsx                 # Root application component (~5000+ lines)
│   ├── App.css                 # Component-level styles
│   ├── App.test.js             # Minimal test file (placeholder)
│   ├── supabaseClient.js       # Supabase client initialization
│   ├── reportWebVitals.js
│   ├── setupTests.js
│   ├── logo.svg
│   ├── i18n/
│   │   └── translations.js     # All UI strings for 11 languages
│   ├── components/
│   │   └── ui/
│   │       └── primitives.jsx  # Reusable UI components
│   └── pages/                  # One file per top-level tab
│       ├── HomeTab.jsx
│       ├── AnalysisTab.jsx
│       ├── ChartsTab.jsx
│       ├── HeatmapTab.jsx
│       ├── ComparisonTab.jsx
│       ├── ScreenerTab.jsx
│       ├── MarketsTab.jsx
│       ├── PortfolioTab.jsx
│       ├── BacktestTab.jsx
│       ├── CommunityTab.jsx
│       └── AccountTab.jsx
├── public/                     # Static assets served as-is
├── dist/                       # Production build output (gitignored in .gitignore but present)
└── .env.production             # Only contains: GENERATE_SOURCEMAP=false
```

## Architecture

### Two Deployment Modes

**Vercel (primary):**
- Frontend: Vite static build served by Vercel CDN
- Backend: `api/` folder as Vercel serverless functions
- Each file in `api/` is a standalone serverless handler (uses `module.exports = (req, res) => {}`)

**Self-hosted (Raspberry Pi / VPS):**
- `server.js` runs as the Express process on port 3001 (managed by PM2)
- Nginx listens on port 80, proxies `/api/*` to Express, serves `dist/` for everything else
- Config: `nginx/analyzealpha.conf`

The `api/_predictionCore.js` module is shared between both deployment modes (`server.js` requires it, `api/prediction.js` also requires it).

### Data Flow

```
Browser → Vite dev server → /api/* → Express proxy → Yahoo Finance public API
                                   → /api/rss     → investing.com RSS
                                   → /api/prediction → Polymarket API
```

All stock analysis (technical indicators, regime detection, valuation models, risk metrics) runs **entirely client-side** in the browser. No server-side computation beyond proxying.

### Routing

The app uses **URL query parameter routing**, not React Router:
- `?tab=analysis&ticker=AAPL` — go to Analysis tab for AAPL
- `?tab=charts&ticker=TSLA&chart=rsi&chartType=candles` — Charts tab with RSI and candlestick
- `?tab=analysis&ticker=MSFT&analysis=financials` — Analysis/Financials sub-tab

Tab navigation updates `window.location.search` via `history.pushState`. The canonical tab/route parsing lives in `buildUrlFromRoute()` and `readRouteFromLocation()` in `src/App.jsx`.

**Available tab values:**
- Top-level: `home`, `analysis`, `charts`, `screener`, `markets`, `portfolio`, `community`, `heatmap`, `comparison`, `account`
- Analysis sub-tabs: `stock`, `financials`, `options`, `dividends`
- Markets sub-tabs: `heatmap`, `sectors`, `crypto`, `economic`, `prediction`, `rates`, `commodities`, `currencies`
- Portfolio sub-tabs: `holdings`, `paper-trading`, `backtesting`
- Chart modes: `price`, `volume`, `rsi`, `macd`, `stoch`
- Chart types: `line`, `candles`

## Key Conventions

### Color / Theming System

All components receive a `C` prop (the active color palette object). **Never hardcode colors.**

```js
// Defined in src/App.jsx
const LIGHT_THEME = {
  cream: "#FAF7F2", warmWhite: "#F5F1EA", paper: "#EDE8DF",
  rule: "#D4CBBB", ruleFaint: "#E8E1D6",
  ink: "#1A1612", inkSoft: "#3D362E", inkMuted: "#7A7067", inkFaint: "#A69E94",
  // ...plus: up, down, hold, accent
};
const DARK_THEME = { /* equivalent dark values */ };

let C = LIGHT_THEME; // module-level, updated when theme changes
```

Color tokens:
- `C.ink` / `C.inkSoft` / `C.inkMuted` / `C.inkFaint` — text hierarchy
- `C.cream` / `C.warmWhite` / `C.paper` — background hierarchy
- `C.rule` / `C.ruleFaint` — borders and dividers
- `C.up` / `C.down` / `C.hold` — green/red/neutral for financial data
- `C.accent` — focus/brand accent

Theme modes: `"light"`, `"dark"`, `"system"`. Stored in `localStorage` under `aa_theme_v1`. Applied via `root.dataset.theme`.

### Styling Convention

Inline styles are the primary styling approach. CSS classes in `App.css` and `index.css` handle global resets, animations, and a few utility classes. The design system is heavily typographic:
- `var(--mono)` — monospace font for numbers/data
- `var(--body)` — sans-serif for UI text
- `var(--display)` — display font for headings

### Internationalization (i18n)

All user-facing strings must go through the translation system:

```jsx
// In any component that receives the deps/t prop:
const { t } = useI18n(); // or receive t as a prop
t("nav.analysis")         // → "Analysis" (en-US)
t("common.close")         // → "Close"
t("some.key", { name: "AAPL" }) // → interpolated string
```

Translation keys live in `src/i18n/translations.js`. 11 supported locales: `en-US`, `fr-FR`, `de-DE`, `hi-IN`, `id-ID`, `it-IT`, `ja-JP`, `ko-KR`, `pt-BR`, `es-419`, `es-ES`.

When adding new UI text, add the key to **all 11 locales** in `translations.js`. The English string is the fallback.

### UI Primitives

Reusable components are in `src/components/ui/primitives.jsx`. Always use these instead of bare HTML elements:

| Component | Purpose |
|-----------|---------|
| `UIButton` | Primary/secondary/ghost buttons; requires `C` prop |
| `ControlChip` | Toggle chip buttons (e.g., time range selector) |
| `TabGroup` | Horizontal tab bar with active underline |
| `DataTable` | Sortable table with striped rows |
| `TableHeadCell` / `TableCell` | Individual table cells |
| `TextInput` | Styled text input |
| `MetricCard` | KPI card with label, value, and optional change% |
| `GaugeBar` | Progress bar colored by value range |
| `EmptyState` | Centered empty-state with icon/title/message/action |
| `Skeleton` | Animated loading placeholder |
| `FloatingPanel` | Fixed-position floating panel (bottom-right) |

### Pro Feature Gating

Some tabs and features are gated behind a "Pro" flag. In development, toggle it with the **DEV: ENABLE/DISABLE PRO** button visible at the bottom of the page. In production, no real paywall is implemented yet — `isPro` defaults to `false`.

```jsx
// Wrap locked content:
<ProGate title="Pro Required" description="..." features={[...]} />

// Or conditionally render:
{isPro ? <FullFeature /> : <ProGate ... />}
```

Pro-locked tabs: `comparison`, `heatmap` (full), `financials` sub-tab, parts of markets.

### Workspace / State Persistence

User data is stored in a `workspace` object (schema defined by `emptyWorkspace()` in `App.jsx`):

```js
{
  version: 1,
  watchlist: [],      // [{ ticker, addedAt }]
  alerts: [],         // price alert objects
  recent: [],         // recently viewed tickers
  comparisons: [],    // saved comparison sets
  portfolio: { holdings: [] },
  paperPortfolio: { cash, positions, history, equityCurve },
  notificationPrefs: { enabled, priceAlerts, earnings },
  prefs: { period, interval, region, chartType, updatedAt },
}
```

Persisted to `localStorage` under `aa_workspace_v1`. If Supabase is configured, it syncs to the `workspaces` table (keyed by `user_id`). Use `sanitizeWorkspace()` when loading to handle schema migrations.

### Authentication

Supabase auth (email/password + Google OAuth). The client is initialized in `src/supabaseClient.js`. It gracefully handles the case where Supabase env vars are absent (`hasSupabaseConfig` boolean):

```js
import { supabase, hasSupabaseConfig } from "./supabaseClient";
if (!hasSupabaseConfig) { /* run without auth */ }
```

Required env vars (in `.env.local`, not committed):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# Also accepted: VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
```

## Express Proxy (`server.js`)

### API Routes

| Route | Description |
|-------|-------------|
| `GET /api/chart/:ticker` | Price/volume history. Params: `range`, `interval` |
| `GET /api/search?q=` | Ticker symbol search with fuzzy alias matching |
| `GET /api/summary/:ticker` | Quote summary. Param: `modules` (comma-separated) |
| `GET /api/fundamentals/:ticker` | Financial statements (income, balance, cashflow) |
| `GET /api/earnings/:ticker` | Earnings history and calendar |
| `GET /api/dividends/:ticker` | Dividend history |
| `GET /api/options/:ticker` | Options chain with URL fallback chain |
| `GET /api/recommendations/:ticker` | Similar symbols recommended by Yahoo |
| `GET /api/holders/:ticker` | Institutional/insider holders |
| `GET /api/rss` | Aggregated news from investing.com RSS |
| `GET /api/prediction` | Prediction markets from Polymarket |

All routes return JSON. Error responses follow `{ error: "message" }`.

### Security Measures in the Proxy

- **CORS allowlist**: Only `analyze-alpha.vercel.app`, `analyzealpha.duckdns.org`, `localhost:3000`, and `ALLOWED_ORIGINS` env var entries are accepted. Add new origins to `DEFAULT_ALLOWED_ORIGINS` in `server.js`.
- **Rate limiting**: 120 requests/minute per client IP (in-memory, resets on restart).
- **Input validation**: Tickers validated against `/^[A-Za-z0-9=^.\-]{1,12}$/`. Ranges and intervals validated against allowlists.
- **Response size cap**: 2MB max from upstream.
- **Upstream timeout**: 8 seconds (9 seconds for prediction markets).
- **Caching** (in-memory `Map`): 30s for chart data, 5min for RSS, 60s for prediction markets. Max 500 entries; LRU eviction.

### Adding a New API Route

1. Add the route handler to `server.js` following the existing pattern (validate ticker, check cache, fetch upstream, handle errors).
2. Add the equivalent serverless function in `api/` for Vercel deployment.
3. Both implementations must include CORS handling, rate limiting, and input validation.

## Vercel Serverless Functions (`api/`)

Handlers export `module.exports = (req, res) => {}`. They are CommonJS (not ESM). Each file independently implements CORS, rate limiting, and input validation — no shared middleware. The `_predictionCore.js` module (prefixed with `_`) is excluded from being treated as an endpoint by Vercel.

## Frontend Page Components

Each tab in `src/pages/` receives a `deps` object from `App.jsx` containing all shared state and callbacks. This avoids prop-drilling by passing a single bundle. Typical `deps` shape:

```js
{
  ticker, setTicker,           // active ticker
  chartData, loading, error,   // data layer
  analysisResult,              // computed indicators/signals
  workspace, updateWorkspace,  // persistent user data
  C,                           // color palette
  t,                           // translation function
  isPro,                       // pro feature flag
  viewport,                    // { width, height, isMobile }
  theme, setTheme,             // theme control
  // ...plus page-specific props
}
```

## Environment Variables

| Variable | Where used | Purpose |
|----------|-----------|---------|
| `VITE_SUPABASE_URL` | Frontend (Vite) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Frontend | Supabase anon key |
| `PORT` | `server.js` | Express listen port (default: `3001`) |
| `ALLOWED_ORIGINS` | `server.js` | Comma-separated extra CORS origins |
| `GENERATE_SOURCEMAP` | `.env.production` | Set to `false` to skip source maps |

Frontend env vars must be prefixed with `VITE_` to be exposed to the browser. Put secrets in `.env.local` (gitignored). Never commit credentials.

## Self-Hosted Deployment

The `deploy.sh` script is for updating a running instance:
```bash
bash deploy.sh  # git pull → npm install → npm run build → pm2 restart analyzealpha
```

The `setup-pi.sh` script sets up a fresh Raspberry Pi (Node 20, PM2, nginx, certbot).

Nginx config is at `nginx/analyzealpha.conf`. It proxies `/api/` to `http://127.0.0.1:3001` and serves `dist/` as static files with SPA fallback.

## Key Files at a Glance

| File | Size | Notes |
|------|------|-------|
| `src/App.jsx` | ~5,000+ lines | Entire app: data fetching, analysis engine, all shared state, global layout |
| `server.js` | 892 lines | Express proxy with all 10 API routes |
| `src/pages/AnalysisTab.jsx` | large | Stock analysis, technicals, financials, options, dividends |
| `src/components/ui/primitives.jsx` | ~350 lines | All reusable UI components |
| `src/i18n/translations.js` | large | All translated strings for 11 locales |
| `api/search.js` | ~290 lines | Fuzzy ticker search with Levenshtein + alias map |

## Common Pitfalls

- **Do not hardcode colors.** Always use the `C` prop/object with its named tokens.
- **Do not hardcode UI strings.** Use `t("translation.key")` and add the key to all locales in `translations.js`.
- **All API-only modules in `api/` must be CommonJS** (`require`/`module.exports`), not ESM. The `src/` directory uses ESM with Vite.
- **The `api/` folder is for Vercel.** When adding a new endpoint for self-hosted, also add it to `server.js`.
- **Tickers are always uppercased** in URL params and state. The proxy validates the format with a regex.
- **`isPro` is a local dev toggle only.** Do not rely on it for any security or data access controls until a real auth/billing system is in place.
- **All analysis computations are client-side.** Do not move heavy calculations to the Express server.
- **No test suite exists.** `npm test` is a no-op. Manual testing against the running dev server is the current workflow.
