import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { createPortal } from "react-dom";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Brush, Customized,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Area
} from "recharts";
import { supabase, hasSupabaseConfig } from "./supabaseClient";
import "./App.css";

// ═══════════════════════════════════════════════════════════
// DATA LAYER — Local proxy to Yahoo Finance
// ═══════════════════════════════════════════════════════════
let apiCallCount = 0;
let lastApiLatency = 0;
const CHART_ANIM_MS = 650;
const INTERVAL_MS = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "60m": 60 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const WORKSPACE_STORAGE_KEY = "aa_workspace_v1";
const WORKSPACE_VERSION = 1;
const LANG_STORAGE_KEY = "aa_lang_v1";

const APP_TABS = ["home", "analysis", "charts", "heatmap", "comparison", "account"];
const ANALYSIS_TABS = ["stock", "financials"];
const ACCOUNT_TABS = ["overview", "preferences"];
const CHART_MODES = ["price", "volume", "rsi", "macd", "stoch"];
const CHART_TYPES = ["line", "candles"];

const normalizeTab = (tab) => (APP_TABS.includes(tab) ? tab : "home");
const normalizeAnalysisTab = (tab) => (ANALYSIS_TABS.includes(tab) ? tab : "stock");
const normalizeAccountTab = (tab) => (ACCOUNT_TABS.includes(tab) ? tab : "overview");
const normalizeChartMode = (mode) => {
  if (!mode) return null;
  const val = String(mode).toLowerCase();
  return CHART_MODES.includes(val) ? val : null;
};
const normalizeChartType = (type) => {
  if (!type) return "line";
  const val = String(type).toLowerCase();
  return CHART_TYPES.includes(val) ? val : "line";
};

const readRouteFromLocation = () => {
  if (typeof window === "undefined") {
    return { tab: "home", analysisSubTab: "stock", accountSubTab: "overview" };
  }
  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get("tab");
  let tab = normalizeTab(rawTab);
  if (!rawTab) {
    if (params.get("analysis")) tab = "analysis";
    else if (params.get("account")) tab = "account";
    else if (params.get("chart") || params.get("chartType")) tab = "charts";
    else if (params.get("ticker")) tab = "analysis";
  }
  const rawTicker = params.get("ticker");
  const ticker = rawTicker ? rawTicker.trim().toUpperCase() : "";
  return {
    tab,
    analysisSubTab: normalizeAnalysisTab(params.get("analysis")),
    accountSubTab: normalizeAccountTab(params.get("account")),
    ticker,
    chart: normalizeChartMode(params.get("chart")),
    chartType: normalizeChartType(params.get("chartType")),
  };
};

const buildUrlFromRoute = ({ tab, analysisSubTab, accountSubTab, ticker, chart, chartType }) => {
  if (typeof window === "undefined") return "/";
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const safeTab = normalizeTab(tab);
  params.set("tab", safeTab);

  if (tab === "analysis" && analysisSubTab && analysisSubTab !== "stock") {
    params.set("analysis", analysisSubTab);
  } else {
    params.delete("analysis");
  }

  if (tab === "account" && accountSubTab && accountSubTab !== "overview") {
    params.set("account", accountSubTab);
  } else {
    params.delete("account");
  }

  if ((safeTab === "analysis" || safeTab === "charts") && ticker) params.set("ticker", ticker);
  else params.delete("ticker");

  if (safeTab === "charts" && chart) params.set("chart", chart);
  else params.delete("chart");

  if (safeTab === "charts" && chartType && chartType !== "line") {
    params.set("chartType", chartType);
  } else {
    params.delete("chartType");
  }

  const search = params.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash || ""}`;
};

const LANGUAGES = [
  { code: "en-US", label: "English (United States)" },
  { code: "fr-FR", label: "Français (France)" },
  { code: "de-DE", label: "Deutsch (Deutschland)" },
  { code: "hi-IN", label: "हिन्दी (भारत)" },
  { code: "id-ID", label: "Indonesia (Indonesia)" },
  { code: "it-IT", label: "Italiano (Italia)" },
  { code: "ja-JP", label: "日本語 (日本)" },
  { code: "ko-KR", label: "한국어 (대한민국)" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "es-419", label: "Español (Latinoamérica)" },
  { code: "es-ES", label: "Español (España)" },
];

const TRANSLATIONS = {
  "en-US": {
    "tagline.quant": "Quantitative Analysis",
    "search.placeholder": "Search stocks...",
    "search.running": "Running…",
    "search.analyze": "Analyze",
    "nav.home": "Home",
    "nav.analysis": "Analysis",
    "nav.charts": "Charts",
    "nav.heatmap": "Heatmap",
    "nav.comparison": "Comparison",
    "nav.account": "Account",
    "nav.help": "Help",
    "nav.tools": "Tools",
    "common.line": "Line",
    "common.candles": "Candles",
    "common.expand": "Expand",
    "common.close": "Close",
    "common.save": "Save",
    "common.signIn": "Sign In",
    "common.signOut": "Sign Out",
    "common.zoomIn": "Zoom In",
    "common.zoomOut": "Zoom Out",
    "common.reset": "Reset",
    "menu.settings": "Settings",
    "menu.language": "Language",
    "menu.upgrade": "Upgrade to Pro",
    "menu.gift": "Gift AnalyzeAlpha",
    "menu.logout": "Log out",
    "menu.signedOut": "Not signed in",
    "tools.watchlist": "Watchlist",
    "tools.alerts": "Alerts",
    "tools.ticker": "Ticker",
    "tools.add": "Add",
    "tools.emptyWatchlist": "Empty watchlist",
    "tools.noAlerts": "No alerts",
    "tools.above": "Above",
    "tools.below": "Below",
    "tools.set": "Set",
    "tools.triggered": "TRIGGERED",
    "tools.watching": "WATCHING",
    "auth.missingConfig": "Supabase config missing. Add your `VITE_SUPABASE_URL` and publishable key, then restart the dev server.",
    "auth.continueGoogle": "Continue with Google",
    "auth.or": "or",
    "auth.firstName": "First name",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.signIn": "Sign In",
    "auth.createAccount": "Create Account",
    "auth.checkEmail": "Check your email to confirm your account.",
    "auth.errFirstName": "First name required.",
    "auth.errEmailPassword": "Email and password required.",
    "time.secondsAgo": "{count}s ago",
    "time.minutesAgo": "{count}m ago",
    "day.morning": "morning",
    "day.afternoon": "afternoon",
    "day.evening": "evening",
    "day.night": "night",
    "greeting.goodDaypart": "Good {dayPart}",
    "greeting.hey": "Hey",
    "greeting.welcomeBack": "Welcome back",
    "greeting.niceToSeeYou": "Nice to see you",
    "greeting.hello": "Hello",
    "greeting.marketBrief": "Market brief",
    "greeting.quickPulse": "Quick pulse",
    "greeting.snapshot": "Snapshot",
    "greeting.todaysGlance": "Today's glance",
    "home.updated": "Updated {ago}",
    "home.marketNews": "Market News",
    "home.indexes": "Indexes",
    "home.topGainers": "Top Gainers",
    "home.topLosers": "Top Losers",
    "home.trendingStocks": "Trending Stocks",
    "home.marketBriefSection": "Market Brief",
    "chart.openCharts": "Open in Charts",
    "help.title": "Help Mode",
    "help.body": "Hover any highlighted element to learn what it does. Click Help again to exit.",
    "help.exit": "Exit Help",
    "help.search.title": "Search",
    "help.search.body": "Type a ticker or company name. Press Enter or click Analyze to run the model.",
    "help.analyze.title": "Analyze",
    "help.analyze.body": "Fetches fresh data and updates the recommendation, signals, and charts.",
    "help.tools.title": "Tools",
    "help.tools.body": "Open watchlist and alerts to manage tickers without leaving the page.",
    "help.account.title": "Account",
    "help.account.body": "Access settings, language, upgrades, and sign out.",
    "help.priceChart.title": "Price Chart",
    "help.priceChart.body": "Shows the last 60 sessions with live overlays and indicators. Use the controls to change period or interval.",
    "help.nav.home.title": "Home",
    "help.nav.home.body": "Market overview and live snapshots.",
    "help.nav.analysis.title": "Analysis",
    "help.nav.analysis.body": "Full signal stack, valuation, and risk.",
    "help.nav.charts.title": "Charts",
    "help.nav.charts.body": "Advanced charting and indicators.",
    "help.nav.heatmap.title": "Heatmap",
    "help.nav.heatmap.body": "Sector and market map (Pro).",
    "help.nav.comparison.title": "Comparison",
    "help.nav.comparison.body": "Compare multiple tickers (Pro).",
    "help.tickerStrip.title": "Live Ticker Strip",
    "help.tickerStrip.body": "Scrolling snapshot of key markets. Click any ticker to analyze.",
    "help.region.title": "Region Filters",
    "help.region.body": "Switch the market region to update news and charts.",
    "help.marketNews.title": "Market News",
    "help.marketNews.body": "Latest headlines for the selected region.",
    "help.indexes.title": "Indexes",
    "help.indexes.body": "Intraday charts for major indexes.",
    "help.movers.title": "Market Movers",
    "help.movers.body": "Top gainers, losers, and trending tickers.",
    "help.marketBrief.title": "Market Brief",
    "help.marketBrief.body": "Cross-asset summary and risk signals.",
    "help.changelog.title": "Changelog",
    "help.changelog.body": "What’s new in the latest release.",
    "help.accountSync.title": "Account Sync",
    "help.accountSync.body": "Sign in to sync preferences and watchlists across devices.",
    "help.profile.title": "Profile",
    "help.profile.body": "Update your display name and manage sign-in.",
    "help.accountWatchlist.title": "Watchlist",
    "help.accountWatchlist.body": "Manage saved tickers from your account.",
    "help.accountAlerts.title": "Alerts",
    "help.accountAlerts.body": "Set price alerts and monitor triggers.",
    "help.accountRecent.title": "Recent Analyses",
    "help.accountRecent.body": "Quick access to your latest runs.",
    "help.accountPreferences.title": "Preferences",
    "help.accountPreferences.body": "Default period, interval, and region.",
    "help.chartsControls.title": "Chart Controls",
    "help.chartsControls.body": "Toggle indicators and switch chart style.",
    "analysis.stockTab": "Stock",
    "analysis.financialsTab": "Financials",
    "analysis.enterTicker": "Enter a ticker to begin",
    "analysis.typeSymbol": "Type a symbol above and press Analyze",
    "analysis.verdict": "Verdict",
    "analysis.confidence": "Confidence",
    "analysis.score": "Score",
    "analysis.priceTargets": "Price Targets",
    "analysis.target": "Target",
    "analysis.stopLoss": "Stop Loss",
    "analysis.riskReward": "Risk / Reward",
    "analysis.technicalSignals": "Technical Signals",
    "analysis.riskProfile": "Risk Profile",
    "analysis.riskLevel": "Risk Level",
    "analysis.volatility": "Volatility",
    "analysis.maxDrawdown": "Max Drawdown",
    "analysis.sharpe": "Sharpe",
    "analysis.sortino": "Sortino",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "Statistical Signals",
    "analysis.zscore": "Z-Score",
    "analysis.zscoreDesc": "Price deviation from 20-period mean",
    "analysis.momentum": "Momentum",
    "analysis.momentumDesc": "Avg return across 5, 10, 20, 50-day periods",
    "analysis.volume": "Volume",
    "analysis.volumeDesc": "Current volume vs 20-period avg",
    "analysis.composite": "Composite",
    "analysis.compositeDesc": "Weighted combination of all signals",
    "analysis.buy": "Buy",
    "analysis.sell": "Sell",
    "analysis.current": "Current",
    "analysis.avg": "Avg",
    "analysis.confidenceLabel": "Confidence",
    "analysis.direction": "Direction",
    "analysis.valuationAnchor": "Valuation Anchor",
    "analysis.priceChartTitle": "Price — Last 60 Sessions",
    "analysis.valuationToolkit": "Valuation Model Toolkit",
    "analysis.valuationDesc": "Estimates intrinsic value using DCF, dividend discount, and multiples analysis. Use auto-estimates or override assumptions below to run what-if scenarios.",
    "analysis.fcfPerShare": "FCF / Share",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "Dividend / Share",
    "analysis.growth5y": "Growth (5y %)",
    "analysis.discountWacc": "Discount / WACC %",
    "analysis.terminalGrowth": "Terminal Growth %",
    "analysis.targetPE": "Target P/E",
    "analysis.projectionYears": "Projection Years",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "Dividend Discount",
    "analysis.multiples": "Multiples",
    "analysis.anchor": "Anchor",
    "analysis.upside": "Upside",
    "analysis.usedAsContext": "Used as long-term context alongside technical signals.",
    "analysis.neutral": "NEUTRAL",
    "charts.runAnalysisFirst": "Run an analysis first",
    "charts.movingAvg": "Moving Avg",
    "charts.bollinger": "Bollinger",
    "charts.volume": "Volume",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "Stochastic",
    "charts.chart": "Chart",
    "charts.period": "Period",
    "charts.fullPeriod": "{ticker} — Full Period",
    "charts.volumeTitle": "Volume",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "Stochastic",
    "charts.windowHint": "Horizontal scroll pans. Vertical scroll adjusts the selection window. Drag to move. Window: {count} / {total}",
    "account.syncLocal": "Local only",
    "account.syncing": "Syncing…",
    "account.syncError": "Sync error",
    "account.synced": "Synced",
    "account.syncedAgo": "Synced {ago}",
    "account.syncTitle": "Account Sync",
    "account.signedInAs": "Signed in as {email}",
    "account.user": "user",
    "account.signInToSync": "Sign in to sync your account data across devices.",
    "account.profile": "Profile",
    "account.firstName": "First name",
    "account.saved": "Saved",
    "account.enterFirstName": "Enter a first name.",
    "account.signInToSave": "Sign in to save.",
    "account.overview": "Overview",
    "account.preferences": "Preferences",
    "account.recentAnalyses": "Recent Analyses",
    "account.noAnalyses": "No analyses yet",
    "account.signal": "Signal",
    "account.regime": "Regime",
    "account.risk": "Risk",
    "account.conf": "Conf",
    "account.view": "View",
    "account.defaultPeriod": "Default Period",
    "account.defaultInterval": "Default Interval",
    "account.homeRegion": "Home Region",
    "pro.heatmap.title": "Heatmap Is Pro",
    "pro.heatmap.desc": "Unlock the S&P heatmap with live Sharpe, volatility, and relative performance.",
    "pro.heatmap.f0": "Parallel data fetches",
    "pro.heatmap.f1": "Treemap visualization",
    "pro.heatmap.f2": "Risk and regime overlays",
    "pro.comparison.title": "Comparison Is Pro",
    "pro.comparison.desc": "Compare multiple tickers across signals, risk, and valuation in one view.",
    "pro.comparison.f0": "Side-by-side signal scores",
    "pro.comparison.f1": "Sharpe and drawdown rankings",
    "pro.comparison.f2": "Export-ready table view",
    "common.live": "LIVE",
    "common.price": "Price",
    "time.justNow": "just now",
    "time.hoursAgo": "{count}h ago",
    "time.daysAgo": "{count}d ago",
    "analysis.valuationAnalysis": "Valuation Analysis",
    "analysis.stretchIndex": "Stretch Index",
    "analysis.undervalued": "Undervalued",
    "analysis.overvalued": "Overvalued",
    "analysis.vsSma200": "vs SMA 200",
    "analysis.vsSma50": "vs SMA 50",
    "analysis.bollingerPercentB": "Bollinger %B",
    "analysis.range52w": "52W Range",
    "analysis.fromLow": "from low",
    "analysis.fairValueEst": "Fair Value Est.",
    "analysis.marketRegime": "Market Regime",
    "analysis.strength": "Strength",
    "analysis.hurst": "Hurst",
    "analysis.avoid": "Avoid",
    "analysis.analystTargets": "Analyst Price Targets",
    "analysis.past12Months": "Past 12 months",
    "analysis.target12Month": "12-month price target",
    "analysis.companyMetrics": "Company Metrics",
    "analysis.earningsPerShare": "Earnings Per Share",
    "analysis.epsUnavailable": "EPS series unavailable.",
    "analysis.revenue": "Revenue",
    "analysis.netProfitMargin": "Net Profit Margin",
    "analysis.currentRatio": "Current Ratio",
    "analysis.debtToEquity": "Debt / Equity",
    "analysis.returnOnEquityTtm": "Return on Equity (TTM)",
    "analysis.financialsProTitle": "Financials Are Pro",
    "analysis.financialsProDesc": "Unlock company financials, valuation tooling, and multi-period statement analysis.",
    "analysis.financialsProF0": "Income statements · Cash flow · Balance sheet",
    "analysis.financialsProF1": "DCF, DDM, and multiples modeling",
    "analysis.financialsProF2": "Historical margin and growth trends",
    "analysis.fundamentalSnapshot": "Fundamental Snapshot",
    "analysis.marketCap": "Market Cap",
    "analysis.netIncome": "Net Income",
    "analysis.freeCashFlow": "Free Cash Flow",
    "analysis.revenueGrowth": "Revenue Growth",
    "analysis.grossMargin": "Gross Margin",
    "analysis.operatingMargin": "Operating Margin",
    "analysis.netMargin": "Net Margin",
    "analysis.balanceSheet": "Balance Sheet",
    "analysis.cash": "Cash",
    "analysis.debt": "Debt",
    "analysis.perShare": "Per Share",
    "analysis.keyRatios": "Key Ratios",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "Financials Overview",
    "analysis.revenueFcfMargin": "Revenue + FCF Margin",
    "analysis.fcfMargin": "FCF Margin",
    "analysis.marginTrends": "Margin Trends",
    "analysis.grossMarginShort": "Gross",
    "analysis.operatingMarginShort": "Operating",
    "analysis.netMarginShort": "Net",
    "analysis.marginRadar": "Margin Radar",
    "analysis.cashVsDebt": "Cash vs Debt",
    "analysis.netCash": "Net Cash",
    "analysis.netIncomeByPeriod": "Net Income by Period",
    "analysis.fundamentalDataAggregator": "Fundamental Data Aggregator",
    "analysis.fundamentalDataDesc": "Collects revenue, earnings, margins, debt, and cash flow by ticker and fiscal period. Designed to plug into APIs or SEC filings — this build uses modeled data for demonstration.",
    "analysis.fiscalPeriod": "Fiscal Period",
    "analysis.source": "Source",
    "analysis.period": "Period",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Upper",
    "analysis.bbLower": "BB Lower",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "Close",
    "heatmap.marketHeatmaps": "Market Heatmaps",
    "heatmap.subtitle": "Treemap visualizations by index, sized by market cap, colored by 6-month Sharpe ratio. Stocks sorted by sector.",
    "heatmap.panelMeta": "{count} stocks · Size: market cap · Color: Sharpe (6mo)",
    "heatmap.load": "Load Heatmap",
    "heatmap.fetches": "Fetches {count} stocks from Yahoo Finance",
    "heatmap.fetching": "Fetching {count} stocks…",
    "heatmap.refresh": "Refresh",
    "heatmap.sector": "Sector",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6mo",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "Running…",
    "comparison.compare": "Compare",
    "comparison.normalizedPerformance": "Normalized Performance (6mo)",
    "comparison.ticker": "Ticker",
    "comparison.price": "Price",
    "comparison.signal": "Signal",
    "comparison.conf": "Conf.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "Vol.",
    "comparison.maxDD": "Max DD",
    "comparison.momentum": "Mom.",
    "comparison.stretch": "Stretch",
    "comparison.sharpeComparison": "Sharpe Comparison",
    "comparison.volatilityComparison": "Volatility Comparison",
    "comparison.volatility": "Volatility",
    "comparison.failed": "failed",
    "help.valuationAnalysis.title": "Valuation Analysis",
    "help.valuationAnalysis.body": "Measures stretch, SMA deviations, and fair value signals.",
    "help.marketRegime.title": "Market Regime",
    "help.marketRegime.body": "Summarizes trend, volatility, and tactical posture.",
    "help.analystTargets.title": "Analyst Targets",
    "help.analystTargets.body": "Consensus targets and the last 12 months of revisions.",
    "help.companyMetrics.title": "Company Metrics",
    "help.companyMetrics.body": "Key operating and balance sheet ratios over time.",
    "help.fundamentalSnapshot.title": "Fundamental Snapshot",
    "help.fundamentalSnapshot.body": "Top-line fundamentals for the selected period.",
    "help.balanceSheet.title": "Balance Sheet",
    "help.balanceSheet.body": "Liquidity and leverage positioning.",
    "help.perShare.title": "Per Share",
    "help.perShare.body": "Per-share earnings, cash flow, and dividends.",
    "help.keyRatios.title": "Key Ratios",
    "help.keyRatios.body": "Profitability and valuation ratios.",
    "help.financialsOverview.title": "Financials Overview",
    "help.financialsOverview.body": "Visual summary of margins, cash vs debt, and earnings.",
    "help.fundamentalData.title": "Fundamental Data",
    "help.fundamentalData.body": "Modeled fundamentals by fiscal period.",
    "help.comparisonInput.title": "Comparison Input",
    "help.comparisonInput.body": "Enter tickers separated by commas to compare.",
    "help.comparisonPerformance.title": "Performance Overlay",
    "help.comparisonPerformance.body": "Normalized returns over 6 months.",
    "help.comparisonTable.title": "Comparison Table",
    "help.comparisonTable.body": "Sortable table of signals, risk, and valuation metrics.",
    "help.heatmapOverview.title": "Market Heatmaps",
    "help.heatmapOverview.body": "Treemap by sector with Sharpe-based coloring.",
    "help.valuationToolkit.title": "Valuation Toolkit",
    "help.valuationToolkit.body": "Tune DCF/DDM assumptions and compare anchors.",
    "help.priceTargets.title": "Price Targets",
    "help.priceTargets.body": "Bull, base, and stop levels plus risk/reward.",
    "help.technicalSignals.title": "Technical Signals",
    "help.technicalSignals.body": "Momentum, trend, and indicator-based signals.",
    "help.riskProfile.title": "Risk Profile",
    "help.riskProfile.body": "Volatility, drawdown, and risk metrics.",
    "help.statSignals.title": "Statistical Signals",
    "help.statSignals.body": "Z-score, momentum, and composite stats.",
    "footer.disclaimer": "For educational purposes only — not financial advice",
    "common.retry": "Retry",
    "common.debug": "Debug",
    "common.hide": "Hide",
    "common.info": "Info",
    "common.noData": "No data available",
    "common.showAll": "Show all {count}",
    "common.na": "N/A",
    "loading.analyzing": "Analyzing",
    "loading.liveSource": "Live data via {source}",
    "error.connectionTitle": "Connection Failed",
    "error.connectionBody": "Unable to retrieve market data. If running locally, make sure the proxy server is running with",
    "error.allSourcesFailed": "All data sources failed",
    "error.notSignedIn": "Not signed in.",
    "news.none": "No headlines available right now.",
    "news.topStory": "Top Story",
    "news.published": "Published {ago}",
    "news.publishedRecently": "Published recently",
    "news.sourceYahoo": "Yahoo Finance",
    "news.fallback.0.title": "Mega-cap earnings set the tone for the week ahead",
    "news.fallback.0.source": "Market Desk",
    "news.fallback.0.desc": "Major technology companies report quarterly results this week.",
    "news.fallback.1.title": "Rates pause keeps focus on growth and AI leaders",
    "news.fallback.1.source": "Global Markets",
    "news.fallback.1.desc": "Federal Reserve holds rates steady as inflation moderates.",
    "news.fallback.2.title": "Energy rebounds while defensives stay bid",
    "news.fallback.2.source": "Daily Brief",
    "news.fallback.2.desc": "Oil prices recover on supply concerns and geopolitical tensions.",
    "news.fallback.3.title": "Retail sales preview: expectations and risks",
    "news.fallback.3.source": "Macro Wire",
    "news.fallback.3.desc": "Consumer spending data expected to show continued resilience.",
    "home.marketScorecard": "Market Scorecard",
    "home.crossAssetPulse": "Cross-Asset Pulse",
    "home.sectorPerformance": "Sector Performance",
    "home.yieldCurve": "Yield Curve",
    "home.portfolioSnapshot": "Portfolio Snapshot",
    "home.yieldUnavailable": "Yield data unavailable",
    "home.yieldLabel": "Yield",
    "home.return1d": "1D",
    "home.return1w": "1W",
    "home.return1m": "1M",
    "home.returnYtd": "YTD",
    "home.todayChange": "{pct} today",
    "perf.title": "PERF MONITOR",
    "perf.pageLoad": "Page Load",
    "perf.jsHeap": "JS Heap",
    "perf.apiCalls": "API Calls",
    "perf.lastLatency": "Last Latency",
    "perf.domNodes": "DOM Nodes",
    "perf.fps": "FPS",
    "region.global": "Global",
    "region.us": "US",
    "region.europe": "Europe",
    "region.asia": "Asia",
    "assetSection.cryptocurrencies": "Cryptocurrencies",
    "assetSection.rates": "Rates",
    "assetSection.commodities": "Commodities",
    "assetSection.currencies": "Currencies",
    "label.sp500": "S&P 500",
    "label.nasdaq": "Nasdaq",
    "label.nasdaq100": "Nasdaq 100",
    "label.dowJones": "Dow Jones",
    "label.dow30": "Dow 30",
    "label.russell2k": "Russell 2K",
    "label.vix": "VIX",
    "label.tenYearYield": "10Y Yield",
    "label.ftse100": "FTSE 100",
    "label.dax": "DAX",
    "label.nikkei225": "Nikkei 225",
    "label.hangSeng": "Hang Seng",
    "label.cac40": "CAC 40",
    "label.euroStoxx": "Euro Stoxx",
    "label.shanghai": "Shanghai",
    "label.kospi": "KOSPI",
    "label.taiwan": "Taiwan",
    "label.eurUsd": "EUR/USD",
    "label.gbpUsd": "GBP/USD",
    "label.usdJpy": "USD/JPY",
    "label.usdCny": "USD/CNY",
    "label.bitcoin": "Bitcoin",
    "label.ethereum": "Ethereum",
    "label.solana": "Solana",
    "label.xrp": "XRP",
    "label.cardano": "Cardano",
    "label.dogecoin": "Dogecoin",
    "label.gold": "Gold",
    "label.silver": "Silver",
    "label.crudeOil": "Crude Oil",
    "label.natGas": "Nat Gas",
    "label.copper": "Copper",
    "label.corn": "Corn",
    "label.dxy": "DXY",
    "label.audUsd": "AUD/USD",
    "label.us10y": "US 10Y",
    "label.us30y": "US 30Y",
    "label.us5y": "US 5Y",
    "label.us3m": "US 3M",
    "label.stocks": "Stocks",
    "label.bonds": "Bonds",
    "label.crypto": "Crypto",
    "label.dollar": "Dollar",
    "sector.technology": "Technology",
    "sector.financials": "Financials",
    "sector.energy": "Energy",
    "sector.healthcare": "Healthcare",
    "sector.industrials": "Industrials",
    "sector.communication": "Communication Services",
    "sector.consumerDiscretionary": "Consumer Discretionary",
    "sector.consumerStaples": "Consumer Staples",
    "sector.realEstate": "Real Estate",
    "sector.materials": "Materials",
    "sector.utilities": "Utilities",
    "signal.STRONG_BUY": "STRONG BUY",
    "signal.BUY": "BUY",
    "signal.HOLD": "HOLD",
    "signal.SELL": "SELL",
    "signal.STRONG_SELL": "STRONG SELL",
    "signal.NEUTRAL": "NEUTRAL",
    "signal.OVERSOLD": "OVERSOLD",
    "signal.OVERBOUGHT": "OVERBOUGHT",
    "signal.BULLISH": "BULLISH",
    "signal.BEARISH": "BEARISH",
    "signal.STRONG": "STRONG",
    "signal.MODERATE": "MODERATE",
    "signal.WEAK": "WEAK",
    "signal.HIGH": "HIGH",
    "signal.MEDIUM": "MEDIUM",
    "signal.LOW": "LOW",
    "signal.NORMAL": "NORMAL",
    "signal.ELEVATED": "ELEVATED",
    "risk.HIGH": "High",
    "risk.MEDIUM": "Medium",
    "risk.LOW": "Low",
    "risk.MODERATE": "Moderate",
    "volatility.HIGH": "High",
    "volatility.ELEVATED": "Elevated",
    "volatility.NORMAL": "Normal",
    "volatility.LOW": "Low",
    "trend.UPTREND": "Uptrend",
    "trend.DOWNTREND": "Downtrend",
    "trend.SIDEWAYS": "Sideways",
    "regime.STRONG_UPTREND": "Strong Uptrend",
    "regime.TRENDING_UPTREND": "Trending Uptrend",
    "regime.TRENDING_DOWNTREND": "Trending Downtrend",
    "regime.STRONG_DOWNTREND": "Strong Downtrend",
    "regime.MEAN_REVERTING": "Mean Reverting",
    "regime.RANGING": "Ranging",
    "regime.HIGH_VOLATILITY": "High Volatility",
    "regime.TRANSITIONING": "Transitioning",
    "regime.UNKNOWN": "Unknown",
    "valuation.FAIRLY_VALUED": "Fairly Valued",
    "valuation.SIGNIFICANTLY_OVERVALUED": "Significantly Overvalued",
    "valuation.OVERVALUED": "Overvalued",
    "valuation.SLIGHTLY_OVERVALUED": "Slightly Overvalued",
    "valuation.SIGNIFICANTLY_UNDERVALUED": "Significantly Undervalued",
    "valuation.UNDERVALUED": "Undervalued",
    "valuation.SLIGHTLY_UNDERVALUED": "Slightly Undervalued",
    "valuation.issueDiscountTerminal": "Discount rate must exceed terminal growth.",
    "valuation.issueDiscountDividend": "Discount rate must exceed dividend growth.",
    "strategy.name.STRONG_UPTREND": "Trend Following (Long)",
    "strategy.name.STRONG_DOWNTREND": "Trend Following (Short)",
    "strategy.name.TRENDING_UPTREND": "Trend Following with Caution",
    "strategy.name.TRENDING_DOWNTREND": "Defensive or Short",
    "strategy.name.MEAN_REVERTING": "Mean Reversion",
    "strategy.name.RANGING": "Range Trading",
    "strategy.name.HIGH_VOLATILITY": "Reduced Position Size",
    "strategy.name.TRANSITIONING": "Wait and Observe",
    "strategy.tactic.buyBreakouts": "Buy breakouts",
    "strategy.tactic.holdPositions": "Hold positions",
    "strategy.tactic.trailStops": "Trail stops",
    "strategy.avoid.counterTrendTrades": "Counter-trend trades",
    "strategy.tactic.shortBreakdowns": "Short breakdowns",
    "strategy.tactic.tightStops": "Tight stops",
    "strategy.tactic.capitalPreservation": "Capital preservation",
    "strategy.avoid.catchingFallingKnives": "Catching falling knives",
    "strategy.tactic.buyDips": "Buy dips",
    "strategy.tactic.partialPositions": "Partial positions",
    "strategy.tactic.takeProfits": "Take profits",
    "strategy.avoid.overextension": "Overextension",
    "strategy.tactic.reduceExposure": "Reduce exposure",
    "strategy.tactic.hedgePositions": "Hedge positions",
    "strategy.avoid.aggressiveLongs": "Aggressive longs",
    "strategy.tactic.buyOversold": "Buy oversold",
    "strategy.tactic.sellOverbought": "Sell overbought",
    "strategy.tactic.rangeTrade": "Range trade",
    "strategy.avoid.chasingMomentum": "Chasing momentum",
    "strategy.tactic.supportResistance": "Support / resistance",
    "strategy.tactic.oscillatorBased": "Oscillator-based",
    "strategy.avoid.trendFollowing": "Trend following",
    "strategy.tactic.widerStops": "Wider stops",
    "strategy.tactic.optionsStrategies": "Options strategies",
    "strategy.avoid.fullPositions": "Full positions",
    "strategy.tactic.smallPositions": "Small positions",
    "strategy.tactic.watchConfirmation": "Watch confirmation",
    "strategy.avoid.largeCommitments": "Large commitments",
    "changelog.title": "What's New v{version}",
    "changelog.0.3.12.0": "GitHub Pages deployment support with gh-pages and homepage config",
    "changelog.0.3.12.1": "Global markets grid with region movers and show-more popups",
    "changelog.0.3.12.2": "Search bar with Yahoo Finance autocomplete and /api/search support",
    "changelog.0.3.12.3": "Asset class sections (crypto, rates, commodities, FX) with live prices",
    "changelog.0.3.12.4": "News cards now include images and expanded to 20 items",
    "changelog.0.3.12.5": "Live ticker refresh runs immediately and avoids UI skeleton flashes",
    "changelog.0.3.11.0": "Brand refresh: logo icon, refined typography, ambient glow",
    "changelog.0.3.11.1": "Home page hero section with live market status",
    "changelog.0.3.11.2": "Auto-scrolling marquee ticker strip with LIVE pulse badge",
    "changelog.0.3.11.3": "Market region cycling with split red/green intraday charts",
    "changelog.0.3.11.4": "DEV toggles for live tickers and performance monitor",
    "changelog.0.3.11.5": "Longer sparklines and clearer mover/trending layouts",
    "changelog.0.3.10.0": "Home dashboard with news, market snapshot, and popular tickers",
    "changelog.0.3.10.1": "Financials visuals refresh with radar + cash/debt views",
    "changelog.0.3.10.2": "Homepage overhaul into a live market dashboard",
    "changelog.0.3.10.3": "Real-time ticker strip, intraday charts, movers, and trending sparklines",
    "changelog.0.3.10.4": "RSS news feed, skeleton loading states, and collapsible changelog banner",
    "changelog.0.3.9.0": "Stock vs Financials analysis split",
    "changelog.0.3.9.1": "Valuation toolkit and fundamentals aggregator",
    "help.newsHero.title": "Top Story",
    "help.newsHero.body": "Featured headline with summary and source details.",
    "help.newsList.title": "Headlines",
    "help.newsList.body": "Additional headlines with images and quick links.",
    "help.moverGainers.title": "Top Gainers",
    "help.moverGainers.body": "Largest gainers for the current session.",
    "help.moverLosers.title": "Top Losers",
    "help.moverLosers.body": "Largest decliners for the current session.",
    "help.moverTrending.title": "Trending",
    "help.moverTrending.body": "Most active and trending tickers right now.",
    "help.assetClasses.title": "Asset Classes",
    "help.assetClasses.body": "Live snapshots for crypto, rates, commodities, and FX.",
    "help.marketScorecard.title": "Market Scorecard",
    "help.marketScorecard.body": "S&P 500 returns and key risk gauges.",
    "help.crossAsset.title": "Cross-Asset Pulse",
    "help.crossAsset.body": "Quick read on stocks, bonds, commodities, crypto, and USD.",
    "help.sectorPerformance.title": "Sector Performance",
    "help.sectorPerformance.body": "Sector ETFs ranked by today's move.",
    "help.yieldCurve.title": "Yield Curve",
    "help.yieldCurve.body": "Short vs long rates and curve shape.",
    "help.portfolioSnapshot.title": "Portfolio Snapshot",
    "help.portfolioSnapshot.body": "Model portfolio value, cash, and risk mix.",
    "help.openCharts.title": "Open in Charts",
    "help.openCharts.body": "Jump to the Charts tab and expand the full-period view.",
  },
  "fr-FR": {
    "tagline.quant": "Analyse quantitative",
    "search.placeholder": "Rechercher des actions...",
    "search.running": "En cours…",
    "search.analyze": "Analyser",
    "nav.home": "Accueil",
    "nav.analysis": "Analyse",
    "nav.charts": "Graphiques",
    "nav.heatmap": "Carte thermique",
    "nav.comparison": "Comparaison",
    "nav.account": "Compte",
    "nav.help": "Aide",
    "nav.tools": "Outils",
    "common.line": "Ligne",
    "common.candles": "Bougies",
    "common.expand": "Agrandir",
    "common.close": "Fermer",
    "common.save": "Enregistrer",
    "common.signIn": "Se connecter",
    "common.signOut": "Se déconnecter",
    "common.zoomIn": "Zoom avant",
    "common.zoomOut": "Zoom arrière",
    "common.reset": "Réinitialiser",
    "menu.settings": "Paramètres",
    "menu.language": "Langue",
    "menu.upgrade": "Passer à Pro",
    "menu.gift": "Offrir AnalyzeAlpha",
    "menu.logout": "Se déconnecter",
    "menu.signedOut": "Non connecté",
    "tools.watchlist": "Liste de suivi",
    "tools.alerts": "Alertes",
    "tools.ticker": "Ticker",
    "tools.add": "Ajouter",
    "tools.emptyWatchlist": "Liste de suivi vide",
    "tools.noAlerts": "Aucune alerte",
    "tools.above": "Au-dessus",
    "tools.below": "En dessous",
    "tools.set": "Définir",
    "tools.triggered": "DÉCLENCHÉ",
    "tools.watching": "SURVEILLANCE",
    "auth.missingConfig": "Configuration Supabase manquante. Ajoutez `VITE_SUPABASE_URL` et la clé publique, puis redémarrez le serveur de dev.",
    "auth.continueGoogle": "Continuer avec Google",
    "auth.or": "ou",
    "auth.firstName": "Prénom",
    "auth.email": "E-mail",
    "auth.password": "Mot de passe",
    "auth.signIn": "Se connecter",
    "auth.createAccount": "Créer un compte",
    "auth.checkEmail": "Vérifiez votre e-mail pour confirmer votre compte.",
    "auth.errFirstName": "Prénom requis.",
    "auth.errEmailPassword": "E-mail et mot de passe requis.",
    "time.secondsAgo": "il y a {count}s",
    "time.minutesAgo": "il y a {count} min",
    "day.morning": "matin",
    "day.afternoon": "après-midi",
    "day.evening": "soir",
    "day.night": "nuit",
    "greeting.goodDaypart": "Bon {dayPart}",
    "greeting.hey": "Salut",
    "greeting.welcomeBack": "Content de vous revoir",
    "greeting.niceToSeeYou": "Ravi de vous voir",
    "greeting.hello": "Bonjour",
    "greeting.marketBrief": "Brief marché",
    "greeting.quickPulse": "Pulse rapide",
    "greeting.snapshot": "Aperçu",
    "greeting.todaysGlance": "Coup d'œil du jour",
    "home.updated": "Mis à jour {ago}",
    "home.marketNews": "Actualités du marché",
    "home.indexes": "Indices",
    "home.topGainers": "Principales hausses",
    "home.topLosers": "Principales baisses",
    "home.trendingStocks": "Actions tendance",
    "home.marketBriefSection": "Brief marché",
    "chart.openCharts": "Ouvrir dans Graphiques",
    "help.title": "Mode d'aide",
    "help.body": "Survolez un élément en surbrillance pour voir ce qu'il fait. Cliquez sur Aide à nouveau pour quitter.",
    "help.exit": "Quitter l'aide",
    "help.search.title": "Recherche",
    "help.search.body": "Tapez un ticker ou un nom d'entreprise. Appuyez sur Entrée ou cliquez sur Analyser.",
    "help.analyze.title": "Analyser",
    "help.analyze.body": "Récupère les données et met à jour la recommandation, les signaux et les graphiques.",
    "help.tools.title": "Outils",
    "help.tools.body": "Gérez la liste de suivi et les alertes sans quitter la page.",
    "help.account.title": "Compte",
    "help.account.body": "Réglages, langue, upgrades et déconnexion.",
    "help.priceChart.title": "Graphique des prix",
    "help.priceChart.body": "Affiche les 60 dernières séances avec indicateurs. Modifiez période et intervalle.",
    "help.nav.home.title": "Accueil",
    "help.nav.home.body": "Vue d'ensemble du marché et instantanés en direct.",
    "help.nav.analysis.title": "Analyse",
    "help.nav.analysis.body": "Signaux, valorisation et risque.",
    "help.nav.charts.title": "Graphiques",
    "help.nav.charts.body": "Graphiques avancés et indicateurs.",
    "help.nav.heatmap.title": "Carte thermique",
    "help.nav.heatmap.body": "Carte secteur/marché (Pro).",
    "help.nav.comparison.title": "Comparaison",
    "help.nav.comparison.body": "Comparer plusieurs tickers (Pro).",
    "help.tickerStrip.title": "Bandeau des tickers",
    "help.tickerStrip.body": "Aperçu défilant des marchés. Cliquez sur un ticker.",
    "help.region.title": "Régions",
    "help.region.body": "Changez la région pour mettre à jour les actus et graphiques.",
    "help.marketNews.title": "Actualités du marché",
    "help.marketNews.body": "Derniers titres pour la région sélectionnée.",
    "help.indexes.title": "Indices",
    "help.indexes.body": "Graphiques intraday des principaux indices.",
    "help.movers.title": "Mouvements du marché",
    "help.movers.body": "Meilleures hausses, baisses et tendances.",
    "help.marketBrief.title": "Brief marché",
    "help.marketBrief.body": "Résumé cross-asset et signaux de risque.",
    "help.changelog.title": "Journal des changements",
    "help.changelog.body": "Nouveautés de la dernière version.",
    "help.accountSync.title": "Synchronisation",
    "help.accountSync.body": "Connectez-vous pour synchroniser préférences et listes.",
    "help.profile.title": "Profil",
    "help.profile.body": "Mettre à jour le nom et gérer la connexion.",
    "help.accountWatchlist.title": "Liste de suivi",
    "help.accountWatchlist.body": "Gérer les tickers sauvegardés.",
    "help.accountAlerts.title": "Alertes",
    "help.accountAlerts.body": "Définir des alertes de prix.",
    "help.accountRecent.title": "Analyses récentes",
    "help.accountRecent.body": "Accès rapide à vos dernières analyses.",
    "help.accountPreferences.title": "Préférences",
    "help.accountPreferences.body": "Période, intervalle et région par défaut.",
    "help.chartsControls.title": "Contrôles du graphique",
    "help.chartsControls.body": "Activer les indicateurs et changer le style.",
    "analysis.stockTab": "Action",
    "analysis.financialsTab": "Finances",
    "analysis.enterTicker": "Entrez un ticker pour commencer",
    "analysis.typeSymbol": "Tapez un symbole ci-dessus et cliquez sur Analyser",
    "analysis.verdict": "Verdict",
    "analysis.confidence": "Confiance",
    "analysis.score": "Score",
    "analysis.priceTargets": "Objectifs de prix",
    "analysis.target": "Objectif",
    "analysis.stopLoss": "Stop loss",
    "analysis.riskReward": "Risque / Rendement",
    "analysis.technicalSignals": "Signaux techniques",
    "analysis.riskProfile": "Profil de risque",
    "analysis.riskLevel": "Niveau de risque",
    "analysis.volatility": "Volatilité",
    "analysis.maxDrawdown": "Perte max",
    "analysis.sharpe": "Sharpe",
    "analysis.sortino": "Sortino",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "Signaux statistiques",
    "analysis.zscore": "Z-score",
    "analysis.zscoreDesc": "Écart du prix à la moyenne 20 périodes",
    "analysis.momentum": "Momentum",
    "analysis.momentumDesc": "Rendement moyen sur 5, 10, 20, 50 jours",
    "analysis.volume": "Volume",
    "analysis.volumeDesc": "Volume actuel vs moyenne 20 périodes",
    "analysis.composite": "Composite",
    "analysis.compositeDesc": "Combinaison pondérée de tous les signaux",
    "analysis.buy": "Acheter",
    "analysis.sell": "Vendre",
    "analysis.current": "Actuel",
    "analysis.avg": "Moy.",
    "analysis.confidenceLabel": "Confiance",
    "analysis.direction": "Direction",
    "analysis.valuationAnchor": "Ancre de valorisation",
    "analysis.priceChartTitle": "Prix — 60 dernières séances",
    "analysis.valuationToolkit": "Outils de valorisation",
    "analysis.valuationDesc": "Estime la valeur intrinsèque via DCF, dividendes et multiples. Ajustez les hypothèses.",
    "analysis.fcfPerShare": "FCF / Action",
    "analysis.eps": "BPA",
    "analysis.dividendPerShare": "Dividende / Action",
    "analysis.growth5y": "Croissance (5 ans %)",
    "analysis.discountWacc": "Actualisation / WACC %",
    "analysis.terminalGrowth": "Croissance terminale %",
    "analysis.targetPE": "P/E cible",
    "analysis.projectionYears": "Années de projection",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "Actualisation des dividendes",
    "analysis.multiples": "Multiples",
    "analysis.anchor": "Ancre",
    "analysis.upside": "Potentiel",
    "analysis.usedAsContext": "Utilisé comme contexte long terme avec les signaux techniques.",
    "analysis.neutral": "NEUTRE",
    "charts.runAnalysisFirst": "Lancez une analyse d'abord",
    "charts.movingAvg": "Moyennes mobiles",
    "charts.bollinger": "Bollinger",
    "charts.volume": "Volume",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "Stochastique",
    "charts.chart": "Graphique",
    "charts.period": "Période",
    "charts.fullPeriod": "{ticker} — Période complète",
    "charts.volumeTitle": "Volume",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "Stochastique",
    "charts.windowHint": "Défilement horizontal pour déplacer, vertical pour ajuster. Glisser pour déplacer. Fenêtre : {count} / {total}",
    "account.syncLocal": "Local uniquement",
    "account.syncing": "Synchronisation…",
    "account.syncError": "Erreur de sync",
    "account.synced": "Synchronisé",
    "account.syncedAgo": "Synchronisé {ago}",
    "account.syncTitle": "Synchronisation du compte",
    "account.signedInAs": "Connecté en tant que {email}",
    "account.user": "utilisateur",
    "account.signInToSync": "Connectez-vous pour synchroniser vos données.",
    "account.profile": "Profil",
    "account.firstName": "Prénom",
    "account.saved": "Enregistré",
    "account.enterFirstName": "Entrez un prénom.",
    "account.signInToSave": "Connectez-vous pour enregistrer.",
    "account.overview": "Vue d’ensemble",
    "account.preferences": "Préférences",
    "account.recentAnalyses": "Analyses récentes",
    "account.noAnalyses": "Aucune analyse pour l’instant",
    "account.signal": "Signal",
    "account.regime": "Régime",
    "account.risk": "Risque",
    "account.conf": "Confiance",
    "account.view": "Voir",
    "account.defaultPeriod": "Période par défaut",
    "account.defaultInterval": "Intervalle par défaut",
    "account.homeRegion": "Région d’accueil",
    "pro.heatmap.title": "La carte thermique est Pro",
    "pro.heatmap.desc": "Déverrouillez la carte thermique du S&P avec Sharpe, volatilité et performance relative en temps réel.",
    "pro.heatmap.f0": "Récupérations de données parallèles",
    "pro.heatmap.f1": "Visualisation en treemap",
    "pro.heatmap.f2": "Superpositions de risque et de régime",
    "pro.comparison.title": "La comparaison est Pro",
    "pro.comparison.desc": "Comparez plusieurs tickers selon les signaux, le risque et la valorisation dans une seule vue.",
    "pro.comparison.f0": "Scores de signaux côte à côte",
    "pro.comparison.f1": "Classements Sharpe et drawdown",
    "pro.comparison.f2": "Vue tableau prête à l'export",
    "common.live": "LIVE",
    "common.price": "Prix",
    "time.justNow": "à l’instant",
    "time.hoursAgo": "il y a {count} h",
    "time.daysAgo": "il y a {count} j",
    "analysis.valuationAnalysis": "Analyse de valorisation",
    "analysis.stretchIndex": "Indice d’étirement",
    "analysis.undervalued": "Sous-évalué",
    "analysis.overvalued": "Surévalué",
    "analysis.vsSma200": "vs SMA 200",
    "analysis.vsSma50": "vs SMA 50",
    "analysis.bollingerPercentB": "Bollinger %B",
    "analysis.range52w": "Fourchette 52 sem.",
    "analysis.fromLow": "au-dessus du plus bas",
    "analysis.fairValueEst": "Valeur juste est.",
    "analysis.marketRegime": "Régime de marché",
    "analysis.strength": "Force",
    "analysis.hurst": "Hurst",
    "analysis.avoid": "Éviter",
    "analysis.analystTargets": "Objectifs des analystes",
    "analysis.past12Months": "12 derniers mois",
    "analysis.target12Month": "Objectif à 12 mois",
    "analysis.companyMetrics": "Indicateurs d’entreprise",
    "analysis.earningsPerShare": "Bénéfice par action",
    "analysis.epsUnavailable": "Série BPA indisponible.",
    "analysis.revenue": "Revenu",
    "analysis.netProfitMargin": "Marge nette",
    "analysis.currentRatio": "Ratio courant",
    "analysis.debtToEquity": "Dette / capitaux propres",
    "analysis.returnOnEquityTtm": "ROE (TTM)",
    "analysis.financialsProTitle": "Finances en Pro",
    "analysis.financialsProDesc": "Débloquez les données financières, l’outillage de valorisation et l’analyse multi‑périodes.",
    "analysis.financialsProF0": "Compte de résultat · Flux de trésorerie · Bilan",
    "analysis.financialsProF1": "Modélisation DCF, DDM et multiples",
    "analysis.financialsProF2": "Tendances historiques des marges et de la croissance",
    "analysis.fundamentalSnapshot": "Aperçu fondamental",
    "analysis.marketCap": "Capitalisation",
    "analysis.netIncome": "Résultat net",
    "analysis.freeCashFlow": "Flux de trésorerie libre",
    "analysis.revenueGrowth": "Croissance du chiffre d’affaires",
    "analysis.grossMargin": "Marge brute",
    "analysis.operatingMargin": "Marge opérationnelle",
    "analysis.netMargin": "Marge nette",
    "analysis.balanceSheet": "Bilan",
    "analysis.cash": "Trésorerie",
    "analysis.debt": "Dette",
    "analysis.perShare": "Par action",
    "analysis.keyRatios": "Ratios clés",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "Vue d’ensemble financière",
    "analysis.revenueFcfMargin": "Revenu + marge FCF",
    "analysis.fcfMargin": "Marge FCF",
    "analysis.marginTrends": "Tendances des marges",
    "analysis.grossMarginShort": "Brute",
    "analysis.operatingMarginShort": "Opérationnelle",
    "analysis.netMarginShort": "Nette",
    "analysis.marginRadar": "Radar des marges",
    "analysis.cashVsDebt": "Trésorerie vs dette",
    "analysis.netCash": "Trésorerie nette",
    "analysis.netIncomeByPeriod": "Résultat net par période",
    "analysis.fundamentalDataAggregator": "Agrégateur de données fondamentales",
    "analysis.fundamentalDataDesc": "Agrège revenus, bénéfices, marges, dette et flux de trésorerie par ticker et période fiscale. Conçu pour se brancher sur des API/SEC — données simulées dans cette version.",
    "analysis.fiscalPeriod": "Période fiscale",
    "analysis.source": "Source",
    "analysis.period": "Période",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Supérieur",
    "analysis.bbLower": "BB Inférieur",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "Clôture",
    "heatmap.marketHeatmaps": "Cartes thermiques",
    "heatmap.subtitle": "Treemaps par indice, taille par capitalisation, couleur par Sharpe 6 mois. Actions triées par secteur.",
    "heatmap.panelMeta": "{count} actions · Taille : capitalisation · Couleur : Sharpe (6 mois)",
    "heatmap.load": "Charger la heatmap",
    "heatmap.fetches": "Récupère {count} actions depuis Yahoo Finance",
    "heatmap.fetching": "Récupération de {count} actions…",
    "heatmap.refresh": "Actualiser",
    "heatmap.sector": "Secteur",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6 mois",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "En cours…",
    "comparison.compare": "Comparer",
    "comparison.normalizedPerformance": "Performance normalisée (6 mois)",
    "comparison.ticker": "Ticker",
    "comparison.price": "Prix",
    "comparison.signal": "Signal",
    "comparison.conf": "Conf.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "Vol.",
    "comparison.maxDD": "DD max",
    "comparison.momentum": "Mom.",
    "comparison.stretch": "Stretch",
    "comparison.sharpeComparison": "Comparaison Sharpe",
    "comparison.volatilityComparison": "Comparaison volatilité",
    "comparison.volatility": "Volatilité",
    "comparison.failed": "échec",
    "help.valuationAnalysis.title": "Analyse de valorisation",
    "help.valuationAnalysis.body": "Mesure l’écart, les SMA et la valeur juste.",
    "help.marketRegime.title": "Régime de marché",
    "help.marketRegime.body": "Synthèse tendance, volatilité et posture tactique.",
    "help.analystTargets.title": "Objectifs des analystes",
    "help.analystTargets.body": "Consensus et révisions des 12 derniers mois.",
    "help.companyMetrics.title": "Indicateurs d’entreprise",
    "help.companyMetrics.body": "Ratios opérationnels et bilanciels dans le temps.",
    "help.fundamentalSnapshot.title": "Aperçu fondamental",
    "help.fundamentalSnapshot.body": "Fondamentaux principaux pour la période sélectionnée.",
    "help.balanceSheet.title": "Bilan",
    "help.balanceSheet.body": "Liquidité et levier.",
    "help.perShare.title": "Par action",
    "help.perShare.body": "BPA, cash-flow et dividendes par action.",
    "help.keyRatios.title": "Ratios clés",
    "help.keyRatios.body": "Rentabilité et valorisation.",
    "help.financialsOverview.title": "Vue d’ensemble financière",
    "help.financialsOverview.body": "Résumé visuel des marges, trésorerie/dette et bénéfices.",
    "help.fundamentalData.title": "Données fondamentales",
    "help.fundamentalData.body": "Fondamentaux modélisés par période fiscale.",
    "help.comparisonInput.title": "Entrée comparaison",
    "help.comparisonInput.body": "Entrez des tickers séparés par des virgules.",
    "help.comparisonPerformance.title": "Surperformance normalisée",
    "help.comparisonPerformance.body": "Rendements normalisés sur 6 mois.",
    "help.comparisonTable.title": "Tableau de comparaison",
    "help.comparisonTable.body": "Tableau triable des signaux, risques et valorisation.",
    "help.heatmapOverview.title": "Cartes thermiques",
    "help.heatmapOverview.body": "Treemap par secteur avec couleurs selon Sharpe.",
    "help.valuationToolkit.title": "Outils de valorisation",
    "help.valuationToolkit.body": "Ajustez les hypothèses DCF/DDM et comparez les ancres.",
    "help.priceTargets.title": "Objectifs de prix",
    "help.priceTargets.body": "Niveaux bull/base/stop et ratio risque/rendement.",
    "help.technicalSignals.title": "Signaux techniques",
    "help.technicalSignals.body": "Signaux de momentum, tendance et indicateurs.",
    "help.riskProfile.title": "Profil de risque",
    "help.riskProfile.body": "Volatilité, drawdown et métriques de risque.",
    "help.statSignals.title": "Signaux statistiques",
    "help.statSignals.body": "Z-score, momentum et stats composites.",
    "footer.disclaimer": "À des fins éducatives uniquement — ceci n'est pas un conseil financier",
  },
  "de-DE": {
    "tagline.quant": "Quantitative Analyse",
    "search.placeholder": "Aktien suchen...",
    "search.running": "Läuft…",
    "search.analyze": "Analysieren",
    "nav.home": "Startseite",
    "nav.analysis": "Analyse",
    "nav.charts": "Charts",
    "nav.heatmap": "Heatmap",
    "nav.comparison": "Vergleich",
    "nav.account": "Konto",
    "nav.help": "Hilfe",
    "nav.tools": "Werkzeuge",
    "common.line": "Linie",
    "common.candles": "Kerzen",
    "common.expand": "Erweitern",
    "common.close": "Schließen",
    "common.save": "Speichern",
    "common.signIn": "Anmelden",
    "common.signOut": "Abmelden",
    "common.zoomIn": "Hineinzoomen",
    "common.zoomOut": "Herauszoomen",
    "common.reset": "Zurücksetzen",
    "menu.settings": "Einstellungen",
    "menu.language": "Sprache",
    "menu.upgrade": "Auf Pro upgraden",
    "menu.gift": "AnalyzeAlpha verschenken",
    "menu.logout": "Abmelden",
    "menu.signedOut": "Nicht angemeldet",
    "tools.watchlist": "Watchlist",
    "tools.alerts": "Alarme",
    "tools.ticker": "Ticker",
    "tools.add": "Hinzufügen",
    "tools.emptyWatchlist": "Watchlist leer",
    "tools.noAlerts": "Keine Alarme",
    "tools.above": "Oberhalb",
    "tools.below": "Unterhalb",
    "tools.set": "Setzen",
    "tools.triggered": "AUSGELÖST",
    "tools.watching": "BEOBACHTEN",
    "auth.missingConfig": "Supabase-Konfiguration fehlt. Fügen Sie `VITE_SUPABASE_URL` und den Publishable Key hinzu und starten Sie den Dev-Server neu.",
    "auth.continueGoogle": "Mit Google fortfahren",
    "auth.or": "oder",
    "auth.firstName": "Vorname",
    "auth.email": "E-Mail",
    "auth.password": "Passwort",
    "auth.signIn": "Anmelden",
    "auth.createAccount": "Konto erstellen",
    "auth.checkEmail": "Bitte E-Mail prüfen, um das Konto zu bestätigen.",
    "auth.errFirstName": "Vorname erforderlich.",
    "auth.errEmailPassword": "E-Mail und Passwort erforderlich.",
    "time.secondsAgo": "vor {count}s",
    "time.minutesAgo": "vor {count} Min.",
    "day.morning": "Morgen",
    "day.afternoon": "Nachmittag",
    "day.evening": "Abend",
    "day.night": "Nacht",
    "greeting.goodDaypart": "Guten {dayPart}",
    "greeting.hey": "Hey",
    "greeting.welcomeBack": "Willkommen zurück",
    "greeting.niceToSeeYou": "Schön, dich zu sehen",
    "greeting.hello": "Hallo",
    "greeting.marketBrief": "Marktüberblick",
    "greeting.quickPulse": "Schneller Puls",
    "greeting.snapshot": "Momentaufnahme",
    "greeting.todaysGlance": "Heutiger Überblick",
    "home.updated": "Aktualisiert {ago}",
    "home.marketNews": "Marktnachrichten",
    "home.indexes": "Indizes",
    "home.topGainers": "Top-Gewinner",
    "home.topLosers": "Top-Verlierer",
    "home.trendingStocks": "Trendende Aktien",
    "home.marketBriefSection": "Marktüberblick",
    "chart.openCharts": "In Charts öffnen",
    "help.title": "Hilfemodus",
    "help.body": "Fahre über markierte Elemente, um zu sehen, was sie tun. Klicke erneut auf Hilfe, um zu beenden.",
    "help.exit": "Hilfe beenden",
    "help.search.title": "Suche",
    "help.search.body": "Ticker oder Unternehmen eingeben. Enter oder Analysieren klicken.",
    "help.analyze.title": "Analysieren",
    "help.analyze.body": "Aktualisiert Empfehlung, Signale und Charts.",
    "help.tools.title": "Werkzeuge",
    "help.tools.body": "Watchlist und Alarme verwalten.",
    "help.account.title": "Konto",
    "help.account.body": "Einstellungen, Sprache, Upgrade und Abmelden.",
    "help.priceChart.title": "Preis-Chart",
    "help.priceChart.body": "Zeigt die letzten 60 Sitzungen mit Indikatoren. Periode/Intervall ändern.",
    "help.nav.home.title": "Startseite",
    "help.nav.home.body": "Marktüberblick und Live-Snapshots.",
    "help.nav.analysis.title": "Analyse",
    "help.nav.analysis.body": "Signale, Bewertung und Risiko.",
    "help.nav.charts.title": "Charts",
    "help.nav.charts.body": "Erweiterte Charts und Indikatoren.",
    "help.nav.heatmap.title": "Heatmap",
    "help.nav.heatmap.body": "Sektor- und Marktkarte (Pro).",
    "help.nav.comparison.title": "Vergleich",
    "help.nav.comparison.body": "Mehrere Ticker vergleichen (Pro).",
    "help.tickerStrip.title": "Ticker-Leiste",
    "help.tickerStrip.body": "Scrollender Marktüberblick. Klicke einen Ticker zum Analysieren.",
    "help.region.title": "Regionen",
    "help.region.body": "Region wechseln, um News und Charts zu aktualisieren.",
    "help.marketNews.title": "Marktnachrichten",
    "help.marketNews.body": "Aktuelle Schlagzeilen der ausgewählten Region.",
    "help.indexes.title": "Indizes",
    "help.indexes.body": "Intraday-Charts der wichtigsten Indizes.",
    "help.movers.title": "Marktbewegungen",
    "help.movers.body": "Top-Gewinner, -Verlierer und Trends.",
    "help.marketBrief.title": "Marktüberblick",
    "help.marketBrief.body": "Cross-Asset-Zusammenfassung und Risikosignale.",
    "help.changelog.title": "Änderungsprotokoll",
    "help.changelog.body": "Neues in der aktuellen Version.",
    "help.accountSync.title": "Kontosynchronisierung",
    "help.accountSync.body": "Anmelden, um Einstellungen und Watchlists zu synchronisieren.",
    "help.profile.title": "Profil",
    "help.profile.body": "Anzeigenamen aktualisieren und Anmeldung verwalten.",
    "help.accountWatchlist.title": "Watchlist",
    "help.accountWatchlist.body": "Gespeicherte Ticker verwalten.",
    "help.accountAlerts.title": "Alarme",
    "help.accountAlerts.body": "Preisalarme setzen und überwachen.",
    "help.accountRecent.title": "Letzte Analysen",
    "help.accountRecent.body": "Schneller Zugriff auf letzte Analysen.",
    "help.accountPreferences.title": "Einstellungen",
    "help.accountPreferences.body": "Standardperiode, Intervall und Region.",
    "help.chartsControls.title": "Chart-Steuerung",
    "help.chartsControls.body": "Indikatoren umschalten und Stil wechseln.",
    "analysis.stockTab": "Aktie",
    "analysis.financialsTab": "Finanzen",
    "analysis.enterTicker": "Gib einen Ticker ein, um zu starten",
    "analysis.typeSymbol": "Symbol oben eingeben und Analysieren klicken",
    "analysis.verdict": "Urteil",
    "analysis.confidence": "Konfidenz",
    "analysis.score": "Score",
    "analysis.priceTargets": "Preisziele",
    "analysis.target": "Ziel",
    "analysis.stopLoss": "Stop-Loss",
    "analysis.riskReward": "Risiko / Rendite",
    "analysis.technicalSignals": "Technische Signale",
    "analysis.riskProfile": "Risikoprofil",
    "analysis.riskLevel": "Risikostufe",
    "analysis.volatility": "Volatilität",
    "analysis.maxDrawdown": "Max. Drawdown",
    "analysis.sharpe": "Sharpe",
    "analysis.sortino": "Sortino",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "Statistische Signale",
    "analysis.zscore": "Z-Score",
    "analysis.zscoreDesc": "Preisabweichung vom 20-Perioden-Mittel",
    "analysis.momentum": "Momentum",
    "analysis.momentumDesc": "Ø Rendite über 5, 10, 20, 50 Tage",
    "analysis.volume": "Volumen",
    "analysis.volumeDesc": "Aktuelles Volumen vs. 20-Perioden-Durchschnitt",
    "analysis.composite": "Komposit",
    "analysis.compositeDesc": "Gewichtete Kombination aller Signale",
    "analysis.buy": "Kaufen",
    "analysis.sell": "Verkaufen",
    "analysis.current": "Aktuell",
    "analysis.avg": "Ø",
    "analysis.confidenceLabel": "Konfidenz",
    "analysis.direction": "Richtung",
    "analysis.valuationAnchor": "Bewertungsanker",
    "analysis.priceChartTitle": "Preis — letzte 60 Sitzungen",
    "analysis.valuationToolkit": "Bewertungs-Toolkit",
    "analysis.valuationDesc": "Schätzt den inneren Wert via DCF, Dividenden-Discount und Multiples. Annahmen anpassen.",
    "analysis.fcfPerShare": "FCF / Aktie",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "Dividende / Aktie",
    "analysis.growth5y": "Wachstum (5J %)",
    "analysis.discountWacc": "Diskont / WACC %",
    "analysis.terminalGrowth": "Terminales Wachstum %",
    "analysis.targetPE": "Ziel-KGV",
    "analysis.projectionYears": "Prognosejahre",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "Dividenden-Discount",
    "analysis.multiples": "Multiples",
    "analysis.anchor": "Anker",
    "analysis.upside": "Potenzial",
    "analysis.usedAsContext": "Als langfristiger Kontext neben technischen Signalen genutzt.",
    "analysis.neutral": "NEUTRAL",
    "charts.runAnalysisFirst": "Zuerst eine Analyse ausführen",
    "charts.movingAvg": "Gleitende Mittelwerte",
    "charts.bollinger": "Bollinger",
    "charts.volume": "Volumen",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "Stochastik",
    "charts.chart": "Chart",
    "charts.period": "Periode",
    "charts.fullPeriod": "{ticker} — Gesamtzeitraum",
    "charts.volumeTitle": "Volumen",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "Stochastik",
    "charts.windowHint": "Horizontal scrollt, vertikal passt das Fenster an. Ziehen zum Verschieben. Fenster: {count} / {total}",
    "account.syncLocal": "Nur lokal",
    "account.syncing": "Synchronisiere…",
    "account.syncError": "Sync-Fehler",
    "account.synced": "Synchronisiert",
    "account.syncedAgo": "Synchronisiert {ago}",
    "account.syncTitle": "Kontosynchronisierung",
    "account.signedInAs": "Angemeldet als {email}",
    "account.user": "Benutzer",
    "account.signInToSync": "Melden Sie sich an, um Daten zu synchronisieren.",
    "account.profile": "Profil",
    "account.firstName": "Vorname",
    "account.saved": "Gespeichert",
    "account.enterFirstName": "Vorname eingeben.",
    "account.signInToSave": "Zum Speichern anmelden.",
    "account.overview": "Übersicht",
    "account.preferences": "Einstellungen",
    "account.recentAnalyses": "Letzte Analysen",
    "account.noAnalyses": "Noch keine Analysen",
    "account.signal": "Signal",
    "account.regime": "Regime",
    "account.risk": "Risiko",
    "account.conf": "Konf.",
    "account.view": "Ansehen",
    "account.defaultPeriod": "Standardzeitraum",
    "account.defaultInterval": "Standardintervall",
    "account.homeRegion": "Startregion",
    "pro.heatmap.title": "Heatmap ist Pro",
    "pro.heatmap.desc": "Schalte die S&P-Heatmap mit live Sharpe, Volatilität und relativer Performance frei.",
    "pro.heatmap.f0": "Parallele Datenabrufe",
    "pro.heatmap.f1": "Treemap-Visualisierung",
    "pro.heatmap.f2": "Risiko- und Regime-Overlays",
    "pro.comparison.title": "Vergleich ist Pro",
    "pro.comparison.desc": "Vergleiche mehrere Ticker über Signale, Risiko und Bewertung in einer Ansicht.",
    "pro.comparison.f0": "Signal-Scores nebeneinander",
    "pro.comparison.f1": "Sharpe- und Drawdown-Rankings",
    "pro.comparison.f2": "Exportfertige Tabellenansicht",
    "common.live": "LIVE",
    "common.price": "Preis",
    "time.justNow": "gerade eben",
    "time.hoursAgo": "vor {count} Std.",
    "time.daysAgo": "vor {count} Tagen",
    "analysis.valuationAnalysis": "Bewertungsanalyse",
    "analysis.stretchIndex": "Stretch-Index",
    "analysis.undervalued": "Unterbewertet",
    "analysis.overvalued": "Überbewertet",
    "analysis.vsSma200": "vs SMA 200",
    "analysis.vsSma50": "vs SMA 50",
    "analysis.bollingerPercentB": "Bollinger %B",
    "analysis.range52w": "52W-Spanne",
    "analysis.fromLow": "über dem Tief",
    "analysis.fairValueEst": "Fair-Value-Schätzung",
    "analysis.marketRegime": "Marktregime",
    "analysis.strength": "Stärke",
    "analysis.hurst": "Hurst",
    "analysis.avoid": "Meiden",
    "analysis.analystTargets": "Analystenziele",
    "analysis.past12Months": "Letzte 12 Monate",
    "analysis.target12Month": "12‑Monats‑Kursziel",
    "analysis.companyMetrics": "Unternehmenskennzahlen",
    "analysis.earningsPerShare": "Gewinn je Aktie",
    "analysis.epsUnavailable": "EPS-Serie nicht verfügbar.",
    "analysis.revenue": "Umsatz",
    "analysis.netProfitMargin": "Nettomarge",
    "analysis.currentRatio": "Liquiditätsgrad",
    "analysis.debtToEquity": "Verschuldung / Eigenkapital",
    "analysis.returnOnEquityTtm": "Eigenkapitalrendite (TTM)",
    "analysis.financialsProTitle": "Finanzen sind Pro",
    "analysis.financialsProDesc": "Schalte Unternehmensfinanzen, Bewertungs-Tools und Mehrperioden-Analysen frei.",
    "analysis.financialsProF0": "GuV · Cashflow · Bilanz",
    "analysis.financialsProF1": "DCF-, DDM- und Multiples-Modelle",
    "analysis.financialsProF2": "Historische Margen- und Wachstumstrends",
    "analysis.fundamentalSnapshot": "Fundamentaler Überblick",
    "analysis.marketCap": "Marktkapitalisierung",
    "analysis.netIncome": "Nettogewinn",
    "analysis.freeCashFlow": "Free Cash Flow",
    "analysis.revenueGrowth": "Umsatzwachstum",
    "analysis.grossMargin": "Bruttomarge",
    "analysis.operatingMargin": "Operative Marge",
    "analysis.netMargin": "Nettomarge",
    "analysis.balanceSheet": "Bilanz",
    "analysis.cash": "Cash",
    "analysis.debt": "Schulden",
    "analysis.perShare": "Pro Aktie",
    "analysis.keyRatios": "Kennzahlen",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "KGV",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "Finanzübersicht",
    "analysis.revenueFcfMargin": "Umsatz + FCF-Marge",
    "analysis.fcfMargin": "FCF-Marge",
    "analysis.marginTrends": "Margentrends",
    "analysis.grossMarginShort": "Brutto",
    "analysis.operatingMarginShort": "Operativ",
    "analysis.netMarginShort": "Netto",
    "analysis.marginRadar": "Margen-Radar",
    "analysis.cashVsDebt": "Cash vs Schulden",
    "analysis.netCash": "Netto-Cash",
    "analysis.netIncomeByPeriod": "Nettogewinn je Periode",
    "analysis.fundamentalDataAggregator": "Fundamentaldaten-Aggregator",
    "analysis.fundamentalDataDesc": "Sammelt Umsatz, Gewinne, Margen, Schulden und Cashflow nach Ticker und Fiskalperiode. Für APIs/SEC gedacht — hier modellierte Daten.",
    "analysis.fiscalPeriod": "Fiskalperiode",
    "analysis.source": "Quelle",
    "analysis.period": "Periode",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Ober",
    "analysis.bbLower": "BB Unter",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "Schluss",
    "heatmap.marketHeatmaps": "Markt-Heatmaps",
    "heatmap.subtitle": "Treemap je Index, Größe nach Marktkapitalisierung, Farbe nach 6‑Monats‑Sharpe. Aktien nach Sektor sortiert.",
    "heatmap.panelMeta": "{count} Aktien · Größe: Marktkapitalisierung · Farbe: Sharpe (6 Monate)",
    "heatmap.load": "Heatmap laden",
    "heatmap.fetches": "Lädt {count} Aktien von Yahoo Finance",
    "heatmap.fetching": "Lade {count} Aktien…",
    "heatmap.refresh": "Aktualisieren",
    "heatmap.sector": "Sektor",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6 Monate",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "Läuft…",
    "comparison.compare": "Vergleichen",
    "comparison.normalizedPerformance": "Normalisierte Performance (6 Monate)",
    "comparison.ticker": "Ticker",
    "comparison.price": "Preis",
    "comparison.signal": "Signal",
    "comparison.conf": "Konf.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "Vol.",
    "comparison.maxDD": "Max DD",
    "comparison.momentum": "Mom.",
    "comparison.stretch": "Stretch",
    "comparison.sharpeComparison": "Sharpe-Vergleich",
    "comparison.volatilityComparison": "Volatilitätsvergleich",
    "comparison.volatility": "Volatilität",
    "comparison.failed": "fehlgeschlagen",
    "help.valuationAnalysis.title": "Bewertungsanalyse",
    "help.valuationAnalysis.body": "Misst Stretch, SMA-Abweichungen und Fair-Value-Signale.",
    "help.marketRegime.title": "Marktregime",
    "help.marketRegime.body": "Zusammenfassung von Trend, Volatilität und Taktik.",
    "help.analystTargets.title": "Analystenziele",
    "help.analystTargets.body": "Konsensziele und Änderungen der letzten 12 Monate.",
    "help.companyMetrics.title": "Unternehmenskennzahlen",
    "help.companyMetrics.body": "Wichtige operative und Bilanzkennzahlen im Zeitverlauf.",
    "help.fundamentalSnapshot.title": "Fundamentaler Überblick",
    "help.fundamentalSnapshot.body": "Top-Line-Fundamentaldaten für die gewählte Periode.",
    "help.balanceSheet.title": "Bilanz",
    "help.balanceSheet.body": "Liquidität und Verschuldung.",
    "help.perShare.title": "Pro Aktie",
    "help.perShare.body": "EPS, Cashflow und Dividenden je Aktie.",
    "help.keyRatios.title": "Kennzahlen",
    "help.keyRatios.body": "Profitabilität und Bewertung.",
    "help.financialsOverview.title": "Finanzübersicht",
    "help.financialsOverview.body": "Visuelle Übersicht zu Margen, Cash vs Schulden und Gewinnen.",
    "help.fundamentalData.title": "Fundamentaldaten",
    "help.fundamentalData.body": "Modellierte Fundamentaldaten nach Fiskalperiode.",
    "help.comparisonInput.title": "Vergleichseingabe",
    "help.comparisonInput.body": "Tickers durch Kommas getrennt eingeben.",
    "help.comparisonPerformance.title": "Performance-Overlay",
    "help.comparisonPerformance.body": "Normalisierte Renditen über 6 Monate.",
    "help.comparisonTable.title": "Vergleichstabelle",
    "help.comparisonTable.body": "Sortierbare Tabelle mit Signalen, Risiko und Bewertung.",
    "help.heatmapOverview.title": "Markt-Heatmaps",
    "help.heatmapOverview.body": "Treemap nach Sektor, Farbe nach Sharpe.",
    "help.valuationToolkit.title": "Bewertungs-Toolkit",
    "help.valuationToolkit.body": "DCF/DDM-Annahmen anpassen und Anker vergleichen.",
    "help.priceTargets.title": "Kursziele",
    "help.priceTargets.body": "Bull/Base/Stop-Level und Risiko/Rendite.",
    "help.technicalSignals.title": "Technische Signale",
    "help.technicalSignals.body": "Momentum-, Trend- und indikatorbasierte Signale.",
    "help.riskProfile.title": "Risikoprofil",
    "help.riskProfile.body": "Volatilität, Drawdown und Risikokennzahlen.",
    "help.statSignals.title": "Statistische Signale",
    "help.statSignals.body": "Z-Score, Momentum und Kombi-Statistiken.",
    "footer.disclaimer": "Nur zu Bildungszwecken — keine Finanzberatung",
  },
  "hi-IN": {
    "tagline.quant": "मात्रात्मक विश्लेषण",
    "search.placeholder": "स्टॉक्स खोजें...",
    "search.running": "चल रहा है…",
    "search.analyze": "विश्लेषण करें",
    "nav.home": "होम",
    "nav.analysis": "विश्लेषण",
    "nav.charts": "चार्ट",
    "nav.heatmap": "हीटमैप",
    "nav.comparison": "तुलना",
    "nav.account": "अकाउंट",
    "nav.help": "सहायता",
    "nav.tools": "टूल्स",
    "common.line": "लाइन",
    "common.candles": "कैंडल्स",
    "common.expand": "विस्तार",
    "common.close": "बंद करें",
    "common.save": "सेव करें",
    "common.signIn": "साइन इन",
    "common.signOut": "साइन आउट",
    "common.zoomIn": "ज़ूम इन",
    "common.zoomOut": "ज़ूम आउट",
    "common.reset": "रीसेट",
    "menu.settings": "सेटिंग्स",
    "menu.language": "भाषा",
    "menu.upgrade": "प्रो में अपग्रेड करें",
    "menu.gift": "AnalyzeAlpha उपहार दें",
    "menu.logout": "लॉग आउट",
    "menu.signedOut": "साइन इन नहीं है",
    "tools.watchlist": "वॉचलिस्ट",
    "tools.alerts": "अलर्ट्स",
    "tools.ticker": "टिकर",
    "tools.add": "जोड़ें",
    "tools.emptyWatchlist": "वॉचलिस्ट खाली है",
    "tools.noAlerts": "कोई अलर्ट नहीं",
    "tools.above": "ऊपर",
    "tools.below": "नीचे",
    "tools.set": "सेट",
    "tools.triggered": "ट्रिगर",
    "tools.watching": "नज़र में",
    "auth.missingConfig": "Supabase कॉन्फ़िग गायब है। `VITE_SUPABASE_URL` और पब्लिशेबल की जोड़ें, फिर dev सर्वर रीस्टार्ट करें।",
    "auth.continueGoogle": "Google के साथ जारी रखें",
    "auth.or": "या",
    "auth.firstName": "पहला नाम",
    "auth.email": "ईमेल",
    "auth.password": "पासवर्ड",
    "auth.signIn": "साइन इन",
    "auth.createAccount": "खाता बनाएँ",
    "auth.checkEmail": "खाता पुष्टि के लिए अपना ईमेल देखें।",
    "auth.errFirstName": "पहला नाम आवश्यक है।",
    "auth.errEmailPassword": "ईमेल और पासवर्ड आवश्यक हैं।",
    "time.secondsAgo": "{count} सेकंड पहले",
    "time.minutesAgo": "{count} मिनट पहले",
    "day.morning": "सुबह",
    "day.afternoon": "दोपहर",
    "day.evening": "शाम",
    "day.night": "रात",
    "greeting.goodDaypart": "शुभ {dayPart}",
    "greeting.hey": "हाय",
    "greeting.welcomeBack": "वापसी पर स्वागत है",
    "greeting.niceToSeeYou": "आपसे मिलकर अच्छा लगा",
    "greeting.hello": "नमस्ते",
    "greeting.marketBrief": "मार्केट ब्रीफ़",
    "greeting.quickPulse": "तेज़ पल्स",
    "greeting.snapshot": "स्नैपशॉट",
    "greeting.todaysGlance": "आज का नज़र",
    "home.updated": "{ago} अपडेट",
    "home.marketNews": "मार्केट न्यूज़",
    "home.indexes": "इंडेक्स",
    "home.topGainers": "टॉप गेनर्स",
    "home.topLosers": "टॉप लूज़र्स",
    "home.trendingStocks": "ट्रेंडिंग स्टॉक्स",
    "home.marketBriefSection": "मार्केट ब्रीफ़",
    "chart.openCharts": "चार्ट्स में खोलें",
    "help.title": "सहायता मोड",
    "help.body": "हाइलाइट किए गए तत्वों पर होवर करें ताकि उनका मतलब समझें। बाहर निकलने के लिए सहायता पर फिर क्लिक करें।",
    "help.exit": "सहायता बंद करें",
    "help.search.title": "सर्च",
    "help.search.body": "टिकर या कंपनी नाम लिखें। Enter दबाएँ या Analyze पर क्लिक करें।",
    "help.analyze.title": "विश्लेषण",
    "help.analyze.body": "डेटा अपडेट करके सिग्नल और चार्ट रीफ्रेश करता है।",
    "help.tools.title": "टूल्स",
    "help.tools.body": "वॉचलिस्ट और अलर्ट्स मैनेज करें।",
    "help.account.title": "अकाउंट",
    "help.account.body": "सेटिंग्स, भाषा, अपग्रेड और लॉग आउट।",
    "help.priceChart.title": "प्राइस चार्ट",
    "help.priceChart.body": "पिछले 60 सेशन और इंडिकेटर्स दिखाता है। पीरियड/इंटरवल बदलें।",
    "help.nav.home.title": "होम",
    "help.nav.home.body": "मार्केट ओवरव्यू और लाइव स्नैपशॉट।",
    "help.nav.analysis.title": "विश्लेषण",
    "help.nav.analysis.body": "सिग्नल, वैल्यूएशन और रिस्क।",
    "help.nav.charts.title": "चार्ट",
    "help.nav.charts.body": "एडवांस्ड चार्ट और इंडिकेटर्स।",
    "help.nav.heatmap.title": "हीटमैप",
    "help.nav.heatmap.body": "सेक्टर/मार्केट मैप (Pro)।",
    "help.nav.comparison.title": "तुलना",
    "help.nav.comparison.body": "कई टिकर्स की तुलना (Pro)।",
    "help.tickerStrip.title": "लाइव टिकर स्ट्रिप",
    "help.tickerStrip.body": "मार्केट का स्क्रॉलिंग स्नैपशॉट। टिकर पर क्लिक करें।",
    "help.region.title": "रीजन फ़िल्टर",
    "help.region.body": "रीजन बदलकर न्यूज़ और चार्ट अपडेट करें।",
    "help.marketNews.title": "मार्केट न्यूज़",
    "help.marketNews.body": "चुने हुए रीजन की ताज़ा हेडलाइन्स।",
    "help.indexes.title": "इंडेक्स",
    "help.indexes.body": "मुख्य इंडेक्स के इंट्राडे चार्ट।",
    "help.movers.title": "मार्केट मूवर्स",
    "help.movers.body": "टॉप गेनर्स, लूज़र्स और ट्रेंडिंग।",
    "help.marketBrief.title": "मार्केट ब्रीफ़",
    "help.marketBrief.body": "क्रॉस-एसेट सारांश और रिस्क सिग्नल्स।",
    "help.changelog.title": "चेंजलॉग",
    "help.changelog.body": "नवीनतम रिलीज़ में क्या नया है।",
    "help.accountSync.title": "अकाउंट सिंक",
    "help.accountSync.body": "प्रेफरेंसेज़ और वॉचलिस्ट सिंक करने के लिए साइन इन करें।",
    "help.profile.title": "प्रोफाइल",
    "help.profile.body": "नाम अपडेट करें और साइन-इन मैनेज करें।",
    "help.accountWatchlist.title": "वॉचलिस्ट",
    "help.accountWatchlist.body": "सेव किए गए टिकर्स मैनेज करें।",
    "help.accountAlerts.title": "अलर्ट्स",
    "help.accountAlerts.body": "प्राइस अलर्ट सेट करें और मॉनिटर करें।",
    "help.accountRecent.title": "हाल की विश्लेषण",
    "help.accountRecent.body": "हाल के रन तक जल्दी पहुँच।",
    "help.accountPreferences.title": "प्रेफरेंसेज़",
    "help.accountPreferences.body": "डिफ़ॉल्ट पीरियड, इंटरवल और रीजन।",
    "help.chartsControls.title": "चार्ट कंट्रोल",
    "help.chartsControls.body": "इंडिकेटर्स टॉगल करें और स्टाइल बदलें।",
    "analysis.stockTab": "स्टॉक",
    "analysis.financialsTab": "फाइनेंशियल्स",
    "analysis.enterTicker": "शुरू करने के लिए टिकर दर्ज करें",
    "analysis.typeSymbol": "ऊपर प्रतीक लिखें और विश्लेषण करें",
    "analysis.verdict": "निर्णय",
    "analysis.confidence": "विश्वास",
    "analysis.score": "स्कोर",
    "analysis.priceTargets": "प्राइस टार्गेट्स",
    "analysis.target": "टार्गेट",
    "analysis.stopLoss": "स्टॉप लॉस",
    "analysis.riskReward": "रिस्क / रिवॉर्ड",
    "analysis.technicalSignals": "टेक्निकल सिग्नल्स",
    "analysis.riskProfile": "रिस्क प्रोफाइल",
    "analysis.riskLevel": "रिस्क लेवल",
    "analysis.volatility": "वोलैटिलिटी",
    "analysis.maxDrawdown": "मैक्स ड्रॉडाउन",
    "analysis.sharpe": "शार्प",
    "analysis.sortino": "सॉर्टिनो",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "स्टैटिस्टिकल सिग्नल्स",
    "analysis.zscore": "Z-स्कोर",
    "analysis.zscoreDesc": "20-पीरियड औसत से कीमत का विचलन",
    "analysis.momentum": "मोमेंटम",
    "analysis.momentumDesc": "5, 10, 20, 50 दिन औसत रिटर्न",
    "analysis.volume": "वॉल्यूम",
    "analysis.volumeDesc": "वर्तमान वॉल्यूम बनाम 20-पीरियड औसत",
    "analysis.composite": "कम्पोज़िट",
    "analysis.compositeDesc": "सभी सिग्नल्स का भारित संयोजन",
    "analysis.buy": "खरीदें",
    "analysis.sell": "बेचें",
    "analysis.current": "वर्तमान",
    "analysis.avg": "औसत",
    "analysis.confidenceLabel": "विश्वास",
    "analysis.direction": "दिशा",
    "analysis.valuationAnchor": "वैल्यूएशन एंकर",
    "analysis.priceChartTitle": "प्राइस — पिछले 60 सेशन",
    "analysis.valuationToolkit": "वैल्यूएशन टूलकिट",
    "analysis.valuationDesc": "DCF, डिविडेंड डिस्काउंट और मल्टिपल्स से आंतरिक मूल्य का अनुमान।",
    "analysis.fcfPerShare": "FCF / शेयर",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "डिविडेंड / शेयर",
    "analysis.growth5y": "ग्रोथ (5y %)",
    "analysis.discountWacc": "डिस्काउंट / WACC %",
    "analysis.terminalGrowth": "टर्मिनल ग्रोथ %",
    "analysis.targetPE": "टार्गेट P/E",
    "analysis.projectionYears": "प्रोजेक्शन वर्षों",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "डिविडेंड डिस्काउंट",
    "analysis.multiples": "मल्टिपल्स",
    "analysis.anchor": "एंकर",
    "analysis.upside": "अपसाइड",
    "analysis.usedAsContext": "टेक्निकल सिग्नल्स के साथ लंबे समय का संदर्भ।",
    "analysis.neutral": "न्यूट्रल",
    "charts.runAnalysisFirst": "पहले एक विश्लेषण चलाएँ",
    "charts.movingAvg": "मूविंग एवरेज",
    "charts.bollinger": "बोलिंजर",
    "charts.volume": "वॉल्यूम",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "स्टोचैस्टिक",
    "charts.chart": "चार्ट",
    "charts.period": "पीरियड",
    "charts.fullPeriod": "{ticker} — फुल पीरियड",
    "charts.volumeTitle": "वॉल्यूम",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "स्टोचैस्टिक",
    "charts.windowHint": "हॉरिज़ॉन्टल स्क्रॉल से पैन, वर्टिकल से विंडो बदलें। खींचकर मूव करें। विंडो: {count} / {total}",
    "account.syncLocal": "सिर्फ लोकल",
    "account.syncing": "सिंक हो रहा है…",
    "account.syncError": "सिंक त्रुटि",
    "account.synced": "सिंक्ड",
    "account.syncedAgo": "{ago} सिंक्ड",
    "account.syncTitle": "अकाउंट सिंक",
    "account.signedInAs": "{email} के रूप में साइन इन",
    "account.user": "यूज़र",
    "account.signInToSync": "डिवाइसों में सिंक के लिए साइन इन करें।",
    "account.profile": "प्रोफाइल",
    "account.firstName": "पहला नाम",
    "account.saved": "सेव हो गया",
    "account.enterFirstName": "पहला नाम दर्ज करें।",
    "account.signInToSave": "सेव करने के लिए साइन इन करें।",
    "account.overview": "ओवरव्यू",
    "account.preferences": "प्रेफरेंसेज़",
    "account.recentAnalyses": "हाल की विश्लेषण",
    "account.noAnalyses": "कोई विश्लेषण नहीं",
    "account.signal": "सिग्नल",
    "account.regime": "रेजिम",
    "account.risk": "रिस्क",
    "account.conf": "कॉन्फ",
    "account.view": "देखें",
    "account.defaultPeriod": "डिफ़ॉल्ट पीरियड",
    "account.defaultInterval": "डिफ़ॉल्ट इंटरवल",
    "account.homeRegion": "होम रीजन",
    "pro.heatmap.title": "हीटमैप प्रो है",
    "pro.heatmap.desc": "लाइव शार्प, वोलैटिलिटी और रिलेटिव परफॉर्मेंस के साथ S&P हीटमैप अनलॉक करें।",
    "pro.heatmap.f0": "समानांतर डेटा फेच",
    "pro.heatmap.f1": "ट्रीमैप विज़ुअलाइज़ेशन",
    "pro.heatmap.f2": "रिस्क और रेजीम ओवरले",
    "pro.comparison.title": "तुलना प्रो है",
    "pro.comparison.desc": "एक ही दृश्य में कई टिकर्स को संकेत, जोखिम और मूल्यांकन के अनुसार तुलना करें।",
    "pro.comparison.f0": "साइड-बाय-साइड सिग्नल स्कोर",
    "pro.comparison.f1": "शार्प और ड्रॉडाउन रैंकिंग",
    "pro.comparison.f2": "एक्सपोर्ट-रेडी टेबल व्यू",
    "common.live": "लाइव",
    "common.price": "कीमत",
    "time.justNow": "अभी",
    "time.hoursAgo": "{count} घंटे पहले",
    "time.daysAgo": "{count} दिन पहले",
    "analysis.valuationAnalysis": "वैल्यूएशन विश्लेषण",
    "analysis.stretchIndex": "स्ट्रेच इंडेक्स",
    "analysis.undervalued": "अंडरवैल्यूड",
    "analysis.overvalued": "ओवरवैल्यूड",
    "analysis.vsSma200": "SMA 200 के मुकाबले",
    "analysis.vsSma50": "SMA 50 के मुकाबले",
    "analysis.bollingerPercentB": "बोलिंजर %B",
    "analysis.range52w": "52-सप्ताह रेंज",
    "analysis.fromLow": "निचले स्तर से",
    "analysis.fairValueEst": "फेयर वैल्यू अनुमान",
    "analysis.marketRegime": "मार्केट रेजीम",
    "analysis.strength": "ताकत",
    "analysis.hurst": "हर्स्ट",
    "analysis.avoid": "बचें",
    "analysis.analystTargets": "विश्लेषक लक्ष्य",
    "analysis.past12Months": "पिछले 12 महीने",
    "analysis.target12Month": "12-महीने का लक्ष्य",
    "analysis.companyMetrics": "कंपनी मीट्रिक्स",
    "analysis.earningsPerShare": "प्रति शेयर आय",
    "analysis.epsUnavailable": "EPS श्रृंखला उपलब्ध नहीं.",
    "analysis.revenue": "राजस्व",
    "analysis.netProfitMargin": "शुद्ध लाभ मार्जिन",
    "analysis.currentRatio": "करंट रेशियो",
    "analysis.debtToEquity": "डेट/इक्विटी",
    "analysis.returnOnEquityTtm": "इक्विटी रिटर्न (TTM)",
    "analysis.financialsProTitle": "फाइनेंशियल्स Pro हैं",
    "analysis.financialsProDesc": "कंपनी वित्तीय डेटा, वैल्यूएशन टूल और मल्टी-पीरियड विश्लेषण अनलॉक करें।",
    "analysis.financialsProF0": "आय विवरण · कैश फ्लो · बैलेंस शीट",
    "analysis.financialsProF1": "DCF, DDM और मल्टिपल मॉडलिंग",
    "analysis.financialsProF2": "ऐतिहासिक मार्जिन और ग्रोथ ट्रेंड",
    "analysis.fundamentalSnapshot": "फंडामेंटल स्नैपशॉट",
    "analysis.marketCap": "मार्केट कैप",
    "analysis.netIncome": "शुद्ध आय",
    "analysis.freeCashFlow": "फ्री कैश फ्लो",
    "analysis.revenueGrowth": "राजस्व वृद्धि",
    "analysis.grossMargin": "ग्रॉस मार्जिन",
    "analysis.operatingMargin": "ऑपरेटिंग मार्जिन",
    "analysis.netMargin": "नेट मार्जिन",
    "analysis.balanceSheet": "बैलेंस शीट",
    "analysis.cash": "कैश",
    "analysis.debt": "कर्ज",
    "analysis.perShare": "प्रति शेयर",
    "analysis.keyRatios": "मुख्य अनुपात",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "वित्तीय अवलोकन",
    "analysis.revenueFcfMargin": "राजस्व + FCF मार्जिन",
    "analysis.fcfMargin": "FCF मार्जिन",
    "analysis.marginTrends": "मार्जिन ट्रेंड",
    "analysis.grossMarginShort": "ग्रॉस",
    "analysis.operatingMarginShort": "ऑपरेटिंग",
    "analysis.netMarginShort": "नेट",
    "analysis.marginRadar": "मार्जिन रडार",
    "analysis.cashVsDebt": "कैश बनाम कर्ज",
    "analysis.netCash": "नेट कैश",
    "analysis.netIncomeByPeriod": "अवधि अनुसार शुद्ध आय",
    "analysis.fundamentalDataAggregator": "फंडामेंटल डेटा एग्रीगेटर",
    "analysis.fundamentalDataDesc": "टिकर और वित्तीय अवधि के अनुसार राजस्व, आय, मार्जिन, कर्ज और कैश फ्लो एकत्र करता है। यह संस्करण डेमो के लिए मॉडल्ड डेटा उपयोग करता है.",
    "analysis.fiscalPeriod": "वित्तीय अवधि",
    "analysis.source": "स्रोत",
    "analysis.period": "अवधि",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Upper",
    "analysis.bbLower": "BB Lower",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "क्लोज़",
    "heatmap.marketHeatmaps": "मार्केट हीटमैप्स",
    "heatmap.subtitle": "इंडेक्स के अनुसार ट्रीमैप, आकार मार्केट कैप से, रंग 6-महीने के Sharpe से। सेक्टर अनुसार क्रमबद्ध।",
    "heatmap.panelMeta": "{count} स्टॉक्स · आकार: मार्केट कैप · रंग: Sharpe (6mo)",
    "heatmap.load": "हीटमैप लोड करें",
    "heatmap.fetches": "Yahoo Finance से {count} स्टॉक्स लाता है",
    "heatmap.fetching": "{count} स्टॉक्स लोड हो रहे हैं…",
    "heatmap.refresh": "रीफ्रेश",
    "heatmap.sector": "सेक्टर",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6 माह",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "चल रहा है…",
    "comparison.compare": "तुलना करें",
    "comparison.normalizedPerformance": "नॉर्मलाइज़्ड परफॉर्मेंस (6 माह)",
    "comparison.ticker": "टिकर",
    "comparison.price": "कीमत",
    "comparison.signal": "सिग्नल",
    "comparison.conf": "कॉन्फ़.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "वोल.",
    "comparison.maxDD": "Max DD",
    "comparison.momentum": "मोम.",
    "comparison.stretch": "स्ट्रेच",
    "comparison.sharpeComparison": "Sharpe तुलना",
    "comparison.volatilityComparison": "वोलैटिलिटी तुलना",
    "comparison.volatility": "वोलैटिलिटी",
    "comparison.failed": "विफल",
    "help.valuationAnalysis.title": "वैल्यूएशन विश्लेषण",
    "help.valuationAnalysis.body": "स्ट्रेच, SMA विचलन और फेयर वैल्यू संकेत दिखाता है।",
    "help.marketRegime.title": "मार्केट रेजीम",
    "help.marketRegime.body": "ट्रेंड, वोलैटिलिटी और रणनीति का सार।",
    "help.analystTargets.title": "विश्लेषक लक्ष्य",
    "help.analystTargets.body": "कंसेंसस लक्ष्य और पिछले 12 महीनों के बदलाव।",
    "help.companyMetrics.title": "कंपनी मीट्रिक्स",
    "help.companyMetrics.body": "समय के साथ प्रमुख ऑपरेटिंग/बैलेंस शीट अनुपात।",
    "help.fundamentalSnapshot.title": "फंडामेंटल स्नैपशॉट",
    "help.fundamentalSnapshot.body": "चुनी गई अवधि के प्रमुख फंडामेंटल।",
    "help.balanceSheet.title": "बैलेंस शीट",
    "help.balanceSheet.body": "लिक्विडिटी और लेवरेज स्थिति।",
    "help.perShare.title": "प्रति शेयर",
    "help.perShare.body": "प्रति शेयर आय, कैश फ्लो और डिविडेंड।",
    "help.keyRatios.title": "मुख्य अनुपात",
    "help.keyRatios.body": "लाभप्रदता और वैल्यूएशन अनुपात।",
    "help.financialsOverview.title": "वित्तीय अवलोकन",
    "help.financialsOverview.body": "मार्जिन, कैश बनाम कर्ज और आय का सार।",
    "help.fundamentalData.title": "फंडामेंटल डेटा",
    "help.fundamentalData.body": "वित्तीय अवधि अनुसार मॉडल्ड फंडामेंटल।",
    "help.comparisonInput.title": "तुलना इनपुट",
    "help.comparisonInput.body": "कॉमा से अलग किए हुए टिकर दर्ज करें।",
    "help.comparisonPerformance.title": "परफॉर्मेंस ओवरले",
    "help.comparisonPerformance.body": "6 महीनों के नॉर्मलाइज़्ड रिटर्न।",
    "help.comparisonTable.title": "तुलना तालिका",
    "help.comparisonTable.body": "सिग्नल, जोखिम और वैल्यूएशन की sortable तालिका।",
    "help.heatmapOverview.title": "मार्केट हीटमैप्स",
    "help.heatmapOverview.body": "सेक्टर ट्रीमैप, Sharpe रंग के साथ।",
    "help.valuationToolkit.title": "वैल्यूएशन टूलकिट",
    "help.valuationToolkit.body": "DCF/DDM मान्यताएँ समायोजित करें और एंकर तुलना करें।",
    "help.priceTargets.title": "प्राइस टार्गेट्स",
    "help.priceTargets.body": "बुल/बेस/स्टॉप स्तर और रिस्क/रिवॉर्ड.",
    "help.technicalSignals.title": "टेक्निकल सिग्नल्स",
    "help.technicalSignals.body": "मोमेंटम, ट्रेंड और इंडिकेटर आधारित सिग्नल्स.",
    "help.riskProfile.title": "रिस्क प्रोफाइल",
    "help.riskProfile.body": "वोलैटिलिटी, ड्रॉडाउन और रिस्क मेट्रिक्स.",
    "help.statSignals.title": "स्टैटिस्टिकल सिग्नल्स",
    "help.statSignals.body": "Z-स्कोर, मोमेंटम और कम्पोज़िट आँकड़े.",
    "footer.disclaimer": "केवल शैक्षिक उद्देश्यों के लिए — यह वित्तीय सलाह नहीं है",
  },
  "id-ID": {
    "tagline.quant": "Analisis kuantitatif",
    "search.placeholder": "Cari saham...",
    "search.running": "Memproses…",
    "search.analyze": "Analisis",
    "nav.home": "Beranda",
    "nav.analysis": "Analisis",
    "nav.charts": "Grafik",
    "nav.heatmap": "Peta panas",
    "nav.comparison": "Perbandingan",
    "nav.account": "Akun",
    "nav.help": "Bantuan",
    "nav.tools": "Alat",
    "common.line": "Garis",
    "common.candles": "Candlestick",
    "common.expand": "Perbesar",
    "common.close": "Tutup",
    "common.save": "Simpan",
    "common.signIn": "Masuk",
    "common.signOut": "Keluar",
    "common.zoomIn": "Zoom In",
    "common.zoomOut": "Zoom Out",
    "common.reset": "Setel Ulang",
    "menu.settings": "Pengaturan",
    "menu.language": "Bahasa",
    "menu.upgrade": "Upgrade ke Pro",
    "menu.gift": "Hadiahkan AnalyzeAlpha",
    "menu.logout": "Keluar",
    "menu.signedOut": "Belum masuk",
    "tools.watchlist": "Daftar pantau",
    "tools.alerts": "Peringatan",
    "tools.ticker": "Ticker",
    "tools.add": "Tambah",
    "tools.emptyWatchlist": "Daftar pantau kosong",
    "tools.noAlerts": "Tidak ada peringatan",
    "tools.above": "Di atas",
    "tools.below": "Di bawah",
    "tools.set": "Setel",
    "tools.triggered": "TERPICU",
    "tools.watching": "MEMANTAU",
    "auth.missingConfig": "Konfigurasi Supabase tidak ada. Tambahkan `VITE_SUPABASE_URL` dan publishable key, lalu restart server dev.",
    "auth.continueGoogle": "Lanjutkan dengan Google",
    "auth.or": "atau",
    "auth.firstName": "Nama depan",
    "auth.email": "Email",
    "auth.password": "Kata sandi",
    "auth.signIn": "Masuk",
    "auth.createAccount": "Buat akun",
    "auth.checkEmail": "Periksa email Anda untuk mengonfirmasi akun.",
    "auth.errFirstName": "Nama depan wajib diisi.",
    "auth.errEmailPassword": "Email dan kata sandi wajib diisi.",
    "time.secondsAgo": "{count} dtk lalu",
    "time.minutesAgo": "{count} mnt lalu",
    "day.morning": "pagi",
    "day.afternoon": "siang",
    "day.evening": "sore",
    "day.night": "malam",
    "greeting.goodDaypart": "Selamat {dayPart}",
    "greeting.hey": "Hai",
    "greeting.welcomeBack": "Selamat datang kembali",
    "greeting.niceToSeeYou": "Senang bertemu Anda",
    "greeting.hello": "Halo",
    "greeting.marketBrief": "Ringkasan pasar",
    "greeting.quickPulse": "Pulsa cepat",
    "greeting.snapshot": "Cuplikan",
    "greeting.todaysGlance": "Sekilas hari ini",
    "home.updated": "Diperbarui {ago}",
    "home.marketNews": "Berita pasar",
    "home.indexes": "Indeks",
    "home.topGainers": "Top gainers",
    "home.topLosers": "Top losers",
    "home.trendingStocks": "Saham trending",
    "home.marketBriefSection": "Ringkasan pasar",
    "chart.openCharts": "Buka di Grafik",
    "help.title": "Mode Bantuan",
    "help.body": "Arahkan kursor ke elemen yang disorot untuk melihat fungsinya. Klik Bantuan lagi untuk keluar.",
    "help.exit": "Keluar Bantuan",
    "help.search.title": "Pencarian",
    "help.search.body": "Ketik ticker atau nama perusahaan. Tekan Enter atau klik Analisis.",
    "help.analyze.title": "Analisis",
    "help.analyze.body": "Memperbarui rekomendasi, sinyal, dan grafik.",
    "help.tools.title": "Alat",
    "help.tools.body": "Kelola daftar pantau dan peringatan.",
    "help.account.title": "Akun",
    "help.account.body": "Pengaturan, bahasa, upgrade, dan keluar.",
    "help.priceChart.title": "Grafik harga",
    "help.priceChart.body": "Menampilkan 60 sesi terakhir dengan indikator.",
    "help.nav.home.title": "Beranda",
    "help.nav.home.body": "Ringkasan pasar dan snapshot langsung.",
    "help.nav.analysis.title": "Analisis",
    "help.nav.analysis.body": "Sinyal, valuasi, dan risiko.",
    "help.nav.charts.title": "Grafik",
    "help.nav.charts.body": "Grafik lanjutan dan indikator.",
    "help.nav.heatmap.title": "Peta panas",
    "help.nav.heatmap.body": "Peta sektor/pasar (Pro).",
    "help.nav.comparison.title": "Perbandingan",
    "help.nav.comparison.body": "Bandingkan beberapa ticker (Pro).",
    "help.tickerStrip.title": "Ticker berjalan",
    "help.tickerStrip.body": "Snapshot pasar yang bergulir. Klik untuk analisis.",
    "help.region.title": "Filter region",
    "help.region.body": "Ganti region untuk memperbarui berita dan grafik.",
    "help.marketNews.title": "Berita pasar",
    "help.marketNews.body": "Headline terbaru untuk region terpilih.",
    "help.indexes.title": "Indeks",
    "help.indexes.body": "Grafik intraday indeks utama.",
    "help.movers.title": "Pergerakan pasar",
    "help.movers.body": "Top gainers, losers, dan trending.",
    "help.marketBrief.title": "Ringkasan pasar",
    "help.marketBrief.body": "Ringkasan lintas aset dan sinyal risiko.",
    "help.changelog.title": "Changelog",
    "help.changelog.body": "Apa yang baru di rilis terbaru.",
    "help.accountSync.title": "Sinkronisasi akun",
    "help.accountSync.body": "Masuk untuk menyinkronkan preferensi dan daftar pantau.",
    "help.profile.title": "Profil",
    "help.profile.body": "Perbarui nama tampilan dan kelola masuk.",
    "help.accountWatchlist.title": "Daftar pantau",
    "help.accountWatchlist.body": "Kelola ticker yang disimpan.",
    "help.accountAlerts.title": "Peringatan",
    "help.accountAlerts.body": "Atur peringatan harga dan pantau.",
    "help.accountRecent.title": "Analisis terbaru",
    "help.accountRecent.body": "Akses cepat ke analisis terakhir.",
    "help.accountPreferences.title": "Preferensi",
    "help.accountPreferences.body": "Periode, interval, dan region default.",
    "help.chartsControls.title": "Kontrol grafik",
    "help.chartsControls.body": "Toggle indikator dan ganti gaya.",
    "analysis.stockTab": "Saham",
    "analysis.financialsTab": "Keuangan",
    "analysis.enterTicker": "Masukkan ticker untuk memulai",
    "analysis.typeSymbol": "Ketik simbol di atas dan klik Analisis",
    "analysis.verdict": "Verdict",
    "analysis.confidence": "Kepercayaan",
    "analysis.score": "Skor",
    "analysis.priceTargets": "Target harga",
    "analysis.target": "Target",
    "analysis.stopLoss": "Stop loss",
    "analysis.riskReward": "Risiko / Imbal hasil",
    "analysis.technicalSignals": "Sinyal teknikal",
    "analysis.riskProfile": "Profil risiko",
    "analysis.riskLevel": "Tingkat risiko",
    "analysis.volatility": "Volatilitas",
    "analysis.maxDrawdown": "Drawdown maks",
    "analysis.sharpe": "Sharpe",
    "analysis.sortino": "Sortino",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "Sinyal statistik",
    "analysis.zscore": "Z-Score",
    "analysis.zscoreDesc": "Deviasi harga dari rata-rata 20 periode",
    "analysis.momentum": "Momentum",
    "analysis.momentumDesc": "Rata-rata return 5, 10, 20, 50 hari",
    "analysis.volume": "Volume",
    "analysis.volumeDesc": "Volume saat ini vs rata-rata 20 periode",
    "analysis.composite": "Komposit",
    "analysis.compositeDesc": "Kombinasi berbobot semua sinyal",
    "analysis.buy": "Beli",
    "analysis.sell": "Jual",
    "analysis.current": "Saat ini",
    "analysis.avg": "Rata-rata",
    "analysis.confidenceLabel": "Kepercayaan",
    "analysis.direction": "Arah",
    "analysis.valuationAnchor": "Anchor valuasi",
    "analysis.priceChartTitle": "Harga — 60 sesi terakhir",
    "analysis.valuationToolkit": "Toolkit valuasi",
    "analysis.valuationDesc": "Estimasi nilai intrinsik via DCF, diskon dividen, dan multiple.",
    "analysis.fcfPerShare": "FCF / Saham",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "Dividen / Saham",
    "analysis.growth5y": "Pertumbuhan (5 thn %)",
    "analysis.discountWacc": "Diskonto / WACC %",
    "analysis.terminalGrowth": "Pertumbuhan terminal %",
    "analysis.targetPE": "Target P/E",
    "analysis.projectionYears": "Tahun proyeksi",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "Diskon dividen",
    "analysis.multiples": "Multipel",
    "analysis.anchor": "Anchor",
    "analysis.upside": "Potensi naik",
    "analysis.usedAsContext": "Sebagai konteks jangka panjang bersama sinyal teknikal.",
    "analysis.neutral": "NETRAL",
    "charts.runAnalysisFirst": "Jalankan analisis terlebih dahulu",
    "charts.movingAvg": "Moving Avg",
    "charts.bollinger": "Bollinger",
    "charts.volume": "Volume",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "Stochastic",
    "charts.chart": "Grafik",
    "charts.period": "Periode",
    "charts.fullPeriod": "{ticker} — Periode penuh",
    "charts.volumeTitle": "Volume",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "Stochastic",
    "charts.windowHint": "Scroll horizontal untuk geser, vertikal untuk ubah jendela. Seret untuk pindah. Jendela: {count} / {total}",
    "account.syncLocal": "Lokal saja",
    "account.syncing": "Menyinkronkan…",
    "account.syncError": "Kesalahan sync",
    "account.synced": "Tersinkron",
    "account.syncedAgo": "Tersinkron {ago}",
    "account.syncTitle": "Sinkronisasi akun",
    "account.signedInAs": "Masuk sebagai {email}",
    "account.user": "pengguna",
    "account.signInToSync": "Masuk untuk menyinkronkan data akun.",
    "account.profile": "Profil",
    "account.firstName": "Nama depan",
    "account.saved": "Tersimpan",
    "account.enterFirstName": "Masukkan nama depan.",
    "account.signInToSave": "Masuk untuk menyimpan.",
    "account.overview": "Ringkasan",
    "account.preferences": "Preferensi",
    "account.recentAnalyses": "Analisis terbaru",
    "account.noAnalyses": "Belum ada analisis",
    "account.signal": "Sinyal",
    "account.regime": "Rezim",
    "account.risk": "Risiko",
    "account.conf": "Konf",
    "account.view": "Lihat",
    "account.defaultPeriod": "Periode default",
    "account.defaultInterval": "Interval default",
    "account.homeRegion": "Region utama",
    "pro.heatmap.title": "Peta panas adalah Pro",
    "pro.heatmap.desc": "Buka peta panas S&P dengan Sharpe, volatilitas, dan kinerja relatif secara langsung.",
    "pro.heatmap.f0": "Pengambilan data paralel",
    "pro.heatmap.f1": "Visualisasi treemap",
    "pro.heatmap.f2": "Overlay risiko dan rezim",
    "pro.comparison.title": "Perbandingan adalah Pro",
    "pro.comparison.desc": "Bandingkan beberapa ticker berdasarkan sinyal, risiko, dan valuasi dalam satu tampilan.",
    "pro.comparison.f0": "Skor sinyal berdampingan",
    "pro.comparison.f1": "Peringkat Sharpe dan drawdown",
    "pro.comparison.f2": "Tampilan tabel siap ekspor",
    "common.live": "LIVE",
    "common.price": "Harga",
    "time.justNow": "baru saja",
    "time.hoursAgo": "{count} jam lalu",
    "time.daysAgo": "{count} hari lalu",
    "analysis.valuationAnalysis": "Analisis Valuasi",
    "analysis.stretchIndex": "Indeks Stretch",
    "analysis.undervalued": "Undervalued",
    "analysis.overvalued": "Overvalued",
    "analysis.vsSma200": "vs SMA 200",
    "analysis.vsSma50": "vs SMA 50",
    "analysis.bollingerPercentB": "Bollinger %B",
    "analysis.range52w": "Rentang 52M",
    "analysis.fromLow": "dari low",
    "analysis.fairValueEst": "Estimasi Nilai Wajar",
    "analysis.marketRegime": "Regime Pasar",
    "analysis.strength": "Kekuatan",
    "analysis.hurst": "Hurst",
    "analysis.avoid": "Hindari",
    "analysis.analystTargets": "Target Analis",
    "analysis.past12Months": "12 bulan terakhir",
    "analysis.target12Month": "Target 12 bulan",
    "analysis.companyMetrics": "Metrik Perusahaan",
    "analysis.earningsPerShare": "Laba per Saham",
    "analysis.epsUnavailable": "Seri EPS tidak tersedia.",
    "analysis.revenue": "Pendapatan",
    "analysis.netProfitMargin": "Margin Laba Bersih",
    "analysis.currentRatio": "Rasio Lancar",
    "analysis.debtToEquity": "Utang / Ekuitas",
    "analysis.returnOnEquityTtm": "ROE (TTM)",
    "analysis.financialsProTitle": "Financials adalah Pro",
    "analysis.financialsProDesc": "Buka finansial perusahaan, alat valuasi, dan analisis multi‑periode.",
    "analysis.financialsProF0": "Laporan laba rugi · Arus kas · Neraca",
    "analysis.financialsProF1": "Model DCF, DDM, dan multiple",
    "analysis.financialsProF2": "Tren margin dan pertumbuhan historis",
    "analysis.fundamentalSnapshot": "Snapshot Fundamental",
    "analysis.marketCap": "Kapitalisasi Pasar",
    "analysis.netIncome": "Laba Bersih",
    "analysis.freeCashFlow": "Arus Kas Bebas",
    "analysis.revenueGrowth": "Pertumbuhan Pendapatan",
    "analysis.grossMargin": "Margin Kotor",
    "analysis.operatingMargin": "Margin Operasional",
    "analysis.netMargin": "Margin Bersih",
    "analysis.balanceSheet": "Neraca",
    "analysis.cash": "Kas",
    "analysis.debt": "Utang",
    "analysis.perShare": "Per Saham",
    "analysis.keyRatios": "Rasio Kunci",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "Ringkasan Finansial",
    "analysis.revenueFcfMargin": "Pendapatan + Margin FCF",
    "analysis.fcfMargin": "Margin FCF",
    "analysis.marginTrends": "Tren Margin",
    "analysis.grossMarginShort": "Kotor",
    "analysis.operatingMarginShort": "Operasional",
    "analysis.netMarginShort": "Bersih",
    "analysis.marginRadar": "Radar Margin",
    "analysis.cashVsDebt": "Kas vs Utang",
    "analysis.netCash": "Kas Bersih",
    "analysis.netIncomeByPeriod": "Laba Bersih per Periode",
    "analysis.fundamentalDataAggregator": "Aggregator Data Fundamental",
    "analysis.fundamentalDataDesc": "Mengumpulkan pendapatan, laba, margin, utang, dan arus kas per ticker dan periode fiskal. Dirancang untuk API/SEC — versi ini memakai data model.",
    "analysis.fiscalPeriod": "Periode Fiskal",
    "analysis.source": "Sumber",
    "analysis.period": "Periode",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Upper",
    "analysis.bbLower": "BB Lower",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "Penutupan",
    "heatmap.marketHeatmaps": "Heatmap Pasar",
    "heatmap.subtitle": "Treemap per indeks, ukuran berdasarkan market cap, warna berdasarkan Sharpe 6 bulan. Saham diurut per sektor.",
    "heatmap.panelMeta": "{count} saham · Ukuran: market cap · Warna: Sharpe (6mo)",
    "heatmap.load": "Muat Heatmap",
    "heatmap.fetches": "Mengambil {count} saham dari Yahoo Finance",
    "heatmap.fetching": "Mengambil {count} saham…",
    "heatmap.refresh": "Segarkan",
    "heatmap.sector": "Sektor",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6 bln",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "Memproses…",
    "comparison.compare": "Bandingkan",
    "comparison.normalizedPerformance": "Performa Ternormalisasi (6 bulan)",
    "comparison.ticker": "Ticker",
    "comparison.price": "Harga",
    "comparison.signal": "Sinyal",
    "comparison.conf": "Konf.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "Vol.",
    "comparison.maxDD": "Max DD",
    "comparison.momentum": "Mom.",
    "comparison.stretch": "Stretch",
    "comparison.sharpeComparison": "Perbandingan Sharpe",
    "comparison.volatilityComparison": "Perbandingan Volatilitas",
    "comparison.volatility": "Volatilitas",
    "comparison.failed": "gagal",
    "help.valuationAnalysis.title": "Analisis Valuasi",
    "help.valuationAnalysis.body": "Mengukur stretch, deviasi SMA, dan sinyal nilai wajar.",
    "help.marketRegime.title": "Regime Pasar",
    "help.marketRegime.body": "Ringkasan tren, volatilitas, dan posisi taktis.",
    "help.analystTargets.title": "Target Analis",
    "help.analystTargets.body": "Konsensus target dan revisi 12 bulan terakhir.",
    "help.companyMetrics.title": "Metrik Perusahaan",
    "help.companyMetrics.body": "Rasio operasi dan neraca utama dari waktu ke waktu.",
    "help.fundamentalSnapshot.title": "Snapshot Fundamental",
    "help.fundamentalSnapshot.body": "Fundamental utama untuk periode terpilih.",
    "help.balanceSheet.title": "Neraca",
    "help.balanceSheet.body": "Likuiditas dan leverage.",
    "help.perShare.title": "Per Saham",
    "help.perShare.body": "EPS, arus kas, dan dividen per saham.",
    "help.keyRatios.title": "Rasio Kunci",
    "help.keyRatios.body": "Rasio profitabilitas dan valuasi.",
    "help.financialsOverview.title": "Ringkasan Finansial",
    "help.financialsOverview.body": "Ringkasan visual margin, kas vs utang, dan laba.",
    "help.fundamentalData.title": "Data Fundamental",
    "help.fundamentalData.body": "Fundamental model per periode fiskal.",
    "help.comparisonInput.title": "Input Perbandingan",
    "help.comparisonInput.body": "Masukkan ticker dipisahkan koma.",
    "help.comparisonPerformance.title": "Overlay Performa",
    "help.comparisonPerformance.body": "Imbal hasil ternormalisasi 6 bulan.",
    "help.comparisonTable.title": "Tabel Perbandingan",
    "help.comparisonTable.body": "Tabel sortir untuk sinyal, risiko, dan valuasi.",
    "help.heatmapOverview.title": "Heatmap Pasar",
    "help.heatmapOverview.body": "Treemap per sektor dengan warna Sharpe.",
    "help.valuationToolkit.title": "Toolkit Valuasi",
    "help.valuationToolkit.body": "Atur asumsi DCF/DDM dan bandingkan anchor.",
    "help.priceTargets.title": "Target Harga",
    "help.priceTargets.body": "Level bull/base/stop serta risiko/imbal hasil.",
    "help.technicalSignals.title": "Sinyal Teknis",
    "help.technicalSignals.body": "Sinyal berbasis momentum, tren, dan indikator.",
    "help.riskProfile.title": "Profil Risiko",
    "help.riskProfile.body": "Volatilitas, drawdown, dan metrik risiko.",
    "help.statSignals.title": "Sinyal Statistik",
    "help.statSignals.body": "Z-score, momentum, dan statistik komposit.",
    "footer.disclaimer": "Hanya untuk tujuan edukasi — bukan nasihat keuangan",
  },
  "it-IT": {
    "tagline.quant": "Analisi quantitativa",
    "search.placeholder": "Cerca titoli...",
    "search.running": "In esecuzione…",
    "search.analyze": "Analizza",
    "nav.home": "Home",
    "nav.analysis": "Analisi",
    "nav.charts": "Grafici",
    "nav.heatmap": "Mappa termica",
    "nav.comparison": "Confronto",
    "nav.account": "Account",
    "nav.help": "Aiuto",
    "nav.tools": "Strumenti",
    "common.line": "Linea",
    "common.candles": "Candele",
    "common.expand": "Espandi",
    "common.close": "Chiudi",
    "common.save": "Salva",
    "common.signIn": "Accedi",
    "common.signOut": "Esci",
    "common.zoomIn": "Zoom avanti",
    "common.zoomOut": "Zoom indietro",
    "common.reset": "Reimposta",
    "menu.settings": "Impostazioni",
    "menu.language": "Lingua",
    "menu.upgrade": "Passa a Pro",
    "menu.gift": "Regala AnalyzeAlpha",
    "menu.logout": "Esci",
    "menu.signedOut": "Non connesso",
    "tools.watchlist": "Watchlist",
    "tools.alerts": "Avvisi",
    "tools.ticker": "Ticker",
    "tools.add": "Aggiungi",
    "tools.emptyWatchlist": "Watchlist vuota",
    "tools.noAlerts": "Nessun avviso",
    "tools.above": "Sopra",
    "tools.below": "Sotto",
    "tools.set": "Imposta",
    "tools.triggered": "ATTIVATO",
    "tools.watching": "IN OSSERVAZIONE",
    "auth.missingConfig": "Configurazione Supabase mancante. Aggiungi `VITE_SUPABASE_URL` e la chiave pubblicabile, poi riavvia il server dev.",
    "auth.continueGoogle": "Continua con Google",
    "auth.or": "oppure",
    "auth.firstName": "Nome",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.signIn": "Accedi",
    "auth.createAccount": "Crea account",
    "auth.checkEmail": "Controlla la tua email per confermare l'account.",
    "auth.errFirstName": "Nome richiesto.",
    "auth.errEmailPassword": "Email e password richieste.",
    "time.secondsAgo": "{count}s fa",
    "time.minutesAgo": "{count} min fa",
    "day.morning": "mattina",
    "day.afternoon": "pomeriggio",
    "day.evening": "sera",
    "day.night": "notte",
    "greeting.goodDaypart": "Buon {dayPart}",
    "greeting.hey": "Ciao",
    "greeting.welcomeBack": "Bentornato",
    "greeting.niceToSeeYou": "Piacere di vederti",
    "greeting.hello": "Salve",
    "greeting.marketBrief": "Brief di mercato",
    "greeting.quickPulse": "Pulse rapido",
    "greeting.snapshot": "Istantanea",
    "greeting.todaysGlance": "Sguardo di oggi",
    "home.updated": "Aggiornato {ago}",
    "home.marketNews": "Notizie di mercato",
    "home.indexes": "Indici",
    "home.topGainers": "Top rialzi",
    "home.topLosers": "Top ribassi",
    "home.trendingStocks": "Titoli di tendenza",
    "home.marketBriefSection": "Brief di mercato",
    "chart.openCharts": "Apri in Grafici",
    "help.title": "Modalità Aiuto",
    "help.body": "Passa il mouse sugli elementi evidenziati per vedere cosa fanno. Fai clic su Aiuto di nuovo per uscire.",
    "help.exit": "Esci da Aiuto",
    "help.search.title": "Ricerca",
    "help.search.body": "Digita un ticker o un'azienda. Premi Invio o clicca Analizza.",
    "help.analyze.title": "Analizza",
    "help.analyze.body": "Aggiorna raccomandazioni, segnali e grafici.",
    "help.tools.title": "Strumenti",
    "help.tools.body": "Gestisci watchlist e avvisi senza lasciare la pagina.",
    "help.account.title": "Account",
    "help.account.body": "Impostazioni, lingua, upgrade e uscita.",
    "help.priceChart.title": "Grafico prezzi",
    "help.priceChart.body": "Mostra le ultime 60 sessioni con indicatori.",
    "help.nav.home.title": "Home",
    "help.nav.home.body": "Panoramica mercato e snapshot live.",
    "help.nav.analysis.title": "Analisi",
    "help.nav.analysis.body": "Segnali, valutazione e rischio.",
    "help.nav.charts.title": "Grafici",
    "help.nav.charts.body": "Grafici avanzati e indicatori.",
    "help.nav.heatmap.title": "Mappa termica",
    "help.nav.heatmap.body": "Mappa settore/mercato (Pro).",
    "help.nav.comparison.title": "Confronto",
    "help.nav.comparison.body": "Confronta più ticker (Pro).",
    "help.tickerStrip.title": "Ticker live",
    "help.tickerStrip.body": "Snapshot scorrevole dei mercati. Clicca un ticker.",
    "help.region.title": "Regioni",
    "help.region.body": "Cambia regione per aggiornare news e grafici.",
    "help.marketNews.title": "Notizie di mercato",
    "help.marketNews.body": "Titoli recenti per la regione selezionata.",
    "help.indexes.title": "Indici",
    "help.indexes.body": "Grafici intraday dei principali indici.",
    "help.movers.title": "Movimenti di mercato",
    "help.movers.body": "Top rialzi, ribassi e trend.",
    "help.marketBrief.title": "Brief di mercato",
    "help.marketBrief.body": "Sintesi cross-asset e segnali di rischio.",
    "help.changelog.title": "Changelog",
    "help.changelog.body": "Novità dell'ultima versione.",
    "help.accountSync.title": "Sync account",
    "help.accountSync.body": "Accedi per sincronizzare preferenze e watchlist.",
    "help.profile.title": "Profilo",
    "help.profile.body": "Aggiorna il nome e gestisci l'accesso.",
    "help.accountWatchlist.title": "Watchlist",
    "help.accountWatchlist.body": "Gestisci i ticker salvati.",
    "help.accountAlerts.title": "Avvisi",
    "help.accountAlerts.body": "Imposta avvisi di prezzo e monitora.",
    "help.accountRecent.title": "Analisi recenti",
    "help.accountRecent.body": "Accesso rapido alle ultime analisi.",
    "help.accountPreferences.title": "Preferenze",
    "help.accountPreferences.body": "Periodo, intervallo e regione predefiniti.",
    "help.chartsControls.title": "Controlli grafico",
    "help.chartsControls.body": "Attiva indicatori e cambia stile.",
    "analysis.stockTab": "Titolo",
    "analysis.financialsTab": "Finanziari",
    "analysis.enterTicker": "Inserisci un ticker per iniziare",
    "analysis.typeSymbol": "Digita un simbolo sopra e premi Analizza",
    "analysis.verdict": "Verdetto",
    "analysis.confidence": "Confidenza",
    "analysis.score": "Punteggio",
    "analysis.priceTargets": "Obiettivi di prezzo",
    "analysis.target": "Obiettivo",
    "analysis.stopLoss": "Stop loss",
    "analysis.riskReward": "Rischio / Rendimento",
    "analysis.technicalSignals": "Segnali tecnici",
    "analysis.riskProfile": "Profilo di rischio",
    "analysis.riskLevel": "Livello di rischio",
    "analysis.volatility": "Volatilità",
    "analysis.maxDrawdown": "Drawdown max",
    "analysis.sharpe": "Sharpe",
    "analysis.sortino": "Sortino",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "Segnali statistici",
    "analysis.zscore": "Z-score",
    "analysis.zscoreDesc": "Deviazione dal medio a 20 periodi",
    "analysis.momentum": "Momentum",
    "analysis.momentumDesc": "Rendimento medio su 5, 10, 20, 50 giorni",
    "analysis.volume": "Volume",
    "analysis.volumeDesc": "Volume attuale vs media 20 periodi",
    "analysis.composite": "Composito",
    "analysis.compositeDesc": "Combinazione ponderata di tutti i segnali",
    "analysis.buy": "Compra",
    "analysis.sell": "Vendi",
    "analysis.current": "Attuale",
    "analysis.avg": "Media",
    "analysis.confidenceLabel": "Confidenza",
    "analysis.direction": "Direzione",
    "analysis.valuationAnchor": "Ancora di valutazione",
    "analysis.priceChartTitle": "Prezzo — ultime 60 sessioni",
    "analysis.valuationToolkit": "Toolkit di valutazione",
    "analysis.valuationDesc": "Stima il valore intrinseco con DCF, dividend discount e multipli.",
    "analysis.fcfPerShare": "FCF / Azione",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "Dividendo / Azione",
    "analysis.growth5y": "Crescita (5 anni %)",
    "analysis.discountWacc": "Sconto / WACC %",
    "analysis.terminalGrowth": "Crescita terminale %",
    "analysis.targetPE": "P/E target",
    "analysis.projectionYears": "Anni di proiezione",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "Dividend Discount",
    "analysis.multiples": "Multipli",
    "analysis.anchor": "Ancora",
    "analysis.upside": "Potenziale",
    "analysis.usedAsContext": "Usato come contesto di lungo termine con segnali tecnici.",
    "analysis.neutral": "NEUTRALE",
    "charts.runAnalysisFirst": "Esegui prima un'analisi",
    "charts.movingAvg": "Media mobile",
    "charts.bollinger": "Bollinger",
    "charts.volume": "Volume",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "Stocastico",
    "charts.chart": "Grafico",
    "charts.period": "Periodo",
    "charts.fullPeriod": "{ticker} — Periodo completo",
    "charts.volumeTitle": "Volume",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "Stocastico",
    "charts.windowHint": "Scroll orizzontale per spostare, verticale per regolare. Trascina per muovere. Finestra: {count} / {total}",
    "account.syncLocal": "Solo locale",
    "account.syncing": "Sincronizzazione…",
    "account.syncError": "Errore sync",
    "account.synced": "Sincronizzato",
    "account.syncedAgo": "Sincronizzato {ago}",
    "account.syncTitle": "Sincronizzazione account",
    "account.signedInAs": "Accesso come {email}",
    "account.user": "utente",
    "account.signInToSync": "Accedi per sincronizzare i dati.",
    "account.profile": "Profilo",
    "account.firstName": "Nome",
    "account.saved": "Salvato",
    "account.enterFirstName": "Inserisci un nome.",
    "account.signInToSave": "Accedi per salvare.",
    "account.overview": "Panoramica",
    "account.preferences": "Preferenze",
    "account.recentAnalyses": "Analisi recenti",
    "account.noAnalyses": "Nessuna analisi",
    "account.signal": "Segnale",
    "account.regime": "Regime",
    "account.risk": "Rischio",
    "account.conf": "Conf",
    "account.view": "Vedi",
    "account.defaultPeriod": "Periodo predefinito",
    "account.defaultInterval": "Intervallo predefinito",
    "account.homeRegion": "Regione iniziale",
    "pro.heatmap.title": "La mappa termica è Pro",
    "pro.heatmap.desc": "Sblocca la mappa termica dell'S&P con Sharpe, volatilità e performance relativa in tempo reale.",
    "pro.heatmap.f0": "Recuperi dati paralleli",
    "pro.heatmap.f1": "Visualizzazione treemap",
    "pro.heatmap.f2": "Sovrapposizioni di rischio e regime",
    "pro.comparison.title": "Il confronto è Pro",
    "pro.comparison.desc": "Confronta più ticker per segnali, rischio e valutazione in un'unica vista.",
    "pro.comparison.f0": "Punteggi dei segnali affiancati",
    "pro.comparison.f1": "Classifiche Sharpe e drawdown",
    "pro.comparison.f2": "Vista tabella pronta per l'esportazione",
    "common.live": "LIVE",
    "common.price": "Prezzo",
    "time.justNow": "proprio ora",
    "time.hoursAgo": "{count} h fa",
    "time.daysAgo": "{count} g fa",
    "analysis.valuationAnalysis": "Analisi di valutazione",
    "analysis.stretchIndex": "Indice di stretch",
    "analysis.undervalued": "Sottovalutato",
    "analysis.overvalued": "Sopravvalutato",
    "analysis.vsSma200": "vs SMA 200",
    "analysis.vsSma50": "vs SMA 50",
    "analysis.bollingerPercentB": "Bollinger %B",
    "analysis.range52w": "Range 52 settimane",
    "analysis.fromLow": "dal minimo",
    "analysis.fairValueEst": "Stima valore equo",
    "analysis.marketRegime": "Regime di mercato",
    "analysis.strength": "Forza",
    "analysis.hurst": "Hurst",
    "analysis.avoid": "Evitare",
    "analysis.analystTargets": "Target degli analisti",
    "analysis.past12Months": "Ultimi 12 mesi",
    "analysis.target12Month": "Target a 12 mesi",
    "analysis.companyMetrics": "Metriche aziendali",
    "analysis.earningsPerShare": "Utile per azione",
    "analysis.epsUnavailable": "Serie EPS non disponibile.",
    "analysis.revenue": "Ricavi",
    "analysis.netProfitMargin": "Margine netto",
    "analysis.currentRatio": "Current ratio",
    "analysis.debtToEquity": "Debito / Equity",
    "analysis.returnOnEquityTtm": "ROE (TTM)",
    "analysis.financialsProTitle": "Financials sono Pro",
    "analysis.financialsProDesc": "Sblocca dati finanziari, strumenti di valutazione e analisi multi-periodo.",
    "analysis.financialsProF0": "Conto economico · Cash flow · Stato patrimoniale",
    "analysis.financialsProF1": "Modelli DCF, DDM e multipli",
    "analysis.financialsProF2": "Trend storici di margini e crescita",
    "analysis.fundamentalSnapshot": "Snapshot fondamentali",
    "analysis.marketCap": "Capitalizzazione",
    "analysis.netIncome": "Utile netto",
    "analysis.freeCashFlow": "Free cash flow",
    "analysis.revenueGrowth": "Crescita ricavi",
    "analysis.grossMargin": "Margine lordo",
    "analysis.operatingMargin": "Margine operativo",
    "analysis.netMargin": "Margine netto",
    "analysis.balanceSheet": "Stato patrimoniale",
    "analysis.cash": "Cassa",
    "analysis.debt": "Debito",
    "analysis.perShare": "Per azione",
    "analysis.keyRatios": "Rapporti chiave",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "Panoramica finanziaria",
    "analysis.revenueFcfMargin": "Ricavi + Margine FCF",
    "analysis.fcfMargin": "Margine FCF",
    "analysis.marginTrends": "Trend dei margini",
    "analysis.grossMarginShort": "Lordo",
    "analysis.operatingMarginShort": "Operativo",
    "analysis.netMarginShort": "Netto",
    "analysis.marginRadar": "Radar margini",
    "analysis.cashVsDebt": "Cassa vs debito",
    "analysis.netCash": "Cassa netta",
    "analysis.netIncomeByPeriod": "Utile netto per periodo",
    "analysis.fundamentalDataAggregator": "Aggregatore dati fondamentali",
    "analysis.fundamentalDataDesc": "Raccoglie ricavi, utili, margini, debito e cash flow per ticker e periodo fiscale. Progettato per API/SEC — qui dati modellati.",
    "analysis.fiscalPeriod": "Periodo fiscale",
    "analysis.source": "Fonte",
    "analysis.period": "Periodo",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Upper",
    "analysis.bbLower": "BB Lower",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "Chiusura",
    "heatmap.marketHeatmaps": "Heatmap di mercato",
    "heatmap.subtitle": "Treemap per indice, dimensione per market cap, colore per Sharpe a 6 mesi. Azioni ordinate per settore.",
    "heatmap.panelMeta": "{count} azioni · Dimensione: market cap · Colore: Sharpe (6 mesi)",
    "heatmap.load": "Carica heatmap",
    "heatmap.fetches": "Recupera {count} azioni da Yahoo Finance",
    "heatmap.fetching": "Recupero di {count} azioni…",
    "heatmap.refresh": "Aggiorna",
    "heatmap.sector": "Settore",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6 mesi",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "In esecuzione…",
    "comparison.compare": "Confronta",
    "comparison.normalizedPerformance": "Performance normalizzata (6 mesi)",
    "comparison.ticker": "Ticker",
    "comparison.price": "Prezzo",
    "comparison.signal": "Segnale",
    "comparison.conf": "Conf.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "Vol.",
    "comparison.maxDD": "Max DD",
    "comparison.momentum": "Mom.",
    "comparison.stretch": "Stretch",
    "comparison.sharpeComparison": "Confronto Sharpe",
    "comparison.volatilityComparison": "Confronto volatilità",
    "comparison.volatility": "Volatilità",
    "comparison.failed": "fallito",
    "help.valuationAnalysis.title": "Analisi di valutazione",
    "help.valuationAnalysis.body": "Misura stretch, deviazioni SMA e segnali di fair value.",
    "help.marketRegime.title": "Regime di mercato",
    "help.marketRegime.body": "Sintesi di trend, volatilità e postura tattica.",
    "help.analystTargets.title": "Target degli analisti",
    "help.analystTargets.body": "Target consenso e revisioni ultimi 12 mesi.",
    "help.companyMetrics.title": "Metriche aziendali",
    "help.companyMetrics.body": "Rapporti operativi e di bilancio nel tempo.",
    "help.fundamentalSnapshot.title": "Snapshot fondamentali",
    "help.fundamentalSnapshot.body": "Fondamentali principali per il periodo selezionato.",
    "help.balanceSheet.title": "Stato patrimoniale",
    "help.balanceSheet.body": "Liquidità e leva.",
    "help.perShare.title": "Per azione",
    "help.perShare.body": "EPS, cash flow e dividendi per azione.",
    "help.keyRatios.title": "Rapporti chiave",
    "help.keyRatios.body": "Rapporti di redditività e valutazione.",
    "help.financialsOverview.title": "Panoramica finanziaria",
    "help.financialsOverview.body": "Riepilogo visivo di margini, cassa vs debito e utili.",
    "help.fundamentalData.title": "Dati fondamentali",
    "help.fundamentalData.body": "Fondamentali modellati per periodo fiscale.",
    "help.comparisonInput.title": "Input confronto",
    "help.comparisonInput.body": "Inserisci ticker separati da virgole.",
    "help.comparisonPerformance.title": "Overlay performance",
    "help.comparisonPerformance.body": "Rendimenti normalizzati su 6 mesi.",
    "help.comparisonTable.title": "Tabella confronto",
    "help.comparisonTable.body": "Tabella ordinabile di segnali, rischio e valutazione.",
    "help.heatmapOverview.title": "Heatmap di mercato",
    "help.heatmapOverview.body": "Treemap per settore con colori Sharpe.",
    "help.valuationToolkit.title": "Toolkit di valutazione",
    "help.valuationToolkit.body": "Regola le assunzioni DCF/DDM e confronta gli anchor.",
    "help.priceTargets.title": "Obiettivi di prezzo",
    "help.priceTargets.body": "Livelli bull/base/stop e rischio/rendimento.",
    "help.technicalSignals.title": "Segnali tecnici",
    "help.technicalSignals.body": "Segnali di momentum, trend e indicatori.",
    "help.riskProfile.title": "Profilo di rischio",
    "help.riskProfile.body": "Volatilità, drawdown e metriche di rischio.",
    "help.statSignals.title": "Segnali statistici",
    "help.statSignals.body": "Z-score, momentum e statistiche composite.",
    "footer.disclaimer": "Solo a scopo educativo — non è consulenza finanziaria",
  },
  "ja-JP": {
    "tagline.quant": "定量分析",
    "search.placeholder": "株式を検索...",
    "search.running": "実行中…",
    "search.analyze": "分析する",
    "nav.home": "ホーム",
    "nav.analysis": "分析",
    "nav.charts": "チャート",
    "nav.heatmap": "ヒートマップ",
    "nav.comparison": "比較",
    "nav.account": "アカウント",
    "nav.help": "ヘルプ",
    "nav.tools": "ツール",
    "common.line": "ライン",
    "common.candles": "ローソク足",
    "common.expand": "拡大",
    "common.close": "閉じる",
    "common.save": "保存",
    "common.signIn": "サインイン",
    "common.signOut": "サインアウト",
    "common.zoomIn": "ズームイン",
    "common.zoomOut": "ズームアウト",
    "common.reset": "リセット",
    "menu.settings": "設定",
    "menu.language": "言語",
    "menu.upgrade": "Pro にアップグレード",
    "menu.gift": "AnalyzeAlpha を贈る",
    "menu.logout": "ログアウト",
    "menu.signedOut": "サインインしていません",
    "tools.watchlist": "ウォッチリスト",
    "tools.alerts": "アラート",
    "tools.ticker": "ティッカー",
    "tools.add": "追加",
    "tools.emptyWatchlist": "ウォッチリストは空です",
    "tools.noAlerts": "アラートなし",
    "tools.above": "以上",
    "tools.below": "以下",
    "tools.set": "設定",
    "tools.triggered": "トリガー",
    "tools.watching": "監視中",
    "auth.missingConfig": "Supabase 設定がありません。`VITE_SUPABASE_URL` と公開キーを追加して開発サーバーを再起動してください。",
    "auth.continueGoogle": "Google で続行",
    "auth.or": "または",
    "auth.firstName": "名",
    "auth.email": "メール",
    "auth.password": "パスワード",
    "auth.signIn": "サインイン",
    "auth.createAccount": "アカウント作成",
    "auth.checkEmail": "確認メールをチェックしてください。",
    "auth.errFirstName": "名は必須です。",
    "auth.errEmailPassword": "メールとパスワードが必要です。",
    "time.secondsAgo": "{count}秒前",
    "time.minutesAgo": "{count}分前",
    "day.morning": "朝",
    "day.afternoon": "午後",
    "day.evening": "夕方",
    "day.night": "夜",
    "greeting.goodDaypart": "良い{dayPart}",
    "greeting.hey": "やあ",
    "greeting.welcomeBack": "お帰りなさい",
    "greeting.niceToSeeYou": "お会いできて嬉しいです",
    "greeting.hello": "こんにちは",
    "greeting.marketBrief": "マーケット概要",
    "greeting.quickPulse": "クイックパルス",
    "greeting.snapshot": "スナップショット",
    "greeting.todaysGlance": "今日の概要",
    "home.updated": "{ago}に更新",
    "home.marketNews": "マーケットニュース",
    "home.indexes": "指数",
    "home.topGainers": "上昇銘柄",
    "home.topLosers": "下落銘柄",
    "home.trendingStocks": "注目銘柄",
    "home.marketBriefSection": "マーケット概要",
    "chart.openCharts": "チャートで開く",
    "help.title": "ヘルプモード",
    "help.body": "ハイライトされた要素にカーソルを合わせると説明が表示されます。終了するにはもう一度ヘルプをクリックします。",
    "help.exit": "ヘルプを終了",
    "help.search.title": "検索",
    "help.search.body": "ティッカーや企業名を入力。Enter または分析をクリック。",
    "help.analyze.title": "分析",
    "help.analyze.body": "推奨、シグナル、チャートを更新します。",
    "help.tools.title": "ツール",
    "help.tools.body": "ウォッチリストとアラートを管理します。",
    "help.account.title": "アカウント",
    "help.account.body": "設定、言語、アップグレード、ログアウト。",
    "help.priceChart.title": "価格チャート",
    "help.priceChart.body": "直近60セッションと指標を表示。",
    "help.nav.home.title": "ホーム",
    "help.nav.home.body": "市場概要とライブスナップショット。",
    "help.nav.analysis.title": "分析",
    "help.nav.analysis.body": "シグナル、評価、リスク。",
    "help.nav.charts.title": "チャート",
    "help.nav.charts.body": "高度なチャートと指標。",
    "help.nav.heatmap.title": "ヒートマップ",
    "help.nav.heatmap.body": "セクター/市場マップ（Pro）。",
    "help.nav.comparison.title": "比較",
    "help.nav.comparison.body": "複数ティッカーの比較（Pro）。",
    "help.tickerStrip.title": "ライブティッカー",
    "help.tickerStrip.body": "市場のスクロールスナップショット。クリックで分析。",
    "help.region.title": "地域",
    "help.region.body": "地域を切り替えてニュースとチャートを更新。",
    "help.marketNews.title": "マーケットニュース",
    "help.marketNews.body": "選択地域の最新ヘッドライン。",
    "help.indexes.title": "指数",
    "help.indexes.body": "主要指数のイントラデイチャート。",
    "help.movers.title": "マーケットムーバー",
    "help.movers.body": "上昇・下落・トレンド銘柄。",
    "help.marketBrief.title": "マーケット概要",
    "help.marketBrief.body": "クロスアセットの要約とリスクシグナル。",
    "help.changelog.title": "更新履歴",
    "help.changelog.body": "最新リリースの変更点。",
    "help.accountSync.title": "アカウント同期",
    "help.accountSync.body": "設定とウォッチリストを同期するためサインイン。",
    "help.profile.title": "プロフィール",
    "help.profile.body": "表示名の更新とサインイン管理。",
    "help.accountWatchlist.title": "ウォッチリスト",
    "help.accountWatchlist.body": "保存済みティッカーの管理。",
    "help.accountAlerts.title": "アラート",
    "help.accountAlerts.body": "価格アラートを設定・監視。",
    "help.accountRecent.title": "最近の分析",
    "help.accountRecent.body": "最近の分析へすばやくアクセス。",
    "help.accountPreferences.title": "設定",
    "help.accountPreferences.body": "デフォルトの期間・間隔・地域。",
    "help.chartsControls.title": "チャート操作",
    "help.chartsControls.body": "指標の切替とスタイル変更。",
    "analysis.stockTab": "株",
    "analysis.financialsTab": "財務",
    "analysis.enterTicker": "開始するにはティッカーを入力",
    "analysis.typeSymbol": "上の欄にシンボルを入力して分析",
    "analysis.verdict": "判定",
    "analysis.confidence": "信頼度",
    "analysis.score": "スコア",
    "analysis.priceTargets": "目標価格",
    "analysis.target": "目標",
    "analysis.stopLoss": "ストップロス",
    "analysis.riskReward": "リスク/リワード",
    "analysis.technicalSignals": "テクニカルシグナル",
    "analysis.riskProfile": "リスクプロファイル",
    "analysis.riskLevel": "リスクレベル",
    "analysis.volatility": "ボラティリティ",
    "analysis.maxDrawdown": "最大ドローダウン",
    "analysis.sharpe": "シャープ",
    "analysis.sortino": "ソルティノ",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "統計シグナル",
    "analysis.zscore": "Zスコア",
    "analysis.zscoreDesc": "20期間平均からの乖離",
    "analysis.momentum": "モメンタム",
    "analysis.momentumDesc": "5/10/20/50日平均リターン",
    "analysis.volume": "出来高",
    "analysis.volumeDesc": "現在の出来高 vs 20期間平均",
    "analysis.composite": "コンポジット",
    "analysis.compositeDesc": "全シグナルの加重合成",
    "analysis.buy": "買い",
    "analysis.sell": "売り",
    "analysis.current": "現在",
    "analysis.avg": "平均",
    "analysis.confidenceLabel": "信頼度",
    "analysis.direction": "方向",
    "analysis.valuationAnchor": "評価アンカー",
    "analysis.priceChartTitle": "価格 — 直近60セッション",
    "analysis.valuationToolkit": "バリュエーションツール",
    "analysis.valuationDesc": "DCF・配当割引・マルチプルで内在価値を推定。",
    "analysis.fcfPerShare": "FCF / 株",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "配当 / 株",
    "analysis.growth5y": "成長率 (5年%)",
    "analysis.discountWacc": "割引率 / WACC %",
    "analysis.terminalGrowth": "ターミナル成長率 %",
    "analysis.targetPE": "目標PER",
    "analysis.projectionYears": "予測年数",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "配当割引",
    "analysis.multiples": "マルチプル",
    "analysis.anchor": "アンカー",
    "analysis.upside": "上昇余地",
    "analysis.usedAsContext": "テクニカルシグナルと併せた長期文脈に使用。",
    "analysis.neutral": "中立",
    "charts.runAnalysisFirst": "先に分析を実行してください",
    "charts.movingAvg": "移動平均",
    "charts.bollinger": "ボリンジャー",
    "charts.volume": "出来高",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "ストキャスティクス",
    "charts.chart": "チャート",
    "charts.period": "期間",
    "charts.fullPeriod": "{ticker} — 全期間",
    "charts.volumeTitle": "出来高",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "ストキャスティクス",
    "charts.windowHint": "横スクロールで移動、縦で範囲調整。ドラッグで移動。範囲: {count} / {total}",
    "account.syncLocal": "ローカルのみ",
    "account.syncing": "同期中…",
    "account.syncError": "同期エラー",
    "account.synced": "同期済み",
    "account.syncedAgo": "{ago}に同期",
    "account.syncTitle": "アカウント同期",
    "account.signedInAs": "{email} でサインイン",
    "account.user": "ユーザー",
    "account.signInToSync": "デバイス間同期のためサインインしてください。",
    "account.profile": "プロフィール",
    "account.firstName": "名",
    "account.saved": "保存済み",
    "account.enterFirstName": "名を入力してください。",
    "account.signInToSave": "保存するにはサインイン。",
    "account.overview": "概要",
    "account.preferences": "設定",
    "account.recentAnalyses": "最近の分析",
    "account.noAnalyses": "分析はまだありません",
    "account.signal": "シグナル",
    "account.regime": "レジーム",
    "account.risk": "リスク",
    "account.conf": "信頼度",
    "account.view": "表示",
    "account.defaultPeriod": "既定の期間",
    "account.defaultInterval": "既定の間隔",
    "account.homeRegion": "ホーム地域",
    "pro.heatmap.title": "ヒートマップは Pro です",
    "pro.heatmap.desc": "ライブのシャープ、ボラティリティ、相対パフォーマンスで S&P ヒートマップを解放。",
    "pro.heatmap.f0": "並列データ取得",
    "pro.heatmap.f1": "ツリーマップ可視化",
    "pro.heatmap.f2": "リスクとレジームのオーバーレイ",
    "pro.comparison.title": "比較は Pro です",
    "pro.comparison.desc": "複数のティッカーをシグナル、リスク、バリュエーションで一括比較。",
    "pro.comparison.f0": "シグナルスコアの並列表示",
    "pro.comparison.f1": "シャープとドローダウンのランキング",
    "pro.comparison.f2": "エクスポート可能な表表示",
    "common.live": "ライブ",
    "common.price": "価格",
    "time.justNow": "たった今",
    "time.hoursAgo": "{count}時間前",
    "time.daysAgo": "{count}日前",
    "analysis.valuationAnalysis": "バリュエーション分析",
    "analysis.stretchIndex": "ストレッチ指数",
    "analysis.undervalued": "割安",
    "analysis.overvalued": "割高",
    "analysis.vsSma200": "SMA 200比",
    "analysis.vsSma50": "SMA 50比",
    "analysis.bollingerPercentB": "ボリンジャー %B",
    "analysis.range52w": "52週レンジ",
    "analysis.fromLow": "安値から",
    "analysis.fairValueEst": "適正価値推定",
    "analysis.marketRegime": "市場レジーム",
    "analysis.strength": "強さ",
    "analysis.hurst": "ハースト",
    "analysis.avoid": "避ける",
    "analysis.analystTargets": "アナリスト目標",
    "analysis.past12Months": "過去12か月",
    "analysis.target12Month": "12か月目標",
    "analysis.companyMetrics": "企業指標",
    "analysis.earningsPerShare": "1株利益",
    "analysis.epsUnavailable": "EPS系列は利用できません。",
    "analysis.revenue": "売上",
    "analysis.netProfitMargin": "純利益率",
    "analysis.currentRatio": "流動比率",
    "analysis.debtToEquity": "負債 / 資本",
    "analysis.returnOnEquityTtm": "ROE (TTM)",
    "analysis.financialsProTitle": "財務はPro",
    "analysis.financialsProDesc": "企業財務、バリュエーションツール、複数期間分析を解放。",
    "analysis.financialsProF0": "損益計算書 · キャッシュフロー · 貸借対照表",
    "analysis.financialsProF1": "DCF・DDM・マルチプルモデル",
    "analysis.financialsProF2": "過去のマージンと成長トレンド",
    "analysis.fundamentalSnapshot": "ファンダメンタル概要",
    "analysis.marketCap": "時価総額",
    "analysis.netIncome": "純利益",
    "analysis.freeCashFlow": "フリーキャッシュフロー",
    "analysis.revenueGrowth": "売上成長率",
    "analysis.grossMargin": "粗利益率",
    "analysis.operatingMargin": "営業利益率",
    "analysis.netMargin": "純利益率",
    "analysis.balanceSheet": "バランスシート",
    "analysis.cash": "現金",
    "analysis.debt": "負債",
    "analysis.perShare": "1株あたり",
    "analysis.keyRatios": "主要比率",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "財務概要",
    "analysis.revenueFcfMargin": "売上 + FCFマージン",
    "analysis.fcfMargin": "FCFマージン",
    "analysis.marginTrends": "マージントレンド",
    "analysis.grossMarginShort": "粗",
    "analysis.operatingMarginShort": "営業",
    "analysis.netMarginShort": "純",
    "analysis.marginRadar": "マージンレーダー",
    "analysis.cashVsDebt": "現金 vs 負債",
    "analysis.netCash": "ネットキャッシュ",
    "analysis.netIncomeByPeriod": "期間別純利益",
    "analysis.fundamentalDataAggregator": "ファンダメンタル集計",
    "analysis.fundamentalDataDesc": "ティッカーと会計期間ごとに売上・利益・マージン・負債・キャッシュフローを集計。API/SEC向け想定 — ここではモデルデータ。",
    "analysis.fiscalPeriod": "会計期間",
    "analysis.source": "ソース",
    "analysis.period": "期間",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB 上限",
    "analysis.bbLower": "BB 下限",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "終値",
    "heatmap.marketHeatmaps": "市場ヒートマップ",
    "heatmap.subtitle": "指数別トレマップ。サイズは時価総額、色は6か月Sharpe。セクター順に並べ替え。",
    "heatmap.panelMeta": "{count}銘柄 · サイズ: 時価総額 · 色: Sharpe (6か月)",
    "heatmap.load": "ヒートマップを読み込む",
    "heatmap.fetches": "Yahoo Financeから{count}銘柄を取得",
    "heatmap.fetching": "{count}銘柄を取得中…",
    "heatmap.refresh": "更新",
    "heatmap.sector": "セクター",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6か月",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "実行中…",
    "comparison.compare": "比較",
    "comparison.normalizedPerformance": "正規化パフォーマンス (6か月)",
    "comparison.ticker": "ティッカー",
    "comparison.price": "価格",
    "comparison.signal": "シグナル",
    "comparison.conf": "確度",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "ボラ",
    "comparison.maxDD": "最大DD",
    "comparison.momentum": "モメ",
    "comparison.stretch": "ストレッチ",
    "comparison.sharpeComparison": "Sharpe比較",
    "comparison.volatilityComparison": "ボラティリティ比較",
    "comparison.volatility": "ボラティリティ",
    "comparison.failed": "失敗",
    "help.valuationAnalysis.title": "バリュエーション分析",
    "help.valuationAnalysis.body": "ストレッチ、SMA乖離、適正価値シグナルを表示。",
    "help.marketRegime.title": "市場レジーム",
    "help.marketRegime.body": "トレンド、ボラ、戦術姿勢の概要。",
    "help.analystTargets.title": "アナリスト目標",
    "help.analystTargets.body": "コンセンサス目標と過去12か月の変更。",
    "help.companyMetrics.title": "企業指標",
    "help.companyMetrics.body": "主要オペレーション/バランス指標の推移。",
    "help.fundamentalSnapshot.title": "ファンダメンタル概要",
    "help.fundamentalSnapshot.body": "選択期間の主要ファンダメンタル。",
    "help.balanceSheet.title": "バランスシート",
    "help.balanceSheet.body": "流動性とレバレッジ。",
    "help.perShare.title": "1株あたり",
    "help.perShare.body": "EPS、キャッシュフロー、配当の1株あたり。",
    "help.keyRatios.title": "主要比率",
    "help.keyRatios.body": "収益性とバリュエーション比率。",
    "help.financialsOverview.title": "財務概要",
    "help.financialsOverview.body": "マージン、現金 vs 負債、利益の視覚要約。",
    "help.fundamentalData.title": "ファンダメンタルデータ",
    "help.fundamentalData.body": "会計期間別のモデルファンダメンタル。",
    "help.comparisonInput.title": "比較入力",
    "help.comparisonInput.body": "カンマ区切りでティッカーを入力。",
    "help.comparisonPerformance.title": "パフォーマンスオーバーレイ",
    "help.comparisonPerformance.body": "6か月の正規化リターン。",
    "help.comparisonTable.title": "比較テーブル",
    "help.comparisonTable.body": "シグナル・リスク・バリュエーションのソート可能表。",
    "help.heatmapOverview.title": "市場ヒートマップ",
    "help.heatmapOverview.body": "セクター別トレマップをSharpe色で表示。",
    "help.valuationToolkit.title": "バリュエーションツール",
    "help.valuationToolkit.body": "DCF/DDM前提を調整し、アンカーを比較。",
    "help.priceTargets.title": "価格目標",
    "help.priceTargets.body": "ブル/ベース/ストップ水準とリスク/リワード。",
    "help.technicalSignals.title": "テクニカルシグナル",
    "help.technicalSignals.body": "モメンタム、トレンド、指標ベースのシグナル。",
    "help.riskProfile.title": "リスクプロファイル",
    "help.riskProfile.body": "ボラティリティ、ドローダウン、リスク指標。",
    "help.statSignals.title": "統計シグナル",
    "help.statSignals.body": "Zスコア、モメンタム、複合統計。",
    "footer.disclaimer": "教育目的のみ — 金融助言ではありません",
  },
  "ko-KR": {
    "tagline.quant": "정량 분석",
    "search.placeholder": "종목 검색...",
    "search.running": "실행 중…",
    "search.analyze": "분석",
    "nav.home": "홈",
    "nav.analysis": "분석",
    "nav.charts": "차트",
    "nav.heatmap": "히트맵",
    "nav.comparison": "비교",
    "nav.account": "계정",
    "nav.help": "도움말",
    "nav.tools": "도구",
    "common.line": "라인",
    "common.candles": "캔들",
    "common.expand": "확장",
    "common.close": "닫기",
    "common.save": "저장",
    "common.signIn": "로그인",
    "common.signOut": "로그아웃",
    "common.zoomIn": "확대",
    "common.zoomOut": "축소",
    "common.reset": "재설정",
    "menu.settings": "설정",
    "menu.language": "언어",
    "menu.upgrade": "Pro로 업그레이드",
    "menu.gift": "AnalyzeAlpha 선물하기",
    "menu.logout": "로그아웃",
    "menu.signedOut": "로그인되지 않음",
    "tools.watchlist": "관심목록",
    "tools.alerts": "알림",
    "tools.ticker": "티커",
    "tools.add": "추가",
    "tools.emptyWatchlist": "관심목록이 비었습니다",
    "tools.noAlerts": "알림 없음",
    "tools.above": "이상",
    "tools.below": "이하",
    "tools.set": "설정",
    "tools.triggered": "트리거",
    "tools.watching": "모니터링",
    "auth.missingConfig": "Supabase 설정이 없습니다. `VITE_SUPABASE_URL`과 공개 키를 추가한 후 dev 서버를 재시작하세요.",
    "auth.continueGoogle": "Google로 계속",
    "auth.or": "또는",
    "auth.firstName": "이름",
    "auth.email": "이메일",
    "auth.password": "비밀번호",
    "auth.signIn": "로그인",
    "auth.createAccount": "계정 만들기",
    "auth.checkEmail": "계정 확인을 위해 이메일을 확인하세요.",
    "auth.errFirstName": "이름이 필요합니다.",
    "auth.errEmailPassword": "이메일과 비밀번호가 필요합니다.",
    "time.secondsAgo": "{count}초 전",
    "time.minutesAgo": "{count}분 전",
    "day.morning": "아침",
    "day.afternoon": "오후",
    "day.evening": "저녁",
    "day.night": "밤",
    "greeting.goodDaypart": "좋은 {dayPart}",
    "greeting.hey": "안녕",
    "greeting.welcomeBack": "다시 오신 것을 환영합니다",
    "greeting.niceToSeeYou": "반가워요",
    "greeting.hello": "안녕하세요",
    "greeting.marketBrief": "마켓 브리프",
    "greeting.quickPulse": "빠른 요약",
    "greeting.snapshot": "스냅샷",
    "greeting.todaysGlance": "오늘의 한눈",
    "home.updated": "{ago} 업데이트",
    "home.marketNews": "시장 뉴스",
    "home.indexes": "지수",
    "home.topGainers": "상승 상위",
    "home.topLosers": "하락 상위",
    "home.trendingStocks": "트렌딩 종목",
    "home.marketBriefSection": "마켓 브리프",
    "chart.openCharts": "차트에서 열기",
    "help.title": "도움말 모드",
    "help.body": "강조 표시된 요소에 마우스를 올리면 설명이 표시됩니다. 종료하려면 도움말을 다시 클릭하세요.",
    "help.exit": "도움말 종료",
    "help.search.title": "검색",
    "help.search.body": "티커나 기업명을 입력하고 Enter 또는 분석을 클릭하세요.",
    "help.analyze.title": "분석",
    "help.analyze.body": "추천, 신호, 차트를 업데이트합니다.",
    "help.tools.title": "도구",
    "help.tools.body": "관심목록과 알림을 관리합니다.",
    "help.account.title": "계정",
    "help.account.body": "설정, 언어, 업그레이드, 로그아웃.",
    "help.priceChart.title": "가격 차트",
    "help.priceChart.body": "최근 60 세션과 지표를 표시합니다.",
    "help.nav.home.title": "홈",
    "help.nav.home.body": "시장 개요와 라이브 스냅샷.",
    "help.nav.analysis.title": "분석",
    "help.nav.analysis.body": "신호, 밸류에이션, 리스크.",
    "help.nav.charts.title": "차트",
    "help.nav.charts.body": "고급 차트와 지표.",
    "help.nav.heatmap.title": "히트맵",
    "help.nav.heatmap.body": "섹터/시장 맵 (Pro).",
    "help.nav.comparison.title": "비교",
    "help.nav.comparison.body": "여러 티커 비교 (Pro).",
    "help.tickerStrip.title": "라이브 티커 스트립",
    "help.tickerStrip.body": "스크롤링 시장 스냅샷. 티커 클릭.",
    "help.region.title": "지역",
    "help.region.body": "지역을 바꿔 뉴스와 차트를 업데이트합니다.",
    "help.marketNews.title": "시장 뉴스",
    "help.marketNews.body": "선택한 지역의 최신 헤드라인.",
    "help.indexes.title": "지수",
    "help.indexes.body": "주요 지수의 인트라데이 차트.",
    "help.movers.title": "시장 움직임",
    "help.movers.body": "상승/하락 및 트렌딩 종목.",
    "help.marketBrief.title": "마켓 브리프",
    "help.marketBrief.body": "크로스자산 요약과 리스크 신호.",
    "help.changelog.title": "변경 기록",
    "help.changelog.body": "최신 버전의 변경 사항.",
    "help.accountSync.title": "계정 동기화",
    "help.accountSync.body": "설정과 관심목록 동기화를 위해 로그인하세요.",
    "help.profile.title": "프로필",
    "help.profile.body": "표시 이름 업데이트 및 로그인 관리.",
    "help.accountWatchlist.title": "관심목록",
    "help.accountWatchlist.body": "저장된 티커 관리.",
    "help.accountAlerts.title": "알림",
    "help.accountAlerts.body": "가격 알림 설정 및 모니터링.",
    "help.accountRecent.title": "최근 분석",
    "help.accountRecent.body": "최근 분석에 빠르게 접근.",
    "help.accountPreferences.title": "환경설정",
    "help.accountPreferences.body": "기본 기간, 간격, 지역.",
    "help.chartsControls.title": "차트 컨트롤",
    "help.chartsControls.body": "지표 토글 및 스타일 변경.",
    "analysis.stockTab": "종목",
    "analysis.financialsTab": "재무",
    "analysis.enterTicker": "시작하려면 티커를 입력하세요",
    "analysis.typeSymbol": "위에 심볼을 입력하고 분석을 누르세요",
    "analysis.verdict": "판정",
    "analysis.confidence": "신뢰도",
    "analysis.score": "점수",
    "analysis.priceTargets": "목표가",
    "analysis.target": "목표",
    "analysis.stopLoss": "손절가",
    "analysis.riskReward": "위험/보상",
    "analysis.technicalSignals": "기술적 신호",
    "analysis.riskProfile": "리스크 프로필",
    "analysis.riskLevel": "리스크 수준",
    "analysis.volatility": "변동성",
    "analysis.maxDrawdown": "최대 낙폭",
    "analysis.sharpe": "샤프",
    "analysis.sortino": "소르티노",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "통계적 신호",
    "analysis.zscore": "Z-점수",
    "analysis.zscoreDesc": "20기간 평균 대비 가격 편차",
    "analysis.momentum": "모멘텀",
    "analysis.momentumDesc": "5, 10, 20, 50일 평균 수익",
    "analysis.volume": "거래량",
    "analysis.volumeDesc": "현재 거래량 vs 20기간 평균",
    "analysis.composite": "종합",
    "analysis.compositeDesc": "모든 신호의 가중 결합",
    "analysis.buy": "매수",
    "analysis.sell": "매도",
    "analysis.current": "현재",
    "analysis.avg": "평균",
    "analysis.confidenceLabel": "신뢰도",
    "analysis.direction": "방향",
    "analysis.valuationAnchor": "밸류에이션 앵커",
    "analysis.priceChartTitle": "가격 — 최근 60 세션",
    "analysis.valuationToolkit": "밸류에이션 툴킷",
    "analysis.valuationDesc": "DCF, 배당 할인, 멀티플로 내재가치를 추정합니다.",
    "analysis.fcfPerShare": "FCF / 주",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "배당 / 주",
    "analysis.growth5y": "성장 (5년 %)",
    "analysis.discountWacc": "할인 / WACC %",
    "analysis.terminalGrowth": "터미널 성장 %",
    "analysis.targetPE": "목표 P/E",
    "analysis.projectionYears": "예측 연수",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "배당 할인",
    "analysis.multiples": "멀티플",
    "analysis.anchor": "앵커",
    "analysis.upside": "상승여력",
    "analysis.usedAsContext": "기술적 신호와 함께 장기적 컨텍스트로 사용됩니다.",
    "analysis.neutral": "중립",
    "charts.runAnalysisFirst": "먼저 분석을 실행하세요",
    "charts.movingAvg": "이동평균",
    "charts.bollinger": "볼린저",
    "charts.volume": "거래량",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "스토캐스틱",
    "charts.chart": "차트",
    "charts.period": "기간",
    "charts.fullPeriod": "{ticker} — 전체 기간",
    "charts.volumeTitle": "거래량",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "스토캐스틱",
    "charts.windowHint": "가로 스크롤로 이동, 세로로 범위 조절. 드래그로 이동. 창: {count} / {total}",
    "account.syncLocal": "로컬만",
    "account.syncing": "동기화 중…",
    "account.syncError": "동기화 오류",
    "account.synced": "동기화됨",
    "account.syncedAgo": "{ago} 동기화",
    "account.syncTitle": "계정 동기화",
    "account.signedInAs": "{email}로 로그인",
    "account.user": "사용자",
    "account.signInToSync": "기기 간 동기화를 위해 로그인하세요.",
    "account.profile": "프로필",
    "account.firstName": "이름",
    "account.saved": "저장됨",
    "account.enterFirstName": "이름을 입력하세요.",
    "account.signInToSave": "저장하려면 로그인하세요.",
    "account.overview": "개요",
    "account.preferences": "환경설정",
    "account.recentAnalyses": "최근 분석",
    "account.noAnalyses": "아직 분석 없음",
    "account.signal": "신호",
    "account.regime": "레짐",
    "account.risk": "리스크",
    "account.conf": "신뢰",
    "account.view": "보기",
    "account.defaultPeriod": "기본 기간",
    "account.defaultInterval": "기본 간격",
    "account.homeRegion": "홈 지역",
    "pro.heatmap.title": "히트맵은 Pro입니다",
    "pro.heatmap.desc": "실시간 샤프, 변동성, 상대 성과로 S&P 히트맵을 잠금 해제합니다.",
    "pro.heatmap.f0": "병렬 데이터 가져오기",
    "pro.heatmap.f1": "트리맵 시각화",
    "pro.heatmap.f2": "리스크 및 레짐 오버레이",
    "pro.comparison.title": "비교는 Pro입니다",
    "pro.comparison.desc": "여러 티커를 신호, 리스크, 가치평가로 한 화면에서 비교합니다.",
    "pro.comparison.f0": "나란한 신호 점수",
    "pro.comparison.f1": "샤프 및 드로다운 순위",
    "pro.comparison.f2": "내보내기용 테이블 보기",
    "common.live": "라이브",
    "common.price": "가격",
    "time.justNow": "방금",
    "time.hoursAgo": "{count}시간 전",
    "time.daysAgo": "{count}일 전",
    "analysis.valuationAnalysis": "밸류에이션 분석",
    "analysis.stretchIndex": "스트레치 지수",
    "analysis.undervalued": "저평가",
    "analysis.overvalued": "고평가",
    "analysis.vsSma200": "SMA 200 대비",
    "analysis.vsSma50": "SMA 50 대비",
    "analysis.bollingerPercentB": "볼린저 %B",
    "analysis.range52w": "52주 범위",
    "analysis.fromLow": "저점 대비",
    "analysis.fairValueEst": "적정가 추정",
    "analysis.marketRegime": "시장 레짐",
    "analysis.strength": "강도",
    "analysis.hurst": "허스트",
    "analysis.avoid": "피하기",
    "analysis.analystTargets": "애널리스트 목표",
    "analysis.past12Months": "지난 12개월",
    "analysis.target12Month": "12개월 목표",
    "analysis.companyMetrics": "기업 지표",
    "analysis.earningsPerShare": "주당순이익",
    "analysis.epsUnavailable": "EPS 시리즈 없음.",
    "analysis.revenue": "매출",
    "analysis.netProfitMargin": "순이익률",
    "analysis.currentRatio": "유동비율",
    "analysis.debtToEquity": "부채/자본",
    "analysis.returnOnEquityTtm": "자기자본이익률 (TTM)",
    "analysis.financialsProTitle": "재무는 Pro",
    "analysis.financialsProDesc": "기업 재무, 밸류에이션 도구, 다기간 분석을 잠금 해제합니다.",
    "analysis.financialsProF0": "손익계산서 · 현금흐름 · 대차대조표",
    "analysis.financialsProF1": "DCF, DDM, 멀티플 모델",
    "analysis.financialsProF2": "과거 마진 및 성장 추세",
    "analysis.fundamentalSnapshot": "펀더멘털 스냅샷",
    "analysis.marketCap": "시가총액",
    "analysis.netIncome": "순이익",
    "analysis.freeCashFlow": "잉여현금흐름",
    "analysis.revenueGrowth": "매출 성장",
    "analysis.grossMargin": "매출총이익률",
    "analysis.operatingMargin": "영업이익률",
    "analysis.netMargin": "순이익률",
    "analysis.balanceSheet": "대차대조표",
    "analysis.cash": "현금",
    "analysis.debt": "부채",
    "analysis.perShare": "주당",
    "analysis.keyRatios": "핵심 비율",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "재무 개요",
    "analysis.revenueFcfMargin": "매출 + FCF 마진",
    "analysis.fcfMargin": "FCF 마진",
    "analysis.marginTrends": "마진 추세",
    "analysis.grossMarginShort": "총",
    "analysis.operatingMarginShort": "영업",
    "analysis.netMarginShort": "순",
    "analysis.marginRadar": "마진 레이더",
    "analysis.cashVsDebt": "현금 vs 부채",
    "analysis.netCash": "순현금",
    "analysis.netIncomeByPeriod": "기간별 순이익",
    "analysis.fundamentalDataAggregator": "펀더멘털 데이터 집계",
    "analysis.fundamentalDataDesc": "티커와 회계기간별 매출, 이익, 마진, 부채, 현금흐름을 수집합니다. API/SEC 연동용 — 여기서는 모델 데이터.",
    "analysis.fiscalPeriod": "회계기간",
    "analysis.source": "출처",
    "analysis.period": "기간",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB 상단",
    "analysis.bbLower": "BB 하단",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "종가",
    "heatmap.marketHeatmaps": "시장 히트맵",
    "heatmap.subtitle": "지수별 트리맵, 크기는 시가총액, 색은 6개월 Sharpe. 섹터별 정렬.",
    "heatmap.panelMeta": "{count} 종목 · 크기: 시가총액 · 색: Sharpe (6개월)",
    "heatmap.load": "히트맵 불러오기",
    "heatmap.fetches": "Yahoo Finance에서 {count} 종목 가져오기",
    "heatmap.fetching": "{count} 종목 가져오는 중…",
    "heatmap.refresh": "새로고침",
    "heatmap.sector": "섹터",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6개월",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "실행 중…",
    "comparison.compare": "비교",
    "comparison.normalizedPerformance": "정규화 성과 (6개월)",
    "comparison.ticker": "티커",
    "comparison.price": "가격",
    "comparison.signal": "신호",
    "comparison.conf": "확신",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "변동",
    "comparison.maxDD": "최대 DD",
    "comparison.momentum": "모멘텀",
    "comparison.stretch": "스트레치",
    "comparison.sharpeComparison": "Sharpe 비교",
    "comparison.volatilityComparison": "변동성 비교",
    "comparison.volatility": "변동성",
    "comparison.failed": "실패",
    "help.valuationAnalysis.title": "밸류에이션 분석",
    "help.valuationAnalysis.body": "스트레치, SMA 편차, 적정가 신호를 표시합니다.",
    "help.marketRegime.title": "시장 레짐",
    "help.marketRegime.body": "추세, 변동성, 전술 요약.",
    "help.analystTargets.title": "애널리스트 목표",
    "help.analystTargets.body": "컨센서스 목표와 최근 12개월 변화.",
    "help.companyMetrics.title": "기업 지표",
    "help.companyMetrics.body": "시간에 따른 주요 운영/재무 비율.",
    "help.fundamentalSnapshot.title": "펀더멘털 스냅샷",
    "help.fundamentalSnapshot.body": "선택 기간의 핵심 펀더멘털.",
    "help.balanceSheet.title": "대차대조표",
    "help.balanceSheet.body": "유동성과 레버리지.",
    "help.perShare.title": "주당",
    "help.perShare.body": "주당 EPS, 현금흐름, 배당.",
    "help.keyRatios.title": "핵심 비율",
    "help.keyRatios.body": "수익성과 밸류에이션 비율.",
    "help.financialsOverview.title": "재무 개요",
    "help.financialsOverview.body": "마진, 현금 vs 부채, 이익 요약.",
    "help.fundamentalData.title": "펀더멘털 데이터",
    "help.fundamentalData.body": "회계기간별 모델 펀더멘털.",
    "help.comparisonInput.title": "비교 입력",
    "help.comparisonInput.body": "콤마로 구분된 티커를 입력하세요.",
    "help.comparisonPerformance.title": "성과 오버레이",
    "help.comparisonPerformance.body": "6개월 정규화 수익률.",
    "help.comparisonTable.title": "비교 표",
    "help.comparisonTable.body": "신호, 위험, 밸류에이션 정렬 표.",
    "help.heatmapOverview.title": "시장 히트맵",
    "help.heatmapOverview.body": "섹터 트리맵을 Sharpe 색으로 표시.",
    "help.valuationToolkit.title": "밸류에이션 툴킷",
    "help.valuationToolkit.body": "DCF/DDM 가정을 조정하고 앵커를 비교.",
    "help.priceTargets.title": "가격 목표",
    "help.priceTargets.body": "불/베이스/스톱 수준과 리스크/리워드.",
    "help.technicalSignals.title": "기술 신호",
    "help.technicalSignals.body": "모멘텀, 추세, 지표 기반 신호.",
    "help.riskProfile.title": "리스크 프로필",
    "help.riskProfile.body": "변동성, 드로다운, 리스크 지표.",
    "help.statSignals.title": "통계 신호",
    "help.statSignals.body": "Z-스코어, 모멘텀, 복합 통계.",
    "footer.disclaimer": "교육 목적 전용 — 금융 조언이 아닙니다",
  },
  "pt-BR": {
    "tagline.quant": "Análise quantitativa",
    "search.placeholder": "Pesquisar ações...",
    "search.running": "Processando…",
    "search.analyze": "Analisar",
    "nav.home": "Início",
    "nav.analysis": "Análise",
    "nav.charts": "Gráficos",
    "nav.heatmap": "Mapa de calor",
    "nav.comparison": "Comparação",
    "nav.account": "Conta",
    "nav.help": "Ajuda",
    "nav.tools": "Ferramentas",
    "common.line": "Linha",
    "common.candles": "Velas",
    "common.expand": "Expandir",
    "common.close": "Fechar",
    "common.save": "Salvar",
    "common.signIn": "Entrar",
    "common.signOut": "Sair",
    "common.zoomIn": "Zoom in",
    "common.zoomOut": "Zoom out",
    "common.reset": "Redefinir",
    "menu.settings": "Configurações",
    "menu.language": "Idioma",
    "menu.upgrade": "Atualizar para Pro",
    "menu.gift": "Presentear AnalyzeAlpha",
    "menu.logout": "Sair",
    "menu.signedOut": "Não conectado",
    "tools.watchlist": "Watchlist",
    "tools.alerts": "Alertas",
    "tools.ticker": "Ticker",
    "tools.add": "Adicionar",
    "tools.emptyWatchlist": "Watchlist vazia",
    "tools.noAlerts": "Sem alertas",
    "tools.above": "Acima",
    "tools.below": "Abaixo",
    "tools.set": "Definir",
    "tools.triggered": "DISPARADO",
    "tools.watching": "MONITORANDO",
    "auth.missingConfig": "Configuração do Supabase ausente. Adicione `VITE_SUPABASE_URL` e a chave publicável e reinicie o servidor dev.",
    "auth.continueGoogle": "Continuar com Google",
    "auth.or": "ou",
    "auth.firstName": "Nome",
    "auth.email": "Email",
    "auth.password": "Senha",
    "auth.signIn": "Entrar",
    "auth.createAccount": "Criar conta",
    "auth.checkEmail": "Verifique seu email para confirmar a conta.",
    "auth.errFirstName": "Nome obrigatório.",
    "auth.errEmailPassword": "Email e senha obrigatórios.",
    "time.secondsAgo": "{count}s atrás",
    "time.minutesAgo": "{count} min atrás",
    "day.morning": "manhã",
    "day.afternoon": "tarde",
    "day.evening": "noite",
    "day.night": "madrugada",
    "greeting.goodDaypart": "Bom {dayPart}",
    "greeting.hey": "Oi",
    "greeting.welcomeBack": "Bem-vindo de volta",
    "greeting.niceToSeeYou": "Bom te ver",
    "greeting.hello": "Olá",
    "greeting.marketBrief": "Briefing de mercado",
    "greeting.quickPulse": "Pulso rápido",
    "greeting.snapshot": "Resumo",
    "greeting.todaysGlance": "Visão de hoje",
    "home.updated": "Atualizado {ago}",
    "home.marketNews": "Notícias do mercado",
    "home.indexes": "Índices",
    "home.topGainers": "Maiores altas",
    "home.topLosers": "Maiores quedas",
    "home.trendingStocks": "Ações em alta",
    "home.marketBriefSection": "Briefing de mercado",
    "chart.openCharts": "Abrir em Gráficos",
    "help.title": "Modo de Ajuda",
    "help.body": "Passe o mouse sobre os elementos destacados para ver o que eles fazem. Clique em Ajuda novamente para sair.",
    "help.exit": "Sair da Ajuda",
    "help.search.title": "Busca",
    "help.search.body": "Digite um ticker ou empresa. Pressione Enter ou clique em Analisar.",
    "help.analyze.title": "Analisar",
    "help.analyze.body": "Atualiza recomendação, sinais e gráficos.",
    "help.tools.title": "Ferramentas",
    "help.tools.body": "Gerencie watchlist e alertas.",
    "help.account.title": "Conta",
    "help.account.body": "Configurações, idioma, upgrade e sair.",
    "help.priceChart.title": "Gráfico de preço",
    "help.priceChart.body": "Mostra as últimas 60 sessões com indicadores.",
    "help.nav.home.title": "Início",
    "help.nav.home.body": "Visão geral do mercado e snapshots ao vivo.",
    "help.nav.analysis.title": "Análise",
    "help.nav.analysis.body": "Sinais, valuation e risco.",
    "help.nav.charts.title": "Gráficos",
    "help.nav.charts.body": "Gráficos avançados e indicadores.",
    "help.nav.heatmap.title": "Mapa de calor",
    "help.nav.heatmap.body": "Mapa de setores/mercado (Pro).",
    "help.nav.comparison.title": "Comparação",
    "help.nav.comparison.body": "Compare vários tickers (Pro).",
    "help.tickerStrip.title": "Ticker ao vivo",
    "help.tickerStrip.body": "Snapshot rolante do mercado. Clique para analisar.",
    "help.region.title": "Regiões",
    "help.region.body": "Troque a região para atualizar notícias e gráficos.",
    "help.marketNews.title": "Notícias do mercado",
    "help.marketNews.body": "Últimas manchetes da região selecionada.",
    "help.indexes.title": "Índices",
    "help.indexes.body": "Gráficos intraday dos principais índices.",
    "help.movers.title": "Movimentos do mercado",
    "help.movers.body": "Maiores altas, quedas e tendências.",
    "help.marketBrief.title": "Briefing de mercado",
    "help.marketBrief.body": "Resumo cross-asset e sinais de risco.",
    "help.changelog.title": "Changelog",
    "help.changelog.body": "Novidades da última versão.",
    "help.accountSync.title": "Sincronização",
    "help.accountSync.body": "Entre para sincronizar preferências e watchlists.",
    "help.profile.title": "Perfil",
    "help.profile.body": "Atualize o nome e gerencie o login.",
    "help.accountWatchlist.title": "Watchlist",
    "help.accountWatchlist.body": "Gerencie tickers salvos.",
    "help.accountAlerts.title": "Alertas",
    "help.accountAlerts.body": "Defina alertas de preço e monitore.",
    "help.accountRecent.title": "Análises recentes",
    "help.accountRecent.body": "Acesso rápido às análises mais recentes.",
    "help.accountPreferences.title": "Preferências",
    "help.accountPreferences.body": "Período, intervalo e região padrão.",
    "help.chartsControls.title": "Controles do gráfico",
    "help.chartsControls.body": "Ative indicadores e mude o estilo.",
    "analysis.stockTab": "Ação",
    "analysis.financialsTab": "Financeiro",
    "analysis.enterTicker": "Digite um ticker para começar",
    "analysis.typeSymbol": "Digite um símbolo acima e clique em Analisar",
    "analysis.verdict": "Veredito",
    "analysis.confidence": "Confiança",
    "analysis.score": "Pontuação",
    "analysis.priceTargets": "Metas de preço",
    "analysis.target": "Meta",
    "analysis.stopLoss": "Stop loss",
    "analysis.riskReward": "Risco / Retorno",
    "analysis.technicalSignals": "Sinais técnicos",
    "analysis.riskProfile": "Perfil de risco",
    "analysis.riskLevel": "Nível de risco",
    "analysis.volatility": "Volatilidade",
    "analysis.maxDrawdown": "Drawdown máximo",
    "analysis.sharpe": "Sharpe",
    "analysis.sortino": "Sortino",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "Sinais estatísticos",
    "analysis.zscore": "Z-Score",
    "analysis.zscoreDesc": "Desvio do preço da média de 20 períodos",
    "analysis.momentum": "Momentum",
    "analysis.momentumDesc": "Retorno médio em 5, 10, 20, 50 dias",
    "analysis.volume": "Volume",
    "analysis.volumeDesc": "Volume atual vs média 20 períodos",
    "analysis.composite": "Composto",
    "analysis.compositeDesc": "Combinação ponderada de todos os sinais",
    "analysis.buy": "Comprar",
    "analysis.sell": "Vender",
    "analysis.current": "Atual",
    "analysis.avg": "Média",
    "analysis.confidenceLabel": "Confiança",
    "analysis.direction": "Direção",
    "analysis.valuationAnchor": "Âncora de valuation",
    "analysis.priceChartTitle": "Preço — últimas 60 sessões",
    "analysis.valuationToolkit": "Toolkit de valuation",
    "analysis.valuationDesc": "Estima valor intrínseco com DCF, desconto de dividendos e múltiplos.",
    "analysis.fcfPerShare": "FCF / Ação",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "Dividendo / Ação",
    "analysis.growth5y": "Crescimento (5 anos %)",
    "analysis.discountWacc": "Desconto / WACC %",
    "analysis.terminalGrowth": "Crescimento terminal %",
    "analysis.targetPE": "P/L alvo",
    "analysis.projectionYears": "Anos de projeção",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "Desconto de dividendos",
    "analysis.multiples": "Múltiplos",
    "analysis.anchor": "Âncora",
    "analysis.upside": "Potencial",
    "analysis.usedAsContext": "Usado como contexto de longo prazo com sinais técnicos.",
    "analysis.neutral": "NEUTRO",
    "charts.runAnalysisFirst": "Faça uma análise primeiro",
    "charts.movingAvg": "Médias móveis",
    "charts.bollinger": "Bollinger",
    "charts.volume": "Volume",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "Estocástico",
    "charts.chart": "Gráfico",
    "charts.period": "Período",
    "charts.fullPeriod": "{ticker} — Período completo",
    "charts.volumeTitle": "Volume",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "Estocástico",
    "charts.windowHint": "Scroll horizontal move, vertical ajusta a janela. Arraste para mover. Janela: {count} / {total}",
    "account.syncLocal": "Somente local",
    "account.syncing": "Sincronizando…",
    "account.syncError": "Erro de sync",
    "account.synced": "Sincronizado",
    "account.syncedAgo": "Sincronizado {ago}",
    "account.syncTitle": "Sincronização da conta",
    "account.signedInAs": "Conectado como {email}",
    "account.user": "usuário",
    "account.signInToSync": "Entre para sincronizar seus dados.",
    "account.profile": "Perfil",
    "account.firstName": "Nome",
    "account.saved": "Salvo",
    "account.enterFirstName": "Digite um nome.",
    "account.signInToSave": "Entre para salvar.",
    "account.overview": "Visão geral",
    "account.preferences": "Preferências",
    "account.recentAnalyses": "Análises recentes",
    "account.noAnalyses": "Nenhuma análise ainda",
    "account.signal": "Sinal",
    "account.regime": "Regime",
    "account.risk": "Risco",
    "account.conf": "Conf",
    "account.view": "Ver",
    "account.defaultPeriod": "Período padrão",
    "account.defaultInterval": "Intervalo padrão",
    "account.homeRegion": "Região inicial",
    "pro.heatmap.title": "Mapa de calor é Pro",
    "pro.heatmap.desc": "Desbloqueie o mapa de calor do S&P com Sharpe, volatilidade e desempenho relativo ao vivo.",
    "pro.heatmap.f0": "Coletas de dados paralelas",
    "pro.heatmap.f1": "Visualização em treemap",
    "pro.heatmap.f2": "Sobreposições de risco e regime",
    "pro.comparison.title": "Comparação é Pro",
    "pro.comparison.desc": "Compare vários tickers por sinais, risco e valuation em uma única visualização.",
    "pro.comparison.f0": "Pontuações de sinais lado a lado",
    "pro.comparison.f1": "Rankings de Sharpe e drawdown",
    "pro.comparison.f2": "Visão de tabela pronta para exportação",
    "common.live": "AO VIVO",
    "common.price": "Preço",
    "time.justNow": "agora mesmo",
    "time.hoursAgo": "{count}h atrás",
    "time.daysAgo": "{count}d atrás",
    "analysis.valuationAnalysis": "Análise de valuation",
    "analysis.stretchIndex": "Índice de esticamento",
    "analysis.undervalued": "Subavaliado",
    "analysis.overvalued": "Sobreavaliado",
    "analysis.vsSma200": "vs SMA 200",
    "analysis.vsSma50": "vs SMA 50",
    "analysis.bollingerPercentB": "Bollinger %B",
    "analysis.range52w": "Faixa 52 semanas",
    "analysis.fromLow": "acima do mínimo",
    "analysis.fairValueEst": "Estimativa de valor justo",
    "analysis.marketRegime": "Regime de mercado",
    "analysis.strength": "Força",
    "analysis.hurst": "Hurst",
    "analysis.avoid": "Evite",
    "analysis.analystTargets": "Alvos de analistas",
    "analysis.past12Months": "Últimos 12 meses",
    "analysis.target12Month": "Alvo de 12 meses",
    "analysis.companyMetrics": "Métricas da empresa",
    "analysis.earningsPerShare": "Lucro por ação",
    "analysis.epsUnavailable": "Série de EPS indisponível.",
    "analysis.revenue": "Receita",
    "analysis.netProfitMargin": "Margem líquida",
    "analysis.currentRatio": "Índice de liquidez",
    "analysis.debtToEquity": "Dívida / Patrimônio",
    "analysis.returnOnEquityTtm": "ROE (TTM)",
    "analysis.financialsProTitle": "Financeiro é Pro",
    "analysis.financialsProDesc": "Desbloqueie finanças, ferramentas de valuation e análise multi‑período.",
    "analysis.financialsProF0": "DRE · Fluxo de caixa · Balanço",
    "analysis.financialsProF1": "Modelagem DCF, DDM e múltiplos",
    "analysis.financialsProF2": "Tendências históricas de margem e crescimento",
    "analysis.fundamentalSnapshot": "Snapshot fundamental",
    "analysis.marketCap": "Valor de mercado",
    "analysis.netIncome": "Lucro líquido",
    "analysis.freeCashFlow": "Fluxo de caixa livre",
    "analysis.revenueGrowth": "Crescimento da receita",
    "analysis.grossMargin": "Margem bruta",
    "analysis.operatingMargin": "Margem operacional",
    "analysis.netMargin": "Margem líquida",
    "analysis.balanceSheet": "Balanço patrimonial",
    "analysis.cash": "Caixa",
    "analysis.debt": "Dívida",
    "analysis.perShare": "Por ação",
    "analysis.keyRatios": "Indicadores-chave",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/L",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "Visão financeira",
    "analysis.revenueFcfMargin": "Receita + Margem FCF",
    "analysis.fcfMargin": "Margem FCF",
    "analysis.marginTrends": "Tendências de margem",
    "analysis.grossMarginShort": "Bruta",
    "analysis.operatingMarginShort": "Operacional",
    "analysis.netMarginShort": "Líquida",
    "analysis.marginRadar": "Radar de margens",
    "analysis.cashVsDebt": "Caixa vs Dívida",
    "analysis.netCash": "Caixa líquido",
    "analysis.netIncomeByPeriod": "Lucro líquido por período",
    "analysis.fundamentalDataAggregator": "Agregador de dados fundamentais",
    "analysis.fundamentalDataDesc": "Coleta receita, lucro, margens, dívida e fluxo de caixa por ticker e período fiscal. Feito para APIs/SEC — aqui usa dados modelados.",
    "analysis.fiscalPeriod": "Período fiscal",
    "analysis.source": "Fonte",
    "analysis.period": "Período",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Superior",
    "analysis.bbLower": "BB Inferior",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "Fechamento",
    "heatmap.marketHeatmaps": "Heatmaps de mercado",
    "heatmap.subtitle": "Treemaps por índice, tamanho por valor de mercado, cor pelo Sharpe de 6 meses. Ações por setor.",
    "heatmap.panelMeta": "{count} ações · Tamanho: valor de mercado · Cor: Sharpe (6 meses)",
    "heatmap.load": "Carregar heatmap",
    "heatmap.fetches": "Busca {count} ações no Yahoo Finance",
    "heatmap.fetching": "Buscando {count} ações…",
    "heatmap.refresh": "Atualizar",
    "heatmap.sector": "Setor",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6 meses",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "Processando…",
    "comparison.compare": "Comparar",
    "comparison.normalizedPerformance": "Performance normalizada (6 meses)",
    "comparison.ticker": "Ticker",
    "comparison.price": "Preço",
    "comparison.signal": "Sinal",
    "comparison.conf": "Conf.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "Vol.",
    "comparison.maxDD": "Max DD",
    "comparison.momentum": "Mom.",
    "comparison.stretch": "Esticamento",
    "comparison.sharpeComparison": "Comparação Sharpe",
    "comparison.volatilityComparison": "Comparação de volatilidade",
    "comparison.volatility": "Volatilidade",
    "comparison.failed": "falhou",
    "help.valuationAnalysis.title": "Análise de valuation",
    "help.valuationAnalysis.body": "Mede esticamento, desvios de SMA e sinais de valor justo.",
    "help.marketRegime.title": "Regime de mercado",
    "help.marketRegime.body": "Resumo de tendência, volatilidade e postura tática.",
    "help.analystTargets.title": "Alvos de analistas",
    "help.analystTargets.body": "Alvos de consenso e revisões dos últimos 12 meses.",
    "help.companyMetrics.title": "Métricas da empresa",
    "help.companyMetrics.body": "Indicadores operacionais e de balanço ao longo do tempo.",
    "help.fundamentalSnapshot.title": "Snapshot fundamental",
    "help.fundamentalSnapshot.body": "Fundamentos principais do período selecionado.",
    "help.balanceSheet.title": "Balanço patrimonial",
    "help.balanceSheet.body": "Liquidez e alavancagem.",
    "help.perShare.title": "Por ação",
    "help.perShare.body": "EPS, fluxo de caixa e dividendos por ação.",
    "help.keyRatios.title": "Indicadores-chave",
    "help.keyRatios.body": "Indicadores de rentabilidade e valuation.",
    "help.financialsOverview.title": "Visão financeira",
    "help.financialsOverview.body": "Resumo visual de margens, caixa vs dívida e lucros.",
    "help.fundamentalData.title": "Dados fundamentais",
    "help.fundamentalData.body": "Fundamentos modelados por período fiscal.",
    "help.comparisonInput.title": "Entrada de comparação",
    "help.comparisonInput.body": "Digite tickers separados por vírgulas.",
    "help.comparisonPerformance.title": "Overlay de performance",
    "help.comparisonPerformance.body": "Retornos normalizados de 6 meses.",
    "help.comparisonTable.title": "Tabela de comparação",
    "help.comparisonTable.body": "Tabela ordenável de sinais, risco e valuation.",
    "help.heatmapOverview.title": "Heatmaps de mercado",
    "help.heatmapOverview.body": "Treemap por setor com cores de Sharpe.",
    "help.valuationToolkit.title": "Toolkit de valuation",
    "help.valuationToolkit.body": "Ajuste premissas DCF/DDM e compare âncoras.",
    "help.priceTargets.title": "Alvos de preço",
    "help.priceTargets.body": "Níveis bull/base/stop e risco/retorno.",
    "help.technicalSignals.title": "Sinais técnicos",
    "help.technicalSignals.body": "Sinais de momentum, tendência e indicadores.",
    "help.riskProfile.title": "Perfil de risco",
    "help.riskProfile.body": "Volatilidade, drawdown e métricas de risco.",
    "help.statSignals.title": "Sinais estatísticos",
    "help.statSignals.body": "Z-score, momentum e estatísticas compostas.",
    "footer.disclaimer": "Apenas para fins educacionais — não é aconselhamento financeiro",
  },
  "es-419": {
    "tagline.quant": "Análisis cuantitativo",
    "search.placeholder": "Buscar acciones...",
    "search.running": "Ejecutando…",
    "search.analyze": "Analizar",
    "nav.home": "Inicio",
    "nav.analysis": "Análisis",
    "nav.charts": "Gráficos",
    "nav.heatmap": "Mapa de calor",
    "nav.comparison": "Comparación",
    "nav.account": "Cuenta",
    "nav.help": "Ayuda",
    "menu.settings": "Configuración",
    "menu.language": "Idioma",
    "menu.upgrade": "Mejorar a Pro",
    "menu.gift": "Regalar AnalyzeAlpha",
    "menu.logout": "Cerrar sesión",
    "menu.signedOut": "No has iniciado sesión",
    "chart.openCharts": "Abrir en Gráficos",
    "help.title": "Modo de Ayuda",
    "help.body": "Pasa el cursor sobre los elementos resaltados para ver qué hacen. Haz clic en Ayuda otra vez para salir.",
    "help.exit": "Salir de Ayuda",
    "pro.heatmap.title": "El mapa de calor es Pro",
    "pro.heatmap.desc": "Desbloquea el mapa de calor del S&P con Sharpe, volatilidad y rendimiento relativo en vivo.",
    "pro.heatmap.f0": "Obtención de datos en paralelo",
    "pro.heatmap.f1": "Visualización treemap",
    "pro.heatmap.f2": "Superposiciones de riesgo y régimen",
    "pro.comparison.title": "La comparación es Pro",
    "pro.comparison.desc": "Compara varios tickers por señales, riesgo y valoración en una sola vista.",
    "pro.comparison.f0": "Puntuaciones de señales lado a lado",
    "pro.comparison.f1": "Clasificaciones de Sharpe y drawdown",
    "pro.comparison.f2": "Vista de tabla lista para exportar",
    "nav.tools": "Herramientas",
    "common.line": "Línea",
    "common.candles": "Velas",
    "common.expand": "Expandir",
    "common.close": "Cerrar",
    "common.save": "Guardar",
    "common.signIn": "Iniciar sesión",
    "common.signOut": "Cerrar sesión",
    "common.zoomIn": "Acercar",
    "common.zoomOut": "Alejar",
    "common.reset": "Restablecer",
    "common.live": "EN VIVO",
    "common.price": "Precio",
    "tools.watchlist": "Lista de seguimiento",
    "tools.alerts": "Alertas",
    "tools.ticker": "Ticker",
    "tools.add": "Agregar",
    "tools.emptyWatchlist": "Lista de seguimiento vacía",
    "tools.noAlerts": "Sin alertas",
    "tools.above": "Por encima",
    "tools.below": "Por debajo",
    "tools.set": "Establecer",
    "tools.triggered": "DISPARADO",
    "tools.watching": "VIGILANDO",
    "auth.missingConfig": "Falta la configuración de Supabase. Agrega `VITE_SUPABASE_URL` y la clave publicable, luego reinicia el servidor dev.",
    "auth.continueGoogle": "Continuar con Google",
    "auth.or": "o",
    "auth.firstName": "Nombre",
    "auth.email": "Email",
    "auth.password": "Contraseña",
    "auth.signIn": "Iniciar sesión",
    "auth.createAccount": "Crear cuenta",
    "auth.checkEmail": "Revisa tu email para confirmar la cuenta.",
    "auth.errFirstName": "El nombre es obligatorio.",
    "auth.errEmailPassword": "Email y contraseña obligatorios.",
    "time.secondsAgo": "hace {count}s",
    "time.minutesAgo": "hace {count} min",
    "time.justNow": "justo ahora",
    "time.hoursAgo": "hace {count} h",
    "time.daysAgo": "hace {count} d",
    "day.morning": "mañana",
    "day.afternoon": "tarde",
    "day.evening": "noche",
    "day.night": "madrugada",
    "greeting.goodDaypart": "Buen {dayPart}",
    "greeting.hey": "Hola",
    "greeting.welcomeBack": "Bienvenido de nuevo",
    "greeting.niceToSeeYou": "Qué gusto verte",
    "greeting.hello": "Hola",
    "greeting.marketBrief": "Resumen de mercado",
    "greeting.quickPulse": "Pulso rápido",
    "greeting.snapshot": "Resumen",
    "greeting.todaysGlance": "Vista de hoy",
    "home.updated": "Actualizado {ago}",
    "home.marketNews": "Noticias del mercado",
    "home.indexes": "Índices",
    "home.topGainers": "Mayores alzas",
    "home.topLosers": "Mayores bajas",
    "home.trendingStocks": "Acciones en tendencia",
    "home.marketBriefSection": "Resumen de mercado",
    "help.search.title": "Búsqueda",
    "help.search.body": "Escribe un ticker o nombre de empresa. Presiona Enter o Analizar.",
    "help.analyze.title": "Analizar",
    "help.analyze.body": "Actualiza datos, recomendaciones, señales y gráficos.",
    "help.tools.title": "Herramientas",
    "help.tools.body": "Gestiona watchlist y alertas.",
    "help.account.title": "Cuenta",
    "help.account.body": "Accede a configuración, idioma, upgrades y salir.",
    "help.priceChart.title": "Gráfico de precio",
    "help.priceChart.body": "Muestra las últimas 60 sesiones con indicadores.",
    "help.nav.home.title": "Inicio",
    "help.nav.home.body": "Resumen del mercado y snapshots en vivo.",
    "help.nav.analysis.title": "Análisis",
    "help.nav.analysis.body": "Señales, valoración y riesgo.",
    "help.nav.charts.title": "Gráficos",
    "help.nav.charts.body": "Gráficos avanzados e indicadores.",
    "help.nav.heatmap.title": "Mapa de calor",
    "help.nav.heatmap.body": "Mapa de sectores/mercado (Pro).",
    "help.nav.comparison.title": "Comparación",
    "help.nav.comparison.body": "Compara varios tickers (Pro).",
    "help.tickerStrip.title": "Cinta de tickers",
    "help.tickerStrip.body": "Snapshot del mercado en movimiento. Haz clic para analizar.",
    "help.region.title": "Regiones",
    "help.region.body": "Cambia la región para actualizar noticias y gráficos.",
    "help.marketNews.title": "Noticias del mercado",
    "help.marketNews.body": "Titulares recientes para la región seleccionada.",
    "help.indexes.title": "Índices",
    "help.indexes.body": "Gráficos intradía de los índices principales.",
    "help.movers.title": "Movimientos del mercado",
    "help.movers.body": "Mayores alzas, bajas y tendencias.",
    "help.marketBrief.title": "Resumen de mercado",
    "help.marketBrief.body": "Resumen cross-asset y señales de riesgo.",
    "help.changelog.title": "Cambios",
    "help.changelog.body": "Qué hay de nuevo en la última versión.",
    "help.accountSync.title": "Sincronización",
    "help.accountSync.body": "Inicia sesión para sincronizar preferencias y watchlists.",
    "help.profile.title": "Perfil",
    "help.profile.body": "Actualiza tu nombre y gestiona el acceso.",
    "help.accountWatchlist.title": "Watchlist",
    "help.accountWatchlist.body": "Gestiona tickers guardados.",
    "help.accountAlerts.title": "Alertas",
    "help.accountAlerts.body": "Configura alertas de precio y monitorea.",
    "help.accountRecent.title": "Análisis recientes",
    "help.accountRecent.body": "Acceso rápido a tus últimos análisis.",
    "help.accountPreferences.title": "Preferencias",
    "help.accountPreferences.body": "Periodo, intervalo y región predeterminados.",
    "help.chartsControls.title": "Controles del gráfico",
    "help.chartsControls.body": "Activa indicadores y cambia el estilo.",
    "analysis.stockTab": "Acción",
    "analysis.financialsTab": "Finanzas",
    "analysis.enterTicker": "Ingresa un ticker para empezar",
    "analysis.typeSymbol": "Escribe un símbolo y haz clic en Analizar",
    "analysis.verdict": "Veredicto",
    "analysis.confidence": "Confianza",
    "analysis.score": "Puntuación",
    "analysis.priceTargets": "Objetivos de precio",
    "analysis.target": "Objetivo",
    "analysis.stopLoss": "Stop loss",
    "analysis.riskReward": "Riesgo / Retorno",
    "analysis.technicalSignals": "Señales técnicas",
    "analysis.riskProfile": "Perfil de riesgo",
    "analysis.riskLevel": "Nivel de riesgo",
    "analysis.volatility": "Volatilidad",
    "analysis.maxDrawdown": "Máximo drawdown",
    "analysis.sharpe": "Sharpe",
    "analysis.sortino": "Sortino",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "Señales estadísticas",
    "analysis.zscore": "Z-Score",
    "analysis.zscoreDesc": "Desviación del precio respecto a la media de 20 periodos",
    "analysis.momentum": "Momentum",
    "analysis.momentumDesc": "Rendimiento medio en 5, 10, 20, 50 días",
    "analysis.volume": "Volumen",
    "analysis.volumeDesc": "Volumen actual vs media de 20 periodos",
    "analysis.composite": "Compuesto",
    "analysis.compositeDesc": "Combinación ponderada de todas las señales",
    "analysis.buy": "Comprar",
    "analysis.sell": "Vender",
    "analysis.current": "Actual",
    "analysis.avg": "Prom.",
    "analysis.confidenceLabel": "Confianza",
    "analysis.direction": "Dirección",
    "analysis.valuationAnchor": "Ancla de valoración",
    "analysis.priceChartTitle": "Precio — últimas 60 sesiones",
    "analysis.valuationToolkit": "Toolkit de valoración",
    "analysis.valuationDesc": "Estima el valor intrínseco con DCF, descuento de dividendos y múltiplos.",
    "analysis.fcfPerShare": "FCF / Acción",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "Dividendo / Acción",
    "analysis.growth5y": "Crecimiento (5 años %)",
    "analysis.discountWacc": "Descuento / WACC %",
    "analysis.terminalGrowth": "Crecimiento terminal %",
    "analysis.targetPE": "P/E objetivo",
    "analysis.projectionYears": "Años de proyección",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "Descuento de dividendos",
    "analysis.multiples": "Múltiplos",
    "analysis.anchor": "Ancla",
    "analysis.upside": "Potencial",
    "analysis.usedAsContext": "Usado como contexto a largo plazo con señales técnicas.",
    "analysis.neutral": "NEUTRO",
    "charts.runAnalysisFirst": "Primero realiza un análisis",
    "charts.movingAvg": "Media móvil",
    "charts.bollinger": "Bollinger",
    "charts.volume": "Volumen",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "Estocástico",
    "charts.chart": "Gráfico",
    "charts.period": "Periodo",
    "charts.fullPeriod": "{ticker} — Periodo completo",
    "charts.volumeTitle": "Volumen",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "Estocástico",
    "charts.windowHint": "Desplazamiento horizontal mueve, vertical ajusta la ventana. Arrastra para mover. Ventana: {count} / {total}",
    "account.syncLocal": "Solo local",
    "account.syncing": "Sincronizando…",
    "account.syncError": "Error de sync",
    "account.synced": "Sincronizado",
    "account.syncedAgo": "Sincronizado {ago}",
    "account.syncTitle": "Sincronización de cuenta",
    "account.signedInAs": "Conectado como {email}",
    "account.user": "usuario",
    "account.signInToSync": "Inicia sesión para sincronizar datos.",
    "account.profile": "Perfil",
    "account.firstName": "Nombre",
    "account.saved": "Guardado",
    "account.enterFirstName": "Ingresa un nombre.",
    "account.signInToSave": "Inicia sesión para guardar.",
    "account.overview": "Resumen",
    "account.preferences": "Preferencias",
    "account.recentAnalyses": "Análisis recientes",
    "account.noAnalyses": "Aún no hay análisis",
    "account.signal": "Señal",
    "account.regime": "Régimen",
    "account.risk": "Riesgo",
    "account.conf": "Conf.",
    "account.view": "Ver",
    "account.defaultPeriod": "Periodo predeterminado",
    "account.defaultInterval": "Intervalo predeterminado",
    "account.homeRegion": "Región inicial",
    "analysis.valuationAnalysis": "Análisis de valoración",
    "analysis.stretchIndex": "Índice de stretch",
    "analysis.undervalued": "Infravalorado",
    "analysis.overvalued": "Sobrevalorado",
    "analysis.vsSma200": "vs SMA 200",
    "analysis.vsSma50": "vs SMA 50",
    "analysis.bollingerPercentB": "Bollinger %B",
    "analysis.range52w": "Rango 52 semanas",
    "analysis.fromLow": "desde el mínimo",
    "analysis.fairValueEst": "Estimación de valor justo",
    "analysis.marketRegime": "Régimen de mercado",
    "analysis.strength": "Fuerza",
    "analysis.hurst": "Hurst",
    "analysis.avoid": "Evitar",
    "analysis.analystTargets": "Objetivos de analistas",
    "analysis.past12Months": "Últimos 12 meses",
    "analysis.target12Month": "Objetivo a 12 meses",
    "analysis.companyMetrics": "Métricas de la empresa",
    "analysis.earningsPerShare": "Ganancias por acción",
    "analysis.epsUnavailable": "Serie de EPS no disponible.",
    "analysis.revenue": "Ingresos",
    "analysis.netProfitMargin": "Margen de beneficio neto",
    "analysis.currentRatio": "Ratio corriente",
    "analysis.debtToEquity": "Deuda / Patrimonio",
    "analysis.returnOnEquityTtm": "ROE (TTM)",
    "analysis.financialsProTitle": "Finanzas son Pro",
    "analysis.financialsProDesc": "Desbloquea financieros, herramientas de valoración y análisis multi‑periodo.",
    "analysis.financialsProF0": "Estado de resultados · Flujo de caja · Balance",
    "analysis.financialsProF1": "Modelado DCF, DDM y múltiplos",
    "analysis.financialsProF2": "Tendencias históricas de márgenes y crecimiento",
    "analysis.fundamentalSnapshot": "Snapshot fundamental",
    "analysis.marketCap": "Capitalización de mercado",
    "analysis.netIncome": "Ingreso neto",
    "analysis.freeCashFlow": "Flujo de caja libre",
    "analysis.revenueGrowth": "Crecimiento de ingresos",
    "analysis.grossMargin": "Margen bruto",
    "analysis.operatingMargin": "Margen operativo",
    "analysis.netMargin": "Margen neto",
    "analysis.balanceSheet": "Balance",
    "analysis.cash": "Caja",
    "analysis.debt": "Deuda",
    "analysis.perShare": "Por acción",
    "analysis.keyRatios": "Ratios clave",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "Resumen financiero",
    "analysis.revenueFcfMargin": "Ingresos + Margen FCF",
    "analysis.fcfMargin": "Margen FCF",
    "analysis.marginTrends": "Tendencias de margen",
    "analysis.grossMarginShort": "Bruto",
    "analysis.operatingMarginShort": "Operativo",
    "analysis.netMarginShort": "Neto",
    "analysis.marginRadar": "Radar de márgenes",
    "analysis.cashVsDebt": "Caja vs Deuda",
    "analysis.netCash": "Caja neta",
    "analysis.netIncomeByPeriod": "Ingreso neto por periodo",
    "analysis.fundamentalDataAggregator": "Agregador de datos fundamentales",
    "analysis.fundamentalDataDesc": "Recopila ingresos, ganancias, márgenes, deuda y flujo de caja por ticker y periodo fiscal. Diseñado para APIs/SEC — aquí usa datos modelados.",
    "analysis.fiscalPeriod": "Periodo fiscal",
    "analysis.source": "Fuente",
    "analysis.period": "Periodo",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Superior",
    "analysis.bbLower": "BB Inferior",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "Cierre",
    "heatmap.marketHeatmaps": "Mapa de calor del mercado",
    "heatmap.subtitle": "Treemap por índice, tamaño por capitalización, color por Sharpe de 6 meses. Acciones ordenadas por sector.",
    "heatmap.panelMeta": "{count} acciones · Tamaño: capitalización · Color: Sharpe (6 meses)",
    "heatmap.load": "Cargar mapa de calor",
    "heatmap.fetches": "Obtiene {count} acciones de Yahoo Finance",
    "heatmap.fetching": "Obteniendo {count} acciones…",
    "heatmap.refresh": "Actualizar",
    "heatmap.sector": "Sector",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6 meses",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "Ejecutando…",
    "comparison.compare": "Comparar",
    "comparison.normalizedPerformance": "Rendimiento normalizado (6 meses)",
    "comparison.ticker": "Ticker",
    "comparison.price": "Precio",
    "comparison.signal": "Señal",
    "comparison.conf": "Conf.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "Vol.",
    "comparison.maxDD": "Max DD",
    "comparison.momentum": "Mom.",
    "comparison.stretch": "Stretch",
    "comparison.sharpeComparison": "Comparación Sharpe",
    "comparison.volatilityComparison": "Comparación de volatilidad",
    "comparison.volatility": "Volatilidad",
    "comparison.failed": "falló",
    "help.valuationAnalysis.title": "Análisis de valoración",
    "help.valuationAnalysis.body": "Mide stretch, desviaciones SMA y señales de valor justo.",
    "help.marketRegime.title": "Régimen de mercado",
    "help.marketRegime.body": "Resumen de tendencia, volatilidad y postura táctica.",
    "help.analystTargets.title": "Objetivos de analistas",
    "help.analystTargets.body": "Objetivos consenso y revisiones de 12 meses.",
    "help.companyMetrics.title": "Métricas de la empresa",
    "help.companyMetrics.body": "Ratios operativos y de balance a lo largo del tiempo.",
    "help.fundamentalSnapshot.title": "Snapshot fundamental",
    "help.fundamentalSnapshot.body": "Fundamentales principales del periodo seleccionado.",
    "help.balanceSheet.title": "Balance",
    "help.balanceSheet.body": "Liquidez y apalancamiento.",
    "help.perShare.title": "Por acción",
    "help.perShare.body": "EPS, flujo de caja y dividendos por acción.",
    "help.keyRatios.title": "Ratios clave",
    "help.keyRatios.body": "Ratios de rentabilidad y valoración.",
    "help.financialsOverview.title": "Resumen financiero",
    "help.financialsOverview.body": "Resumen visual de márgenes, caja vs deuda y ganancias.",
    "help.fundamentalData.title": "Datos fundamentales",
    "help.fundamentalData.body": "Fundamentales modelados por periodo fiscal.",
    "help.comparisonInput.title": "Entrada de comparación",
    "help.comparisonInput.body": "Ingresa tickers separados por comas.",
    "help.comparisonPerformance.title": "Overlay de rendimiento",
    "help.comparisonPerformance.body": "Rendimientos normalizados de 6 meses.",
    "help.comparisonTable.title": "Tabla de comparación",
    "help.comparisonTable.body": "Tabla ordenable de señales, riesgo y valoración.",
    "help.heatmapOverview.title": "Mapa de calor",
    "help.heatmapOverview.body": "Treemap por sector con colores Sharpe.",
    "help.valuationToolkit.title": "Toolkit de valoración",
    "help.valuationToolkit.body": "Ajusta supuestos DCF/DDM y compara anclas.",
    "help.priceTargets.title": "Objetivos de precio",
    "help.priceTargets.body": "Niveles bull/base/stop y riesgo/retorno.",
    "help.technicalSignals.title": "Señales técnicas",
    "help.technicalSignals.body": "Señales de momentum, tendencia e indicadores.",
    "help.riskProfile.title": "Perfil de riesgo",
    "help.riskProfile.body": "Volatilidad, drawdown y métricas de riesgo.",
    "help.statSignals.title": "Señales estadísticas",
    "help.statSignals.body": "Z-score, momentum y estadísticas compuestas.",
    "footer.disclaimer": "Solo con fines educativos — no es asesoramiento financiero",
  },
  "es-ES": {
    "tagline.quant": "Análisis cuantitativo",
    "search.placeholder": "Buscar acciones...",
    "search.running": "Ejecutando…",
    "search.analyze": "Analizar",
    "nav.home": "Inicio",
    "nav.analysis": "Análisis",
    "nav.charts": "Gráficos",
    "nav.heatmap": "Mapa de calor",
    "nav.comparison": "Comparación",
    "nav.account": "Cuenta",
    "nav.help": "Ayuda",
    "menu.settings": "Ajustes",
    "menu.language": "Idioma",
    "menu.upgrade": "Actualizar a Pro",
    "menu.gift": "Regalar AnalyzeAlpha",
    "menu.logout": "Cerrar sesión",
    "menu.signedOut": "No has iniciado sesión",
    "chart.openCharts": "Abrir en Gráficos",
    "help.title": "Modo de Ayuda",
    "help.body": "Pasa el cursor por los elementos resaltados para ver qué hacen. Haz clic en Ayuda otra vez para salir.",
    "help.exit": "Salir de Ayuda",
    "pro.heatmap.title": "El mapa de calor es Pro",
    "pro.heatmap.desc": "Desbloquea el mapa de calor del S&P con Sharpe, volatilidad y rendimiento relativo en vivo.",
    "pro.heatmap.f0": "Obtención de datos en paralelo",
    "pro.heatmap.f1": "Visualización treemap",
    "pro.heatmap.f2": "Superposiciones de riesgo y régimen",
    "pro.comparison.title": "La comparación es Pro",
    "pro.comparison.desc": "Compara varios tickers por señales, riesgo y valoración en una sola vista.",
    "pro.comparison.f0": "Puntuaciones de señales en paralelo",
    "pro.comparison.f1": "Clasificaciones de Sharpe y drawdown",
    "pro.comparison.f2": "Vista de tabla lista para exportar",
    "nav.tools": "Herramientas",
    "common.line": "Línea",
    "common.candles": "Velas",
    "common.expand": "Expandir",
    "common.close": "Cerrar",
    "common.save": "Guardar",
    "common.signIn": "Iniciar sesión",
    "common.signOut": "Cerrar sesión",
    "common.zoomIn": "Acercar",
    "common.zoomOut": "Alejar",
    "common.reset": "Restablecer",
    "common.live": "EN VIVO",
    "common.price": "Precio",
    "tools.watchlist": "Lista de seguimiento",
    "tools.alerts": "Alertas",
    "tools.ticker": "Ticker",
    "tools.add": "Agregar",
    "tools.emptyWatchlist": "Lista de seguimiento vacía",
    "tools.noAlerts": "Sin alertas",
    "tools.above": "Por encima",
    "tools.below": "Por debajo",
    "tools.set": "Establecer",
    "tools.triggered": "DISPARADO",
    "tools.watching": "VIGILANDO",
    "auth.missingConfig": "Falta la configuración de Supabase. Agrega `VITE_SUPABASE_URL` y la clave publicable, luego reinicia el servidor dev.",
    "auth.continueGoogle": "Continuar con Google",
    "auth.or": "o",
    "auth.firstName": "Nombre",
    "auth.email": "Email",
    "auth.password": "Contraseña",
    "auth.signIn": "Iniciar sesión",
    "auth.createAccount": "Crear cuenta",
    "auth.checkEmail": "Revisa tu email para confirmar la cuenta.",
    "auth.errFirstName": "El nombre es obligatorio.",
    "auth.errEmailPassword": "Email y contraseña obligatorios.",
    "time.secondsAgo": "hace {count}s",
    "time.minutesAgo": "hace {count} min",
    "time.justNow": "justo ahora",
    "time.hoursAgo": "hace {count} h",
    "time.daysAgo": "hace {count} d",
    "day.morning": "mañana",
    "day.afternoon": "tarde",
    "day.evening": "noche",
    "day.night": "madrugada",
    "greeting.goodDaypart": "Buen {dayPart}",
    "greeting.hey": "Hola",
    "greeting.welcomeBack": "Bienvenido de nuevo",
    "greeting.niceToSeeYou": "Qué gusto verte",
    "greeting.hello": "Hola",
    "greeting.marketBrief": "Resumen de mercado",
    "greeting.quickPulse": "Pulso rápido",
    "greeting.snapshot": "Resumen",
    "greeting.todaysGlance": "Vista de hoy",
    "home.updated": "Actualizado {ago}",
    "home.marketNews": "Noticias del mercado",
    "home.indexes": "Índices",
    "home.topGainers": "Mayores alzas",
    "home.topLosers": "Mayores bajas",
    "home.trendingStocks": "Acciones en tendencia",
    "home.marketBriefSection": "Resumen de mercado",
    "help.search.title": "Búsqueda",
    "help.search.body": "Escribe un ticker o nombre de empresa. Presiona Enter o Analizar.",
    "help.analyze.title": "Analizar",
    "help.analyze.body": "Actualiza datos, recomendaciones, señales y gráficos.",
    "help.tools.title": "Herramientas",
    "help.tools.body": "Gestiona watchlist y alertas.",
    "help.account.title": "Cuenta",
    "help.account.body": "Accede a configuración, idioma, upgrades y salir.",
    "help.priceChart.title": "Gráfico de precio",
    "help.priceChart.body": "Muestra las últimas 60 sesiones con indicadores.",
    "help.nav.home.title": "Inicio",
    "help.nav.home.body": "Resumen del mercado y snapshots en vivo.",
    "help.nav.analysis.title": "Análisis",
    "help.nav.analysis.body": "Señales, valoración y riesgo.",
    "help.nav.charts.title": "Gráficos",
    "help.nav.charts.body": "Gráficos avanzados e indicadores.",
    "help.nav.heatmap.title": "Mapa de calor",
    "help.nav.heatmap.body": "Mapa de sectores/mercado (Pro).",
    "help.nav.comparison.title": "Comparación",
    "help.nav.comparison.body": "Compara varios tickers (Pro).",
    "help.tickerStrip.title": "Cinta de tickers",
    "help.tickerStrip.body": "Snapshot del mercado en movimiento. Haz clic para analizar.",
    "help.region.title": "Regiones",
    "help.region.body": "Cambia la región para actualizar noticias y gráficos.",
    "help.marketNews.title": "Noticias del mercado",
    "help.marketNews.body": "Titulares recientes para la región seleccionada.",
    "help.indexes.title": "Índices",
    "help.indexes.body": "Gráficos intradía de los índices principales.",
    "help.movers.title": "Movimientos del mercado",
    "help.movers.body": "Mayores alzas, bajas y tendencias.",
    "help.marketBrief.title": "Resumen de mercado",
    "help.marketBrief.body": "Resumen cross-asset y señales de riesgo.",
    "help.changelog.title": "Cambios",
    "help.changelog.body": "Qué hay de nuevo en la última versión.",
    "help.accountSync.title": "Sincronización",
    "help.accountSync.body": "Inicia sesión para sincronizar preferencias y watchlists.",
    "help.profile.title": "Perfil",
    "help.profile.body": "Actualiza tu nombre y gestiona el acceso.",
    "help.accountWatchlist.title": "Watchlist",
    "help.accountWatchlist.body": "Gestiona tickers guardados.",
    "help.accountAlerts.title": "Alertas",
    "help.accountAlerts.body": "Configura alertas de precio y monitorea.",
    "help.accountRecent.title": "Análisis recientes",
    "help.accountRecent.body": "Acceso rápido a tus últimos análisis.",
    "help.accountPreferences.title": "Preferencias",
    "help.accountPreferences.body": "Periodo, intervalo y región predeterminados.",
    "help.chartsControls.title": "Controles del gráfico",
    "help.chartsControls.body": "Activa indicadores y cambia el estilo.",
    "analysis.stockTab": "Acción",
    "analysis.financialsTab": "Finanzas",
    "analysis.enterTicker": "Ingresa un ticker para empezar",
    "analysis.typeSymbol": "Escribe un símbolo y haz clic en Analizar",
    "analysis.verdict": "Veredicto",
    "analysis.confidence": "Confianza",
    "analysis.score": "Puntuación",
    "analysis.priceTargets": "Objetivos de precio",
    "analysis.target": "Objetivo",
    "analysis.stopLoss": "Stop loss",
    "analysis.riskReward": "Riesgo / Retorno",
    "analysis.technicalSignals": "Señales técnicas",
    "analysis.riskProfile": "Perfil de riesgo",
    "analysis.riskLevel": "Nivel de riesgo",
    "analysis.volatility": "Volatilidad",
    "analysis.maxDrawdown": "Máximo drawdown",
    "analysis.sharpe": "Sharpe",
    "analysis.sortino": "Sortino",
    "analysis.var95": "VaR 95%",
    "analysis.statSignals": "Señales estadísticas",
    "analysis.zscore": "Z-Score",
    "analysis.zscoreDesc": "Desviación del precio respecto a la media de 20 periodos",
    "analysis.momentum": "Momentum",
    "analysis.momentumDesc": "Rendimiento medio en 5, 10, 20, 50 días",
    "analysis.volume": "Volumen",
    "analysis.volumeDesc": "Volumen actual vs media de 20 periodos",
    "analysis.composite": "Compuesto",
    "analysis.compositeDesc": "Combinación ponderada de todas las señales",
    "analysis.buy": "Comprar",
    "analysis.sell": "Vender",
    "analysis.current": "Actual",
    "analysis.avg": "Prom.",
    "analysis.confidenceLabel": "Confianza",
    "analysis.direction": "Dirección",
    "analysis.valuationAnchor": "Ancla de valoración",
    "analysis.priceChartTitle": "Precio — últimas 60 sesiones",
    "analysis.valuationToolkit": "Toolkit de valoración",
    "analysis.valuationDesc": "Estima el valor intrínseco con DCF, descuento de dividendos y múltiplos.",
    "analysis.fcfPerShare": "FCF / Acción",
    "analysis.eps": "EPS",
    "analysis.dividendPerShare": "Dividendo / Acción",
    "analysis.growth5y": "Crecimiento (5 años %)",
    "analysis.discountWacc": "Descuento / WACC %",
    "analysis.terminalGrowth": "Crecimiento terminal %",
    "analysis.targetPE": "P/E objetivo",
    "analysis.projectionYears": "Años de proyección",
    "analysis.dcf": "DCF",
    "analysis.dividendDiscount": "Descuento de dividendos",
    "analysis.multiples": "Múltiplos",
    "analysis.anchor": "Ancla",
    "analysis.upside": "Potencial",
    "analysis.usedAsContext": "Usado como contexto a largo plazo con señales técnicas.",
    "analysis.neutral": "NEUTRO",
    "charts.runAnalysisFirst": "Primero realiza un análisis",
    "charts.movingAvg": "Media móvil",
    "charts.bollinger": "Bollinger",
    "charts.volume": "Volumen",
    "charts.rsi": "RSI",
    "charts.macd": "MACD",
    "charts.stochastic": "Estocástico",
    "charts.chart": "Gráfico",
    "charts.period": "Periodo",
    "charts.fullPeriod": "{ticker} — Periodo completo",
    "charts.volumeTitle": "Volumen",
    "charts.rsiTitle": "RSI (14)",
    "charts.macdTitle": "MACD",
    "charts.stochTitle": "Estocástico",
    "charts.windowHint": "Desplazamiento horizontal mueve, vertical ajusta la ventana. Arrastra para mover. Ventana: {count} / {total}",
    "account.syncLocal": "Solo local",
    "account.syncing": "Sincronizando…",
    "account.syncError": "Error de sync",
    "account.synced": "Sincronizado",
    "account.syncedAgo": "Sincronizado {ago}",
    "account.syncTitle": "Sincronización de cuenta",
    "account.signedInAs": "Conectado como {email}",
    "account.user": "usuario",
    "account.signInToSync": "Inicia sesión para sincronizar datos.",
    "account.profile": "Perfil",
    "account.firstName": "Nombre",
    "account.saved": "Guardado",
    "account.enterFirstName": "Ingresa un nombre.",
    "account.signInToSave": "Inicia sesión para guardar.",
    "account.overview": "Resumen",
    "account.preferences": "Preferencias",
    "account.recentAnalyses": "Análisis recientes",
    "account.noAnalyses": "Aún no hay análisis",
    "account.signal": "Señal",
    "account.regime": "Régimen",
    "account.risk": "Riesgo",
    "account.conf": "Conf.",
    "account.view": "Ver",
    "account.defaultPeriod": "Periodo predeterminado",
    "account.defaultInterval": "Intervalo predeterminado",
    "account.homeRegion": "Región inicial",
    "analysis.valuationAnalysis": "Análisis de valoración",
    "analysis.stretchIndex": "Índice de stretch",
    "analysis.undervalued": "Infravalorado",
    "analysis.overvalued": "Sobrevalorado",
    "analysis.vsSma200": "vs SMA 200",
    "analysis.vsSma50": "vs SMA 50",
    "analysis.bollingerPercentB": "Bollinger %B",
    "analysis.range52w": "Rango 52 semanas",
    "analysis.fromLow": "desde el mínimo",
    "analysis.fairValueEst": "Estimación de valor justo",
    "analysis.marketRegime": "Régimen de mercado",
    "analysis.strength": "Fuerza",
    "analysis.hurst": "Hurst",
    "analysis.avoid": "Evitar",
    "analysis.analystTargets": "Objetivos de analistas",
    "analysis.past12Months": "Últimos 12 meses",
    "analysis.target12Month": "Objetivo a 12 meses",
    "analysis.companyMetrics": "Métricas de la empresa",
    "analysis.earningsPerShare": "Ganancias por acción",
    "analysis.epsUnavailable": "Serie de EPS no disponible.",
    "analysis.revenue": "Ingresos",
    "analysis.netProfitMargin": "Margen de beneficio neto",
    "analysis.currentRatio": "Ratio corriente",
    "analysis.debtToEquity": "Deuda / Patrimonio",
    "analysis.returnOnEquityTtm": "ROE (TTM)",
    "analysis.financialsProTitle": "Finanzas son Pro",
    "analysis.financialsProDesc": "Desbloquea financieros, herramientas de valoración y análisis multi‑periodo.",
    "analysis.financialsProF0": "Estado de resultados · Flujo de caja · Balance",
    "analysis.financialsProF1": "Modelado DCF, DDM y múltiplos",
    "analysis.financialsProF2": "Tendencias históricas de márgenes y crecimiento",
    "analysis.fundamentalSnapshot": "Snapshot fundamental",
    "analysis.marketCap": "Capitalización de mercado",
    "analysis.netIncome": "Ingreso neto",
    "analysis.freeCashFlow": "Flujo de caja libre",
    "analysis.revenueGrowth": "Crecimiento de ingresos",
    "analysis.grossMargin": "Margen bruto",
    "analysis.operatingMargin": "Margen operativo",
    "analysis.netMargin": "Margen neto",
    "analysis.balanceSheet": "Balance",
    "analysis.cash": "Caja",
    "analysis.debt": "Deuda",
    "analysis.perShare": "Por acción",
    "analysis.keyRatios": "Ratios clave",
    "analysis.roe": "ROE",
    "analysis.roa": "ROA",
    "analysis.pe": "P/E",
    "analysis.pfcf": "P/FCF",
    "analysis.financialsOverview": "Resumen financiero",
    "analysis.revenueFcfMargin": "Ingresos + Margen FCF",
    "analysis.fcfMargin": "Margen FCF",
    "analysis.marginTrends": "Tendencias de margen",
    "analysis.grossMarginShort": "Bruto",
    "analysis.operatingMarginShort": "Operativo",
    "analysis.netMarginShort": "Neto",
    "analysis.marginRadar": "Radar de márgenes",
    "analysis.cashVsDebt": "Caja vs Deuda",
    "analysis.netCash": "Caja neta",
    "analysis.netIncomeByPeriod": "Ingreso neto por periodo",
    "analysis.fundamentalDataAggregator": "Agregador de datos fundamentales",
    "analysis.fundamentalDataDesc": "Recopila ingresos, ganancias, márgenes, deuda y flujo de caja por ticker y periodo fiscal. Diseñado para APIs/SEC — aquí usa datos modelados.",
    "analysis.fiscalPeriod": "Periodo fiscal",
    "analysis.source": "Fuente",
    "analysis.period": "Periodo",
    "analysis.fcf": "FCF",
    "analysis.bbUpper": "BB Superior",
    "analysis.bbLower": "BB Inferior",
    "analysis.sma20": "SMA 20",
    "analysis.sma50": "SMA 50",
    "analysis.close": "Cierre",
    "heatmap.marketHeatmaps": "Mapa de calor del mercado",
    "heatmap.subtitle": "Treemap por índice, tamaño por capitalización, color por Sharpe de 6 meses. Acciones ordenadas por sector.",
    "heatmap.panelMeta": "{count} acciones · Tamaño: capitalización · Color: Sharpe (6 meses)",
    "heatmap.load": "Cargar mapa de calor",
    "heatmap.fetches": "Obtiene {count} acciones de Yahoo Finance",
    "heatmap.fetching": "Obteniendo {count} acciones…",
    "heatmap.refresh": "Actualizar",
    "heatmap.sector": "Sector",
    "heatmap.sharpe": "Sharpe",
    "heatmap.sixMonths": "6 meses",
    "comparison.placeholder": "AAPL, MSFT, GOOGL...",
    "comparison.running": "Ejecutando…",
    "comparison.compare": "Comparar",
    "comparison.normalizedPerformance": "Rendimiento normalizado (6 meses)",
    "comparison.ticker": "Ticker",
    "comparison.price": "Precio",
    "comparison.signal": "Señal",
    "comparison.conf": "Conf.",
    "comparison.sharpe": "Sharpe",
    "comparison.vol": "Vol.",
    "comparison.maxDD": "Max DD",
    "comparison.momentum": "Mom.",
    "comparison.stretch": "Stretch",
    "comparison.sharpeComparison": "Comparación Sharpe",
    "comparison.volatilityComparison": "Comparación de volatilidad",
    "comparison.volatility": "Volatilidad",
    "comparison.failed": "falló",
    "help.valuationAnalysis.title": "Análisis de valoración",
    "help.valuationAnalysis.body": "Mide stretch, desviaciones SMA y señales de valor justo.",
    "help.marketRegime.title": "Régimen de mercado",
    "help.marketRegime.body": "Resumen de tendencia, volatilidad y postura táctica.",
    "help.analystTargets.title": "Objetivos de analistas",
    "help.analystTargets.body": "Objetivos consenso y revisiones de 12 meses.",
    "help.companyMetrics.title": "Métricas de la empresa",
    "help.companyMetrics.body": "Ratios operativos y de balance a lo largo del tiempo.",
    "help.fundamentalSnapshot.title": "Snapshot fundamental",
    "help.fundamentalSnapshot.body": "Fundamentales principales del periodo seleccionado.",
    "help.balanceSheet.title": "Balance",
    "help.balanceSheet.body": "Liquidez y apalancamiento.",
    "help.perShare.title": "Por acción",
    "help.perShare.body": "EPS, flujo de caja y dividendos por acción.",
    "help.keyRatios.title": "Ratios clave",
    "help.keyRatios.body": "Ratios de rentabilidad y valoración.",
    "help.financialsOverview.title": "Resumen financiero",
    "help.financialsOverview.body": "Resumen visual de márgenes, caja vs deuda y ganancias.",
    "help.fundamentalData.title": "Datos fundamentales",
    "help.fundamentalData.body": "Fundamentales modelados por periodo fiscal.",
    "help.comparisonInput.title": "Entrada de comparación",
    "help.comparisonInput.body": "Ingresa tickers separados por comas.",
    "help.comparisonPerformance.title": "Overlay de rendimiento",
    "help.comparisonPerformance.body": "Rendimientos normalizados de 6 meses.",
    "help.comparisonTable.title": "Tabla de comparación",
    "help.comparisonTable.body": "Tabla ordenable de señales, riesgo y valoración.",
    "help.heatmapOverview.title": "Mapa de calor",
    "help.heatmapOverview.body": "Treemap por sector con colores Sharpe.",
    "help.valuationToolkit.title": "Toolkit de valoración",
    "help.valuationToolkit.body": "Ajusta supuestos DCF/DDM y compara anclas.",
    "help.priceTargets.title": "Objetivos de precio",
    "help.priceTargets.body": "Niveles bull/base/stop y riesgo/retorno.",
    "help.technicalSignals.title": "Señales técnicas",
    "help.technicalSignals.body": "Señales de momentum, tendencia e indicadores.",
    "help.riskProfile.title": "Perfil de riesgo",
    "help.riskProfile.body": "Volatilidad, drawdown y métricas de riesgo.",
    "help.statSignals.title": "Señales estadísticas",
    "help.statSignals.body": "Z-score, momentum y estadísticas compuestas.",
    "footer.disclaimer": "Solo con fines educativos — no es asesoramiento financiero",
  },
};

const I18nContext = React.createContext({
  t: (key, vars) => {
    if (typeof key !== "string") return "";
    if (!vars) return key;
    return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)), key);
  },
  locale: "en-US",
});

const HelpContext = React.createContext({
  enabled: false,
  show: null,
  hide: null,
});

function useI18n() {
  return useContext(I18nContext);
}

function emptyWorkspace() {
  return {
    version: WORKSPACE_VERSION,
    watchlist: [],
    alerts: [],
    recent: [],
    comparisons: [],
    prefs: {
      period: "1y",
      interval: "1d",
      region: "Global",
      updatedAt: Date.now(),
    },
  };
}

function sanitizeWorkspace(data) {
  if (!data || typeof data !== "object") return emptyWorkspace();
  const base = emptyWorkspace();
  return {
    version: WORKSPACE_VERSION,
    watchlist: Array.isArray(data.watchlist) ? data.watchlist : base.watchlist,
    alerts: Array.isArray(data.alerts) ? data.alerts : base.alerts,
    recent: Array.isArray(data.recent) ? data.recent : base.recent,
    comparisons: Array.isArray(data.comparisons) ? data.comparisons : base.comparisons,
    prefs: {
      ...base.prefs,
      ...(data.prefs && typeof data.prefs === "object" ? data.prefs : {}),
    },
  };
}

function loadLocalWorkspace() {
  if (typeof window === "undefined") return emptyWorkspace();
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    return sanitizeWorkspace(JSON.parse(raw));
  } catch {
    return emptyWorkspace();
  }
}

function saveLocalWorkspace(data) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota or access errors
  }
}

function formatAgo(ts, t) {
  const fallback = (key, vars, fallbackValue) => {
    if (typeof t === "function") {
      const res = t(key, vars);
      if (res && res !== key) return res;
    }
    return fallbackValue;
  };
  if (!ts) return fallback("time.justNow", null, "just now");
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return fallback("time.secondsAgo", { count: sec }, `${sec}s ago`);
  const min = Math.floor(sec / 60);
  if (min < 60) return fallback("time.minutesAgo", { count: min }, `${min}m ago`);
  const hr = Math.floor(min / 60);
  if (hr < 24) return fallback("time.hoursAgo", { count: hr }, `${hr}h ago`);
  const day = Math.floor(hr / 24);
  return fallback("time.daysAgo", { count: day }, `${day}d ago`);
}

function normalizeEnumValue(value) {
  return String(value || "").toUpperCase().replace(/[\s-]+/g, "_");
}

function translateEnum(value, t, prefix) {
  if (!value) return "";
  const key = `${prefix}.${normalizeEnumValue(value)}`;
  const translated = typeof t === "function" ? t(key) : "";
  if (translated && translated !== key) return translated;
  return String(value).replace(/_/g, " ");
}

function formatShortDate(dateStr, locale) {
  if (!dateStr) return "";
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return dateStr;
  try {
    return new Intl.DateTimeFormat(locale || undefined, { month: "short", day: "numeric", year: "numeric" }).format(dt);
  } catch {
    return dt.toLocaleDateString();
  }
}

const LABEL_KEY_MAP = {
  Global: "region.global",
  US: "region.us",
  Europe: "region.europe",
  Asia: "region.asia",
  Cryptocurrencies: "assetSection.cryptocurrencies",
  Rates: "assetSection.rates",
  Commodities: "assetSection.commodities",
  Currencies: "assetSection.currencies",
  "S&P 500": "label.sp500",
  Nasdaq: "label.nasdaq",
  "Nasdaq 100": "label.nasdaq100",
  "Dow Jones": "label.dowJones",
  "Dow 30": "label.dow30",
  "Russell 2K": "label.russell2k",
  VIX: "label.vix",
  "10Y Yield": "label.tenYearYield",
  "FTSE 100": "label.ftse100",
  DAX: "label.dax",
  "Nikkei 225": "label.nikkei225",
  "Hang Seng": "label.hangSeng",
  "CAC 40": "label.cac40",
  "Euro Stoxx": "label.euroStoxx",
  Shanghai: "label.shanghai",
  KOSPI: "label.kospi",
  Taiwan: "label.taiwan",
  "EUR/USD": "label.eurUsd",
  "GBP/USD": "label.gbpUsd",
  "USD/JPY": "label.usdJpy",
  "USD/CNY": "label.usdCny",
  Bitcoin: "label.bitcoin",
  Ethereum: "label.ethereum",
  Solana: "label.solana",
  XRP: "label.xrp",
  Cardano: "label.cardano",
  Dogecoin: "label.dogecoin",
  Gold: "label.gold",
  Silver: "label.silver",
  "Crude Oil": "label.crudeOil",
  "Nat Gas": "label.natGas",
  Copper: "label.copper",
  Corn: "label.corn",
  DXY: "label.dxy",
  "AUD/USD": "label.audUsd",
  "US 10Y": "label.us10y",
  "US 30Y": "label.us30y",
  "US 5Y": "label.us5y",
  "US 3M": "label.us3m",
  Stocks: "label.stocks",
  Bonds: "label.bonds",
  Crypto: "label.crypto",
  Dollar: "label.dollar",
  Technology: "sector.technology",
  Financials: "sector.financials",
  Energy: "sector.energy",
  Healthcare: "sector.healthcare",
  Industrials: "sector.industrials",
  "Comm. Services": "sector.communication",
  Communication: "sector.communication",
  "Communication Services": "sector.communication",
  "Consumer Disc.": "sector.consumerDiscretionary",
  "Consumer Discretionary": "sector.consumerDiscretionary",
  "Consumer Staples": "sector.consumerStaples",
  "Real Estate": "sector.realEstate",
  Materials: "sector.materials",
  Utilities: "sector.utilities",
};

function labelFor(label, t) {
  if (!label) return "";
  const key = LABEL_KEY_MAP[label];
  const translated = key && typeof t === "function" ? t(key) : "";
  if (translated && translated !== key) return translated;
  return label;
}

function buildNewsPlaceholder(text) {
  const safe = encodeURIComponent(text || "");
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0%25' stop-color='%23EFE7DC'/><stop offset='100%25' stop-color='%23D7C8B4'/></linearGradient></defs><rect width='800' height='500' fill='url(%23g)'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Verdana' font-size='36' fill='%236B5E52'>${safe}</text></svg>`;
}

function getFirstNameFromUser(user) {
  const meta = user?.user_metadata || {};
  const raw = meta.first_name || meta.firstName || meta.name || meta.full_name || meta.fullName || "";
  if (!raw) return "";
  return String(raw).trim().split(/\s+/)[0];
}

function shortRegimeLabel(regime) {
  if (!regime) return "UNKNOWN";
  return String(regime).replace(/STRONG_/g, "").replace(/TRENDING_/g, "").replace(/_/g, " ");
}

function mergeUnique(primary, secondary, keyFn) {
  const seen = new Set();
  const merged = [];
  [...primary, ...secondary].forEach((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

function mergeWorkspaces(local, remote) {
  const a = sanitizeWorkspace(local);
  const b = sanitizeWorkspace(remote);
  const prefs = (a.prefs?.updatedAt || 0) >= (b.prefs?.updatedAt || 0) ? a.prefs : b.prefs;
  return {
    version: WORKSPACE_VERSION,
    watchlist: mergeUnique(a.watchlist, b.watchlist, (w) => w.ticker),
    alerts: mergeUnique(a.alerts, b.alerts, (al) => `${al.ticker}|${al.type}|${al.value}`),
    recent: mergeUnique(a.recent, b.recent, (r) => `${r.ticker}|${r.ts || r.timestamp || ""}`),
    comparisons: mergeUnique(a.comparisons, b.comparisons, (c) => c?.id || c?.key || JSON.stringify(c)),
    prefs,
  };
}

function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

function formatDateLabel(ts, interval) {
  const iso = new Date(ts * 1000).toISOString();
  const day = iso.slice(0, 10);
  if (interval && interval !== "1d") {
    return `${day} ${iso.slice(11, 16)}`;
  }
  return day;
}

function parseDateLabel(label) {
  if (!label) return null;
  if (label.includes("T")) return new Date(label);
  if (label.length === 10) return new Date(`${label}T00:00:00Z`);
  if (label.includes(" ")) return new Date(label.replace(" ", "T") + "Z");
  return new Date(label);
}

function applyLivePoint(data, livePrice, interval) {
  if (!data || !data.length || livePrice == null) return data || [];
  const ms = INTERVAL_MS[interval] || 0;
  if (!ms || ms >= INTERVAL_MS["1d"]) return data;
  const last = data[data.length - 1];
  const lastTime = parseDateLabel(last.date);
  if (!lastTime || Number.isNaN(lastTime.getTime())) return data;
  const now = Date.now();
  const bucket = Math.floor(now / ms) * ms;
  if (bucket <= lastTime.getTime()) return data;
  const label = formatDateLabel(Math.floor(bucket / 1000), interval);
  const open = last.Close;
  const high = Math.max(open, livePrice);
  const low = Math.min(open, livePrice);
  return [...data, { ...last, date: label, Open: open, High: high, Low: low, Close: livePrice }];
}

async function fetchStockData(ticker, period = "1y", interval = "1d") {
  const debug = { attempts: [], ticker, period, interval, timestamp: new Date().toISOString() };
  const t0 = performance.now();

  // Via local Express proxy (no CORS issues)
  try {
    const s = performance.now();
    const url = `/api/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}`;
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
    const json = await resp.json();
    const r = json?.chart?.result?.[0];
    if (!r?.timestamp || !r?.indicators?.quote?.[0]?.close) throw new Error("Bad response structure");
    const q = r.indicators.quote[0];
    const data = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const c = q.close[i], o = q.open[i], h = q.high[i], l = q.low[i], v = q.volume[i];
      if (c == null || o == null) continue;
      data.push({
        date: formatDateLabel(r.timestamp[i], interval),
        Open: +o.toFixed(2), High: +(h ?? Math.max(o, c)).toFixed(2),
        Low: +(l ?? Math.min(o, c)).toFixed(2), Close: +c.toFixed(2), Volume: v || 0,
      });
    }
    const minPoints = interval === "1d" ? 10 : 5;
    if (data.length < minPoints) throw new Error(`Only ${data.length} data points`);
    const lat = Math.round(performance.now() - s);
    debug.attempts.push({ source: "local-proxy", status: "success", latency: lat, points: data.length });
    return { data, source: "Yahoo Finance", latency: lat, debug, isLive: true };
  } catch (e) {
    debug.attempts.push({ source: "local-proxy", status: "failed", error: e.message });
  }

  // Fallback: CORS proxy (dev only)
  if (!import.meta.env.PROD) {
    try {
      const s = performance.now();
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}&includePrePost=false`;
      const resp = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`);
      if (!resp.ok) throw new Error(`CORS proxy HTTP ${resp.status}`);
      const json = await resp.json();
      const r = json?.chart?.result?.[0];
      if (!r?.timestamp || !r?.indicators?.quote?.[0]?.close) throw new Error("Bad response");
      const q = r.indicators.quote[0];
      const data = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        const c = q.close[i], o = q.open[i], h = q.high[i], l = q.low[i], v = q.volume[i];
        if (c == null || o == null) continue;
        data.push({
          date: formatDateLabel(r.timestamp[i], interval),
          Open: +o.toFixed(2), High: +(h ?? Math.max(o, c)).toFixed(2),
          Low: +(l ?? Math.min(o, c)).toFixed(2), Close: +c.toFixed(2), Volume: v || 0,
        });
      }
      const minPoints = interval === "1d" ? 10 : 5;
      if (data.length < minPoints) throw new Error(`Only ${data.length} data points`);
      const lat = Math.round(performance.now() - s);
      debug.attempts.push({ source: "cors-proxy", status: "success", latency: lat, points: data.length });
      return { data, source: "Yahoo Finance", latency: lat, debug, isLive: true };
    } catch (e) {
      debug.attempts.push({ source: "cors-proxy", status: "failed", error: e.message });
    }
  } else {
    debug.attempts.push({ source: "cors-proxy", status: "skipped", reason: "disabled in production" });
  }

  debug.totalTime = Math.round(performance.now() - t0);
  const err = new Error(`All data sources failed for ${ticker}`);
  err.debug = debug;
  throw err;
}

async function fetchQuickQuote(ticker) {
  const t0 = performance.now();
  apiCallCount++;
  const url = `/api/chart/${encodeURIComponent(ticker)}?range=1mo&interval=1d`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  lastApiLatency = Math.round(performance.now() - t0);
  const r = json?.chart?.result?.[0];
  if (!r?.meta) throw new Error("Bad response");
  const meta = r.meta;
  const closes = r.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
  const volumes = r.indicators?.quote?.[0]?.volume?.filter(v => v != null) || [];
  const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? (closes.length > 1 ? closes[closes.length - 2] : price);
  const change = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const volume = volumes[volumes.length - 1] || 0;
  return { ticker, price, change, changePct, volume, name: meta.shortName || meta.symbol || ticker, spark: closes.slice(-30), prevClose };
}

async function fetchIntradayData(ticker) {
  const t0 = performance.now();
  apiCallCount++;
  const url = `/api/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  lastApiLatency = Math.round(performance.now() - t0);
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error("Bad response");
  const q = r.indicators.quote[0];
  const prevClose = r.meta?.chartPreviousClose ?? r.meta?.previousClose ?? q.close?.[0] ?? 0;
  const points = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = q.close[i];
    if (c == null) continue;
    const d = new Date(r.timestamp[i] * 1000);
    points.push({ time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, price: +c.toFixed(2) });
  }
  const lastPrice = points.length ? points[points.length - 1].price : prevClose;
  return { points, prevClose, lastPrice, isUp: lastPrice >= prevClose };
}

async function fetchMarketMovers(universe) {
  const uni = universe || HEATMAP_UNIVERSE;
  const results = await Promise.allSettled(uni.map(s => fetchQuickQuote(s.ticker)));
  const quotes = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);
  const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
  const gainers = sorted.filter(s => s.changePct > 0);
  const losers = [...quotes].sort((a, b) => a.changePct - b.changePct).filter(s => s.changePct < 0);
  const mostActive = [...quotes].sort((a, b) => b.volume - a.volume);
  return { gainers, losers, mostActive };
}

async function fetchRSSNews() {
  try {
    const resp = await fetchWithTimeout("/api/rss");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (json.items && json.items.length > 0) return json.items.slice(0, 20);
    return FALLBACK_NEWS;
  } catch {
    return FALLBACK_NEWS;
  }
}

async function fetchTickerStrip(symbols) {
  const syms = symbols || TICKER_STRIP_SYMBOLS;
  const results = await Promise.allSettled(
    syms.map(s => fetchQuickQuote(s.symbol))
  );
  return syms.map((s, i) => {
    const r = results[i];
    if (r.status === "fulfilled") {
      return { ...s, price: r.value.price, change: r.value.change, changePct: r.value.changePct, loaded: true };
    }
    return { ...s, price: 0, change: 0, changePct: 0, loaded: false };
  });
}

async function fetchSearch(query) {
  if (!query || query.length < 1) return [];
  const resp = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`, {}, 5000);
  if (!resp.ok) return [];
  const json = await resp.json();
  return json.quotes || [];
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════
function calcReturns(d) {
  return d.map((v, i) => {
    if (i === 0) return { ...v, Returns: 0, LogReturns: 0 };
    const ret = (v.Close - d[i - 1].Close) / d[i - 1].Close;
    return { ...v, Returns: ret, LogReturns: Math.log(v.Close / d[i - 1].Close) };
  });
}

function calcSMA(c, w) {
  return c.map((_, i) => i < w - 1 ? null : c.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w);
}

function calcEMA(c, s) {
  const k = 2 / (s + 1), e = [c[0]];
  for (let i = 1; i < c.length; i++) e.push(c[i] * k + e[i - 1] * (1 - k));
  return e;
}

function calcRSI(c, p = 14) {
  const r = new Array(c.length).fill(null);
  for (let i = 1; i < c.length; i++) {
    if (i < p) continue;
    let g = 0, l = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const d = c[j] - c[j - 1];
      if (d > 0) g += d; else l -= d;
    }
    const ag = g / p, al = l / p;
    r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return r;
}

function calcMACD(c, f = 12, s = 26, sg = 9) {
  const ef = calcEMA(c, f), es = calcEMA(c, s);
  const m = ef.map((v, i) => v - es[i]), si = calcEMA(m, sg);
  return { macd: m, signal: si, histogram: m.map((v, i) => v - si[i]) };
}

function calcBB(c, p = 20, n = 2) {
  return c.map((_, i) => {
    if (i < p - 1) return { upper: null, middle: null, lower: null };
    const sl = c.slice(i - p + 1, i + 1);
    const m = sl.reduce((a, b) => a + b, 0) / p;
    const st = Math.sqrt(sl.reduce((a, v) => a + (v - m) ** 2, 0) / p);
    return { upper: m + n * st, middle: m, lower: m - n * st };
  });
}

function calcATR(d, p = 14) {
  const tr = d.map((v, i) => {
    if (i === 0) return v.High - v.Low;
    return Math.max(v.High - v.Low, Math.abs(v.High - d[i - 1].Close), Math.abs(v.Low - d[i - 1].Close));
  });
  return calcSMA(tr, p);
}

function calcStoch(d, kP = 14, dP = 3) {
  const k = d.map((_, i) => {
    if (i < kP - 1) return null;
    const sl = d.slice(i - kP + 1, i + 1);
    const lo = Math.min(...sl.map(x => x.Low)), hi = Math.max(...sl.map(x => x.High));
    return hi === lo ? 50 : 100 * (d[i].Close - lo) / (hi - lo);
  });
  return { k, d: calcSMA(k.map(v => v ?? 50), dP) };
}

function calcADX(d, p = 14) {
  const di = [], dm = [], adx = [];
  for (let i = 0; i < d.length; i++) {
    if (i < p) { di.push(null); dm.push(null); adx.push(null); continue; }
    let ts = 0, dp = 0, dn = 0;
    for (let j = i - p + 1; j <= i; j++) {
      ts += Math.max(d[j].High - d[j].Low, Math.abs(d[j].High - d[j - 1].Close), Math.abs(d[j].Low - d[j - 1].Close));
      const u = d[j].High - d[j - 1].High, dd = d[j - 1].Low - d[j].Low;
      dp += (u > dd && u > 0) ? u : 0;
      dn += (dd > u && dd > 0) ? dd : 0;
    }
    const dip = ts > 0 ? 100 * dp / ts : 0, dim = ts > 0 ? 100 * dn / ts : 0;
    di.push(dip); dm.push(dim);
    adx.push((dip + dim) > 0 ? 100 * Math.abs(dip - dim) / (dip + dim) : 0);
  }
  return { diPlus: di, diMinus: dm, adx };
}

function detectTrend(data, w = 50) {
  const c = data.map(d => d.Close), n = Math.min(w, c.length), r = c.slice(-n);
  const xm = (n - 1) / 2, ym = r.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - xm) * (r[i] - ym); den += (i - xm) ** 2; }
  const sl = den ? num / den : 0, ns = (sl / ym) * 100;
  const ssTot = r.reduce((a, v) => a + (v - ym) ** 2, 0);
  const ssRes = r.reduce((a, v, i) => a + (v - (sl * i + (ym - sl * xm))) ** 2, 0);
  const rSq = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const s20 = calcSMA(c, 20), s50 = calcSMA(c, 50);
  const ma = (s20[s20.length - 1] || 0) > (s50[s50.length - 1] || 0) ? "UPTREND" : "DOWNTREND";
  let dir = "SIDEWAYS";
  if (ns > 0.1 && ma === "UPTREND") dir = "UPTREND";
  else if (ns < -0.1 && ma === "DOWNTREND") dir = "DOWNTREND";
  return { direction: dir, strength: Math.min(100, Math.abs(ns) * 10 * rSq), slope: ns, rSquared: rSq, maAlignment: ma, confidence: rSq };
}

function classifyVol(data, w = 20) {
  const ret = data.map(d => d.Returns).filter(r => r !== undefined && r !== 0);
  if (ret.length < w + 2) return { current: 0, average: 0, ratio: 1, classification: "NORMAL" };
  const rc = ret.slice(-w), m0 = rc.reduce((a, b) => a + b, 0) / rc.length;
  const std = Math.sqrt(rc.reduce((a, v) => a + (v - m0) ** 2, 0) / rc.length);
  const cv = std * Math.sqrt(252) * 100;
  const all = [];
  for (let i = w; i <= ret.length; i++) {
    const s = ret.slice(i - w, i), m = s.reduce((a, b) => a + b, 0) / s.length;
    all.push(Math.sqrt(s.reduce((a, v) => a + (v - m) ** 2, 0) / s.length));
  }
  const av = all.length > 0 ? (all.reduce((a, b) => a + b, 0) / all.length) * Math.sqrt(252) * 100 : cv;
  const ratio = av > 0 ? cv / av : 1;
  let cls = "NORMAL";
  if (ratio > 1.5) cls = "HIGH"; else if (ratio > 1.2) cls = "ELEVATED"; else if (ratio < 0.8) cls = "LOW";
  return { current: cv, average: av, ratio, classification: cls };
}

function calcHurst(prices, ml = 20) {
  const lags = [], taus = [];
  for (let l = 2; l < Math.min(ml, prices.length); l++) {
    let s = 0, ct = 0;
    for (let i = l; i < prices.length; i++) { s += (prices[i] - prices[i - l]) ** 2; ct++; }
    if (ct > 0) { lags.push(Math.log(l)); taus.push(Math.log(Math.sqrt(s / ct))); }
  }
  if (lags.length < 2) return 0.5;
  const xm = lags.reduce((a, b) => a + b, 0) / lags.length;
  const ym = taus.reduce((a, b) => a + b, 0) / taus.length;
  let n = 0, d = 0;
  for (let i = 0; i < lags.length; i++) { n += (lags[i] - xm) * (taus[i] - ym); d += (lags[i] - xm) ** 2; }
  return d ? n / d : 0.5;
}

function detectRegime(data) {
  const trend = detectTrend(data), vol = classifyVol(data), hurst = calcHurst(data.map(d => d.Close));
  let overall;
  if (trend.strength > 60 && hurst > 0.55) overall = `STRONG_${trend.direction}`;
  else if (trend.strength > 40 && trend.direction !== "SIDEWAYS") overall = `TRENDING_${trend.direction}`;
  else if (hurst < 0.45 && ["LOW", "NORMAL"].includes(vol.classification)) overall = "MEAN_REVERTING";
  else if (vol.classification === "HIGH") overall = "HIGH_VOLATILITY";
  else if (trend.direction === "SIDEWAYS" && ["LOW", "NORMAL"].includes(vol.classification)) overall = "RANGING";
  else overall = "TRANSITIONING";
  return { trend, volatility: vol, hurst, overall };
}

function zscoreSignals(data, w = 20) {
  const c = data.map(d => d.Close), r = c.slice(-w), m = r.reduce((a, b) => a + b, 0) / r.length;
  const st = Math.sqrt(r.reduce((a, v) => a + (v - m) ** 2, 0) / r.length);
  const z = st > 0 ? (c[c.length - 1] - m) / st : 0;
  let sig = "NEUTRAL", p = 0.5;
  if (z > 2) { sig = "STRONG_SELL"; p = 0.95; } else if (z > 1) { sig = "SELL"; p = 0.68; }
  else if (z < -2) { sig = "STRONG_BUY"; p = 0.95; } else if (z < -1) { sig = "BUY"; p = 0.68; }
  return { signal: sig, zscore: z, probability: p, mean: m, std: st };
}

function momentumSignals(data) {
  const c = data.map(d => d.Close), cur = c[c.length - 1], sc = {};
  [5, 10, 20, 50].forEach(p => { if (c.length > p) sc[`${p}d`] = ((cur / c[c.length - 1 - p]) - 1) * 100; });
  const v = Object.values(sc), avg = v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  const ap = v.every(x => x > 0), an = v.every(x => x < 0);
  let sig = "NEUTRAL";
  if (ap && avg > 5) sig = "STRONG_BUY"; else if (avg > 2) sig = "BUY";
  else if (an && avg < -5) sig = "STRONG_SELL"; else if (avg < -2) sig = "SELL";
  return { signal: sig, avgMomentum: avg, byPeriod: sc, consistency: (ap || an) ? "HIGH" : "LOW" };
}

function volumeSignals(data, w = 20) {
  const vols = data.map(d => d.Volume), r = vols.slice(-w), m = r.reduce((a, b) => a + b, 0) / r.length;
  const st = Math.sqrt(r.reduce((a, v) => a + (v - m) ** 2, 0) / r.length);
  const z = st > 0 ? (vols[vols.length - 1] - m) / st : 0;
  const lr = data[data.length - 1].Returns || 0;
  let sig = "NEUTRAL";
  if (z > 2 && lr > 0) sig = "STRONG_BUY"; else if (z > 1 && lr > 0) sig = "BUY";
  else if (z > 2 && lr < 0) sig = "STRONG_SELL"; else if (z > 1 && lr < 0) sig = "SELL";
  return { signal: sig, volumeZscore: z, avgVolume: m, currentVolume: vols[vols.length - 1] };
}

function aggregateSignals(signals) {
  const map = { STRONG_BUY: 2, BUY: 1, NEUTRAL: 0, SELL: -1, STRONG_SELL: -2 };
  const wt = { zscore: 0.25, momentum: 0.30, volume: 0.25 };
  let total = 0;
  Object.entries(wt).forEach(([k, w]) => { if (signals[k]) total += (map[signals[k].signal] || 0) * w; });
  let sig = "NEUTRAL", conf = 0.5;
  if (total >= 1.5) { sig = "STRONG_BUY"; conf = Math.min(0.95, 0.5 + Math.abs(total) * 0.3); }
  else if (total >= 0.5) { sig = "BUY"; conf = Math.min(0.85, 0.5 + Math.abs(total) * 0.3); }
  else if (total <= -1.5) { sig = "STRONG_SELL"; conf = Math.min(0.95, 0.5 + Math.abs(total) * 0.3); }
  else if (total <= -0.5) { sig = "SELL"; conf = Math.min(0.85, 0.5 + Math.abs(total) * 0.3); }
  return { signal: sig, score: total, confidence: conf };
}

function calcRiskMetrics(data) {
  const ret = data.map(d => d.Returns).filter(r => r !== undefined && r !== 0);
  if (ret.length < 5) return { volatility: 0, sharpe: 0, sortino: 0, maxDrawdown: 0, var95: 0, cvar95: 0, riskLevel: "LOW" };
  const m = ret.reduce((a, b) => a + b, 0) / ret.length;
  const std = Math.sqrt(ret.reduce((a, v) => a + (v - m) ** 2, 0) / ret.length);
  const vol = std * Math.sqrt(252) * 100, annRet = m * 252;
  const sharpe = std > 0 ? (annRet - 0.02) / (std * Math.sqrt(252)) : 0;
  const ds = ret.filter(r => r < 0);
  const dsStd = ds.length > 0 ? Math.sqrt(ds.reduce((a, v) => a + v ** 2, 0) / ds.length) * Math.sqrt(252) : 0;
  const sortino = dsStd > 0 ? (annRet - 0.02) / dsStd : 0;
  let maxDD = 0, peak = 1, cum = 1;
  ret.forEach(r => { cum *= (1 + r); if (cum > peak) peak = cum; const dd = (cum - peak) / peak; if (dd < maxDD) maxDD = dd; });
  const sorted = [...ret].sort((a, b) => a - b);
  const idx5 = Math.floor(sorted.length * 0.05);
  const var95 = sorted[idx5] * 100;
  const cvSlice = sorted.slice(0, idx5);
  const cvar95 = cvSlice.length > 0 ? (cvSlice.reduce((a, b) => a + b, 0) / cvSlice.length) * 100 : var95;
  let riskLevel = "LOW";
  if (vol > 40 || maxDD < -0.30) riskLevel = "HIGH";
  else if (vol > 25 || maxDD < -0.20) riskLevel = "MEDIUM";
  return { volatility: vol, sharpe, sortino, maxDrawdown: maxDD * 100, var95, cvar95, riskLevel };
}

function generateRecommendation(tech, regime, stat, risk, valuationModels) {
  const sm = { STRONG_BUY: 2, BUY: 1, OVERSOLD: 1, NEUTRAL: 0, SELL: -1, STRONG_SELL: -2, OVERBOUGHT: -1, BULLISH: 1, BEARISH: -1 };
  let ts = 0; Object.values(tech).forEach(s => { ts += sm[s] || 0; });
  const ss = sm[stat.aggregate?.signal] || 0;
  let rs = 0;
  if (regime.overall.includes("UPTREND")) rs = regime.overall.includes("STRONG") ? 1 : 0.5;
  else if (regime.overall.includes("DOWNTREND")) rs = regime.overall.includes("STRONG") ? -1 : -0.5;
  const valuationBias = valuationModels?.signal === "UNDERVALUED" ? 1 : valuationModels?.signal === "OVERVALUED" ? -1 : 0;
  let fs = ts * 0.3 + ss * 0.35 + rs * 0.25 + valuationBias * 0.1;
  if (risk.riskLevel === "HIGH") fs *= 0.7;
  let action = "HOLD", conf = 0.5;
  if (fs >= 1.2) { action = "STRONG BUY"; conf = Math.min(0.90, 0.6 + Math.abs(fs) * 0.15); }
  else if (fs >= 0.4) { action = "BUY"; conf = Math.min(0.75, 0.5 + Math.abs(fs) * 0.15); }
  else if (fs <= -1.2) { action = "STRONG SELL"; conf = Math.min(0.90, 0.6 + Math.abs(fs) * 0.15); }
  else if (fs <= -0.4) { action = "SELL"; conf = Math.min(0.75, 0.5 + Math.abs(fs) * 0.15); }
  return { action, confidence: conf, score: fs, components: { technical: ts, statistical: ss, regime: rs, valuation: valuationBias } };
}

function calcValuation(data) {
  const closes = data.map(d => d.Close), last = closes[closes.length - 1];
  const sma200 = calcSMA(closes, 200), sma50 = calcSMA(closes, 50);
  const sma200Val = sma200[sma200.length - 1], sma50Val = sma50[sma50.length - 1];
  const devSma200 = sma200Val ? ((last - sma200Val) / sma200Val) * 100 : 0;
  const devSma50 = sma50Val ? ((last - sma50Val) / sma50Val) * 100 : 0;
  const bb = calcBB(closes), lastBB = bb[bb.length - 1];
  const pctB = lastBB.upper && lastBB.lower ? (last - lastBB.lower) / (lastBB.upper - lastBB.lower) : 0.5;
  const rsi = calcRSI(closes), lastRSI = rsi[rsi.length - 1] || 50;
  const high52 = Math.max(...closes.slice(-252)), low52 = Math.min(...closes.slice(-252));
  const range52Pct = high52 !== low52 ? (last - low52) / (high52 - low52) * 100 : 50;
  let stretch = 0;
  stretch += Math.max(-50, Math.min(50, devSma200)) + 50;
  stretch += Math.max(-50, Math.min(50, devSma50 * 1.5)) + 50;
  stretch += pctB * 100;
  stretch += (lastRSI / 100) * 100;
  stretch += range52Pct;
  stretch = stretch / 5;
  let verdict = "FAIRLY VALUED";
  if (stretch > 80) verdict = "SIGNIFICANTLY OVERVALUED";
  else if (stretch > 65) verdict = "OVERVALUED";
  else if (stretch > 55) verdict = "SLIGHTLY OVERVALUED";
  else if (stretch < 20) verdict = "SIGNIFICANTLY UNDERVALUED";
  else if (stretch < 35) verdict = "UNDERVALUED";
  else if (stretch < 45) verdict = "SLIGHTLY UNDERVALUED";
  const fairValue = sma200Val || sma50Val || last;
  return { stretch, verdict, devSma200, devSma50, pctB, rsi: lastRSI, range52Pct, high52, low52, fairValue, sma200: sma200Val, sma50: sma50Val };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function seededRange(seed, salt, min, max) {
  return min + (max - min) * seededRandom(seed + salt * 999);
}

function calcFundamentals(ticker, price) {
  const seed = hashCode(ticker || "UNKNOWN");
  const px = price || 100;
  const shares = seededRange(seed, 1, 0.4, 5.0) * 1e9;
  const marketCap = px * shares;
  const ps = seededRange(seed, 2, 1.5, 8);
  const revenue = marketCap / ps;
  const grossMargin = seededRange(seed, 3, 0.3, 0.7);
  const opMargin = clamp(grossMargin * seededRange(seed, 4, 0.35, 0.7), 0.08, grossMargin - 0.05);
  const netMargin = clamp(opMargin * seededRange(seed, 5, 0.6, 0.85), 0.03, opMargin - 0.01);
  const fcfMargin = clamp(opMargin * seededRange(seed, 6, 0.6, 0.95), 0.02, 0.35);
  const revenueGrowth = seededRange(seed, 7, -0.05, 0.18);
  const debtToEquity = seededRange(seed, 8, 0.0, 1.6);
  const equity = marketCap * seededRange(seed, 9, 0.35, 0.8);
  const debt = equity * debtToEquity;
  const cash = revenue * seededRange(seed, 10, 0.04, 0.25);
  const capex = revenue * seededRange(seed, 11, 0.03, 0.08);
  const netIncome = revenue * netMargin;
  const fcf = revenue * fcfMargin;
  const eps = netIncome / shares;
  const fcfPerShare = fcf / shares;
  const dividendYield = seededRange(seed, 12, 0.0, 0.035);
  const dividendPerShare = px * dividendYield;
  const roe = seededRange(seed, 13, 0.08, 0.35);
  const roa = seededRange(seed, 14, 0.03, 0.18);
  const currentRatio = seededRange(seed, 15, 0.9, 2.5);

  const base = {
    revenue, netIncome, fcf, grossMargin, opMargin, netMargin, fcfMargin,
    capex, cash, debt, eps, fcfPerShare, dividendPerShare, roe, roa, currentRatio,
  };

  const periods = ["LTM", "FY2023", "FY2022"].map((label, idx) => {
    const scale = 1 / Math.pow(1 + revenueGrowth, idx);
    const drift = 1 + seededRange(seed, 20 + idx, -0.03, 0.03);
    const rev = revenue * scale * drift;
    const gMargin = clamp(grossMargin * (1 + seededRange(seed, 30 + idx, -0.02, 0.02)), 0.2, 0.8);
    const oMargin = clamp(opMargin * (1 + seededRange(seed, 40 + idx, -0.03, 0.03)), 0.05, gMargin - 0.04);
    const nMargin = clamp(netMargin * (1 + seededRange(seed, 50 + idx, -0.03, 0.03)), 0.02, oMargin - 0.01);
    const fMargin = clamp(fcfMargin * (1 + seededRange(seed, 60 + idx, -0.04, 0.04)), 0.02, 0.35);
    return {
      label,
      revenue: rev,
      netIncome: rev * nMargin,
      fcf: rev * fMargin,
      grossMargin: gMargin,
      opMargin: oMargin,
      netMargin: nMargin,
      fcfMargin: fMargin,
    };
  });

  return {
    source: "Modeled",
    currency: "USD",
    shares,
    marketCap,
    revenueGrowth,
    debtToEquity,
    equity,
    cash,
    debt,
    periods,
    ratios: { grossMargin, opMargin, netMargin, fcfMargin, roe, roa, currentRatio },
    perShare: { eps, fcfPerShare, dividendPerShare },
    base,
  };
}

function buildValuationAssumptions(fundamentals, price, risk) {
  const g = clamp(fundamentals?.revenueGrowth ?? 0.06, -0.02, 0.12);
  const volAdj = risk?.volatility ? Math.min(0.04, risk.volatility / 250) : 0.01;
  const discount = clamp(0.08 + volAdj, 0.07, 0.14);
  const terminalGrowth = clamp(Math.min(0.03, g * 0.5), 0.01, 0.03);
  const targetPE = clamp(12 + g * 100 * 0.8, 10, 28);
  return {
    fcfPerShare: fundamentals?.perShare?.fcfPerShare ?? (price ? price * 0.04 : 3),
    dividendPerShare: fundamentals?.perShare?.dividendPerShare ?? (price ? price * 0.015 : 1),
    eps: fundamentals?.perShare?.eps ?? (price ? price / 20 : 5),
    growthRate: g,
    discountRate: discount,
    terminalGrowth,
    targetPE,
    years: 5,
  };
}

function dcfValue(fcfPerShare, growthRate, discountRate, terminalGrowth, years) {
  if (!fcfPerShare || years <= 0) return null;
  if (discountRate <= terminalGrowth) return null;
  let pv = 0;
  for (let i = 1; i <= years; i++) {
    const cf = fcfPerShare * Math.pow(1 + growthRate, i);
    pv += cf / Math.pow(1 + discountRate, i);
  }
  const terminal = (fcfPerShare * Math.pow(1 + growthRate, years) * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  pv += terminal / Math.pow(1 + discountRate, years);
  return pv;
}

function ddmValue(dividendPerShare, growthRate, discountRate) {
  if (!dividendPerShare) return null;
  if (discountRate <= growthRate) return null;
  return dividendPerShare * (1 + growthRate) / (discountRate - growthRate);
}

function runValuationModels(assumptions, price) {
  if (!assumptions) {
    return { dcf: null, ddm: null, multiples: null, anchor: null, upside: null, signal: "FAIRLY VALUED", issues: [], assumptions: null };
  }
  const a = assumptions;
  const issues = [];
  const dcf = dcfValue(a.fcfPerShare, a.growthRate, a.discountRate, a.terminalGrowth, a.years);
  if (a.discountRate <= a.terminalGrowth) issues.push("valuation.issueDiscountTerminal");
  const ddmGrowth = Math.min(a.growthRate, 0.06);
  const ddm = a.dividendPerShare > 0 ? ddmValue(a.dividendPerShare, ddmGrowth, a.discountRate) : null;
  if (a.dividendPerShare > 0 && a.discountRate <= ddmGrowth) issues.push("valuation.issueDiscountDividend");
  const multiples = a.eps && a.targetPE ? a.eps * a.targetPE : null;
  const vals = [dcf, ddm, multiples].filter(v => Number.isFinite(v) && v > 0);
  const anchor = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  const upside = anchor && price ? (anchor / price - 1) : null;
  let signal = "FAIRLY VALUED";
  if (upside != null) {
    if (upside > 0.15) signal = "UNDERVALUED";
    else if (upside < -0.15) signal = "OVERVALUED";
  }
  return { dcf, ddm, multiples, anchor, upside, signal, issues, assumptions: a };
}

function runAnalysis(ticker, rawData) {
  let raw = calcReturns(rawData);
  const closes = raw.map(d => d.Close);
  const rsi = calcRSI(closes), macdD = calcMACD(closes), bb = calcBB(closes);
  const atr = calcATR(raw), stoch = calcStoch(raw), adxD = calcADX(raw);
  const sma20 = calcSMA(closes, 20), sma50 = calcSMA(closes, 50), sma200 = calcSMA(closes, 200);
  const enriched = raw.map((d, i) => ({
    ...d, RSI: rsi[i], MACD: macdD.macd[i], MACD_Signal: macdD.signal[i], MACD_Hist: macdD.histogram[i],
    BB_Upper: bb[i].upper, BB_Middle: bb[i].middle, BB_Lower: bb[i].lower, ATR: atr[i],
    Stoch_K: stoch.k[i], Stoch_D: stoch.d[i], ADX: adxD.adx[i],
    SMA_20: sma20[i], SMA_50: sma50[i], SMA_200: sma200[i],
  }));
  const last = enriched[enriched.length - 1];
  const techSignals = {};
  if (last.RSI != null) techSignals.RSI = last.RSI < 30 ? "OVERSOLD" : last.RSI > 70 ? "OVERBOUGHT" : "NEUTRAL";
  if (last.MACD != null) techSignals.MACD = last.MACD > last.MACD_Signal ? "BULLISH" : "BEARISH";
  if (last.BB_Upper != null) techSignals.Bollinger = last.Close > last.BB_Upper ? "OVERBOUGHT" : last.Close < last.BB_Lower ? "OVERSOLD" : "NEUTRAL";
  if (last.ADX != null) techSignals.ADX = last.ADX > 25 ? "STRONG" : last.ADX > 20 ? "MODERATE" : "WEAK";
  const regime = detectRegime(enriched);
  const zs = zscoreSignals(enriched), mom = momentumSignals(enriched), vol = volumeSignals(enriched);
  const agg = aggregateSignals({ zscore: zs, momentum: mom, volume: vol });
  const statSignals = { zscore: zs, momentum: mom, volume: vol, aggregate: agg };
  const risk = calcRiskMetrics(enriched);
  const cp = last.Close;
  const valuation = calcValuation(enriched);
  const fundamentals = calcFundamentals(ticker, cp);
  const valuationAssumptions = buildValuationAssumptions(fundamentals, cp, risk);
  const valuationModels = runValuationModels(valuationAssumptions, cp);
  const rec = generateRecommendation(techSignals, regime, statSignals, risk, valuationModels);
  const atrVal = last.ATR || cp * 0.02;
  let target = null, stopLoss = null;
  if (rec.action.includes("BUY")) { target = cp + atrVal * (regime.overall.includes("STRONG") ? 3 : 2); stopLoss = cp - atrVal * (regime.overall.includes("STRONG") ? 1.5 : 1); }
  else if (rec.action.includes("SELL")) { target = cp - atrVal * 2; stopLoss = cp + atrVal; }
  return { ticker, data: enriched, currentPrice: cp, recommendation: rec, techSignals, regime, statSignals, risk, target, stopLoss, valuation, fundamentals, valuationModels };
}

const STRATEGIES = {
  STRONG_UPTREND: {
    strategy: "strategy.name.STRONG_UPTREND",
    tactics: ["strategy.tactic.buyBreakouts", "strategy.tactic.holdPositions", "strategy.tactic.trailStops"],
    avoid: ["strategy.avoid.counterTrendTrades"],
  },
  STRONG_DOWNTREND: {
    strategy: "strategy.name.STRONG_DOWNTREND",
    tactics: ["strategy.tactic.shortBreakdowns", "strategy.tactic.tightStops", "strategy.tactic.capitalPreservation"],
    avoid: ["strategy.avoid.catchingFallingKnives"],
  },
  TRENDING_UPTREND: {
    strategy: "strategy.name.TRENDING_UPTREND",
    tactics: ["strategy.tactic.buyDips", "strategy.tactic.partialPositions", "strategy.tactic.takeProfits"],
    avoid: ["strategy.avoid.overextension"],
  },
  TRENDING_DOWNTREND: {
    strategy: "strategy.name.TRENDING_DOWNTREND",
    tactics: ["strategy.tactic.reduceExposure", "strategy.tactic.hedgePositions"],
    avoid: ["strategy.avoid.aggressiveLongs"],
  },
  MEAN_REVERTING: {
    strategy: "strategy.name.MEAN_REVERTING",
    tactics: ["strategy.tactic.buyOversold", "strategy.tactic.sellOverbought", "strategy.tactic.rangeTrade"],
    avoid: ["strategy.avoid.chasingMomentum"],
  },
  RANGING: {
    strategy: "strategy.name.RANGING",
    tactics: ["strategy.tactic.supportResistance", "strategy.tactic.oscillatorBased"],
    avoid: ["strategy.avoid.trendFollowing"],
  },
  HIGH_VOLATILITY: {
    strategy: "strategy.name.HIGH_VOLATILITY",
    tactics: ["strategy.tactic.widerStops", "strategy.tactic.optionsStrategies"],
    avoid: ["strategy.avoid.fullPositions"],
  },
  TRANSITIONING: {
    strategy: "strategy.name.TRANSITIONING",
    tactics: ["strategy.tactic.smallPositions", "strategy.tactic.watchConfirmation"],
    avoid: ["strategy.avoid.largeCommitments"],
  },
};

const HEATMAP_UNIVERSE = [
  { ticker: "AAPL", name: "Apple", cap: 3800 }, { ticker: "MSFT", name: "Microsoft", cap: 3200 },
  { ticker: "NVDA", name: "NVIDIA", cap: 3100 }, { ticker: "GOOGL", name: "Alphabet", cap: 2300 },
  { ticker: "AMZN", name: "Amazon", cap: 2200 }, { ticker: "META", name: "Meta", cap: 1600 },
  { ticker: "TSLA", name: "Tesla", cap: 1200 }, { ticker: "BRK-B", name: "Berkshire", cap: 1000 },
  { ticker: "LLY", name: "Eli Lilly", cap: 780 }, { ticker: "V", name: "Visa", cap: 600 },
  { ticker: "JPM", name: "JPMorgan", cap: 580 }, { ticker: "WMT", name: "Walmart", cap: 550 },
  { ticker: "UNH", name: "UnitedHealth", cap: 520 }, { ticker: "XOM", name: "ExxonMobil", cap: 480 },
  { ticker: "NFLX", name: "Netflix", cap: 380 }, { ticker: "AMD", name: "AMD", cap: 280 },
  { ticker: "CRM", name: "Salesforce", cap: 260 }, { ticker: "COST", name: "Costco", cap: 380 },
  { ticker: "ADBE", name: "Adobe", cap: 220 }, { ticker: "PEP", name: "PepsiCo", cap: 210 },
];

const SECTOR_COLORS = {
  Technology: "#4A90D9", "Consumer Discretionary": "#E8913A", Healthcare: "#50B87A",
  Financials: "#8B6BB5", Energy: "#D4534E", "Consumer Staples": "#6DBFB8",
  Industrials: "#7A8B99", Communication: "#E06B9F", Materials: "#B8A038",
  "Real Estate": "#5C9EAD", Utilities: "#8FAA6E",
};

const HEATMAP_INDEXES = {
  "S&P 500": [
    { ticker: "AAPL", name: "Apple", cap: 3800, sector: "Technology" },
    { ticker: "MSFT", name: "Microsoft", cap: 3200, sector: "Technology" },
    { ticker: "NVDA", name: "NVIDIA", cap: 3100, sector: "Technology" },
    { ticker: "GOOGL", name: "Alphabet", cap: 2300, sector: "Technology" },
    { ticker: "META", name: "Meta", cap: 1600, sector: "Technology" },
    { ticker: "AMD", name: "AMD", cap: 280, sector: "Technology" },
    { ticker: "CRM", name: "Salesforce", cap: 260, sector: "Technology" },
    { ticker: "ADBE", name: "Adobe", cap: 220, sector: "Technology" },
    { ticker: "AMZN", name: "Amazon", cap: 2200, sector: "Consumer Discretionary" },
    { ticker: "TSLA", name: "Tesla", cap: 1200, sector: "Consumer Discretionary" },
    { ticker: "NFLX", name: "Netflix", cap: 380, sector: "Consumer Discretionary" },
    { ticker: "COST", name: "Costco", cap: 380, sector: "Consumer Staples" },
    { ticker: "WMT", name: "Walmart", cap: 550, sector: "Consumer Staples" },
    { ticker: "PEP", name: "PepsiCo", cap: 210, sector: "Consumer Staples" },
    { ticker: "BRK-B", name: "Berkshire", cap: 1000, sector: "Financials" },
    { ticker: "JPM", name: "JPMorgan", cap: 580, sector: "Financials" },
    { ticker: "V", name: "Visa", cap: 600, sector: "Financials" },
    { ticker: "GS", name: "Goldman Sachs", cap: 180, sector: "Financials" },
    { ticker: "LLY", name: "Eli Lilly", cap: 780, sector: "Healthcare" },
    { ticker: "UNH", name: "UnitedHealth", cap: 520, sector: "Healthcare" },
    { ticker: "JNJ", name: "Johnson & Johnson", cap: 380, sector: "Healthcare" },
    { ticker: "XOM", name: "ExxonMobil", cap: 480, sector: "Energy" },
    { ticker: "CVX", name: "Chevron", cap: 280, sector: "Energy" },
    { ticker: "CAT", name: "Caterpillar", cap: 180, sector: "Industrials" },
    { ticker: "UPS", name: "UPS", cap: 110, sector: "Industrials" },
  ],
  "Nasdaq 100": [
    { ticker: "AAPL", name: "Apple", cap: 3800, sector: "Technology" },
    { ticker: "MSFT", name: "Microsoft", cap: 3200, sector: "Technology" },
    { ticker: "NVDA", name: "NVIDIA", cap: 3100, sector: "Technology" },
    { ticker: "GOOGL", name: "Alphabet", cap: 2300, sector: "Technology" },
    { ticker: "META", name: "Meta", cap: 1600, sector: "Technology" },
    { ticker: "AMD", name: "AMD", cap: 280, sector: "Technology" },
    { ticker: "CRM", name: "Salesforce", cap: 260, sector: "Technology" },
    { ticker: "ADBE", name: "Adobe", cap: 220, sector: "Technology" },
    { ticker: "INTC", name: "Intel", cap: 120, sector: "Technology" },
    { ticker: "AMZN", name: "Amazon", cap: 2200, sector: "Consumer Discretionary" },
    { ticker: "TSLA", name: "Tesla", cap: 1200, sector: "Consumer Discretionary" },
    { ticker: "NFLX", name: "Netflix", cap: 380, sector: "Consumer Discretionary" },
    { ticker: "COST", name: "Costco", cap: 380, sector: "Consumer Staples" },
    { ticker: "PEP", name: "PepsiCo", cap: 210, sector: "Consumer Staples" },
    { ticker: "LLY", name: "Eli Lilly", cap: 780, sector: "Healthcare" },
    { ticker: "AMGN", name: "Amgen", cap: 150, sector: "Healthcare" },
    { ticker: "GILD", name: "Gilead", cap: 100, sector: "Healthcare" },
  ],
  "Dow 30": [
    { ticker: "AAPL", name: "Apple", cap: 3800, sector: "Technology" },
    { ticker: "MSFT", name: "Microsoft", cap: 3200, sector: "Technology" },
    { ticker: "CRM", name: "Salesforce", cap: 260, sector: "Technology" },
    { ticker: "AMZN", name: "Amazon", cap: 2200, sector: "Consumer Discretionary" },
    { ticker: "WMT", name: "Walmart", cap: 550, sector: "Consumer Staples" },
    { ticker: "JPM", name: "JPMorgan", cap: 580, sector: "Financials" },
    { ticker: "V", name: "Visa", cap: 600, sector: "Financials" },
    { ticker: "GS", name: "Goldman Sachs", cap: 180, sector: "Financials" },
    { ticker: "UNH", name: "UnitedHealth", cap: 520, sector: "Healthcare" },
    { ticker: "JNJ", name: "Johnson & Johnson", cap: 380, sector: "Healthcare" },
    { ticker: "XOM", name: "ExxonMobil", cap: 480, sector: "Energy" },
    { ticker: "CVX", name: "Chevron", cap: 280, sector: "Energy" },
    { ticker: "CAT", name: "Caterpillar", cap: 180, sector: "Industrials" },
    { ticker: "BA", name: "Boeing", cap: 130, sector: "Industrials" },
    { ticker: "DIS", name: "Disney", cap: 170, sector: "Communication" },
  ],
};

const TICKER_STRIP_SYMBOLS = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^RUT", label: "Russell 2K" },
  { symbol: "^VIX", label: "VIX" },
  { symbol: "^TNX", label: "10Y Yield" },
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "CL=F", label: "Crude Oil" },
];

const MARKET_REGIONS = {
  Global: {
    strip: [
      { symbol: "^GSPC", label: "S&P 500" }, { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^DJI", label: "Dow Jones" }, { symbol: "^RUT", label: "Russell 2K" },
      { symbol: "^VIX", label: "VIX" }, { symbol: "^TNX", label: "10Y Yield" },
      { symbol: "BTC-USD", label: "Bitcoin" }, { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
    charts: [
      { symbol: "^GSPC", label: "S&P 500" }, { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^FTSE", label: "FTSE 100" }, { symbol: "^GDAXI", label: "DAX" },
      { symbol: "^N225", label: "Nikkei 225" }, { symbol: "^HSI", label: "Hang Seng" },
    ],
  },
  US: {
    strip: [
      { symbol: "^GSPC", label: "S&P 500" }, { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^DJI", label: "Dow Jones" }, { symbol: "^RUT", label: "Russell 2K" },
      { symbol: "^VIX", label: "VIX" }, { symbol: "^TNX", label: "10Y Yield" },
      { symbol: "BTC-USD", label: "Bitcoin" }, { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
    charts: [{ symbol: "^GSPC", label: "S&P 500" }, { symbol: "^IXIC", label: "Nasdaq" }],
  },
  Europe: {
    strip: [
      { symbol: "^FTSE", label: "FTSE 100" }, { symbol: "^GDAXI", label: "DAX" },
      { symbol: "^FCHI", label: "CAC 40" }, { symbol: "^STOXX50E", label: "Euro Stoxx" },
      { symbol: "EURUSD=X", label: "EUR/USD" }, { symbol: "GBPUSD=X", label: "GBP/USD" },
      { symbol: "^TNX", label: "10Y Yield" }, { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
    charts: [{ symbol: "^FTSE", label: "FTSE 100" }, { symbol: "^GDAXI", label: "DAX" }],
  },
  Asia: {
    strip: [
      { symbol: "^N225", label: "Nikkei 225" }, { symbol: "^HSI", label: "Hang Seng" },
      { symbol: "000001.SS", label: "Shanghai" }, { symbol: "^KS11", label: "KOSPI" },
      { symbol: "^TWII", label: "Taiwan" }, { symbol: "USDJPY=X", label: "USD/JPY" },
      { symbol: "USDCNY=X", label: "USD/CNY" }, { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
    charts: [{ symbol: "^N225", label: "Nikkei 225" }, { symbol: "^HSI", label: "Hang Seng" }],
  },
};

const REGION_MOVERS = {
  Global: HEATMAP_UNIVERSE,
  US: HEATMAP_UNIVERSE,
  Europe: [
    { ticker: "SHEL", name: "Shell", cap: 200 }, { ticker: "ASML", name: "ASML", cap: 300 },
    { ticker: "SAP", name: "SAP", cap: 250 }, { ticker: "AZN", name: "AstraZeneca", cap: 220 },
    { ticker: "NVS", name: "Novartis", cap: 210 }, { ticker: "TTE", name: "TotalEnergies", cap: 140 },
    { ticker: "SAN", name: "Sanofi", cap: 130 }, { ticker: "DEO", name: "Diageo", cap: 80 },
    { ticker: "UL", name: "Unilever", cap: 120 }, { ticker: "GSK", name: "GSK", cap: 90 },
    { ticker: "RIO", name: "Rio Tinto", cap: 100 }, { ticker: "BTI", name: "BAT", cap: 75 },
  ],
  Asia: [
    { ticker: "TSM", name: "TSMC", cap: 700 }, { ticker: "BABA", name: "Alibaba", cap: 200 },
    { ticker: "TM", name: "Toyota", cap: 250 }, { ticker: "SONY", name: "Sony", cap: 120 },
    { ticker: "HDB", name: "HDFC Bank", cap: 100 }, { ticker: "MUFG", name: "MUFG", cap: 90 },
    { ticker: "PDD", name: "PDD Holdings", cap: 130 }, { ticker: "JD", name: "JD.com", cap: 50 },
    { ticker: "NIO", name: "NIO", cap: 15 }, { ticker: "INFY", name: "Infosys", cap: 70 },
    { ticker: "KB", name: "KB Financial", cap: 25 }, { ticker: "LI", name: "Li Auto", cap: 20 },
  ],
};

const ASSET_SECTIONS = [
  { title: "Cryptocurrencies", symbols: [
    { symbol: "BTC-USD", label: "Bitcoin" }, { symbol: "ETH-USD", label: "Ethereum" },
    { symbol: "SOL-USD", label: "Solana" }, { symbol: "XRP-USD", label: "XRP" },
    { symbol: "ADA-USD", label: "Cardano" }, { symbol: "DOGE-USD", label: "Dogecoin" },
  ]},
  { title: "Rates", symbols: [
    { symbol: "^TNX", label: "US 10Y" }, { symbol: "^TYX", label: "US 30Y" },
    { symbol: "^FVX", label: "US 5Y" }, { symbol: "^IRX", label: "US 3M" },
  ]},
  { title: "Commodities", symbols: [
    { symbol: "GC=F", label: "Gold" }, { symbol: "SI=F", label: "Silver" },
    { symbol: "CL=F", label: "Crude Oil" }, { symbol: "NG=F", label: "Nat Gas" },
    { symbol: "HG=F", label: "Copper" }, { symbol: "ZC=F", label: "Corn" },
  ]},
  { title: "Currencies", symbols: [
    { symbol: "EURUSD=X", label: "EUR/USD" }, { symbol: "GBPUSD=X", label: "GBP/USD" },
    { symbol: "USDJPY=X", label: "USD/JPY" }, { symbol: "USDCNY=X", label: "USD/CNY" },
    { symbol: "DX-Y.NYB", label: "DXY" }, { symbol: "AUDUSD=X", label: "AUD/USD" },
  ]},
];

const DEFAULT_TRENDING = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "META", name: "Meta" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "NFLX", name: "Netflix" },
];

const FALLBACK_NEWS = [
  { titleKey: "news.fallback.0.title", sourceKey: "news.fallback.0.source", pubDate: "", descriptionKey: "news.fallback.0.desc" },
  { titleKey: "news.fallback.1.title", sourceKey: "news.fallback.1.source", pubDate: "", descriptionKey: "news.fallback.1.desc" },
  { titleKey: "news.fallback.2.title", sourceKey: "news.fallback.2.source", pubDate: "", descriptionKey: "news.fallback.2.desc" },
  { titleKey: "news.fallback.3.title", sourceKey: "news.fallback.3.source", pubDate: "", descriptionKey: "news.fallback.3.desc" },
];

const NEWS_PLACEHOLDER_IMAGE = buildNewsPlaceholder("Market News");


const SCORECARD_INDICATORS = [
  { symbol: "^VIX", label: "VIX" },
  { symbol: "^TNX", label: "10Y Yield" },
  { symbol: "DX-Y.NYB", label: "Dollar (DXY)" },
  { symbol: "GC=F", label: "Gold" },
];

const CROSS_ASSET_SYMBOLS = [
  { symbol: "SPY", label: "Stocks" },
  { symbol: "TLT", label: "Bonds" },
  { symbol: "GLD", label: "Gold" },
  { symbol: "BTC-USD", label: "Crypto" },
  { symbol: "UUP", label: "Dollar" },
];

const SECTOR_ETFS = [
  { symbol: "XLK", label: "Technology" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLV", label: "Healthcare" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLC", label: "Comm. Services" },
  { symbol: "XLY", label: "Consumer Disc." },
  { symbol: "XLP", label: "Consumer Staples" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLB", label: "Materials" },
];

const YIELD_CURVE_TENORS = [
  { symbol: "^IRX", label: "3M", maturity: 0.25 },
  { symbol: "^FVX", label: "5Y", maturity: 5 },
  { symbol: "^TNX", label: "10Y", maturity: 10 },
  { symbol: "^TYX", label: "30Y", maturity: 30 },
];

const PORTFOLIO_TILE = {
  value: 248300,
  dayChangePct: 1.12,
  ytdPct: 8.6,
  cash: 12400,
  risk: "MODERATE",
  top: ["AAPL", "NVDA", "MSFT", "AMZN", "META"],
};

const CHANGELOG = [
  {
    version: "0.3.12",
    date: "2026-02-08",
    items: [
      "changelog.0.3.12.0",
      "changelog.0.3.12.1",
      "changelog.0.3.12.2",
      "changelog.0.3.12.3",
      "changelog.0.3.12.4",
      "changelog.0.3.12.5",
    ],
  },
  {
    version: "0.3.11",
    date: "2026-02-08",
    items: [
      "changelog.0.3.11.0",
      "changelog.0.3.11.1",
      "changelog.0.3.11.2",
      "changelog.0.3.11.3",
      "changelog.0.3.11.4",
      "changelog.0.3.11.5",
    ],
  },
  {
    version: "0.3.10",
    date: "2026-02-08",
    items: [
      "changelog.0.3.10.0",
      "changelog.0.3.10.1",
      "changelog.0.3.10.2",
      "changelog.0.3.10.3",
      "changelog.0.3.10.4",
    ],
  },
  {
    version: "0.3.9",
    date: "2026-02-01",
    items: [
      "changelog.0.3.9.0",
      "changelog.0.3.9.1",
    ],
  },
];


// ═══════════════════════════════════════════════════════════
// DESIGN SYSTEM + UI COMPONENTS
// ═══════════════════════════════════════════════════════════
const C = {
  cream: "#FAF7F2", warmWhite: "#F5F1EA", paper: "#EDE8DF",
  rule: "#D4CBBB", ruleFaint: "#E8E1D6",
  ink: "#1A1612", inkSoft: "#3D362E", inkMuted: "#7A7067", inkFaint: "#A69E94",
  up: "#1B6B3A", upBg: "#E8F5ED", down: "#9B1B1B", downBg: "#FBE8E8",
  hold: "#8B6914", holdBg: "#FDF6E3", accent: "#8B2500", chart4: "#5B4A8A",
};

const fmt = (n, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const fmtPct = (n, d = 1) => n != null ? `${Number(n).toFixed(d)}%` : "—";
const fmtMoney = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${Number(n).toFixed(2)}`;
};
const recColor = (a) => a?.includes("BUY") ? C.up : a?.includes("SELL") ? C.down : C.hold;
const valColor = (v) => v?.includes("OVER") ? C.down : v?.includes("UNDER") ? C.up : C.hold;
const latColor = (ms) => ms < 200 ? C.up : ms < 800 ? C.hold : C.down;

function LogoIcon({ size = 20, color }) {
  const c = color || C.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <path d="M6 26 L12 10 L18 18 L26 4" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="26" cy="4" r="2" fill={c} opacity="0.9" />
      <path d="M6 26 L12 10 L18 18 L26 4" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.15" style={{ filter: "blur(3px)" }} />
    </svg>
  );
}

function IconGear({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke={color} strokeWidth="1.6" />
      <path d="M19.4 12a7.4 7.4 0 0 0-.08-1l2.02-1.56-1.6-2.77-2.44 1a7.6 7.6 0 0 0-1.74-1L15.3 3h-3.2l-.26 2.67a7.6 7.6 0 0 0-1.74 1l-2.44-1-1.6 2.77L8.08 11a7.4 7.4 0 0 0 0 2l-2.02 1.56 1.6 2.77 2.44-1c.53.4 1.11.73 1.74 1L12.1 21h3.2l.26-2.67c.63-.27 1.21-.6 1.74-1l2.44 1 1.6-2.77L19.32 13c.05-.33.08-.66.08-1Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function IconGlobe({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path d="M3.5 12h17" stroke={color} strokeWidth="1.2" />
      <path d="M12 3c3 3.2 3 14.8 0 18" stroke={color} strokeWidth="1.2" />
      <path d="M12 3c-3 3.2-3 14.8 0 18" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function IconCrown({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M4 8 8.5 12 12 6l3.5 6L20 8l-2 9H6L4 8Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 19h11" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconGift({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M4 11h16v9H4z" stroke={color} strokeWidth="1.4" />
      <path d="M12 11v9" stroke={color} strokeWidth="1.4" />
      <path d="M3 7h18v4H3z" stroke={color} strokeWidth="1.4" />
      <path d="M12 7c-1.6 0-3-1.1-3-2.5S10.2 2 12 4c1.8-2 3-1.1 3 0.5S13.6 7 12 7Z" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function IconLogout({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M4 4h9v4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4 20h9v-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 12h10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 8l4 4-4 4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight({ size = 14, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M9 6l6 6-6 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck({ size = 14, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M5 12l4 4L19 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrandMark({ size = 26, pro = false, muted = false, weight = 300, iconOnly = false }) {
  const iconSize = Math.round(size * 0.78);
  const content = (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: Math.round(size * 0.28),
      lineHeight: 1,
      position: "relative",
    }}>
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>
        <LogoIcon size={iconSize} color={muted ? C.inkMuted : C.ink} />
      </div>
      {!iconOnly && (
        <div style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <span style={{
            fontSize: size,
            fontWeight: weight,
            fontFamily: "var(--display)",
            letterSpacing: "-0.02em",
            color: muted ? C.inkMuted : C.ink,
          }}>Analyze</span>
          <span style={{
            fontSize: size,
            fontWeight: Math.min(weight + 200, 700),
            fontFamily: "var(--display)",
            letterSpacing: "-0.02em",
            color: muted ? C.inkMuted : C.ink,
          }}>Alpha</span>
          {pro && (
            <span style={{
              fontSize: Math.round(size * 0.42),
              fontWeight: 700,
              fontFamily: "var(--body)",
              letterSpacing: "0.06em",
              color: muted ? C.inkFaint : C.inkSoft,
              textTransform: "uppercase",
              marginLeft: 2,
              alignSelf: "flex-start",
              marginTop: Math.round(size * 0.08),
            }}>Pro</span>
          )}
        </div>
      )}
    </div>
  );
  return content;
}

function ProTag({ small = false }) {
  return (
    <span style={{
      fontWeight: 700,
      fontSize: small ? 9 : 10,
      color: C.ink,
      fontFamily: "var(--body)",
      letterSpacing: "0.04em",
    }}>
      Pro
    </span>
  );
}

function ProGate({ title = "Pro Required", description, features }) {
  return (
    <div style={{ border: `1px dashed ${C.rule}`, background: C.warmWhite, padding: 28, textAlign: "center", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "center" }}><ProTag /></div>
      <div style={{ fontFamily: "var(--display)", fontSize: 22, color: C.ink }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.6 }}>{description}</div>}
      {features && (
        <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
          {features.map((f) => (
            <div key={f} style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--mono)" }}>{f}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Signal({ value }) {
  const { t } = useI18n();
  const col = {
    STRONG_BUY: C.up, BUY: C.up, OVERSOLD: C.up, BULLISH: C.up,
    NEUTRAL: C.hold, SELL: C.down, STRONG_SELL: C.down, OVERBOUGHT: C.down, BEARISH: C.down,
    STRONG: C.up, MODERATE: C.hold, WEAK: C.inkMuted,
    HIGH: C.down, LOW: C.up, NORMAL: C.hold, ELEVATED: C.accent,
  }[value] || C.inkMuted;
  const label = translateEnum(value, t, "signal");
  return <span style={{ color: col, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{label}</span>;
}

function Row({ label, value, color, border = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: border ? `1px solid ${C.ruleFaint}` : "none" }}>
      <span style={{ color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{label}</span>
      <span style={{ color: color || C.ink, fontSize: 13, fontFamily: "var(--mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function HelpWrap({ help, enabled, onShow, onHide, block = false, children }) {
  const ctx = useContext(HelpContext);
  const active = enabled ?? ctx?.enabled;
  const show = onShow ?? ctx?.show;
  const hide = onHide ?? ctx?.hide;
  if (!help || !active) return children;
  return (
    <div
      onMouseEnter={e => show?.(e, help)}
      onMouseLeave={hide}
      style={{
        display: block ? "block" : "inline-flex",
        outline: `1px dashed ${C.rule}`,
        outlineOffset: 4,
        borderRadius: 6,
      }}
    >
      {children}
    </div>
  );
}

function Section({ title, children, style, actions, help }) {
  const baseStyle = { minWidth: 0, ...style };
  const content = (
    <div style={baseStyle}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--body)", paddingBottom: 8, borderBottom: `2px solid ${C.ink}`, marginBottom: 10 }}>
          <span>{title}</span>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
  if (!help) return content;
  return (
    <HelpWrap help={help} block>
      {content}
    </HelpWrap>
  );
}

function Sparkline({ data, color = C.ink, prevClose, width = 120, height = 36 }) {
  if (!data || data.length < 2) return null;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  let refY = null;
  if (prevClose != null && prevClose >= min && prevClose <= max) {
    refY = height - pad - ((prevClose - min) / span) * (height - pad * 2);
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {refY != null && (
        <line x1={pad} y1={refY} x2={width - pad} y2={refY} stroke={C.inkFaint} strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
      )}
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LiveBadge({ latency, source }) {
  const { t } = useI18n();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.04em" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.up, display: "inline-block", animation: "livePulse 2s ease infinite", boxShadow: `0 0 6px ${C.up}55` }} />
      <span style={{ color: C.up }}>{t("common.live")}</span>
      <span style={{ color: C.inkFaint }}>·</span>
      <span style={{ color: C.inkMuted, fontSize: 9 }}>{source}</span>
      <span style={{ color: latColor(latency), fontSize: 9 }}>{latency}ms</span>
    </span>
  );
}

function usePrevious(value) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

function useMenuPresence(open, duration = 160) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState(open ? "open" : "closed");
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMounted(true);
      setPhase("open");
      return;
    }
    if (!mounted) return;
    setPhase("closing");
    timerRef.current = setTimeout(() => {
      setMounted(false);
      setPhase("closed");
      timerRef.current = null;
    }, duration);
  }, [open, mounted, duration]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { mounted, phase };
}

function useInView(rootMargin = "200px 0px") {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView];
}

function LazySection({ children, minHeight = 140, rootMargin = "200px 0px" }) {
  const [ref, inView] = useInView(rootMargin);
  return (
    <div ref={ref} style={{ minHeight }}>
      {inView ? children : null}
    </div>
  );
}

function AnimatedPrice({ price, prevPrice, large = false }) {
  const safePrev = prevPrice ?? price;
  const dir = price > safePrev ? "up" : price < safePrev ? "down" : "same";
  const col = dir === "up" ? C.up : dir === "down" ? C.down : C.ink;
  const sz = large ? 42 : 16;
  const next = `$${fmt(price)}`;
  const prev = `$${fmt(safePrev)}`;
  const len = Math.max(next.length, prev.length);
  const nextPad = next.padStart(len, " ");
  const prevPad = prev.padStart(len, " ");
  const digitCount = nextPad.split("").filter(ch => ch >= "0" && ch <= "9").length;
  let digitIndex = 0;

  return (
    <div style={{ overflow: "hidden", position: "relative", height: large ? 52 : 22, color: col, whiteSpace: "pre" }}>
      <div style={{
        fontSize: sz, fontWeight: large ? 300 : 600,
        fontFamily: large ? "var(--display)" : "var(--mono)",
        lineHeight: large ? "52px" : "22px",
        fontVariantNumeric: "tabular-nums",
        transition: "color 0.6s ease",
      }}>
        {nextPad.split("").map((ch, i) => {
          const prevCh = prevPad[i];
          const isDigit = ch >= "0" && ch <= "9";
          const changed = isDigit && ch !== prevCh;
          const anim = changed && dir !== "same" ? `slide${dir === "up" ? "Up" : "Down"} 0.35s cubic-bezier(0.16,1,0.3,1)` : "none";
          const order = isDigit ? (digitCount - 1 - digitIndex) : 0;
          if (isDigit) digitIndex += 1;
          const delay = changed ? `${Math.max(0, order) * 0.02}s` : "0s";
          return (
            <span key={`${i}-${ch}`} style={{ display: "inline-block", animation: anim, animationDelay: delay, animationFillMode: "both" }}>
              {ch === " " ? "\u00A0" : ch}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CandlestickSeries({ data, xAxisMap, yAxisMap }) {
  const xAxis = Object.values(xAxisMap || {})[0];
  const yAxis = Object.values(yAxisMap || {})[0];
  if (!xAxis || !yAxis) return null;
  const xScale = xAxis.scale;
  const yScale = yAxis.scale;
  const band = typeof xScale.bandwidth === "function" ? xScale.bandwidth() : 10;
  const bodyWidth = Math.max(4, band * 0.85);

  return (
    <g>
      {(data || []).map((d, i) => {
        if (d == null || d.o == null || d.h == null || d.l == null || d.c == null) return null;
        const x = xScale(d.n) + band / 2;
        const open = d.o, close = d.c, high = d.h, low = d.l;
        const color = close >= open ? C.up : C.down;
        const bodyTop = yScale(Math.max(open, close));
        const bodyBottom = yScale(Math.min(open, close));
        const wickTop = yScale(high);
        const wickBottom = yScale(low);
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={wickTop} y2={wickBottom} stroke={color} strokeWidth={1.2} />
            <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
          </g>
        );
      })}
    </g>
  );
}

function ExpandedChartModal({ title, mode, data, onClose, dataKey, period, interval, onReanalyze, ticker }) {
  const { t } = useI18n();
  const [window, setWindow] = useState({ start: 0, end: Math.max(0, (data?.length || 1) - 1) });
  const [chartType, setChartType] = useState(mode === "price" ? "candles" : "line");
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const initRef = useRef({ key: null, mode: null });
  const windowRef = useRef(window);
  const rafRef = useRef(null);
  const pendingRef = useRef(null);

  useEffect(() => {
    windowRef.current = window;
  }, [window]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const len = data?.length || 0;
    if (!len) return;
    const key = dataKey || title || "chart";
    if (initRef.current.key === key && initRef.current.mode === mode) return;
    initRef.current = { key, mode };
    const end = len - 1;
    const size = Math.min(200, len);
    const start = Math.max(0, end - size + 1);
    const next = { start, end };
    windowRef.current = next;
    pendingRef.current = null;
    setWindow(next);
    setChartType(mode === "price" ? "candles" : "line");
  }, [data?.length, mode, dataKey, title]);

  const clampWindow = (start, end) => {
    if (!data || data.length === 0) return { start: 0, end: 0 };
    const max = data.length - 1;
    let s = Math.max(0, start);
    let e = Math.min(max, end);
    const minSize = Math.min(30, max + 1);
    if (e - s + 1 < minSize) {
      e = Math.min(max, s + minSize - 1);
      s = Math.max(0, e - minSize + 1);
    }
    return { start: s, end: e };
  };

  const commitWindow = (next) => {
    pendingRef.current = next;
    windowRef.current = next;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current) {
        setWindow(pendingRef.current);
        pendingRef.current = null;
      }
    });
  };

  const shiftWindow = (delta) => {
    const base = pendingRef.current || windowRef.current;
    const size = base.end - base.start + 1;
    const next = clampWindow(base.start + delta, base.start + delta + size - 1);
    commitWindow(next);
  };

  const zoomWindow = (factor) => {
    const base = pendingRef.current || windowRef.current;
    if (!data || data.length === 0) return;
    const size = base.end - base.start + 1;
    const target = Math.max(30, Math.min(data.length, Math.round(size * factor)));
    const center = (base.start + base.end) / 2;
    const start = Math.round(center - target / 2);
    const end = start + target - 1;
    commitWindow(clampWindow(start, end));
  };

  const onWheel = (e) => {
    e.preventDefault();
    if (!data || data.length === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const size = windowRef.current.end - windowRef.current.start + 1;
    const absX = Math.abs(e.deltaX);
    const absY = Math.abs(e.deltaY);
    if (absX > 0.5) {
      const width = rect?.width || 1;
      const shift = Math.round((e.deltaX / width) * size);
      if (shift !== 0) shiftWindow(shift);
      return;
    }
    if (absY > 0.5) {
      zoomWindow(e.deltaY > 0 ? 1.1 : 0.9);
    }
  };

  const onMouseDown = (e) => {
    dragRef.current = { x: e.clientX, start: windowRef.current.start, end: windowRef.current.end };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.x;
    const size = dragRef.current.end - dragRef.current.start + 1;
    const shift = Math.round(-dx / rect.width * size);
    const next = clampWindow(dragRef.current.start + shift, dragRef.current.end + shift);
    commitWindow(next);
  };
  const onMouseUp = () => { dragRef.current = null; };

  const windowData = useMemo(() => data?.slice(window.start, window.end + 1) || [], [data, window.start, window.end]);
  const controlBtn = (on) => ({
    padding: "6px 10px",
    border: `1px solid ${on ? C.ink : C.rule}`,
    background: on ? C.ink : "transparent",
    color: on ? C.cream : C.inkMuted,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--body)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });

  const modal = (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.35)", zIndex: 12000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.cream, border: `1px solid ${C.rule}`, width: "96%", height: "92%", maxWidth: 1400, boxShadow: "8px 16px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 18, color: C.ink }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {mode === "price" && (
              <>
                <button onClick={() => setChartType("line")} style={controlBtn(chartType === "line")}>{t("common.line")}</button>
                <button onClick={() => setChartType("candles")} style={controlBtn(chartType === "candles")}>{t("common.candles")}</button>
              </>
            )}
            {onReanalyze && ticker && (
              <>
                <select value={period || "1y"} onChange={e => onReanalyze(ticker, e.target.value, interval)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "5px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                  {[["1d","1D"],["5d","5D"],["1mo","1M"],["3mo","3M"],["6mo","6M"],["1y","1Y"],["2y","2Y"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
                <select value={interval || "1d"} onChange={e => onReanalyze(ticker, period, e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "5px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                  {(["1d","5d"].includes(period) ? [["1m","1m"],["5m","5m"],["15m","15m"],["30m","30m"],["60m","1h"]] : period === "1mo" ? [["15m","15m"],["30m","30m"],["60m","1h"],["1d","1d"]] : [["1d","1d"]]).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </>
            )}
            <button onClick={() => zoomWindow(0.85)} style={controlBtn(false)}>{t("common.zoomIn")}</button>
            <button onClick={() => zoomWindow(1.15)} style={controlBtn(false)}>{t("common.zoomOut")}</button>
            <button onClick={() => commitWindow(clampWindow(0, (data?.length || 1) - 1))} style={controlBtn(false)}>{t("common.reset")}</button>
            <button onClick={onClose} style={controlBtn(false)}>{t("common.close")}</button>
          </div>
        </div>
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div ref={containerRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            style={{ flex: 1, background: C.warmWhite, border: `1px solid ${C.rule}`, position: "relative", cursor: dragRef.current ? "grabbing" : "grab", userSelect: "none" }}>
            <ResponsiveContainer width="100%" height="100%">
              {mode === "volume" ? (
                <BarChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                </BarChart>
              ) : mode === "rsi" ? (
                <LineChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} ticks={[30, 70]} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={70} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} />
                </LineChart>
              ) : mode === "macd" ? (
                <ComposedChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={0} stroke={C.rule} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Bar dataKey="mh" fill={C.inkSoft + "20"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                  <Line dataKey="macd" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="ms" stroke={C.accent} dot={false} strokeWidth={1} />
                </ComposedChart>
              ) : mode === "stoch" ? (
                <LineChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} />
                </LineChart>
              ) : (
                <ComposedChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
                  <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" />
                  <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" />
                  <Line dataKey="s20" stroke={C.accent + "AA"} dot={false} strokeWidth={1} />
                  <Line dataKey="s50" stroke={C.chart4 + "88"} dot={false} strokeWidth={1} />
                  <Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} />
                  {chartType === "candles" ? (
                    <Customized component={CandlestickSeries} />
                  ) : (
                    <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  )}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)" }}>
            {t("charts.windowHint", { count: window.end - window.start + 1, total: data?.length || 0 })}
          </div>
          <div style={{ height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data || []}>
                <XAxis dataKey="n" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Line dataKey="c" stroke={C.inkSoft} dot={false} strokeWidth={1} />
                <Brush dataKey="n" height={22} stroke={C.rule} fill={C.warmWhite} travellerWidth={8}
                  startIndex={window.start} endIndex={window.end}
                  onChange={(r) => {
                    if (!r || r.startIndex == null || r.endIndex == null) return;
                    commitWindow(clampWindow(r.startIndex, r.endIndex));
                  }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}

function LoadingScreen({ ticker, isPro }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 420, gap: 20, position: "relative" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, zIndex: 1 }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "relative", zIndex: 1, animation: "alphaFloat 3s ease-in-out infinite" }}>
            <LogoIcon size={40} />
          </div>
        </div>
        <BrandMark size={28} pro={isPro} weight={300} />
      </div>
      <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.inkMuted, zIndex: 1 }}>
        {t("loading.analyzing")} <span style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)" }}>{ticker}</span>
      </div>
      <div style={{ width: 200, height: 2, background: C.ruleFaint, borderRadius: 2, overflow: "hidden", zIndex: 1 }}>
        <div style={{ width: "55%", height: "100%", background: "linear-gradient(90deg, rgba(26,22,18,0), rgba(26,22,18,0.7), rgba(26,22,18,0))", animation: "proSweep 1.6s ease infinite" }} />
      </div>
      <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)", zIndex: 1, letterSpacing: "0.04em" }}>
        {t("loading.liveSource", { source: t("news.sourceYahoo") })}
      </div>
    </div>
  );
}

function ErrorScreen({ error, debugInfo, onRetry }) {
  const { t } = useI18n();
  const [showDebug, setShowDebug] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 16 }}>
      <BrandMark size={24} muted />
      <div style={{ fontSize: 24, fontFamily: "var(--display)", color: C.ink, fontWeight: 600 }}>{t("error.connectionTitle")}</div>
      <div style={{ fontSize: 14, color: C.inkMuted, fontFamily: "var(--body)", textAlign: "center", maxWidth: 440, lineHeight: 1.6 }}>
        {t("error.connectionBody")} <code style={{ background: C.paper, padding: "2px 6px", fontFamily: "var(--mono)", fontSize: 12 }}>npm start</code>.
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button onClick={onRetry} style={{ padding: "10px 28px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("common.retry")}</button>
        <button onClick={() => setShowDebug(!showDebug)} style={{ padding: "10px 20px", background: "transparent", color: C.inkMuted, border: `1px solid ${C.rule}`, fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>
          {showDebug ? t("common.hide") : t("common.debug")} {t("common.info")}
        </button>
      </div>
      {showDebug && debugInfo && (
        <div style={{ marginTop: 12, padding: 16, background: C.warmWhite, border: `1px solid ${C.rule}`, maxWidth: 600, width: "100%", fontSize: 11, fontFamily: "var(--mono)", color: C.inkSoft, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
          {JSON.stringify(debugInfo, null, 2)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME TAB — SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function SkeletonBlock({ width = "100%", height = 16, style }) {
  return (
    <div style={{ width, height, background: `linear-gradient(90deg, ${C.paper} 25%, ${C.warmWhite} 50%, ${C.paper} 75%)`, backgroundSize: "200% 100%", animation: "loadSlide 1.5s ease-in-out infinite", borderRadius: 2, ...style }} />
  );
}

function TickerStrip({ data, loading, onAnalyze }) {
  const { t } = useI18n();
  const renderItem = (item, idx) => (
    <button
      key={item.symbol + "-" + idx}
      type="button"
      onClick={() => onAnalyze?.(item.symbol)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px",
        minWidth: 140,
        borderRight: `1px solid rgba(255,255,255,0.08)`,
        whiteSpace: "nowrap",
        background: "transparent",
        border: "none",
        color: "inherit",
        cursor: "pointer",
        textAlign: "left",
        transition: "transform 0.2s ease, background 0.2s ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em", fontWeight: 600 }}>{labelFor(item.label, t)}</span>
      <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "#fff", fontWeight: 600 }}>
        {item.loaded ? (item.price >= 1000 ? item.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : item.price.toFixed(2)) : "—"}
      </span>
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: item.changePct > 0 ? "#4ADE80" : item.changePct < 0 ? "#F87171" : "rgba(255,255,255,0.5)" }}>
        {item.loaded ? `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%` : ""}
      </span>
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", background: C.ink, overflow: "hidden", minWidth: 0 }}>
      {/* LIVE badge — fixed, does not scroll */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRight: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE80", display: "inline-block", animation: "livePulse 2s ease-in-out infinite", boxShadow: "0 0 6px rgba(74,222,128,0.4)" }} />
        <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#4ADE80", fontWeight: 700, letterSpacing: "0.08em" }}>{t("common.live")}</span>
      </div>
      {/* Scrolling content */}
      <div className="ticker-strip-scroll" style={{ flex: 1, overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex" }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", minWidth: 140, borderRight: `1px solid rgba(255,255,255,0.08)` }}>
                <SkeletonBlock width={60} height={10} style={{ opacity: 0.2 }} />
                <SkeletonBlock width={50} height={12} style={{ opacity: 0.15 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="ticker-strip-inner" style={{ display: "flex", width: "max-content" }}>
            {data.map((item, i) => renderItem(item, i))}
            {data.map((item, i) => renderItem(item, i + data.length))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniIntradayChart({ data, label, loading, onAnalyze, ticker, compact = false }) {
  const { t } = useI18n();
  if (loading || !data) {
    return (
      <div style={{ padding: "16px 20px", background: C.warmWhite, border: `1px solid ${C.rule}`, minHeight: 180 }}>
        <SkeletonBlock width={100} height={10} style={{ marginBottom: 8 }} />
        <SkeletonBlock width="100%" height={120} />
      </div>
    );
  }
  const { points, prevClose } = data;
  const chartData = points.map(p => ({
    time: p.time,
    price: p.price,
    aboveOpen: Math.max(p.price, prevClose),
    belowOpen: Math.min(p.price, prevClose),
  }));

  const lastPrice = points.length ? points[points.length - 1].price : prevClose;
  const change = lastPrice - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const color = lastPrice >= prevClose ? C.up : C.down;
  const changeBg = lastPrice >= prevClose ? C.upBg : C.downBg;
  const safeLabel = label.replace(/[^a-zA-Z0-9]/g, "");
  const displayLabel = labelFor(label, t);
  const clickable = !!onAnalyze && !!ticker;
  return (
    <button
      type="button"
      onClick={() => clickable && onAnalyze?.(ticker)}
      style={{
        padding: compact ? "12px 14px" : "16px 20px",
        background: C.warmWhite,
        border: `1px solid ${C.rule}`,
        cursor: clickable ? "pointer" : "default",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: compact ? 9 : 10, textTransform: "uppercase", letterSpacing: "0.12em", color: C.inkMuted, fontFamily: "var(--body)", fontWeight: 600 }}>{displayLabel}</span>
          <span style={{ fontSize: compact ? 22 : 30, fontFamily: "var(--display)", color: C.inkSoft, fontWeight: 600, marginLeft: 12 }}>{fmt(lastPrice)}</span>
        </div>
        <span style={{ fontSize: compact ? 12 : 14, fontFamily: "var(--mono)", fontWeight: 800, color, background: changeBg, padding: compact ? "3px 6px" : "4px 8px", borderRadius: 10 }}>
          {change >= 0 ? "+" : ""}{fmt(change)} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={compact ? 90 : 120}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={`gradUp-${safeLabel}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.up} stopOpacity={0.25} />
              <stop offset="100%" stopColor={C.up} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={`gradDn-${safeLabel}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.down} stopOpacity={0.02} />
              <stop offset="100%" stopColor={C.down} stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <ReferenceLine y={prevClose} stroke={C.rule} strokeDasharray="3 3" />
          <Area type="monotone" dataKey="aboveOpen" stroke="none" fill={`url(#gradUp-${safeLabel})`} baseValue={prevClose} dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="belowOpen" stroke="none" fill={`url(#gradDn-${safeLabel})`} baseValue={prevClose} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="price" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <XAxis dataKey="time" hide />
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, fontSize: 11, fontFamily: "var(--mono)" }}
            formatter={(v, name) => name === "price" ? [`$${Number(v).toFixed(2)}`, t("common.price")] : [null, null]}
            labelFormatter={(l) => l}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </button>
  );
}

function MoverPopup({ title, stocks, onAnalyze, onClose }) {
  return (
    <div className="popup-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.35)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="popup-card" onClick={e => e.stopPropagation()} style={{ background: C.cream, border: `1px solid ${C.rule}`, width: 480, maxHeight: "80vh", boxShadow: "8px 16px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.rule}` }}>
          <span style={{ fontFamily: "var(--display)", fontSize: 18, color: C.ink }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.inkMuted, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: "8px 20px 20px" }}>
          {stocks.map((s) => (
            <button key={s.ticker} onClick={() => { onAnalyze?.(s.ticker); onClose(); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 4px", background: "transparent", border: "none", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.paper}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ display: "grid", gap: 2, minWidth: 80 }}>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12, color: C.ink }}>{s.ticker}</span>
                <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)" }}>{s.name}</span>
              </div>
              {s.spark && s.spark.length > 1 && <Sparkline data={s.spark} color={s.changePct >= 0 ? C.up : C.down} prevClose={s.prevClose} />}
              <div style={{ textAlign: "right", minWidth: 80 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: C.ink }}>${fmt(s.price)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: s.changePct >= 0 ? C.up : C.down, marginLeft: 8 }}>
                  {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoverColumn({ title, stocks, allStocks, loading, onAnalyze }) {
  const { t } = useI18n();
  const [showPopup, setShowPopup] = useState(false);
  const display = stocks ? stocks.slice(0, 5) : [];

  if (loading) {
    return (
      <div style={{ padding: "16px 20px", background: C.warmWhite, border: `1px solid ${C.rule}`, minWidth: 0, width: "100%" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: C.inkMuted, fontFamily: "var(--body)", fontWeight: 600, marginBottom: 12 }}>{title}</div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
            <SkeletonBlock width={50} height={12} />
            <SkeletonBlock width={60} height={12} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ padding: "16px 20px", background: C.warmWhite, border: `1px solid ${C.rule}`, minWidth: 0, width: "100%" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: C.inkMuted, fontFamily: "var(--body)", fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {(!display || display.length === 0) ? (
        <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--body)", padding: "12px 0" }}>{t("common.noData")}</div>
      ) : (
        <>
          {display.map((s) => (
            <button key={s.ticker} onClick={() => onAnalyze?.(s.ticker)}
              style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", width: "100%", padding: "8px 4px", background: "transparent", border: "none", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.paper}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ display: "grid", gap: 2, minWidth: 0, overflow: "hidden" }}>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12, color: C.ink }}>{s.ticker}</span>
                <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              </div>
              <div style={{ padding: "0 8px" }}>
                {s.spark && s.spark.length > 1 && <Sparkline data={s.spark} color={s.changePct >= 0 ? C.up : C.down} prevClose={s.prevClose} />}
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: C.ink }}>${fmt(s.price)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: s.changePct >= 0 ? C.up : C.down, marginLeft: 8 }}>
                  {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                </span>
              </div>
            </button>
          ))}
          {allStocks && allStocks.length > 5 && (
            <button onClick={() => setShowPopup(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "8px 4px", background: "transparent", border: "none", cursor: "pointer", color: C.inkMuted, fontSize: 11, fontFamily: "var(--body)", fontWeight: 600, gap: 4, marginTop: 4, transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = C.ink}
              onMouseLeave={e => e.currentTarget.style.color = C.inkMuted}>
              {t("common.showAll", { count: allStocks.length })} →
            </button>
          )}
        </>
      )}
      {showPopup && allStocks && (
        <MoverPopup title={title} stocks={allStocks} onAnalyze={onAnalyze} onClose={() => setShowPopup(false)} />
      )}
    </div>
  );
}

function timeAgo(dateStr, t) {
  if (!dateStr) return "";
  try {
    const ts = new Date(dateStr).getTime();
    if (!Number.isFinite(ts)) return "";
    return formatAgo(ts, t);
  } catch { return ""; }
}

function NewsSection({ news, loading }) {
  const { t } = useI18n();
  if (loading) {
    return (
      <div style={{ display: "grid", gap: 1 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: "14px 16px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
            <SkeletonBlock width="80%" height={14} style={{ marginBottom: 6 }} />
            <SkeletonBlock width="60%" height={10} />
          </div>
        ))}
      </div>
    );
  }
  if (!news || news.length === 0) {
    return (
      <div style={{ padding: "16px", background: C.warmWhite, border: `1px solid ${C.rule}`, fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)" }}>
        {t("news.none")}
      </div>
    );
  }
  const hero = news[0];
  const placeholder = buildNewsPlaceholder(t("home.marketNews"));
  const heroTitle = hero.titleKey ? t(hero.titleKey) : hero.title;
  const heroDesc = hero.descriptionKey ? t(hero.descriptionKey) : hero.description;
  const heroSource = hero.sourceKey ? t(hero.sourceKey) : hero.source || t("news.sourceYahoo");
  const heroImage = hero.image || placeholder || NEWS_PLACEHOLDER_IMAGE;
  const rest = news.slice(1);
  const cards = rest.slice(0, 6);
  const publishedText = hero.pubDate ? t("news.published", { ago: timeAgo(hero.pubDate, t) }) : t("news.publishedRecently");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <HelpWrap help={{ title: t("help.newsHero.title"), body: t("help.newsHero.body") }} block>
        <a href={hero.link || "#"} target="_blank" rel="noopener noreferrer"
          style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", minHeight: 260, background: C.warmWhite, border: `1px solid ${C.rule}`, borderRadius: 16, textDecoration: "none", color: C.ink, overflow: "hidden" }}>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.24em", textTransform: "uppercase", color: C.inkFaint }}>{t("news.topStory")}</div>
          <div>
            <div style={{ fontSize: 28, fontFamily: "var(--display)", lineHeight: 1.2, color: C.inkSoft }}>{heroTitle}</div>
            {heroDesc && (
              <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.inkMuted, lineHeight: 1.6, marginTop: 10 }}>{heroDesc}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.02em" }}>
            <span>{publishedText}</span>
            <span style={{ color: C.ruleFaint }}>·</span>
            <span style={{ fontWeight: 600 }}>{heroSource}</span>
          </div>
        </div>
        <div style={{ position: "relative", background: C.paper }}>
          <img src={heroImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.src = placeholder || NEWS_PLACEHOLDER_IMAGE; }} />
        </div>
        </a>
      </HelpWrap>
      <HelpWrap help={{ title: t("help.newsList.title"), body: t("help.newsList.body") }} block>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {cards.map((n, i) => {
            const cardImage = n.image || placeholder || NEWS_PLACEHOLDER_IMAGE;
            const cardTitle = n.titleKey ? t(n.titleKey) : n.title;
            const cardSource = n.sourceKey ? t(n.sourceKey) : n.source || t("news.sourceYahoo");
            return (
              <a key={i} href={n.link || "#"} target="_blank" rel="noopener noreferrer"
                style={{ display: "grid", gridTemplateRows: "120px auto", background: C.warmWhite, border: `1px solid ${C.rule}`, borderRadius: 14, textDecoration: "none", color: C.ink, overflow: "hidden", transition: "transform 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
                <div style={{ position: "relative", background: C.paper }}>
                  <img src={cardImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.src = placeholder || NEWS_PLACEHOLDER_IMAGE; }} />
                </div>
                <div style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.ink, fontWeight: 500, lineHeight: 1.4 }}>{cardTitle}</div>
                  <div style={{ display: "flex", gap: 8, fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.02em" }}>
                    <span style={{ fontWeight: 600 }}>{cardSource}</span>
                    {n.pubDate && <>
                      <span style={{ color: C.ruleFaint }}>|</span>
                      <span>{timeAgo(n.pubDate, t)}</span>
                    </>}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </HelpWrap>
    </div>
  );
}

function MiniCard({ title, children, style }) {
  return (
    <div style={{ background: C.warmWhite, border: `1px solid ${C.rule}`, padding: "14px 16px", display: "grid", gap: 10, ...style }}>
      {title && (
        <div style={{ fontSize: 10, fontFamily: "var(--body)", letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function MarketScorecardCard() {
  const { t } = useI18n();
  const [spData, setSpData] = useState(null);
  const [indicators, setIndicators] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchStockData("^GSPC", "1y", "1d"),
      Promise.allSettled(SCORECARD_INDICATORS.map(ind => fetchQuickQuote(ind.symbol))),
    ]).then(([stockResult, indResults]) => {
      if (cancelled) return;
      const hist = stockResult.data;
      const latest = hist[hist.length - 1]?.Close || 0;
      const prev1d = hist.length > 1 ? hist[hist.length - 2]?.Close : latest;
      const prev1w = hist.length > 5 ? hist[hist.length - 6]?.Close : hist[0]?.Close;
      const prev1m = hist.length > 22 ? hist[hist.length - 23]?.Close : hist[0]?.Close;
      const firstOfYear = hist[0]?.Close || latest;
      const calcRet = (from) => from ? ((latest - from) / from) * 100 : 0;
      setSpData({
        price: latest,
        ret1d: calcRet(prev1d),
        ret1w: calcRet(prev1w),
        ret1m: calcRet(prev1m),
        retYtd: calcRet(firstOfYear),
      });
      setIndicators(SCORECARD_INDICATORS.map((ind, i) => {
        const r = indResults[i];
        if (r.status === "fulfilled") return { ...ind, price: r.value.price, changePct: r.value.changePct, ok: true };
        return { ...ind, price: 0, changePct: 0, ok: false };
      }));
      setLoaded(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const vixColor = (v) => {
    if (v < 15) return C.up;
    if (v < 20) return C.hold;
    if (v < 30) return "#D97706";
    return C.down;
  };
  const vixWidth = (v) => Math.min(100, (v / 40) * 100);

  const ReturnPill = ({ label, value }) => (
    <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, padding: "3px 8px", borderRadius: 10, background: value >= 0 ? C.upBg : C.downBg, color: value >= 0 ? C.up : C.down }}>
      {label} {value >= 0 ? "+" : ""}{value.toFixed(2)}%
    </span>
  );

  return (
    <MiniCard title={t("home.marketScorecard")}>
      {!loaded ? (
        <div style={{ display: "grid", gap: 8 }}>
          <SkeletonBlock height={24} />
          <SkeletonBlock height={16} />
          <SkeletonBlock height={16} />
          <SkeletonBlock height={16} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted, fontWeight: 600 }}>{labelFor("S&P 500", t)}</span>
              <span style={{ fontSize: 16, fontFamily: "var(--mono)", fontWeight: 700, color: C.ink }}>
                {spData.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ReturnPill label={t("home.return1d")} value={spData.ret1d} />
              <ReturnPill label={t("home.return1w")} value={spData.ret1w} />
              <ReturnPill label={t("home.return1m")} value={spData.ret1m} />
              <ReturnPill label={t("home.returnYtd")} value={spData.retYtd} />
            </div>
          </div>
          {indicators.find(d => d.label === "VIX" && d.ok) && (() => {
            const vix = indicators.find(d => d.label === "VIX");
            return (
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontFamily: "var(--body)", color: C.inkMuted, fontWeight: 600 }}>{labelFor("VIX", t)}</span>
                  <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 700, color: vixColor(vix.price) }}>{vix.price.toFixed(1)}</span>
                </div>
                <div style={{ height: 6, background: C.paper, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${vixWidth(vix.price)}%`, background: vixColor(vix.price), borderRadius: 3, transition: "width 0.3s" }} />
                </div>
              </div>
            );
          })()}
          <div style={{ display: "grid", gap: 0 }}>
            {indicators.filter(d => d.label !== "VIX" && d.ok).map(d => (
              <div key={d.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted }}>{labelFor(d.label, t)}</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600, color: C.ink }}>
                    {d.price >= 100 ? d.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : d.price.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: d.changePct >= 0 ? C.up : C.down }}>
                    {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </MiniCard>
  );
}

function CrossAssetCard() {
  const { t } = useI18n();
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(CROSS_ASSET_SYMBOLS.map(a => fetchQuickQuote(a.symbol))).then(results => {
      if (cancelled) return;
      setData(CROSS_ASSET_SYMBOLS.map((a, i) => {
        const r = results[i];
        if (r.status === "fulfilled") return { ...a, price: r.value.price, changePct: r.value.changePct, spark: r.value.spark, prevClose: r.value.prevClose, ok: true };
        return { ...a, price: 0, changePct: 0, spark: [], prevClose: 0, ok: false };
      }));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <MiniCard title={t("home.crossAssetPulse")}>
      <div style={{ display: "grid", gap: 0 }}>
        {!loaded ? (
          CROSS_ASSET_SYMBOLS.map((_, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
              <SkeletonBlock width={60} height={12} />
              <SkeletonBlock width={120} height={24} />
              <SkeletonBlock width={60} height={12} />
            </div>
          ))
        ) : (
          data.filter(d => d.ok).map(d => (
            <div key={d.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
              <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.ink, fontWeight: 600, minWidth: 50 }}>{labelFor(d.label, t)}</span>
              <Sparkline data={d.spark} color={d.changePct >= 0 ? C.up : C.down} prevClose={d.prevClose} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 90, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600, color: C.ink }}>
                  {d.price >= 100 ? d.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : d.price.toFixed(2)}
                </span>
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: d.changePct >= 0 ? C.up : C.down }}>
                  {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </MiniCard>
  );
}

function SectorPerformanceCard() {
  const { t } = useI18n();
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(SECTOR_ETFS.map(s => fetchQuickQuote(s.symbol))).then(results => {
      if (cancelled) return;
      const items = SECTOR_ETFS.map((s, i) => {
        const r = results[i];
        if (r.status === "fulfilled") return { ...s, changePct: r.value.changePct, ok: true };
        return { ...s, changePct: 0, ok: false };
      }).filter(d => d.ok).sort((a, b) => b.changePct - a.changePct);
      setData(items);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const maxAbs = Math.max(...data.map(d => Math.abs(d.changePct)), 1);
  const barCap = Math.max(maxAbs, 0.5);

  return (
    <MiniCard title={t("home.sectorPerformance")}>
      <div style={{ display: "grid", gap: 0 }}>
        {!loaded ? (
          SECTOR_ETFS.slice(0, 6).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
              <SkeletonBlock width={80} height={10} />
              <SkeletonBlock width="100%" height={10} />
              <SkeletonBlock width={40} height={10} />
            </div>
          ))
        ) : (
          data.map(d => {
            const pct = Math.abs(d.changePct);
            const barW = Math.min(100, (pct / barCap) * 100);
            const color = d.changePct >= 0 ? C.up : C.down;
            const opacity = 0.3 + 0.7 * Math.min(pct / barCap, 1);
            return (
              <div key={d.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                <span style={{ fontSize: 10, fontFamily: "var(--body)", color: C.inkMuted, minWidth: 90, flexShrink: 0 }}>{labelFor(d.label, t)}</span>
                <div style={{ flex: 1, height: 8, background: C.paper, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${barW}%`, background: color, opacity, borderRadius: 4, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color, minWidth: 48, textAlign: "right" }}>
                  {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                </span>
              </div>
            );
          })
        )}
      </div>
    </MiniCard>
  );
}

function YieldCurveCard() {
  const { t } = useI18n();
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(YIELD_CURVE_TENORS.map(t => fetchQuickQuote(t.symbol))).then(results => {
      if (cancelled) return;
      const points = YIELD_CURVE_TENORS.map((t, i) => {
        const r = results[i];
        if (r.status === "fulfilled") return { ...t, yield: r.value.price, ok: true };
        return { ...t, yield: 0, ok: false };
      }).filter(d => d.ok);
      setData(points);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const isNormal = data.length >= 2 && data[data.length - 1].yield > data[0].yield;
  const lineColor = isNormal ? C.up : C.down;

  return (
    <MiniCard title={t("home.yieldCurve")}>
      {!loaded ? (
        <SkeletonBlock height={140} />
      ) : data.length < 2 ? (
        <div style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted, padding: 20, textAlign: "center" }}>{t("home.yieldUnavailable")}</div>
      ) : (
        <div style={{ width: "100%", height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "var(--mono)", fill: C.inkMuted }} axisLine={{ stroke: C.rule }} tickLine={false} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fontFamily: "var(--mono)", fill: C.inkMuted }} axisLine={false} tickLine={false} width={30} tickFormatter={v => v.toFixed(1) + "%"} />
              <Tooltip contentStyle={{ background: C.warmWhite, border: `1px solid ${C.rule}`, fontSize: 11, fontFamily: "var(--mono)" }} formatter={v => [v.toFixed(2) + "%", t("home.yieldLabel")]} />
              <Line type="monotone" dataKey="yield" stroke={lineColor} strokeWidth={2} dot={{ fill: lineColor, r: 4 }} label={{ position: "top", fontSize: 10, fontFamily: "var(--mono)", fill: C.ink, formatter: v => v.toFixed(2) + "%" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </MiniCard>
  );
}

function PortfolioTileCard({ data }) {
  const { t } = useI18n();
  const changeColor = data.dayChangePct >= 0 ? C.up : C.down;
  const changeText = t("home.todayChange", { pct: `${data.dayChangePct >= 0 ? "+" : ""}${data.dayChangePct.toFixed(2)}%` });
  return (
    <MiniCard title={t("home.portfolioSnapshot")}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 30, fontFamily: "var(--display)", color: C.ink }}>{fmtMoney(data.value)}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: changeColor }}>
            {changeText}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 700 }}>{t("home.returnYtd")}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: C.up }}>{data.ytdPct.toFixed(2)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 700 }}>{t("analysis.cash")}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700 }}>{fmtMoney(data.cash)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 700 }}>{t("account.risk")}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700 }}>{translateEnum(data.risk, t, "risk")}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.top.map(t => (
            <span key={t} style={{ fontSize: 11, fontFamily: "var(--mono)", padding: "3px 8px", border: `1px solid ${C.rule}`, color: C.inkMuted }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </MiniCard>
  );
}

function ChangelogBanner() {
  const { t, locale } = useI18n();
  const latestVersion = CHANGELOG[0]?.version || "0.3.12";
  const storageKey = `changelog_dismissed_${latestVersion}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "true"; } catch { return false; }
  });
  const [expanded, setExpanded] = useState(false);

  if (dismissed) return null;

  return (
    <div style={{ background: C.warmWhite, border: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
        <button onClick={() => setExpanded(!expanded)}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, color: C.ink }}>{t("changelog.title", { version: latestVersion })}</span>
          <span style={{ fontSize: 10, color: C.inkFaint, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
        </button>
        <button onClick={() => { setDismissed(true); try { localStorage.setItem(storageKey, "true"); } catch {} }}
          style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, color: C.inkFaint, padding: "0 4px", lineHeight: 1 }}>×</button>
      </div>
      {expanded && (
        <div style={{ padding: "0 16px 14px", display: "grid", gap: 12 }}>
          {CHANGELOG.map((entry) => (
            <div key={entry.version}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: C.ink }}>v{entry.version}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.inkFaint }}>{formatShortDate(entry.date, locale)}</span>
              </div>
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                {entry.items.map((it) => (
                  <div key={it} style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5, paddingLeft: 12, position: "relative" }}>
                    <span style={{ position: "absolute", left: 0, color: C.inkFaint }}>+</span>
                    {t(it)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetRow({ section, onAnalyze }) {
  const { t } = useI18n();
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(section.symbols.map(s => fetchQuickQuote(s.symbol))).then(results => {
      if (cancelled) return;
      const items = section.symbols.map((s, i) => {
        const r = results[i];
        if (r.status === "fulfilled") return { ...s, price: r.value.price, changePct: r.value.changePct, spark: r.value.spark, ok: true };
        return { ...s, price: 0, changePct: 0, spark: [], ok: false };
      });
      setData(items);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [section]);

  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "var(--mono)", marginBottom: 10 }}>
        {labelFor(section.title, t)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 2 }}>
        {!loaded ? (
          section.symbols.map((_, i) => (
            <div key={i} style={{ padding: "8px 10px" }}>
              <SkeletonBlock width={60} height={10} style={{ marginBottom: 4 }} />
              <SkeletonBlock width={80} height={14} />
            </div>
          ))
        ) : (
          data.filter(d => d.ok).map(d => (
            <button
              key={d.symbol}
              type="button"
              onClick={() => onAnalyze?.(d.symbol)}
              style={{
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 4,
                transition: "background 0.15s",
                minWidth: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.warmWhite}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted, fontWeight: 600 }}>{labelFor(d.label, t)}</span>
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: d.changePct >= 0 ? C.up : C.down }}>
                  {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                </span>
              </div>
              <div style={{ fontSize: 15, fontFamily: "var(--mono)", fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                {d.price >= 100 ? d.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : d.price.toFixed(2)}
              </div>
              {d.spark && d.spark.length > 1 && (
                <div style={{ opacity: 0.7 }}>
                  <Sparkline data={d.spark} color={d.changePct >= 0 ? C.up : C.down} />
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME TAB
// ═══════════════════════════════════════════════════════════
function HomeTab({ onAnalyze, region = "Global", onRegionChange, greetingName }) {
  const { t, locale } = useI18n();
  const [indexPage, setIndexPage] = useState(0);
  const [stripData, setStripData] = useState([]);
  const [stripLoading, setStripLoading] = useState(true);
  const [charts, setCharts] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [movers, setMovers] = useState(null);
  const [moversLoading, setMoversLoading] = useState(true);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [trending, setTrending] = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [agoText, setAgoText] = useState("");

  // "Updated Xs ago" counter
  useEffect(() => {
    if (!lastRefresh) return;
    const tick = () => {
      const sec = Math.round((Date.now() - lastRefresh) / 1000);
      setAgoText(sec < 60
        ? t("time.secondsAgo", { count: sec })
        : t("time.minutesAgo", { count: Math.floor(sec / 60) })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastRefresh]);

  const loadRegionData = useCallback(async (rgn, cancelled, skeleton) => {
    const cfg = MARKET_REGIONS[rgn];
    if (skeleton) { setStripLoading(true); setChartsLoading(true); }
    try {
      const data = await fetchTickerStrip(cfg.strip);
      if (!cancelled.current) { setStripData(data); setStripLoading(false); }
    } catch { if (!cancelled.current) setStripLoading(false); }
    try {
      const chartResults = await Promise.allSettled(cfg.charts.map(c => fetchIntradayData(c.symbol)));
      if (!cancelled.current) {
        setCharts(chartResults.map((r, i) => ({
          data: r.status === "fulfilled" ? r.value : null,
          label: cfg.charts[i].label,
        })));
        setChartsLoading(false);
        setLastRefresh(Date.now());
      }
    } catch { if (!cancelled.current) setChartsLoading(false); }
  }, []);

  const loadMovers = useCallback(async (rgn, cancelled) => {
    try {
      const universe = REGION_MOVERS[rgn] || HEATMAP_UNIVERSE;
      const data = await fetchMarketMovers(universe);
      if (!cancelled.current) { setMovers(data); setMoversLoading(false); }
    } catch { if (!cancelled.current) setMoversLoading(false); }
  }, []);

  const loadTrending = useCallback(async (cancelled) => {
    try {
      const results = await Promise.allSettled(DEFAULT_TRENDING.map(s => fetchQuickQuote(s.ticker)));
      if (!cancelled.current) {
        const stocks = DEFAULT_TRENDING.map((s, i) => {
          const r = results[i];
          if (r.status === "fulfilled") return { ...s, price: r.value.price, changePct: r.value.changePct, spark: r.value.spark, prevClose: r.value.prevClose, loaded: true };
          return { ...s, price: 0, changePct: 0, spark: [], loaded: false };
        }).filter(s => s.loaded);
        setTrending(stocks);
        setTrendingLoading(false);
      }
    } catch { if (!cancelled.current) setTrendingLoading(false); }
  }, []);

  useEffect(() => {
    const cancelled = { current: false };

    loadRegionData(region, cancelled, true);
    loadMovers(region, cancelled);
    loadTrending(cancelled);

    const loadNews = async () => {
      try {
        const data = await fetchRSSNews();
        if (!cancelled.current) { setNews(data); setNewsLoading(false); }
      } catch { if (!cancelled.current) { setNews(FALLBACK_NEWS); setNewsLoading(false); } }
    };
    loadNews();

    return () => { cancelled.current = true; };
  }, [region, loadRegionData, loadMovers, loadTrending]);

  // Live tickers polling — refreshes only strip + charts every 30s (lightweight)
  useEffect(() => {
    const cancelled = { current: false };
    const poll = () => {
      loadRegionData(region, cancelled, false);
    };
    const id = setInterval(poll, 30000);
    return () => { cancelled.current = true; clearInterval(id); };
  }, [region, loadRegionData]);

  const handleRegionChange = (rgn) => {
    if (rgn === region) return;
    onRegionChange?.(rgn);
    setIndexPage(0);
    setCharts([]);
    setMovers(null);
    setMoversLoading(true);
  };

  const cfg = MARKET_REGIONS[region];
  const INDEXES_PER_PAGE = 3;
  const totalIndexPages = Math.max(1, Math.ceil(cfg.charts.length / INDEXES_PER_PAGE));
  const safeIndexPage = Math.min(indexPage, totalIndexPages - 1);
  const pageCharts = cfg.charts.slice(
    safeIndexPage * INDEXES_PER_PAGE,
    safeIndexPage * INDEXES_PER_PAGE + INDEXES_PER_PAGE
  );
  const indexActions = totalIndexPages > 1 ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => setIndexPage(p => Math.max(0, p - 1))}
        disabled={safeIndexPage === 0}
        style={{
          padding: "2px 8px",
          border: `1px solid ${C.rule}`,
          background: "transparent",
          color: safeIndexPage === 0 ? C.inkFaint : C.ink,
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10,
        }}
      >
        ←
      </button>
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint }}>
        {safeIndexPage + 1}/{totalIndexPages}
      </span>
      <button
        type="button"
        onClick={() => setIndexPage(p => Math.min(totalIndexPages - 1, p + 1))}
        disabled={safeIndexPage >= totalIndexPages - 1}
        style={{
          padding: "2px 8px",
          border: `1px solid ${C.rule}`,
          background: "transparent",
          color: safeIndexPage >= totalIndexPages - 1 ? C.inkFaint : C.ink,
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10,
        }}
      >
        →
      </button>
    </div>
  ) : null;
  const regionTabStyle = (r) => ({
    padding: "6px 16px", border: `1px solid ${C.rule}`, borderRadius: 20,
    background: region === r ? C.ink : "transparent",
    color: region === r ? C.cream : C.inkMuted,
    fontSize: 11, fontFamily: "var(--body)", fontWeight: 600, cursor: "pointer",
    letterSpacing: "0.06em", transition: "all 0.15s",
  });

  const greetingVariantRef = useRef(Math.floor(Math.random() * 5));
  const dayPart = (() => {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 18) return "afternoon";
    if (h < 22) return "evening";
    return "night";
  })();
  const dayPartLabel = t(`day.${dayPart}`);
  const greetingPhrases = greetingName ? [
    t("greeting.goodDaypart", { dayPart: dayPartLabel }),
    t("greeting.hey"),
    t("greeting.welcomeBack"),
    t("greeting.niceToSeeYou"),
    t("greeting.hello"),
  ] : [
    t("greeting.goodDaypart", { dayPart: dayPartLabel }),
    t("greeting.marketBrief"),
    t("greeting.quickPulse"),
    t("greeting.snapshot"),
    t("greeting.todaysGlance"),
  ];
  const greetingBase = greetingPhrases[greetingVariantRef.current % greetingPhrases.length];
  const greetingText = greetingName ? `${greetingBase}, ${greetingName}` : greetingBase;

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      {/* Ticker Strip */}
      <HelpWrap help={{ title: t("help.tickerStrip.title"), body: t("help.tickerStrip.body") }} block>
        <TickerStrip data={stripData} loading={stripLoading} onAnalyze={onAnalyze} />
      </HelpWrap>

      {/* Region Selector + Updated timestamp */}
      <HelpWrap help={{ title: t("help.region.title"), body: t("help.region.body") }} block>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {Object.keys(MARKET_REGIONS).map((r) => (
            <button key={r} onClick={() => handleRegionChange(r)} style={regionTabStyle(r)}>{labelFor(r, t)}</button>
          ))}
          {lastRefresh && (
            <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.04em" }}>
              {t("home.updated", { ago: agoText })}
            </span>
          )}
        </div>
      </HelpWrap>

      {/* Greeting */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px 12px", marginTop: 6, marginBottom: 6 }}>
        <span style={{ width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <g stroke={C.accent} strokeWidth="1.6" strokeLinecap="round">
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <line x1="4.5" y1="4.5" x2="7.5" y2="7.5" />
              <line x1="16.5" y1="16.5" x2="19.5" y2="19.5" />
              <line x1="4.5" y1="19.5" x2="7.5" y2="16.5" />
              <line x1="16.5" y1="7.5" x2="19.5" y2="4.5" />
            </g>
            <circle cx="12" cy="12" r="3" fill={C.accent} />
          </svg>
        </span>
        <div style={{ fontSize: 22, fontFamily: "var(--display)", color: C.ink, letterSpacing: "-0.01em" }}>
          {greetingText}
        </div>
      </div>

      {/* Headlines + Indexes */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 0.6fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16, minWidth: 0, overflow: "hidden" }}>
          <Section
            title={t("home.marketNews")}
            help={{ title: t("help.marketNews.title"), body: t("help.marketNews.body") }}
          >
            <NewsSection news={news} loading={newsLoading} />
          </Section>
          <HelpWrap help={{ title: t("help.portfolioSnapshot.title"), body: t("help.portfolioSnapshot.body") }} block>
            <PortfolioTileCard data={PORTFOLIO_TILE} />
          </HelpWrap>
        </div>
        <Section
          title={t("home.indexes")}
          actions={indexActions}
          style={{ minWidth: 0 }}
          help={{ title: t("help.indexes.title"), body: t("help.indexes.body") }}
        >
          <div key={safeIndexPage} style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, animation: "fadeIn 0.25s ease" }}>
            {pageCharts.map((c) => {
              const idx = cfg.charts.findIndex(x => x.symbol === c.symbol);
              return (
                <MiniIntradayChart
                  key={c.symbol}
                  data={charts[idx]?.data}
                  label={c.label}
                  loading={chartsLoading && !charts[idx]?.data}
                  onAnalyze={onAnalyze}
                  ticker={c.symbol}
                  compact
                />
              );
            })}
          </div>
        </Section>
      </div>

      {/* Market Movers — 3 columns */}
      <LazySection minHeight={240}>
        <HelpWrap help={{ title: t("help.movers.title"), body: t("help.movers.body") }} block>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <HelpWrap help={{ title: t("help.moverGainers.title"), body: t("help.moverGainers.body") }} block>
              <MoverColumn title={t("home.topGainers")} stocks={movers?.gainers} allStocks={movers?.gainers} loading={moversLoading} onAnalyze={onAnalyze} />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.moverLosers.title"), body: t("help.moverLosers.body") }} block>
              <MoverColumn title={t("home.topLosers")} stocks={movers?.losers} allStocks={movers?.losers} loading={moversLoading} onAnalyze={onAnalyze} />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.moverTrending.title"), body: t("help.moverTrending.body") }} block>
              <MoverColumn title={t("home.trendingStocks")} stocks={trending} allStocks={trending} loading={trendingLoading} onAnalyze={onAnalyze} />
            </HelpWrap>
          </div>
        </HelpWrap>
      </LazySection>

      {/* Asset Class Sections */}
      <LazySection minHeight={200}>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          {ASSET_SECTIONS.map(section => (
            <HelpWrap key={section.title} help={{ title: t("help.assetClasses.title"), body: t("help.assetClasses.body") }} block>
              <AssetRow section={section} onAnalyze={onAnalyze} />
            </HelpWrap>
          ))}
        </div>
      </LazySection>

      {/* Market Brief */}
      <LazySection minHeight={220}>
        <Section
          title={t("home.marketBriefSection")}
          help={{ title: t("help.marketBrief.title"), body: t("help.marketBrief.body") }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
            <HelpWrap help={{ title: t("help.marketScorecard.title"), body: t("help.marketScorecard.body") }} block>
              <MarketScorecardCard />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.crossAsset.title"), body: t("help.crossAsset.body") }} block>
              <CrossAssetCard />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.sectorPerformance.title"), body: t("help.sectorPerformance.body") }} block>
              <SectorPerformanceCard />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.yieldCurve.title"), body: t("help.yieldCurve.body") }} block>
              <YieldCurveCard />
            </HelpWrap>
          </div>
        </Section>
      </LazySection>

      {/* Changelog Banner */}
      <LazySection minHeight={120}>
        <HelpWrap help={{ title: t("help.changelog.title"), body: t("help.changelog.body") }} block>
          <ChangelogBanner />
        </HelpWrap>
      </LazySection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ACCOUNT TAB
// ═══════════════════════════════════════════════════════════
function AccountTab({
  onAnalyze,
  watchlist = [],
  alerts = [],
  recent = [],
  prefs,
  subTab = "overview",
  onSubTabChange,
  onAddWatchlist,
  onRemoveWatchlist,
  onAddAlert,
  onRemoveAlert,
  onOpenAuth,
  session,
  syncState,
  profileName,
  onUpdateName,
  onSignOut,
}) {
  const { t } = useI18n();
  const activeSubTab = subTab || "overview";
  const setActiveSubTab = onSubTabChange || (() => {});
  const [wlInput, setWlInput] = useState("");
  const [alForm, setAlForm] = useState({ ticker: "", type: "above", value: "" });
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [nameInput, setNameInput] = useState(profileName || "");
  const [nameStatus, setNameStatus] = useState("");

  useEffect(() => {
    setNameInput(profileName || "");
  }, [profileName]);

  if (!session) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 320 }}>
        <div style={{ display: "grid", gap: 12, width: "min(360px, 92vw)" }}>
          <button
            onClick={() => onOpenAuth?.("signin")}
            style={{ padding: "12px 16px", background: C.ink, color: C.cream, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            {t("auth.signIn")}
          </button>
          <button
            onClick={() => onOpenAuth?.("signup")}
            style={{ padding: "12px 16px", background: "transparent", color: C.ink, border: `1px solid ${C.rule}`, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            {t("auth.createAccount")}
          </button>
        </div>
      </div>
    );
  }

  const syncLabel = !session
    ? t("account.syncLocal")
    : syncState?.status === "syncing"
      ? t("account.syncing")
      : syncState?.status === "error"
        ? t("account.syncError")
        : syncState?.last
          ? t("account.syncedAgo", { ago: formatAgo(syncState.last, t) })
          : t("account.synced");

  const addWl = async () => {
    const t = wlInput.trim().toUpperCase();
    if (!t) return;
    setBusy(true);
    try { await onAddWatchlist?.(t); } catch (e) { console.error(e); }
    setWlInput(""); setBusy(false);
  };

  const addAlert = async () => {
    if (!alForm.ticker || !alForm.value) return;
    const t = alForm.ticker.trim().toUpperCase();
    const v = parseFloat(alForm.value);
    if (!t || Number.isNaN(v)) return;
    setBusy(true);
    try { await onAddAlert?.(t, alForm.type, v); } catch (e) { console.error(e); }
    setAlForm({ ticker: "", type: "above", value: "" }); setBusy(false);
  };

  const saveName = async () => {
    const next = nameInput.trim();
    if (!next) { setNameStatus(t("account.enterFirstName")); return; }
    if (!session) { setNameStatus(t("account.signInToSave")); return; }
    setProfileBusy(true);
    const res = await onUpdateName?.(next);
    if (res?.error) setNameStatus(res.error);
    else setNameStatus(t("account.saved"));
    setProfileBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <HelpWrap help={{ title: t("help.accountSync.title"), body: t("help.accountSync.body") }} block>
          <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 16, display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--mono)", color: C.inkFaint, marginBottom: 6 }}>{t("account.syncTitle")}</div>
              <div style={{ fontSize: 13, color: C.ink, fontFamily: "var(--body)" }}>
                {session ? t("account.signedInAs", { email: session?.user?.email || t("account.user") }) : t("account.signInToSync")}
              </div>
              {syncState?.error && <div style={{ fontSize: 11, color: C.down, fontFamily: "var(--body)", marginTop: 4 }}>{syncState.error}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted }}>{syncLabel}</span>
              {!session && (
                <button onClick={() => onOpenAuth?.("signin")} style={{ padding: "8px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {t("common.signIn")}
                </button>
              )}
            </div>
          </div>
        </HelpWrap>

        <HelpWrap help={{ title: t("help.profile.title"), body: t("help.profile.body") }} block>
          <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 16, display: "grid", gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--mono)", color: C.inkFaint }}>{t("account.profile")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.ink, color: C.cream, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontWeight: 700 }}>
                {(profileName || session?.user?.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, display: "grid", gap: 6 }}>
                <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder={t("account.firstName")}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "8px 10px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }}
                  disabled={!session} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={saveName} disabled={!session || profileBusy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: !session || profileBusy ? 0.5 : 1 }}>
                    {t("common.save")}
                  </button>
                  {session && (
                    <button onClick={onSignOut} style={{ padding: "6px 12px", background: "transparent", color: C.ink, border: `1px solid ${C.rule}`, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)" }}>
                      {t("common.signOut")}
                    </button>
                  )}
                  {nameStatus && <span style={{ fontSize: 10, color: nameStatus === t("account.saved") ? C.up : C.inkMuted, fontFamily: "var(--mono)" }}>{nameStatus}</span>}
                </div>
              </div>
            </div>
          </div>
        </HelpWrap>
      </div>

      <div style={{ display: "flex", gap: 12, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8 }}>
        {["overview", "preferences"].map(t => (
          <button
            key={t}
            onClick={() => setActiveSubTab(t)}
            style={{
              background: "none",
              border: "none",
              color: activeSubTab === t ? C.ink : C.inkMuted,
              fontSize: 11,
              fontWeight: activeSubTab === t ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontFamily: "var(--body)",
              borderBottom: activeSubTab === t ? `2px solid ${C.ink}` : "none",
              paddingBottom: 6,
            }}
          >
            {t === "overview" ? t("account.overview") : t("account.preferences")}
          </button>
        ))}
      </div>

      {activeSubTab === "overview" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <Section title={t("tools.watchlist")} help={{ title: t("help.accountWatchlist.title"), body: t("help.accountWatchlist.body") }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input value={wlInput} onChange={e => setWlInput(e.target.value)} placeholder={t("tools.ticker")}
                  style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", fontSize: 12, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addWl()} />
                <button onClick={addWl} disabled={busy} style={{ padding: "6px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>{t("tools.add")}</button>
              </div>
              {watchlist.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("tools.emptyWatchlist")}</div>
              ) : (
                watchlist.map(w => (
                  <div key={w.ticker} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13, color: C.ink }}>{w.ticker}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(w.price)}</span>
                        <span style={{ color: w.change >= 0 ? C.up : C.down, fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600 }}>{w.change >= 0 ? "+" : ""}{fmtPct(w.change)}</span>
                      </div>
                      {w.spark && w.spark.length > 1 && (
                        <div style={{ marginTop: 6, opacity: 0.7 }}>
                          <Sparkline data={w.spark} color={w.change >= 0 ? C.up : C.down} prevClose={w.prevClose} width={160} height={44} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: recColor(w.rec), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>
                        {w.rec ? translateEnum(w.rec, t, "signal") : t("common.na")}
                      </span>
                      <button onClick={() => onAnalyze(w.ticker)} style={{ background: "transparent", border: `1px solid ${C.rule}`, color: C.ink, fontSize: 10, fontFamily: "var(--body)", padding: "4px 8px", cursor: "pointer" }}>{t("search.analyze")}</button>
                      <button onClick={() => onRemoveWatchlist?.(w.ticker)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))
              )}
            </Section>

            <Section title={t("tools.alerts")} help={{ title: t("help.accountAlerts.title"), body: t("help.accountAlerts.body") }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={alForm.ticker} onChange={e => setAlForm(p => ({ ...p, ticker: e.target.value }))} placeholder={t("tools.ticker")}
                  style={{ width: 70, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }} />
                <select value={alForm.type} onChange={e => setAlForm(p => ({ ...p, type: e.target.value }))}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 6px", fontSize: 11, fontFamily: "var(--body)", color: C.ink, outline: "none" }}>
                  <option value="above">{t("tools.above")}</option><option value="below">{t("tools.below")}</option>
                </select>
                <input value={alForm.value} onChange={e => setAlForm(p => ({ ...p, value: e.target.value }))} placeholder="$" type="number"
                  style={{ width: 80, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addAlert()} />
                <button onClick={addAlert} disabled={busy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>{t("tools.set")}</button>
              </div>
              {alerts.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("tools.noAlerts")}</div>
              ) : (
                alerts.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12 }}>{a.ticker}</span>
                      <span style={{ color: C.inkMuted, fontSize: 11, marginLeft: 6 }}>{a.type === "above" ? "≥" : "≤"} ${fmt(a.value)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: a.triggered ? C.up : C.hold }}>{a.triggered ? t("tools.triggered") : t("tools.watching")}</span>
                      <button onClick={() => onRemoveAlert?.(a.id)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))
              )}
            </Section>
          </div>

          <Section title={t("account.recentAnalyses")} help={{ title: t("help.accountRecent.title"), body: t("help.accountRecent.body") }}>
            {recent.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("account.noAnalyses")}</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {recent.map(r => {
                  const regimeLabel = r.regime ? translateEnum(r.regime, t, "regime") : t("common.na");
                  const riskTone = r.riskLevel === "HIGH" ? C.down : r.riskLevel === "MEDIUM" ? C.hold : C.up;
                  return (
                    <button
                      key={`${r.ticker}-${r.ts || r.timestamp}`}
                      onClick={() => onAnalyze(r.ticker)}
                      style={{ textAlign: "left", border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 14, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", cursor: "pointer" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13 }}>{r.ticker}</span>
                          <span style={{ color: recColor(r.action), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>
                            {r.action ? translateEnum(r.action, t, "signal") : t("analysis.neutral")}
                          </span>
                          <span style={{ color: C.inkFaint, fontSize: 10, fontFamily: "var(--mono)" }}>{r.period || prefs?.period}/{r.interval || prefs?.interval}</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--body)", marginTop: 4 }}>
                          {r.price != null ? `$${fmt(r.price)}` : "—"} · {formatAgo(r.ts || r.timestamp, t)}
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: recColor(r.action), display: "inline-block" }} />
                            {t("account.signal")} {r.action ? translateEnum(r.action, t, "signal") : t("analysis.neutral")}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, display: "inline-block" }} />
                            {t("account.regime")} {regimeLabel}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: riskTone, display: "inline-block" }} />
                            {t("account.risk")} {r.riskLevel ? translateEnum(r.riskLevel, t, "risk") : t("common.na")}
                          </span>
                          {r.confidence != null && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.inkSoft, display: "inline-block" }} />
                              {t("account.conf")} {Math.round(r.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {r.spark && r.spark.length > 1 && (
                          <Sparkline data={r.spark} prevClose={r.prevClose} color={recColor(r.action)} width={200} height={64} />
                        )}
                        <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--mono)" }}>{t("account.view")} →</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      ) : (
        <Section title={t("account.preferences")} help={{ title: t("help.accountPreferences.title"), body: t("help.accountPreferences.body") }}>
          <div style={{ display: "grid", gap: 6 }}>
            <Row label={t("account.defaultPeriod")} value={prefs?.period || "1y"} />
            <Row label={t("account.defaultInterval")} value={prefs?.interval || "1d"} />
            <Row label={t("account.homeRegion")} value={labelFor(prefs?.region || "Global", t)} border={false} />
          </div>
        </Section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS TAB
// ═══════════════════════════════════════════════════════════
function AnalysisTab({
  result,
  livePrice,
  chartLivePrice,
  latency,
  isPro,
  period,
  interval,
  subTab = "stock",
  onSubTabChange,
  onReanalyze,
  onOpenCharts,
  openChartsLabel,
  helpMode,
  onShowHelp,
  onHideHelp,
}) {
  const { t } = useI18n();
  const activeSubTab = subTab || "stock";
  const setActiveSubTab = onSubTabChange || (() => {});
  const [finPeriod, setFinPeriod] = useState("LTM");
  const [assumptions, setAssumptions] = useState(null);
  const [chartType, setChartType] = useState("line");
  const peerSeed = hashCode(result?.ticker || "PEERS");
  const price = livePrice || result?.currentPrice || 0;
  const prevAnimated = usePrevious(price) ?? price;
  const baseAssumptions = assumptions || result?.valuationModels?.assumptions;
  const liveModels = useMemo(() => runValuationModels(baseAssumptions, price), [baseAssumptions, price]);
  const finSeries = useMemo(() => {
    const periods = result?.fundamentals?.periods || [];
    return periods.slice().reverse().map(p => ({
      period: p.label,
      revenue: (p.revenue || 0) / 1e9,
      netIncome: (p.netIncome || 0) / 1e9,
      fcf: (p.fcf || 0) / 1e9,
      fcfMargin: p.revenue ? ((p.fcf || 0) / p.revenue) * 100 : 0,
      grossMargin: (p.grossMargin || 0) * 100,
      opMargin: (p.opMargin || 0) * 100,
      netMargin: (p.netMargin || 0) * 100,
    }));
  }, [result]);

  const epsSeries = useMemo(() => {
    const shares = result?.fundamentals?.shares || 0;
    if (!shares) return [];
    return finSeries.map(p => ({
      period: p.period,
      eps: (p.netIncome * 1e9) / shares,
    }));
  }, [finSeries, result?.fundamentals?.shares]);
  const ratioSeries = useMemo(() => {
    const labels = ["Q3'24", "Q4'24", "Q1'25", "Q2'25", "Q3'25"];
    const baseCurrent = result?.fundamentals?.ratios?.currentRatio ?? 1.6;
    const baseDebt = result?.fundamentals?.debtToEquity ?? 0.8;
    const baseRoe = (result?.fundamentals?.ratios?.roe ?? 0.15) * 100;
    return labels.map((label, i) => ({
      label,
      currentRatio: baseCurrent * (0.85 + seededRange(peerSeed, 90 + i, 0.85, 1.15)),
      debtToEquity: baseDebt * (0.85 + seededRange(peerSeed, 120 + i, 0.8, 1.2)),
      roe: baseRoe * (0.85 + seededRange(peerSeed, 160 + i, 0.8, 1.2)),
    }));
  }, [peerSeed, result?.fundamentals?.ratios?.currentRatio, result?.fundamentals?.debtToEquity, result?.fundamentals?.ratios?.roe]);


  const targetSeries = useMemo(() => {
    const raw = result?.data || [];
    if (!raw.length) return [];
    const byDay = new Map();
    raw.forEach(d => {
      const day = d.date.slice(0, 10);
      byDay.set(day, d);
    });
    const daily = Array.from(byDay.values());
    const tail = daily.slice(-252);
    if (!tail.length) return [];
    const last = tail[tail.length - 1].Close;
    const target = last * seededRange(peerSeed, 88, 1.1, 1.35);
    return tail.map((d, i) => ({
      i,
      date: d.date,
      past: d.Close,
      target: i === tail.length - 1 ? target : null,
      targetLine: target,
    }));
  }, [result?.data, peerSeed]);

  const chartBase = useMemo(
    () => applyLivePoint(result?.data || [], chartLivePrice, interval || result?.interval),
    [result?.data, chartLivePrice, interval, result?.interval]
  );

  useEffect(() => {
    if (!result) return;
    onSubTabChange?.("stock");
    setFinPeriod(result.fundamentals?.periods?.[0]?.label || "LTM");
    setAssumptions(result.valuationModels?.assumptions || null);
    setChartType("line");
  }, [result, onSubTabChange]);

  if (!result) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 14 }}>
        <BrandMark size={26} muted />
        <div style={{ fontSize: 26, fontFamily: "var(--display)", color: C.inkSoft, marginTop: 10, fontWeight: 400 }}>{t("analysis.enterTicker")}</div>
        <div style={{ fontSize: 13, color: C.inkMuted, fontFamily: "var(--body)" }}>{t("analysis.typeSymbol")}</div>
      </div>
    );
  }

  const { ticker, recommendation: rec, techSignals, regime, statSignals, risk, target, stopLoss, valuation: marketValuation, fundamentals, valuationModels } = result;
  const strat = STRATEGIES[regime.overall] || STRATEGIES.TRANSITIONING;
  const stretchPos = Math.min(100, Math.max(0, marketValuation?.stretch || 0));
  const prevClose = chartBase.length > 1 ? chartBase[chartBase.length - 2].Close : price;
  const change = price - prevClose, pctChange = (change / prevClose) * 100;
  const chartSlice = chartBase.slice(-60);
  const chartData = chartSlice.map((d, i) => {
    const isLast = i === chartSlice.length - 1;
    const live = isLast && chartLivePrice != null ? chartLivePrice : d.Close;
    const high = isLast && chartLivePrice != null ? Math.max(d.High ?? live, live) : d.High;
    const low = isLast && chartLivePrice != null ? Math.min(d.Low ?? live, live) : d.Low;
    return { n: d.date.slice(5), c: live, o: d.Open, h: high, l: low, s20: d.SMA_20, s50: d.SMA_50, bu: d.BB_Upper, bl: d.BB_Lower };
  });
  const finData = fundamentals?.periods?.find(p => p.label === finPeriod) || fundamentals?.periods?.[0];
  const marginRadar = [
    { metric: t("analysis.grossMarginShort"), value: (finData?.grossMargin || 0) * 100 },
    { metric: t("analysis.operatingMarginShort"), value: (finData?.opMargin || 0) * 100 },
    { metric: t("analysis.netMarginShort"), value: (finData?.netMargin || 0) * 100 },
    { metric: t("analysis.fcf"), value: finData?.revenue ? ((finData.fcf || 0) / finData.revenue) * 100 : 0 },
  ];
  const radarMax = Math.max(60, ...marginRadar.map(m => m.value || 0));
  const cashDebt = [
    { name: t("analysis.cash"), value: fundamentals?.cash || 0, color: C.up },
    { name: t("analysis.debt"), value: fundamentals?.debt || 0, color: C.down },
  ];
  const netCash = (fundamentals?.cash || 0) - (fundamentals?.debt || 0);
  const updateAssumption = (key, value) => {
    setAssumptions(prev => ({ ...(prev || valuationModels?.assumptions || {}), [key]: value }));
  };
  const inputVal = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : "";
  const subTabStyle = (t, locked = false) => ({
    padding: "6px 0", marginRight: 18, background: "none", border: "none",
    borderBottom: activeSubTab === t ? `2px solid ${C.ink}` : "2px solid transparent",
    color: activeSubTab === t ? C.ink : locked ? C.inkFaint : C.inkMuted, fontSize: 11, fontWeight: activeSubTab === t ? 700 : 500,
    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)",
    opacity: locked ? 0.7 : 1,
  });
  const chartToggle = (on) => ({
    padding: "4px 10px",
    border: `1px solid ${on ? C.ink : C.rule}`,
    background: on ? C.ink : "transparent",
    color: on ? C.cream : C.inkMuted,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--body)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });
  const openChartsBtn = {
    padding: "4px 10px",
    border: `1px solid ${C.rule}`,
    background: "transparent",
    color: C.inkMuted,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--body)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
  const inputStyle = {
    width: "100%",
    background: "transparent",
    border: `1px solid ${C.rule}`,
    padding: "6px 8px",
    fontSize: 12,
    fontFamily: "var(--mono)",
    color: C.ink,
    outline: "none",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8, marginBottom: 18 }}>
        <button onClick={() => setActiveSubTab("stock")} style={subTabStyle("stock")}>{t("analysis.stockTab")}</button>
        <button onClick={() => setActiveSubTab("financials")} style={subTabStyle("financials", !isPro)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {t("analysis.financialsTab")}
            {!isPro && <ProTag small />}
          </span>
        </button>
      </div>

      {activeSubTab === "stock" && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 14, color: C.inkMuted, fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{ticker}</span>
                {result.source && <LiveBadge latency={latency || result.latency} source={result.source} />}
              </div>
              <AnimatedPrice price={price} prevPrice={prevAnimated} large />
              <div style={{ fontSize: 16, fontWeight: 600, color: change >= 0 ? C.up : C.down, fontFamily: "var(--mono)", marginTop: 4 }}>
                {change >= 0 ? "+" : ""}{fmt(change)} ({change >= 0 ? "+" : ""}{fmt(pctChange, 2)}%)
              </div>
            </div>
            <div style={{ padding: "16px 0", borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8, fontFamily: "var(--body)" }}>{t("analysis.verdict")}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: recColor(rec.action), fontFamily: "var(--display)", lineHeight: 1 }}>
                {translateEnum(rec.action, t, "signal")}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, fontFamily: "var(--body)" }}>
                <span style={{ color: C.inkMuted }}>{t("analysis.confidence")} <strong style={{ color: C.ink }}>{fmtPct(rec.confidence * 100, 0)}</strong></span>
                <span style={{ color: C.inkMuted }}>{t("analysis.score")} <strong style={{ color: C.ink }}>{fmt(rec.score)}</strong></span>
              </div>
              {liveModels?.anchor && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: C.paper, borderLeft: `3px solid ${valColor(liveModels.signal)}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>{t("analysis.valuationAnchor")}</div>
                  <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: C.inkSoft, marginTop: 4 }}>
                    {liveModels.signal} · ${fmt(liveModels.anchor)} {liveModels.upside != null && `(${liveModels.upside >= 0 ? "+" : ""}${fmtPct(liveModels.upside * 100, 1)})`}
                  </div>
                </div>
              )}
            </div>
            {target && (
              <Section title={t("analysis.priceTargets")} help={{ title: t("help.priceTargets.title"), body: t("help.priceTargets.body") }}>
                <Row label={t("analysis.target")} value={`$${fmt(target)}`} color={C.up} />
                <Row label={t("analysis.stopLoss")} value={`$${fmt(stopLoss)}`} color={C.down} />
                <Row label={t("analysis.riskReward")} value={`${fmt(Math.abs(target - price) / Math.abs(price - (stopLoss || price)))}x`} border={false} />
              </Section>
            )}
            <Section title={t("analysis.technicalSignals")} help={{ title: t("help.technicalSignals.title"), body: t("help.technicalSignals.body") }}>
              {Object.entries(techSignals).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                  <span style={{ color: C.inkMuted, fontSize: 12 }}>{k}</span><Signal value={v} />
                </div>
              ))}
            </Section>
            <Section title={t("analysis.riskProfile")} help={{ title: t("help.riskProfile.title"), body: t("help.riskProfile.body") }}>
              <Row label={t("analysis.riskLevel")} value={translateEnum(risk.riskLevel, t, "risk")} color={risk.riskLevel === "HIGH" ? C.down : risk.riskLevel === "MEDIUM" ? C.hold : C.up} />
              <Row label={t("analysis.volatility")} value={fmtPct(risk.volatility)} />
              <Row label={t("analysis.maxDrawdown")} value={fmtPct(risk.maxDrawdown)} color={C.down} />
              <Row label={t("analysis.sharpe")} value={fmt(risk.sharpe)} color={risk.sharpe > 1 ? C.up : risk.sharpe > 0 ? C.hold : C.down} />
              <Row label={t("analysis.sortino")} value={fmt(risk.sortino)} />
              <Row label={t("analysis.var95")} value={fmtPct(risk.var95)} color={C.down} border={false} />
            </Section>
            <Section title={t("analysis.statSignals")} help={{ title: t("help.statSignals.title"), body: t("help.statSignals.body") }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {[
                  { key: "zscore", label: t("analysis.zscore"), desc: t("analysis.zscoreDesc"), value: statSignals.zscore.zscore, unit: "σ", range: [-3, 3] },
                  { key: "momentum", label: t("analysis.momentum"), desc: t("analysis.momentumDesc"), value: statSignals.momentum.avgMomentum, unit: "%", range: [-10, 10] },
                  { key: "volume", label: t("analysis.volume"), desc: t("analysis.volumeDesc"), value: statSignals.volume.volumeZscore, unit: "σ", range: [-3, 3] },
                  { key: "aggregate", label: t("analysis.composite"), desc: t("analysis.compositeDesc"), value: statSignals.aggregate.score, unit: "", range: [-2, 2] },
                ].map(({ key, label, desc, value, unit, range }) => {
                  const sig = statSignals[key];
                  const pct = Math.min(100, Math.max(0, ((value - range[0]) / (range[1] - range[0])) * 100));
                  const gaugeColor = sig.signal.includes("BUY") ? C.up : sig.signal.includes("SELL") ? C.down : C.hold;
                  return (
                    <div key={key} style={{ padding: "12px 14px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, fontFamily: "var(--body)" }}>{label}</div>
                          <div style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", marginTop: 1 }}>{desc}</div>
                        </div>
                        <Signal value={sig.signal} />
                      </div>
                      <div style={{ position: "relative", height: 8, background: C.paper, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: `linear-gradient(90deg, ${C.up}33, ${C.holdBg}, ${C.down}33)` }} />
                        <div style={{ position: "absolute", left: `calc(${pct}% - 5px)`, top: -1, width: 10, height: 10, borderRadius: "50%", background: gaugeColor, border: `2px solid ${C.cream}`, boxShadow: `0 0 6px ${gaugeColor}44` }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--mono)" }}>
                        <span style={{ color: C.up, fontWeight: 600 }}>{t("analysis.buy")}</span>
                        <span style={{ color: C.inkSoft, fontWeight: 700 }}>{fmt(value, 2)}{unit}</span>
                        <span style={{ color: C.down, fontWeight: 600 }}>{t("analysis.sell")}</span>
                      </div>
                      {key === "momentum" && sig.byPeriod && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.ruleFaint}` }}>
                          {Object.entries(sig.byPeriod).map(([period, val]) => (
                            <div key={period} style={{ flex: 1, textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)" }}>{period}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", color: val >= 0 ? C.up : C.down }}>
                                {val >= 0 ? "+" : ""}{fmt(val, 1)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {key === "volume" && (
                        <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.ruleFaint}`, fontSize: 10, fontFamily: "var(--mono)" }}>
                          <div><span style={{ color: C.inkFaint }}>{t("analysis.current")} </span><span style={{ color: C.ink, fontWeight: 600 }}>{sig.currentVolume ? (sig.currentVolume / 1e6).toFixed(1) + "M" : "—"}</span></div>
                          <div><span style={{ color: C.inkFaint }}>{t("analysis.avg")} </span><span style={{ color: C.ink, fontWeight: 600 }}>{sig.avgVolume ? (sig.avgVolume / 1e6).toFixed(1) + "M" : "—"}</span></div>
                        </div>
                      )}
                      {key === "aggregate" && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.ruleFaint}` }}>
                          <div style={{ flex: 1, textAlign: "center", padding: "4px 0", background: C.paper, fontSize: 9, fontFamily: "var(--body)" }}>
                            <div style={{ color: C.inkFaint }}>{t("analysis.confidenceLabel")}</div>
                            <div style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)", fontSize: 13 }}>{fmtPct(sig.confidence * 100, 0)}</div>
                          </div>
                          <div style={{ flex: 1, textAlign: "center", padding: "4px 0", background: C.paper, fontSize: 9, fontFamily: "var(--body)" }}>
                            <div style={{ color: C.inkFaint }}>{t("analysis.direction")}</div>
                            <div style={{ fontWeight: 700, color: gaugeColor, fontFamily: "var(--mono)", fontSize: 11 }}>{sig.signal.replace("STRONG_", "").replace("_", " ")}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <HelpWrap
          enabled={helpMode}
          onShow={onShowHelp}
          onHide={onHideHelp}
          block
          help={{
            title: t("help.priceChart.title"),
            body: t("help.priceChart.body"),
          }}
        >
          <Section title={t("analysis.priceChartTitle")} actions={
            (onReanalyze || onOpenCharts) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {onOpenCharts && (
                  <HelpWrap
                    enabled={helpMode}
                    onShow={onShowHelp}
                    onHide={onHideHelp}
                    help={{ title: t("help.openCharts.title"), body: t("help.openCharts.body") }}
                  >
                    <button
                      onClick={() => onOpenCharts({ mode: "price", title: `${ticker} — Full Period` })}
                      style={openChartsBtn}
                    >
                      {openChartsLabel || t("chart.openCharts")}
                    </button>
                  </HelpWrap>
                )}
                {onReanalyze && (
                  <>
                    <select value={period || "1y"} onChange={e => onReanalyze(ticker, e.target.value, interval)}
                      style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "4px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                      {[["1d","1D"],["5d","5D"],["1mo","1M"],["3mo","3M"],["6mo","6M"],["1y","1Y"],["2y","2Y"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                    <select value={interval || "1d"} onChange={e => onReanalyze(ticker, period, e.target.value)}
                      style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "4px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                      {(["1d","5d"].includes(period) ? [["1m","1m"],["5m","5m"],["15m","15m"],["30m","30m"],["60m","1h"]] : period === "1mo" ? [["15m","15m"],["30m","30m"],["60m","1h"],["1d","1d"]] : [["1d","1d"]]).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </>
                )}
              </div>
            )
          }>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setChartType("line")} style={chartToggle(chartType === "line")}>{t("common.line")}</button>
            <button onClick={() => setChartType("candles")} style={chartToggle(chartType === "candles")}>{t("common.candles")}</button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
              <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={9} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
              <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" name={t("analysis.bbUpper")} />
              <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" name={t("analysis.bbLower")} />
              <Line dataKey="s20" stroke={C.accent + "AA"} dot={false} strokeWidth={1} name={t("analysis.sma20")} />
              <Line dataKey="s50" stroke={C.chart4 + "88"} dot={false} strokeWidth={1} name={t("analysis.sma50")} />
              {chartType === "candles" ? (
                <Customized component={CandlestickSeries} />
              ) : (
                <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={2} name={t("analysis.close")} isAnimationActive animationDuration={CHART_ANIM_MS} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          </Section>
        </HelpWrap>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <Section
                title={t("analysis.valuationAnalysis")}
                help={{ title: t("help.valuationAnalysis.title"), body: t("help.valuationAnalysis.body") }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: valColor(marketValuation.verdict), fontFamily: "var(--display)", marginBottom: 10, lineHeight: 1.2 }}>
                  {translateEnum(marketValuation.verdict, t, "valuation")}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.stretchIndex")}</div>
                  <div style={{ height: 10, background: C.paper, position: "relative", overflow: "hidden", borderRadius: 6 }}>
                    <div style={{ position: "absolute", left: 6, right: 6, top: 4, height: 2, background: `linear-gradient(90deg, ${C.up}, ${C.hold}, ${C.down})` }} />
                    <div style={{
                      position: "absolute",
                      left: `calc(${stretchPos}% - 5px)`,
                      top: 1,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: C.ink,
                      boxShadow: "0 0 8px rgba(26,22,18,0.25)"
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 9, fontFamily: "var(--mono)", color: C.inkFaint }}>
                    <span>{t("analysis.undervalued")}</span><span>{fmt(marketValuation.stretch, 0)}/100</span><span>{t("analysis.overvalued")}</span>
                  </div>
                </div>
                <Row label={t("analysis.vsSma200")} value={`${marketValuation.devSma200 > 0 ? "+" : ""}${fmtPct(marketValuation.devSma200)}`} color={Math.abs(marketValuation.devSma200) > 15 ? C.down : C.inkSoft} />
                <Row label={t("analysis.vsSma50")} value={`${marketValuation.devSma50 > 0 ? "+" : ""}${fmtPct(marketValuation.devSma50)}`} />
                <Row label={t("analysis.bollingerPercentB")} value={fmt(marketValuation.pctB, 2)} color={marketValuation.pctB > 0.8 ? C.down : marketValuation.pctB < 0.2 ? C.up : C.hold} />
                <Row label={t("analysis.range52w")} value={`${fmtPct(marketValuation.range52Pct, 0)} ${t("analysis.fromLow")}`} />
                <Row label={t("analysis.fairValueEst")} value={`$${fmt(marketValuation.fairValue)}`} color={price > marketValuation.fairValue * 1.1 ? C.down : price < marketValuation.fairValue * 0.9 ? C.up : C.hold} border={false} />
              </Section>
              <Section
                title={t("analysis.marketRegime")}
                help={{ title: t("help.marketRegime.title"), body: t("help.marketRegime.body") }}
              >
                <div style={{ fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: "var(--display)", marginBottom: 12, lineHeight: 1.2 }}>
                  {translateEnum(regime.overall, t, "regime")}
                </div>
                <Row label={t("analysis.direction")} value={translateEnum(regime.trend.direction, t, "trend")} color={regime.trend.direction === "UPTREND" ? C.up : regime.trend.direction === "DOWNTREND" ? C.down : C.hold} />
                <Row label={t("analysis.strength")} value={`${fmt(regime.trend.strength, 0)} / 100`} />
                <Row label={t("analysis.volatility")} value={translateEnum(regime.volatility.classification, t, "volatility")} />
                <Row label={t("analysis.hurst")} value={fmt(regime.hurst, 3)} color={regime.hurst > 0.5 ? C.up : C.down} />
                <div style={{ marginTop: 12, padding: "10px 12px", background: C.paper, borderLeft: `3px solid ${C.accent}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, fontFamily: "var(--body)" }}>{t(strat.strategy)}</div>
                  <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4, lineHeight: 1.5, fontFamily: "var(--body)" }}>{strat.tactics.map(k => t(k)).join(" · ")}</div>
                  <div style={{ fontSize: 10, color: C.down, marginTop: 4, fontFamily: "var(--body)" }}>{t("analysis.avoid")}: {strat.avoid.map(k => t(k)).join(", ")}</div>
                </div>
              </Section>
            </div>
            <LazySection minHeight={260}>
              <Section
                title={t("analysis.analystTargets")}
                help={{ title: t("help.analystTargets.title"), body: t("help.analystTargets.body") }}
              >
                <div style={{ padding: "12px 14px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={targetSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="i" hide />
                      <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
                      <Line dataKey="past" stroke={C.ink} dot={false} strokeWidth={2} name={t("analysis.past12Months")} />
                      <Line dataKey="targetLine" stroke="#3B82F6" dot={false} strokeWidth={2} strokeDasharray="4 4" name={t("analysis.target12Month")} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint }}>
                    <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.ink, marginRight: 6 }} />{t("analysis.past12Months")}</span>
                    <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#3B82F6", marginRight: 6 }} />{t("analysis.target12Month")}</span>
                  </div>
                </div>
              </Section>
            </LazySection>
            <LazySection minHeight={420}>
              <Section
                title={t("analysis.companyMetrics")}
                help={{ title: t("help.companyMetrics.title"), body: t("help.companyMetrics.body") }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                  <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                    <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>{t("analysis.earningsPerShare")}</div>
                    {epsSeries.length ? (
                      <ResponsiveContainer width="100%" height={170}>
                        <LineChart data={epsSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                          <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                          <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={36} />
                          <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                            formatter={(v) => [`$${fmt(v, 2)}`, t("analysis.eps")]} />
                          <Line type="monotone" dataKey="eps" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)" }}>{t("analysis.epsUnavailable")}</div>
                    )}
                  </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>{t("analysis.revenue")}</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={finSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${fmt(v, 0)}B`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`$${fmt(v, 2)}B`, t("analysis.revenue")]} />
                      <Line type="monotone" dataKey="revenue" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>{t("analysis.netProfitMargin")}</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={finSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${fmt(v, 0)}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`${fmt(v, 1)}%`, t("analysis.netMargin")]} />
                      <Line type="monotone" dataKey="netMargin" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>{t("analysis.currentRatio")}</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={ratioSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`${fmt(v, 2)}`, t("analysis.currentRatio")]} />
                      <Line type="monotone" dataKey="currentRatio" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>{t("analysis.debtToEquity")}</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={ratioSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`${fmt(v, 2)}`, t("analysis.debtToEquity")]} />
                      <Line type="monotone" dataKey="debtToEquity" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ padding: "10px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>{t("analysis.returnOnEquityTtm")}</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={ratioSeries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${fmt(v, 0)}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`${fmt(v, 2)}%`, t("analysis.roe")]} />
                      <Line type="monotone" dataKey="roe" stroke="#2563EB" dot={{ fill: "#2563EB", r: 2 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Section>
          </LazySection>
          </div>
        </div>
      )}

      {activeSubTab === "financials" && !isPro && (
        <ProGate
          title={t("analysis.financialsProTitle")}
          description={t("analysis.financialsProDesc")}
          features={[
            t("analysis.financialsProF0"),
            t("analysis.financialsProF1"),
            t("analysis.financialsProF2"),
          ]}
        />
      )}

      {activeSubTab === "financials" && isPro && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Section
              title={t("analysis.fundamentalSnapshot")}
              help={{ title: t("help.fundamentalSnapshot.title"), body: t("help.fundamentalSnapshot.body") }}
            >
              <Row label={t("analysis.marketCap")} value={fmtMoney(fundamentals?.marketCap)} />
              <Row label={t("analysis.revenue")} value={fmtMoney(finData?.revenue)} />
              <Row label={t("analysis.netIncome")} value={fmtMoney(finData?.netIncome)} />
              <Row label={t("analysis.freeCashFlow")} value={fmtMoney(finData?.fcf)} />
              <Row label={t("analysis.revenueGrowth")} value={fmtPct((fundamentals?.revenueGrowth || 0) * 100, 1)} />
              <Row label={t("analysis.grossMargin")} value={fmtPct((finData?.grossMargin || 0) * 100)} />
              <Row label={t("analysis.operatingMargin")} value={fmtPct((finData?.opMargin || 0) * 100)} />
              <Row label={t("analysis.netMargin")} value={fmtPct((finData?.netMargin || 0) * 100)} border={false} />
            </Section>
            <Section
              title={t("analysis.balanceSheet")}
              help={{ title: t("help.balanceSheet.title"), body: t("help.balanceSheet.body") }}
            >
              <Row label={t("analysis.cash")} value={fmtMoney(fundamentals?.cash)} />
              <Row label={t("analysis.debt")} value={fmtMoney(fundamentals?.debt)} />
              <Row label={t("analysis.debtToEquity")} value={fmt(fundamentals?.debtToEquity, 2)} />
              <Row label={t("analysis.currentRatio")} value={fmt(fundamentals?.ratios?.currentRatio, 2)} border={false} />
            </Section>
            <Section
              title={t("analysis.perShare")}
              help={{ title: t("help.perShare.title"), body: t("help.perShare.body") }}
            >
              <Row label={t("analysis.eps")} value={`$${fmt(fundamentals?.perShare?.eps, 2)}`} />
              <Row label={t("analysis.fcfPerShare")} value={`$${fmt(fundamentals?.perShare?.fcfPerShare, 2)}`} />
              <Row label={t("analysis.dividendPerShare")} value={`$${fmt(fundamentals?.perShare?.dividendPerShare, 2)}`} border={false} />
            </Section>
            <Section
              title={t("analysis.keyRatios")}
              help={{ title: t("help.keyRatios.title"), body: t("help.keyRatios.body") }}
            >
              <Row label={t("analysis.roe")} value={fmtPct((fundamentals?.ratios?.roe || 0) * 100, 1)} color={(fundamentals?.ratios?.roe || 0) > 0.15 ? C.up : C.hold} />
              <Row label={t("analysis.roa")} value={fmtPct((fundamentals?.ratios?.roa || 0) * 100, 1)} />
              <Row label={t("analysis.pe")} value={fundamentals?.perShare?.eps > 0 ? fmt(price / fundamentals.perShare.eps, 1) : "—"} />
              <Row label={t("analysis.pfcf")} value={fundamentals?.perShare?.fcfPerShare > 0 ? fmt(price / fundamentals.perShare.fcfPerShare, 1) : "—"} border={false} />
            </Section>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Section
              title={t("analysis.financialsOverview")}
              help={{ title: t("help.financialsOverview.title"), body: t("help.financialsOverview.body") }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>{t("analysis.revenueFcfMargin")}</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={finSeries} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={44}
                        tickFormatter={(v) => `$${v}B`} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 60]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32}
                        tickFormatter={(v) => `${v}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                        formatter={(v, name) => [name === t("analysis.fcfMargin") ? `${fmt(v, 1)}%` : `$${fmt(v, 2)}B`, name]} />
                      <Bar yAxisId="left" dataKey="revenue" name={t("analysis.revenue")} fill={C.inkSoft + "AA"} radius={[2, 2, 0, 0]} />
                      <Bar yAxisId="left" dataKey="fcf" name={t("analysis.fcf")} fill={C.accent + "AA"} radius={[2, 2, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="fcfMargin" name={t("analysis.fcfMargin")} stroke={C.up} dot={{ fill: C.up, r: 3 }} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>{t("analysis.marginTrends")}</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={finSeries} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                        formatter={(v) => [`${fmt(v, 1)}%`]} />
                      <Line type="monotone" dataKey="grossMargin" name={t("analysis.grossMarginShort")} stroke={C.up} dot={{ fill: C.up, r: 3 }} strokeWidth={2} />
                      <Line type="monotone" dataKey="opMargin" name={t("analysis.operatingMarginShort")} stroke={C.accent} dot={{ fill: C.accent, r: 3 }} strokeWidth={2} />
                      <Line type="monotone" dataKey="netMargin" name={t("analysis.netMarginShort")} stroke={C.chart4} dot={{ fill: C.chart4, r: 3 }} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4, fontSize: 9, fontFamily: "var(--mono)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 3, background: C.up }} />{t("analysis.grossMarginShort")}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 3, background: C.accent }} />{t("analysis.operatingMarginShort")}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 3, background: C.chart4 }} />{t("analysis.netMarginShort")}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>{t("analysis.marginRadar")}</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <RadarChart data={marginRadar}>
                      <PolarGrid stroke={C.ruleFaint} />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} />
                      <PolarRadiusAxis angle={90} domain={[0, radarMax]} tick={{ fill: C.inkFaint, fontSize: 8, fontFamily: "var(--mono)" }} />
                      <Radar dataKey="value" stroke={C.ink} fill={C.accent + "55"} strokeWidth={1.5} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>{t("analysis.cashVsDebt")}</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={cashDebt} dataKey="value" nameKey="name" innerRadius={32} outerRadius={50} paddingAngle={2} stroke="none">
                        {cashDebt.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [fmtMoney(v)]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted }}>
                    <span>{t("analysis.netCash")}</span>
                    <span style={{ color: netCash >= 0 ? C.up : C.down, fontWeight: 700 }}>{fmtMoney(netCash)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 6, fontSize: 9, fontFamily: "var(--mono)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, background: C.up, borderRadius: 2 }} />{t("analysis.cash")} {fmtMoney(fundamentals?.cash)}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, background: C.down, borderRadius: 2 }} />{t("analysis.debt")} {fmtMoney(fundamentals?.debt)}</span>
                  </div>
                </div>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)", fontWeight: 600 }}>{t("analysis.earningsPerShare")}</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={finSeries} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={30} tickFormatter={v => `$${v.toFixed(0)}B`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 10 }}
                        formatter={(v) => [`$${fmt(v, 2)}B`]} />
                      <Bar dataKey="netIncome" name={t("analysis.netIncome")} fill={C.chart4 + "BB"} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ textAlign: "center", fontSize: 9, fontFamily: "var(--mono)", color: C.inkFaint, marginTop: 4 }}>{t("analysis.netIncomeByPeriod")}</div>
                </div>
              </div>
            </Section>
            <Section
              title={t("analysis.fundamentalDataAggregator")}
              help={{ title: t("help.fundamentalData.title"), body: t("help.fundamentalData.body") }}
            >
              <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.5, marginBottom: 10 }}>
                {t("analysis.fundamentalDataDesc")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--body)" }}>{t("analysis.fiscalPeriod")}</span>
                <select value={finPeriod} onChange={e => setFinPeriod(e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}>
                  {(fundamentals?.periods || []).map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                <span style={{ marginLeft: "auto", fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)" }}>{t("analysis.source")}: {fundamentals?.source}</span>
              </div>
              <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--mono)" }}>
                  <thead>
                    <tr style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: C.inkMuted }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>{t("analysis.period")}</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>{t("analysis.revenue")}</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>{t("analysis.netIncome")}</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>{t("analysis.fcf")}</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>{t("analysis.netMargin")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fundamentals?.periods || []).map(p => (
                      <tr key={p.label} onClick={() => setFinPeriod(p.label)}
                        style={{ background: p.label === finPeriod ? C.paper : "transparent", cursor: "pointer", borderBottom: `1px solid ${C.ruleFaint}` }}>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{p.label}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtMoney(p.revenue)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtMoney(p.netIncome)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtMoney(p.fcf)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtPct((p.netMargin || 0) * 100, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section title={t("analysis.valuationToolkit")} help={{ title: t("help.valuationToolkit.title"), body: t("help.valuationToolkit.body") }}>
              <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.5, marginBottom: 10 }}>
                {t("analysis.valuationDesc")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.fcfPerShare")}</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.fcfPerShare)} onChange={e => updateAssumption("fcfPerShare", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.eps")}</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.eps)} onChange={e => updateAssumption("eps", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.dividendPerShare")}</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.dividendPerShare)} onChange={e => updateAssumption("dividendPerShare", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.growth5y")}</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.growthRate || 0) * 100, 1)} onChange={e => updateAssumption("growthRate", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.discountWacc")}</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.discountRate || 0) * 100, 1)} onChange={e => updateAssumption("discountRate", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.terminalGrowth")}</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.terminalGrowth || 0) * 100, 1)} onChange={e => updateAssumption("terminalGrowth", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.targetPE")}</div>
                  <input type="number" step="0.1" value={inputVal(assumptions?.targetPE, 1)} onChange={e => updateAssumption("targetPE", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{t("analysis.projectionYears")}</div>
                  <input type="number" step="1" min="3" max="10" value={inputVal(assumptions?.years, 0)} onChange={e => updateAssumption("years", Math.max(1, parseInt(e.target.value || "0", 10)))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 12 }}>
                {[
                  [t("analysis.dcf"), liveModels.dcf],
                  [t("analysis.dividendDiscount"), liveModels.ddm],
                  [t("analysis.multiples"), liveModels.multiples],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: "8px 10px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                    <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--mono)", color: C.ink }}>{value ? `$${fmt(value)}` : "—"}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: "10px 12px", background: C.paper, borderLeft: `3px solid ${valColor(liveModels.signal)}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>{t("analysis.valuationAnchor")}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: valColor(liveModels.signal), fontFamily: "var(--display)", marginTop: 4 }}>
                  {translateEnum(liveModels.signal, t, "valuation")}
                </div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4, fontFamily: "var(--mono)" }}>
                  {t("analysis.anchor")} {liveModels.anchor ? `$${fmt(liveModels.anchor)}` : "—"} · {t("analysis.upside")} {liveModels.upside != null ? `${liveModels.upside >= 0 ? "+" : ""}${fmtPct(liveModels.upside * 100, 1)}` : "—"}
                </div>
                <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 4, fontFamily: "var(--body)" }}>{t("analysis.usedAsContext")}</div>
              </div>
              {liveModels.issues.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 10, color: C.down, fontFamily: "var(--body)" }}>
                  {liveModels.issues.map(k => t(k)).join(" ")}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CHARTS TAB
// ═══════════════════════════════════════════════════════════
function ChartsTab({
  result,
  chartLivePrice,
  period,
  interval,
  onReanalyze,
  intent,
  onConsumeIntent,
  expandedMode,
  onExpandedModeChange,
  chartType,
  onChartTypeChange,
}) {
  const { t } = useI18n();
  const [show, setShow] = useState({ sma: true, bb: true, vol: true, rsi: true, macd: false, stoch: false });
  const data = result?.data;
  const ticker = result?.ticker || "";
  const toggle = k => setShow(p => ({ ...p, [k]: !p[k] }));
  const activeChartType = chartType || "line";
  const cd = useMemo(() => {
    if (!data || !data.length) return [];
    const base = applyLivePoint(data, chartLivePrice, interval || result?.interval);
    return base.map((d, i) => {
      const isLast = i === base.length - 1;
      const live = isLast && chartLivePrice != null ? chartLivePrice : d.Close;
      const high = isLast && chartLivePrice != null ? Math.max(d.High ?? live, live) : d.High;
      const low = isLast && chartLivePrice != null ? Math.min(d.Low ?? live, live) : d.Low;
      return {
        n: d.date.slice(5), c: live, o: d.Open, h: high, l: low, v: d.Volume,
        s20: d.SMA_20, s50: d.SMA_50, s200: d.SMA_200, bu: d.BB_Upper, bl: d.BB_Lower, bm: d.BB_Middle,
        rsi: d.RSI, macd: d.MACD, ms: d.MACD_Signal, mh: d.MACD_Hist, sk: d.Stoch_K, sd: d.Stoch_D
      };
    });
  }, [data, chartLivePrice, interval, result?.interval]);
  const btn = (on) => ({ padding: "5px 14px", border: `1px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.cream : C.inkMuted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.04em" });
  const h = show.rsi || show.macd || show.stoch ? 260 : 380;
  const expandBtn = { padding: "4px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" };

  useEffect(() => {
    onChartTypeChange?.("line");
    onExpandedModeChange?.(null);
  }, [result?.ticker, onChartTypeChange, onExpandedModeChange]);

  useEffect(() => {
    if (!intent || !result) return;
    onExpandedModeChange?.(normalizeChartMode(intent.mode) || "price");
    onConsumeIntent?.();
  }, [intent, result, ticker, onConsumeIntent, onExpandedModeChange]);

  const expandedTitle = useMemo(() => {
    if (!expandedMode) return "";
    if (expandedMode === "price") return t("charts.fullPeriod", { ticker });
    if (expandedMode === "volume") return `${ticker} — ${t("charts.volumeTitle")}`;
    if (expandedMode === "rsi") return `${ticker} — ${t("charts.rsiTitle")}`;
    if (expandedMode === "macd") return `${ticker} — ${t("charts.macdTitle")}`;
    if (expandedMode === "stoch") return `${ticker} — ${t("charts.stochTitle")}`;
    return `${ticker} — ${t("charts.fullPeriod", { ticker })}`;
  }, [expandedMode, ticker, t]);
  const expanded = expandedMode ? { mode: expandedMode, title: expandedTitle } : null;

  if (!result) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: C.inkMuted, fontFamily: "var(--display)", fontSize: 24 }}>{t("charts.runAnalysisFirst")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <HelpWrap help={{ title: t("help.chartsControls.title"), body: t("help.chartsControls.body") }} block>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${C.rule}`, paddingBottom: 12, alignItems: "center" }}>
          {[
            ["sma", t("charts.movingAvg")],
            ["bb", t("charts.bollinger")],
            ["vol", t("charts.volume")],
            ["rsi", t("charts.rsi")],
            ["macd", t("charts.macd")],
            ["stoch", t("charts.stochastic")]
          ].map(([k, l]) => (
            <button key={k} onClick={() => toggle(k)} style={btn(show[k])}>{l}</button>
          ))}
          <span style={{ marginLeft: 8, fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.1em" }}>{t("charts.chart")}</span>
          <button onClick={() => onChartTypeChange?.("line")} style={btn(activeChartType === "line")}>{t("common.line")}</button>
          <button onClick={() => onChartTypeChange?.("candles")} style={btn(activeChartType === "candles")}>{t("common.candles")}</button>
          {onReanalyze && (
            <>
              <span style={{ marginLeft: 8, fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.1em" }}>{t("charts.period")}</span>
              <select value={period || "1y"} onChange={e => onReanalyze(ticker, e.target.value, interval)}
                style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "4px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                {[["1d","1D"],["5d","5D"],["1mo","1M"],["3mo","3M"],["6mo","6M"],["1y","1Y"],["2y","2Y"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
              <select value={interval || "1d"} onChange={e => onReanalyze(ticker, period, e.target.value)}
                style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "4px 6px", color: C.inkMuted, fontSize: 10, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                {(["1d","5d"].includes(period) ? [["1m","1m"],["5m","5m"],["15m","15m"],["30m","30m"],["60m","1h"]] : period === "1mo" ? [["15m","15m"],["30m","30m"],["60m","1h"],["1d","1d"]] : [["1d","1d"]]).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </>
          )}
        </div>
      </HelpWrap>
      <Section title={t("charts.fullPeriod", { ticker })} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("price")}>{t("common.expand")}</button>}>
        <ResponsiveContainer width="100%" height={h}>
          <ComposedChart data={cd} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
            <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={Math.floor(cd.length / 12)} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
            <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
            {show.bb && <><Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" /><Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" /><Line dataKey="bm" stroke={C.inkFaint} dot={false} strokeWidth={1} opacity={0.4} /></>}
            {show.sma && <><Line dataKey="s20" stroke={C.accent} dot={false} strokeWidth={1} /><Line dataKey="s50" stroke={C.chart4} dot={false} strokeWidth={1} /><Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} /></>}
            {activeChartType === "candles" ? <Customized component={CandlestickSeries} /> : <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive animationDuration={CHART_ANIM_MS} />}
            <Brush dataKey="n" height={18} stroke={C.rule} fill={C.warmWhite} travellerWidth={7} />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
      {show.vol && (
        <LazySection minHeight={120}>
          <Section title={t("charts.volumeTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("volume")}>{t("common.expand")}</button>}>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={cd} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="n" hide /><YAxis hide />
                <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </LazySection>
      )}
      <LazySection minHeight={180}>
        <div style={{ display: "grid", gridTemplateColumns: [show.rsi, show.macd, show.stoch].filter(Boolean).length > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
          {show.rsi && (
            <Section title={t("charts.rsiTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("rsi")}>{t("common.expand")}</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[30, 70]} axisLine={false} tickLine={false} width={30} />
                  <ReferenceLine y={70} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
          {show.macd && (
            <Section title={t("charts.macdTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("macd")}>{t("common.expand")}</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <ComposedChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" hide /><YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={0} stroke={C.rule} />
                  <Bar dataKey="mh" fill={C.inkSoft + "20"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                  <Line dataKey="macd" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="ms" stroke={C.accent} dot={false} strokeWidth={1} />
                </ComposedChart>
              </ResponsiveContainer>
            </Section>
          )}
          {show.stoch && (
            <Section title={t("charts.stochTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("stoch")}>{t("common.expand")}</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={30} />
                  <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
        </div>
      </LazySection>
      {expanded && (
        <ExpandedChartModal
          title={expanded.title}
          mode={expanded.mode}
          data={cd}
          dataKey={ticker}
          onClose={() => onExpandedModeChange?.(null)}
          period={period}
          interval={interval}
          onReanalyze={onReanalyze}
          ticker={ticker}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HEATMAP TAB (Treemap: size=cap, color=Sharpe)
// ═══════════════════════════════════════════════════════════
function squarify(items, W, H) {
  if (!items.length) return [];
  const total = items.reduce((s, i) => s + i.size, 0);
  const scaled = items.map(i => ({ ...i, area: (i.size / total) * W * H })).sort((a, b) => b.area - a.area);
  const rects = [];
  let rem = [...scaled], x = 0, y = 0, w = W, h = H;
  function worst(row, side) {
    const rowArea = row.reduce((s, r) => s + r.area, 0), rowW = rowArea / side;
    let mx = 0;
    for (const r of row) { const rh = r.area / rowW; const asp = Math.max(rowW / rh, rh / rowW); if (asp > mx) mx = asp; }
    return mx;
  }
  while (rem.length > 0) {
    const vert = w < h;
    const side = vert ? w : h;
    let row = [rem[0]], rowArea = rem[0].area;
    for (let i = 1; i < rem.length; i++) {
      const nr = [...row, rem[i]], na = rowArea + rem[i].area;
      if (worst(nr, side) <= worst(row, side)) { row = nr; rowArea = na; } else break;
    }
    const rowSize = rowArea / side;
    let off = 0;
    for (const item of row) {
      const itemSize = item.area / rowSize;
      rects.push({ ...item, x: vert ? x + off : x, y: vert ? y : y + off, w: vert ? itemSize : rowSize, h: vert ? rowSize : itemSize });
      off += itemSize;
    }
    if (vert) { y += rowSize; h -= rowSize; } else { x += rowSize; w -= rowSize; }
    rem = rem.slice(row.length);
  }
  return rects;
}

function sharpeToColor(s) {
  if (s > 1.5) return "#0D5F2C"; if (s > 1) return "#1B6B3A"; if (s > 0.5) return "#3D8B5A";
  if (s > 0) return "#8BAA7A"; if (s > -0.5) return "#C4A05A"; if (s > -1) return "#C47A5A";
  return "#9B1B1B";
}

function HeatmapPanel({ indexName, universe }) {
  const { t } = useI18n();
  const [stocks, setStocks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(null);
  const [progress, setProgress] = useState("");
  const [viewRef, inView] = useInView("300px 0px");
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 420 });

  useEffect(() => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setDims({ w: r.width || 800, h: 420 });
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const total = universe.length;
    let completed = 0;
    setProgress(`0/${total}`);
    const tasks = universe.map(async (s) => {
      try {
        const fd = await fetchStockData(s.ticker, "6mo");
        if (fd.data) {
          const analysis = runAnalysis(s.ticker, fd.data);
          const ret = analysis.data.length > 1 ? ((analysis.currentPrice - analysis.data[0].Close) / analysis.data[0].Close * 100) : 0;
          return { ...s, sharpe: analysis.risk.sharpe, vol: analysis.risk.volatility, ret, price: analysis.currentPrice, rec: analysis.recommendation.action };
        }
          return { ...s, sharpe: 0, vol: 0, ret: 0, price: 0, rec: "N/A" };
      } catch (e) {
        return { ...s, sharpe: 0, vol: 0, ret: 0, price: 0, rec: "N/A" };
      } finally {
        completed += 1;
        setProgress(`${completed}/${total} — ${s.ticker}`);
      }
    });
    const results = await Promise.all(tasks);
    setStocks(results);
    setLoading(false);
    setProgress("");
  }, [universe]);

  useEffect(() => {
    if (inView && !stocks && !loading) {
      load();
    }
  }, [inView, stocks, loading, load]);

  const sectors = useMemo(() => {
    if (!stocks) return [];
    const sectorMap = {};
    stocks.forEach(s => {
      if (!sectorMap[s.sector]) sectorMap[s.sector] = [];
      sectorMap[s.sector].push(s);
    });
    return Object.entries(sectorMap).sort((a, b) => {
      const capA = a[1].reduce((sum, s) => sum + s.cap, 0);
      const capB = b[1].reduce((sum, s) => sum + s.cap, 0);
      return capB - capA;
    });
  }, [stocks]);

  const rects = stocks ? squarify(stocks.map(s => ({ ...s, size: s.cap })), dims.w, dims.h) : [];

  return (
    <div ref={viewRef} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, fontFamily: "var(--display)", letterSpacing: "-0.01em" }}>{labelFor(indexName, t)}</div>
          <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", marginTop: 1 }}>
            {t("heatmap.panelMeta", { count: universe.length })}
          </div>
        </div>
      </div>
      <div ref={containerRef} style={{ position: "relative", width: "100%", height: 420, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
        {!stocks && !loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
            <button onClick={load} style={{ padding: "10px 28px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {t("heatmap.load")}
            </button>
            <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)" }}>
              {t("heatmap.fetches", { count: universe.length })}
            </span>
          </div>
        )}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
            <BrandMark size={18} muted />
            <span style={{ fontFamily: "var(--display)", color: C.inkMuted, fontSize: 14 }}>{t("heatmap.fetching", { count: universe.length })}</span>
            <span style={{ fontFamily: "var(--mono)", color: C.inkFaint, fontSize: 11 }}>{progress}</span>
          </div>
        )}
        {rects.map((r) => (
          <div key={r.ticker} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)}
            style={{ position: "absolute", left: r.x, top: r.y, width: r.w - 1, height: r.h - 1, background: sharpeToColor(r.sharpe), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", border: `1px solid ${C.cream}33`, transition: "opacity 0.15s", opacity: hover && hover.ticker !== r.ticker ? 0.7 : 1 }}>
            {r.w > 40 && r.h > 25 && <span style={{ fontSize: Math.min(14, r.w / 5), fontWeight: 700, color: "#fff", fontFamily: "var(--mono)", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>{r.ticker}</span>}
            {r.w > 60 && r.h > 40 && <span style={{ fontSize: Math.min(10, r.w / 8), color: "#ffffffCC", fontFamily: "var(--mono)", marginTop: 2 }}>{r.ret > 0 ? "+" : ""}{fmt(r.ret, 1)}%</span>}
            {r.w > 80 && r.h > 55 && <span style={{ fontSize: 8, color: "#ffffff88", fontFamily: "var(--body)", marginTop: 1 }}>{labelFor(r.sector, t)}</span>}
          </div>
        ))}
        {hover && (
          <div style={{ position: "absolute", bottom: 8, left: 8, background: C.cream + "F0", border: `1px solid ${C.rule}`, padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.6, zIndex: 10, boxShadow: "2px 4px 12px rgba(0,0,0,0.06)" }}>
            <strong>{hover.ticker}</strong> — {hover.name}<br />
            <span style={{ color: C.inkMuted }}>{t("heatmap.sector")}:</span> {labelFor(hover.sector, t)} · ${fmt(hover.price)} · {t("heatmap.sharpe")} {fmt(hover.sharpe)} · {fmtPct(hover.ret)} {t("heatmap.sixMonths")} · {hover.rec === "N/A" ? t("common.na") : translateEnum(hover.rec, t, "signal")}
          </div>
        )}
        {stocks && (
          <button onClick={load} style={{ position: "absolute", top: 8, right: 8, padding: "4px 12px", background: C.cream + "E0", border: `1px solid ${C.rule}`, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted, cursor: "pointer", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {t("heatmap.refresh")}
          </button>
        )}
      </div>
      {stocks && (
        <>
          <div style={{ display: "flex", gap: 10, fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("heatmap.sharpe")}:</span>
            {[[-1, "< -1"], [-0.5, "-0.5"], [0, "0"], [0.5, "0.5"], [1, "1"], [1.5, "> 1.5"]].map(([v, l]) => (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 10, height: 10, background: sharpeToColor(v) }} />{l}
              </span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {sectors.map(([sectorName, sectorStocks]) => (
              <div key={sectorName} style={{ background: C.warmWhite, border: `1px solid ${C.rule}`, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: SECTOR_COLORS[sectorName] || C.inkMuted, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--body)" }}>{labelFor(sectorName, t)}</span>
                  <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)", marginLeft: "auto" }}>{sectorStocks.length}</span>
                </div>
                {sectorStocks.sort((a, b) => b.cap - a.cap).map(s => (
                  <div key={s.ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: C.ink }}>{s.ticker}</span>
                      <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)" }}>{s.name}</span>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: s.ret >= 0 ? C.up : C.down }}>
                      {s.ret >= 0 ? "+" : ""}{fmt(s.ret, 1)}%
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HeatmapTab() {
  const indexNames = Object.keys(HEATMAP_INDEXES);
  const { t } = useI18n();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <HelpWrap help={{ title: t("help.heatmapOverview.title"), body: t("help.heatmapOverview.body") }} block>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--body)", marginBottom: 4 }}>{t("heatmap.marketHeatmaps")}</div>
          <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--body)" }}>{t("heatmap.subtitle")}</div>
        </div>
      </HelpWrap>
      {indexNames.map(name => (
        <HeatmapPanel key={name} indexName={name} universe={HEATMAP_INDEXES[name]} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPARISON TAB
// ═══════════════════════════════════════════════════════════
const COMP_LINE_COLORS = ["#1A1612", "#8B2500", "#5B4A8A", "#1B6B3A", "#D4A017", "#2E86AB", "#A23B72", "#C73E1D"];

function ComparisonTab() {
  const { t } = useI18n();
  const [tickers, setTickers] = useState("AAPL, MSFT, GOOGL, AMZN");
  const [results, setResults] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [error, setError] = useState(null);

  const run = async () => {
    setLoading(true); setError(null);
    const list = tickers.split(",").map(sym => sym.trim().toUpperCase()).filter(Boolean);
    const dataMap = {};
    const tasks = list.map(async (symbol) => {
      try {
        const fd = await fetchStockData(symbol, "6mo");
        if (fd.data) {
          const a = runAnalysis(symbol, fd.data);
          dataMap[symbol] = fd.data;
          return { ticker: symbol, price: a.currentPrice, rec: a.recommendation.action, conf: a.recommendation.confidence, regime: a.regime.overall, risk: a.risk.riskLevel, sharpe: a.risk.sharpe, vol: a.risk.volatility, maxDD: a.risk.maxDrawdown, mom: a.statSignals.momentum.avgMomentum, stretch: a.valuation.stretch };
        }
        return { ticker: symbol, price: 0, rec: "N/A", conf: 0, regime: "N/A", risk: "N/A", sharpe: 0, vol: 0, maxDD: 0, mom: 0, stretch: 0 };
      } catch (e) {
        setError(prev => (prev || "") + `${symbol}: ${e.message || t("comparison.failed")}; `);
        return { ticker: symbol, price: 0, rec: "N/A", conf: 0, regime: "N/A", risk: "N/A", sharpe: 0, vol: 0, maxDD: 0, mom: 0, stretch: 0 };
      }
    });
    const res = await Promise.all(tasks);
    setResults(res);
    setRawData(dataMap);
    setLoading(false);
  };

  const sorted = useMemo(() => {
    if (!results || !sortCol) return results;
    return [...results].sort((a, b) => ((a[sortCol] > b[sortCol] ? 1 : -1) * sortDir));
  }, [results, sortCol, sortDir]);

  const overlayData = useMemo(() => {
    if (!rawData || !results) return null;
    const validTickers = results.filter(r => rawData[r.ticker] && rawData[r.ticker].length > 10).map(r => r.ticker);
    if (validTickers.length < 2) return null;
    const minLen = Math.min(...validTickers.map(symbol => rawData[symbol].length));
    const chartPoints = [];
    for (let i = 0; i < minLen; i++) {
      const point = { date: rawData[validTickers[0]][i].date.slice(5) };
      validTickers.forEach(symbol => {
        const base = rawData[symbol][0].Close;
        point[symbol] = base > 0 ? ((rawData[symbol][i].Close - base) / base) * 100 : 0;
      });
      chartPoints.push(point);
    }
    return { data: chartPoints, tickers: validTickers };
  }, [rawData, results]);

  const doSort = col => { if (sortCol === col) setSortDir(-sortDir); else { setSortCol(col); setSortDir(1); } };

  const thStyle = (col) => ({
    padding: "6px 8px", textAlign: "right", cursor: "pointer",
    color: sortCol === col ? C.ink : C.inkMuted, fontSize: 9, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--body)",
    borderBottom: `2px solid ${C.ink}`, userSelect: "none", whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <HelpWrap help={{ title: t("help.comparisonInput.title"), body: t("help.comparisonInput.body") }} block>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={tickers} onChange={e => setTickers(e.target.value)} placeholder={t("comparison.placeholder")}
            style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "8px 12px", color: C.ink, fontSize: 13, fontFamily: "var(--mono)", letterSpacing: "0.06em", outline: "none" }}
            onKeyDown={e => e.key === "Enter" && run()} />
          <button onClick={run} disabled={loading}
            style={{ padding: "8px 24px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase", opacity: loading ? 0.5 : 1 }}>
            {loading ? t("comparison.running") : t("comparison.compare")}
          </button>
        </div>
      </HelpWrap>
      {error && <div style={{ padding: "6px 12px", background: C.downBg, color: C.down, fontSize: 11, fontFamily: "var(--mono)" }}>{error}</div>}
      {sorted && (
        <>
          {overlayData && (
            <Section
              title={t("comparison.normalizedPerformance")}
              help={{ title: t("help.comparisonPerformance.title"), body: t("help.comparisonPerformance.body") }}
            >
              <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                {overlayData.tickers.map((t, i) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>
                    <span style={{ width: 12, height: 3, background: COMP_LINE_COLORS[i % COMP_LINE_COLORS.length] }} />
                    {t}
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={overlayData.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={Math.floor(overlayData.data.length / 10)} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={45} tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
                  <ReferenceLine y={0} stroke={C.rule} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                    formatter={(v, name) => [`${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`, name]} />
                  {overlayData.tickers.map((t, i) => (
                    <Line key={t} dataKey={t} stroke={COMP_LINE_COLORS[i % COMP_LINE_COLORS.length]} dot={false} strokeWidth={1.8} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
          <HelpWrap help={{ title: t("help.comparisonTable.title"), body: t("help.comparisonTable.body") }} block>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle(null), textAlign: "left", cursor: "default" }}>{t("comparison.ticker")}</th>
                    <th style={thStyle("price")} onClick={() => doSort("price")}>{t("comparison.price")}{sortCol === "price" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                    <th style={thStyle("rec")} onClick={() => doSort("rec")}>{t("comparison.signal")}{sortCol === "rec" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                    <th style={thStyle("conf")} onClick={() => doSort("conf")}>{t("comparison.conf")}{sortCol === "conf" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                    <th style={thStyle("sharpe")} onClick={() => doSort("sharpe")}>{t("comparison.sharpe")}{sortCol === "sharpe" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                    <th style={thStyle("vol")} onClick={() => doSort("vol")}>{t("comparison.vol")}{sortCol === "vol" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                    <th style={thStyle("maxDD")} onClick={() => doSort("maxDD")}>{t("comparison.maxDD")}{sortCol === "maxDD" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                    <th style={thStyle("mom")} onClick={() => doSort("mom")}>{t("comparison.momentum")}{sortCol === "mom" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                    <th style={thStyle("stretch")} onClick={() => doSort("stretch")}>{t("comparison.stretch")}{sortCol === "stretch" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.ticker} style={{ borderBottom: `1px solid ${C.ruleFaint}`, background: i % 2 ? C.warmWhite + "80" : "transparent" }}>
                      <td style={{ padding: "8px", fontWeight: 700, color: C.ink, fontFamily: "var(--mono)", fontSize: 12 }}>{r.ticker}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(r.price)}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>
                        <span style={{ color: recColor(r.rec), fontWeight: 700, fontSize: 10, fontFamily: "var(--mono)" }}>
                          {r.rec === "N/A" || !r.rec ? t("common.na") : translateEnum(r.rec, t, "signal")}
                        </span>
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11 }}>{fmtPct(r.conf * 100, 0)}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: r.sharpe > 1 ? C.up : r.sharpe > 0 ? C.hold : C.down }}>{fmt(r.sharpe)}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11 }}>{fmtPct(r.vol)}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: C.down }}>{fmtPct(r.maxDD)}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: r.mom > 0 ? C.up : C.down }}>{r.mom > 0 ? "+" : ""}{fmtPct(r.mom)}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, color: r.stretch > 65 ? C.down : r.stretch < 35 ? C.up : C.hold }}>{fmt(r.stretch, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HelpWrap>
          {sorted.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Section title={t("comparison.sharpeComparison")}>
                <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 32)}>
                  <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} horizontal={false} />
                    <XAxis type="number" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} />
                    <YAxis dataKey="ticker" type="category" tick={{ fill: C.ink, fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)" }} width={45} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                    <Bar dataKey="sharpe" name={t("comparison.sharpe")} fill={C.inkSoft} radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
              <Section title={t("comparison.volatilityComparison")}>
                <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 32)}>
                  <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} horizontal={false} />
                    <XAxis type="number" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickFormatter={v => `${v}%`} />
                    <YAxis dataKey="ticker" type="category" tick={{ fill: C.ink, fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)" }} width={45} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} formatter={v => [`${fmt(v)}%`, t("comparison.volatility")]} />
                    <Bar dataKey="vol" name={t("comparison.volatility")} fill={C.accent + "AA"} radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LITE TOOLS (Watchlist + Alerts dropdown)
// ═══════════════════════════════════════════════════════════
function LiteTools({ onAnalyze, watchlist = [], alerts = [], onAddWatchlist, onRemoveWatchlist, onAddAlert, onRemoveAlert }) {
  const [open, setOpen] = useState(false);
  const menuPresence = useMenuPresence(open, 140);
  const { t } = useI18n();
  const [subTab, setSubTab] = useState("watchlist");
  const [wlInput, setWlInput] = useState("");
  const [alForm, setAlForm] = useState({ ticker: "", type: "above", value: "" });
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addWl = async () => {
    const t = wlInput.trim().toUpperCase();
    if (!t || watchlist.some(w => w.ticker === t)) return;
    setBusy(true);
    try { await onAddWatchlist?.(t); } catch (e) { console.error(e); }
    setWlInput(""); setBusy(false);
  };

  const addAlert = async () => {
    if (!alForm.ticker || !alForm.value) return;
    setBusy(true);
    const t = alForm.ticker.trim().toUpperCase(), v = parseFloat(alForm.value);
    try { await onAddAlert?.(t, alForm.type, v); } catch (e) { console.error(e); }
    setAlForm({ ticker: "", type: "above", value: "" }); setBusy(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ padding: "0 0 10px 0", background: "none", border: "none", borderBottom: open ? `2px solid ${C.ink}` : "2px solid transparent", color: open ? C.ink : C.inkMuted, fontSize: 12, fontWeight: open ? 700 : 500, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>
        {t("nav.tools")} ▾ {(watchlist.length + alerts.length) > 0 && <span style={{ fontSize: 9, background: C.ink, color: C.cream, borderRadius: "50%", padding: "1px 5px", marginLeft: 4 }}>{watchlist.length + alerts.length}</span>}
      </button>
      {menuPresence.mounted && (
        <div
          className={`menu-pop menu-pop-rightOrigin${menuPresence.phase === "closing" ? " menu-pop-exit" : ""}`}
          style={{ position: "absolute", top: "100%", right: 0, width: 380, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 24px rgba(0,0,0,0.08)", zIndex: 2100, padding: 16, maxHeight: 480, overflowY: "auto", pointerEvents: menuPresence.phase === "open" ? "auto" : "none" }}
        >
          <div style={{ display: "flex", gap: 12, borderBottom: `1px solid ${C.rule}`, marginBottom: 12, paddingBottom: 8 }}>
            {[{ key: "watchlist", label: t("tools.watchlist") }, { key: "alerts", label: t("tools.alerts") }].map(({ key, label }) => (
              <button key={key} onClick={() => setSubTab(key)} style={{ background: "none", border: "none", color: subTab === key ? C.ink : C.inkMuted, fontSize: 11, fontWeight: subTab === key ? 700 : 400, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--body)", borderBottom: subTab === key ? `2px solid ${C.ink}` : "none", paddingBottom: 4 }}>
                {label} ({key === "watchlist" ? watchlist.length : alerts.length})
              </button>
            ))}
          </div>
          {subTab === "watchlist" && (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input value={wlInput} onChange={e => setWlInput(e.target.value)} placeholder={t("tools.ticker")}
                  style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", fontSize: 12, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addWl()} />
                <button onClick={addWl} disabled={busy} style={{ padding: "6px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>{t("tools.add")}</button>
              </div>
              {watchlist.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("tools.emptyWatchlist")}</div> :
                watchlist.map(w => (
                  <div key={w.ticker} onClick={() => { onAnalyze(w.ticker); setOpen(false); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer" }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13, color: C.ink }}>{w.ticker}</span>
                      <span style={{ marginLeft: 8, fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(w.price)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {w.spark && w.spark.length > 1 && (
                        <div style={{ opacity: 0.7 }}>
                          <Sparkline data={w.spark} color={w.change >= 0 ? C.up : C.down} prevClose={w.prevClose} width={80} height={28} />
                        </div>
                      )}
                      <span style={{ color: w.change >= 0 ? C.up : C.down, fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600 }}>{w.change >= 0 ? "+" : ""}{fmtPct(w.change)}</span>
                      <span style={{ color: recColor(w.rec), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>
                        {w.rec ? translateEnum(w.rec, t, "signal") : t("common.na")}
                      </span>
                      <button onClick={e => { e.stopPropagation(); onRemoveWatchlist?.(w.ticker); }}
                        style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))}
            </>
          )}
          {subTab === "alerts" && (
            <>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={alForm.ticker} onChange={e => setAlForm(p => ({ ...p, ticker: e.target.value }))} placeholder={t("tools.ticker")}
                  style={{ width: 70, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }} />
                <select value={alForm.type} onChange={e => setAlForm(p => ({ ...p, type: e.target.value }))}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 6px", fontSize: 11, fontFamily: "var(--body)", color: C.ink, outline: "none" }}>
                  <option value="above">{t("tools.above")}</option><option value="below">{t("tools.below")}</option>
                </select>
                <input value={alForm.value} onChange={e => setAlForm(p => ({ ...p, value: e.target.value }))} placeholder="$" type="number"
                  style={{ width: 80, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addAlert()} />
                <button onClick={addAlert} disabled={busy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>{t("tools.set")}</button>
              </div>
              {alerts.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("tools.noAlerts")}</div> :
                alerts.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12 }}>{a.ticker}</span>
                      <span style={{ color: C.inkMuted, fontSize: 11, marginLeft: 6 }}>{a.type === "above" ? "≥" : "≤"} ${fmt(a.value)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: a.triggered ? C.up : C.hold }}>{a.triggered ? t("tools.triggered") : t("tools.watching")}</span>
                      <button onClick={() => onRemoveAlert?.(a.id)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUTH MODAL
// ═══════════════════════════════════════════════════════════
function GoogleLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 533.5 544.3" aria-hidden="true">
      <path fill="#4285F4" d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.4H272v95.3h146.9c-6.3 34.1-25.1 63-53.5 82.1v68h86.6c50.7-46.7 79.5-115.6 79.5-195z" />
      <path fill="#34A853" d="M272 544.3c72.6 0 133.6-24.1 178.1-65.2l-86.6-68c-24.1 16.2-55 25.8-91.5 25.8-70.4 0-130-47.7-151.3-111.9H32.7v70.4C77.1 475.2 168.7 544.3 272 544.3z" />
      <path fill="#FBBC05" d="M120.7 324.9c-10.3-30.8-10.3-64.1 0-94.9V159.6H32.7c-38.2 76.4-38.2 166.7 0 243.1l88-68.0z" />
      <path fill="#EA4335" d="M272 107.7c39.5-.6 77.2 14.2 106.3 41.5l79.2-79.2C409.5 24.2 346.3-0.8 272 0 168.7 0 77.1 69.1 32.7 159.6l88 70.4c21.3-64.2 80.9-111.9 151.3-111.9z" />
    </svg>
  );
}

function AuthModal({ open, onClose, startMode = "signin" }) {
  const [mode, setMode] = useState(startMode);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthProvider, setOauthProvider] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    setMode(startMode);
  }, [open, startMode]);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setOauthProvider(null);
    setError("");
    setNotice("");
    if (mode === "signin") setFirstName("");
  }, [open, mode]);

  if (!open) return null;

  const submitEmailAuth = async () => {
    if (!supabase) return;
    if (mode === "signup" && !firstName.trim()) { setError(t("auth.errFirstName")); return; }
    if (!email || !password) { setError(t("auth.errEmailPassword")); return; }
    setBusy(true); setError(""); setNotice("");
    if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin, data: { first_name: firstName.trim() } },
      });
      if (err) setError(err.message);
      else setNotice(t("auth.checkEmail"));
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
      else onClose();
    }
    setBusy(false);
  };

  const oauth = async (provider) => {
    if (!supabase) return;
    setBusy(true); setError(""); setNotice("");
    setOauthProvider(provider);
    const options = { redirectTo: window.location.origin };
    const { error: err } = await supabase.auth.signInWithOAuth({ provider, options });
    if (err) {
      setError(err.message);
      setBusy(false);
      setOauthProvider(null);
    }
  };

  const googleLabel = busy && oauthProvider === "google"
    ? `${t("auth.continueGoogle")}…`
    : t("auth.continueGoogle");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,16,12,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
      <div style={{ width: "min(520px, 92vw)", background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 24, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.inkFaint }}>×</button>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {["signin", "signup"].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                fontWeight: mode === m ? 700 : 500,
                color: mode === m ? C.ink : C.inkMuted,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontFamily: "var(--body)",
                borderBottom: mode === m ? `2px solid ${C.ink}` : "2px solid transparent",
                paddingBottom: 6,
              }}
            >
              {m === "signin" ? t("auth.signIn") : t("auth.createAccount")}
            </button>
          ))}
        </div>

        {!hasSupabaseConfig && (
          <div style={{ background: C.warmWhite, padding: 12, border: `1px dashed ${C.rule}`, fontSize: 12, color: C.inkMuted, marginBottom: 12 }}>
            {t("auth.missingConfig")}
          </div>
        )}

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => oauth("google")}
            disabled={busy || !hasSupabaseConfig}
            style={{ padding: "10px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <GoogleLogo size={16} />
              <span>{googleLabel}</span>
              {busy && oauthProvider === "google" && <span className="spinner" aria-hidden="true" />}
            </span>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 12px" }}>
          <span style={{ flex: 1, height: 1, background: C.ruleFaint }} />
          <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)" }}>{t("auth.or")}</span>
          <span style={{ flex: 1, height: 1, background: C.ruleFaint }} />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {mode === "signup" && (
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder={t("auth.firstName")}
              style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "10px 12px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }} />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder={t("auth.email")} type="email"
            style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "10px 12px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder={t("auth.password")} type="password"
            style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "10px 12px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }} />
          <button onClick={submitEmailAuth} disabled={busy || !hasSupabaseConfig} style={{ padding: "10px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {mode === "signin" ? t("auth.signIn") : t("auth.createAccount")}
          </button>
        </div>

        {error && <div style={{ marginTop: 10, fontSize: 11, color: C.down, fontFamily: "var(--body)" }}>{error}</div>}
        {notice && <div style={{ marginTop: 10, fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>{notice}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PERF MONITOR
// ═══════════════════════════════════════════════════════════
function PerfMonitor({ onClose }) {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState({});
  const fpsRef = useRef({ frames: 0, last: performance.now(), fps: 0 });

  useEffect(() => {
    let running = true;
    const updateFps = () => {
      if (!running) return;
      fpsRef.current.frames++;
      const now = performance.now();
      if (now - fpsRef.current.last >= 1000) {
        fpsRef.current.fps = fpsRef.current.frames;
        fpsRef.current.frames = 0;
        fpsRef.current.last = now;
      }
      requestAnimationFrame(updateFps);
    };
    requestAnimationFrame(updateFps);

    const id = setInterval(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const heap = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} MB` : t("common.na");
      setMetrics({
        pageLoad: nav ? `${Math.round(nav.loadEventEnd)}ms` : t("common.na"),
        jsHeap: heap,
        apiCalls: apiCallCount,
        lastLatency: `${lastApiLatency}ms`,
        domNodes: document.querySelectorAll("*").length,
        fps: fpsRef.current.fps,
      });
    }, 1000);

    return () => { running = false; clearInterval(id); };
  }, []);

  const row = { display: "flex", justifyContent: "space-between", padding: "3px 0" };
  const label = { color: "rgba(255,255,255,0.5)", fontSize: 10 };
  const val = { color: "#fff", fontSize: 10, fontWeight: 600 };

  return (
    <div style={{ position: "fixed", top: 12, right: 12, background: "rgba(26,22,18,0.92)", borderRadius: 8, padding: "12px 16px", fontFamily: "var(--mono)", zIndex: 9999, minWidth: 200, backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "#4ADE80", fontWeight: 700, letterSpacing: "0.08em" }}>{t("perf.title")}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <div style={row}><span style={label}>{t("perf.pageLoad")}</span><span style={val}>{metrics.pageLoad}</span></div>
      <div style={row}><span style={label}>{t("perf.jsHeap")}</span><span style={val}>{metrics.jsHeap}</span></div>
      <div style={row}><span style={label}>{t("perf.apiCalls")}</span><span style={val}>{metrics.apiCalls}</span></div>
      <div style={row}><span style={label}>{t("perf.lastLatency")}</span><span style={val}>{metrics.lastLatency}</span></div>
      <div style={row}><span style={label}>{t("perf.domNodes")}</span><span style={val}>{metrics.domNodes}</span></div>
      <div style={row}><span style={label}>{t("perf.fps")}</span><span style={val}>{metrics.fps}</span></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
function App() {
  const initialWorkspace = useMemo(() => loadLocalWorkspace(), []);
  const initialRoute = useMemo(() => readRouteFromLocation(), []);
  const [tab, setTab] = useState(initialRoute.tab);
  const [analysisSubTab, setAnalysisSubTab] = useState(initialRoute.analysisSubTab);
  const [accountSubTab, setAccountSubTab] = useState(initialRoute.accountSubTab);
  const [routeTicker, setRouteTicker] = useState(initialRoute.ticker);
  const [chartSelection, setChartSelection] = useState(initialRoute.chart);
  const [chartType, setChartType] = useState(initialRoute.chartType);
  const [locale, setLocale] = useState(() => {
    if (typeof window === "undefined") return "en-US";
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved && TRANSLATIONS[saved] ? saved : "en-US";
  });
  const [isPro, setIsPro] = useState(false);
  const [session, setSession] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authToast, setAuthToast] = useState(null);
  const [syncState, setSyncState] = useState({ status: "idle", last: null, error: null });
  const [remoteHydrated, setRemoteHydrated] = useState(false);
  const workspaceRef = useRef(initialWorkspace);
  const userId = session?.user?.id || null;
  const profileName = useMemo(() => getFirstNameFromUser(session?.user), [session?.user]);
  const [watchlist, setWatchlist] = useState(initialWorkspace.watchlist);
  const [alerts, setAlerts] = useState(initialWorkspace.alerts);
  const [recentAnalyses, setRecentAnalyses] = useState(initialWorkspace.recent);
  const [savedComparisons, setSavedComparisons] = useState(initialWorkspace.comparisons);
  const [prefs, setPrefs] = useState(initialWorkspace.prefs);
  const [homeRegion, setHomeRegion] = useState(initialWorkspace.prefs?.region || "Global");
  const [ticker, setTicker] = useState("");
  const [period, setPeriod] = useState(initialWorkspace.prefs?.period || "1y");
  const [interval, setIntervalValue] = useState(initialWorkspace.prefs?.interval || "1d");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [livePrice, setLivePrice] = useState(null);
  const [chartLivePrice, setChartLivePrice] = useState(null);
  const [latency, setLatency] = useState(null);
  const [showPerf, setShowPerf] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchTimerRef = useRef(null);
  const searchRef = useRef(null);
  const accountMenuRef = useRef(null);
  const liveRef = useRef(null);
  const prevPriceRef = useRef(null);
  const chartTimerRef = useRef(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const accountMenuPresence = useMenuPresence(accountMenuOpen, 140);
  const langMenuPresence = useMenuPresence(langMenuOpen, 120);
  const [helpMode, setHelpMode] = useState(false);
  const [helpTooltip, setHelpTooltip] = useState(null);
  const [chartIntent, setChartIntent] = useState(null);
  const routeSyncRef = useRef(false);
  const routeHydratedRef = useRef(false);
  const routedTickerRef = useRef(null);
  const authToastTimerRef = useRef(null);
  const prevSessionRef = useRef(null);
  const authHydratedRef = useRef(false);

  const t = useCallback((key, vars) => {
    let value = (TRANSLATIONS[locale] && TRANSLATIONS[locale][key])
      || TRANSLATIONS["en-US"][key]
      || key;
    if (vars && typeof value === "string") {
      value = Object.entries(vars).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)), value);
    }
    return value;
  }, [locale]);

  const showAuthToast = useCallback((message) => {
    if (!message) return;
    setAuthToast(message);
    if (authToastTimerRef.current) clearTimeout(authToastTimerRef.current);
    authToastTimerRef.current = setTimeout(() => setAuthToast(null), 2000);
  }, []);

  const showHelp = useCallback((e, help) => {
    if (!helpMode || !help) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 280;
    const pad = 12;
    const viewportW = window.innerWidth || 0;
    const viewportH = window.innerHeight || 0;
    let x = rect.right + 12;
    if (x + tooltipWidth > viewportW - pad) {
      x = rect.left - tooltipWidth - 12;
    }
    if (x < pad) x = pad;
    let y = rect.top;
    const estimatedHeight = 140;
    if (y + estimatedHeight > viewportH - pad) {
      y = viewportH - estimatedHeight - pad;
    }
    if (y < pad) y = pad;
    setHelpTooltip({ title: help.title, body: help.body, x, y });
  }, [helpMode]);

  const hideHelp = useCallback(() => {
    if (helpMode) setHelpTooltip(null);
  }, [helpMode]);

  // Close search dropdown on outside click
  useEffect(() => {
    const h = e => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearchDropdown(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const h = e => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LANG_STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    }
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPop = () => {
      routeSyncRef.current = true;
      const nextRoute = readRouteFromLocation();
      setTab(nextRoute.tab);
      setAnalysisSubTab(nextRoute.analysisSubTab);
      setAccountSubTab(nextRoute.accountSubTab);
      setRouteTicker(nextRoute.ticker);
      setChartSelection(nextRoute.chart);
      setChartType(nextRoute.chartType);
      setTimeout(() => { routeSyncRef.current = false; }, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextUrl = buildUrlFromRoute({
      tab,
      analysisSubTab,
      accountSubTab,
      ticker: routeTicker,
      chart: chartSelection,
      chartType,
    });
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl === currentUrl) {
      routeHydratedRef.current = true;
      return;
    }
    if (!routeHydratedRef.current || routeSyncRef.current) {
      window.history.replaceState({}, "", nextUrl);
      routeHydratedRef.current = true;
      return;
    }
    window.history.pushState({}, "", nextUrl);
  }, [tab, analysisSubTab, accountSubTab, routeTicker, chartSelection, chartType]);

  useEffect(() => {
    if (tab === "charts") return;
    if (routeSyncRef.current) return;
    if (chartSelection) setChartSelection(null);
  }, [tab, chartSelection]);

  useEffect(() => {
    if (tab === "analysis" || tab === "charts") return;
    if (routeSyncRef.current) return;
    if (!routeTicker) return;
    setRouteTicker("");
  }, [tab, routeTicker]);

  useEffect(() => {
    if (!helpMode) setHelpTooltip(null);
  }, [helpMode]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const results = await fetchSearch(searchQuery);
      setSearchResults(results);
      setShowSearchDropdown(true);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const workspaceData = useMemo(() => ({
    version: WORKSPACE_VERSION,
    watchlist,
    alerts,
    recent: recentAnalyses,
    comparisons: savedComparisons,
    prefs,
  }), [watchlist, alerts, recentAnalyses, savedComparisons, prefs]);

  useEffect(() => {
    workspaceRef.current = workspaceData;
  }, [workspaceData]);

  useEffect(() => {
    const id = setTimeout(() => saveLocalWorkspace(workspaceData), 200);
    return () => clearTimeout(id);
  }, [workspaceData]);

  useEffect(() => {
    setPrefs(prev => {
      if (prev.period === period && prev.interval === interval) return prev;
      return { ...prev, period, interval, updatedAt: Date.now() };
    });
  }, [period, interval]);

  useEffect(() => {
    setPrefs(prev => {
      if (prev.region === homeRegion) return prev;
      return { ...prev, region: homeRegion, updatedAt: Date.now() };
    });
  }, [homeRegion]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const next = data.session || null;
      setSession(next);
      prevSessionRef.current = next;
      authHydratedRef.current = true;
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const prevSession = prevSessionRef.current;
      setSession(nextSession);
      prevSessionRef.current = nextSession;
      if (event === "SIGNED_IN" && authHydratedRef.current && !prevSession) {
        const email = nextSession?.user?.email || t("account.user");
        showAuthToast(t("account.signedInAs", { email }));
      }
    });
    return () => { active = false; data?.subscription?.unsubscribe(); };
  }, [t, showAuthToast]);

  useEffect(() => {
    if (session) return;
    setAccountMenuOpen(false);
    setLangMenuOpen(false);
  }, [session]);

  const applyWorkspace = useCallback((ws) => {
    const safe = sanitizeWorkspace(ws);
    setWatchlist(safe.watchlist);
    setAlerts(safe.alerts);
    setRecentAnalyses(safe.recent);
    setSavedComparisons(safe.comparisons);
    setPrefs(safe.prefs);
    setHomeRegion(safe.prefs?.region || "Global");
    setPeriod(safe.prefs?.period || "1y");
    setIntervalValue(safe.prefs?.interval || "1d");
  }, []);

  useEffect(() => {
    if (!supabase || !userId) {
      setRemoteHydrated(false);
      setSyncState({ status: "idle", last: null, error: null });
      return;
    }
    let cancelled = false;
    const loadRemote = async () => {
      setSyncState(s => ({ ...s, status: "syncing", error: null }));
      const { data, error: err } = await supabase
        .from("workspaces")
        .select("data, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (err && err.code !== "PGRST116") {
        setSyncState({ status: "error", last: null, error: err.message });
        return;
      }
      const remoteData = data?.data ? sanitizeWorkspace(data.data) : null;
      const merged = mergeWorkspaces(workspaceRef.current, remoteData);
      applyWorkspace(merged);
      setRemoteHydrated(true);
      setSyncState({ status: "synced", last: Date.now(), error: null });
    };
    loadRemote();
    return () => { cancelled = true; };
  }, [userId, applyWorkspace]);

  useEffect(() => {
    if (!supabase || !userId || !remoteHydrated) return;
    const id = setTimeout(async () => {
      setSyncState(s => ({ ...s, status: "syncing", error: null }));
      const { error: err } = await supabase
        .from("workspaces")
        .upsert({
          user_id: userId,
          data: workspaceRef.current,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      if (err) {
        setSyncState({ status: "error", last: null, error: err.message });
      } else {
        setSyncState({ status: "synced", last: Date.now(), error: null });
      }
    }, 800);
    return () => clearTimeout(id);
  }, [workspaceData, userId, remoteHydrated]);

  const intervalOptions = useMemo(() => {
    if (["1d", "5d"].includes(period)) {
      return [["1m", "1m"], ["5m", "5m"], ["15m", "15m"], ["30m", "30m"], ["60m", "1h"]];
    }
    if (period === "1mo") {
      return [["15m", "15m"], ["30m", "30m"], ["60m", "1h"], ["1d", "1d"]];
    }
    return [["1d", "1d"]];
  }, [period]);

  useEffect(() => {
    if (!intervalOptions.some(([v]) => v === interval)) {
      setIntervalValue(intervalOptions[0][0]);
    }
  }, [intervalOptions, interval]);

  const addToWatchlist = useCallback(async (symbol) => {
    const t = (symbol || "").trim().toUpperCase();
    if (!t) return;
    if (watchlist.some(w => w.ticker === t)) return;
    const fd = await fetchStockData(t, "3mo");
    if (!fd?.data) return;
    const a = runAnalysis(t, fd.data);
    const closes = fd.data.map(d => d.Close).filter(v => v != null);
    const prevClose = closes.length > 1 ? closes[closes.length - 2] : a.currentPrice;
    const entry = {
      ticker: t,
      price: a.currentPrice,
      change: prevClose ? ((a.currentPrice - prevClose) / prevClose) * 100 : 0,
      rec: a.recommendation.action,
      spark: closes.slice(-30),
      prevClose,
      addedAt: Date.now(),
    };
    setWatchlist(prev => (prev.some(w => w.ticker === t) ? prev : [...prev, entry]));
  }, [watchlist]);

  const removeFromWatchlist = useCallback((ticker) => {
    setWatchlist(prev => prev.filter(w => w.ticker !== ticker));
  }, []);

  const addAlert = useCallback(async (symbol, type, value) => {
    const t = (symbol || "").trim().toUpperCase();
    const v = parseFloat(value);
    if (!t || Number.isNaN(v)) return;
    const fd = await fetchStockData(t, "1mo");
    const price = fd.data ? fd.data[fd.data.length - 1].Close : 0;
    setAlerts(prev => [...prev, { id: Date.now(), ticker: t, type, value: v, current: price, triggered: type === "above" ? price >= v : price <= v, createdAt: Date.now() }]);
  }, []);

  const removeAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const recordRecent = useCallback((analysis) => {
    if (!analysis?.ticker) return;
    const closes = analysis.data?.map(d => d.Close).filter(v => v != null) || [];
    const prevClose = closes.length > 1 ? closes[closes.length - 2] : analysis.currentPrice;
    const entry = {
      ticker: analysis.ticker,
      ts: Date.now(),
      price: analysis.currentPrice,
      action: analysis.recommendation?.action,
      confidence: analysis.recommendation?.confidence,
      regime: analysis.regime?.overall,
      riskLevel: analysis.risk?.riskLevel,
      period: analysis.period,
      interval: analysis.interval,
      source: analysis.source,
      spark: closes.slice(-30),
      prevClose,
    };
    setRecentAnalyses(prev => {
      const next = [entry, ...prev.filter(r => r.ticker !== entry.ticker)].slice(0, 20);
      return next;
    });
  }, []);

  useEffect(() => {
    const missing = watchlist.filter(w => !w.spark || w.spark.length < 2).map(w => w.ticker);
    if (!missing.length) return;
    let cancelled = false;
    Promise.allSettled(missing.map(t => fetchQuickQuote(t))).then(results => {
      if (cancelled) return;
      setWatchlist(prev => prev.map(w => {
        const idx = missing.indexOf(w.ticker);
        if (idx === -1) return w;
        const r = results[idx];
        if (r && r.status === "fulfilled") {
          return { ...w, spark: r.value.spark || w.spark, prevClose: r.value.prevClose ?? w.prevClose };
        }
        return w;
      }));
    });
    return () => { cancelled = true; };
  }, [watchlist]);

  // Live price polling every 15s
  useEffect(() => {
    if (!result) return;
    const poll = async () => {
      try {
        const s = performance.now();
        const fd = await fetchStockData(result.ticker, result.period || "1mo", result.interval || "1d");
        const lat = Math.round(performance.now() - s);
        setLatency(lat);
        if (fd.data) {
          const last = fd.data[fd.data.length - 1];
          prevPriceRef.current = livePrice || result.currentPrice;
          setLivePrice(last.Close);
        }
      } catch (e) { /* silent */ }
    };
    liveRef.current = setInterval(poll, 15000);
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Micro-tick between polls for visual liveliness
  useEffect(() => {
    if (!result || !livePrice) return;
    const micro = setInterval(() => {
      setLivePrice(prev => {
        const jitter = (Math.random() - 0.5) * 0.001 * prev;
        prevPriceRef.current = prev;
        return +(prev + jitter).toFixed(2);
      });
    }, 1500);
    return () => clearInterval(micro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.ticker, !!livePrice]);

  // Delay chart updates until animation finishes
  useEffect(() => {
    if (chartTimerRef.current) clearTimeout(chartTimerRef.current);
    if (livePrice == null) {
      setChartLivePrice(null);
      return;
    }
    chartTimerRef.current = setTimeout(() => {
      setChartLivePrice(livePrice);
    }, CHART_ANIM_MS);
    return () => { if (chartTimerRef.current) clearTimeout(chartTimerRef.current); };
  }, [livePrice]);

  const analyze = useCallback(async (t, options = {}) => {
    const sym = (t || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym); setLoading(true); setError(null); setLivePrice(null); setLatency(null);
    try {
      const fd = await fetchStockData(sym, period, interval);
      const analysis = runAnalysis(sym, fd.data);
      analysis.period = period;
      analysis.interval = interval;
      analysis.source = fd.source;
      analysis.latency = fd.latency;
      analysis.debug = fd.debug;
      setResult(analysis);
      setLatency(fd.latency);
      recordRecent(analysis);
      if (!options.preserveTab) setTab("analysis");
    } catch (e) {
      setError({ message: t("error.allSourcesFailed"), debug: e.debug || { error: String(e) } });
    }
    setLoading(false);
  }, [ticker, period, interval, recordRecent]);

  useEffect(() => {
    if (!routeTicker) return;
    const next = routeTicker.trim().toUpperCase();
    if (!next) return;
    if (result?.ticker === next) {
      routedTickerRef.current = next;
      return;
    }
    if (routedTickerRef.current === next) return;
    if (loading) return;
    routedTickerRef.current = next;
    analyze(next, { preserveTab: true });
  }, [routeTicker, result?.ticker, loading, analyze]);

  const reanalyze = useCallback(async (t, p, i) => {
    setPeriod(p);
    setIntervalValue(i);
    const sym = t.trim().toUpperCase();
    if (!sym) return;
    setTicker(sym); setLoading(true); setError(null); setLivePrice(null); setLatency(null);
    try {
      const fd = await fetchStockData(sym, p, i);
      const analysis = runAnalysis(sym, fd.data);
      analysis.period = p;
      analysis.interval = i;
      analysis.source = fd.source;
      analysis.latency = fd.latency;
      analysis.debug = fd.debug;
      setResult(analysis);
      setLatency(fd.latency);
      recordRecent(analysis);
    } catch (e) {
      setError({ message: t("error.allSourcesFailed"), debug: e.debug || { error: String(e) } });
    }
    setLoading(false);
  }, [recordRecent]);

  useEffect(() => {
    if (!result?.ticker) return;
    if (tab !== "analysis" && tab !== "charts") return;
    const next = result.ticker.trim().toUpperCase();
    if (!next || next === routeTicker) return;
    setRouteTicker(next);
  }, [result?.ticker, routeTicker, tab]);

  const updateFirstName = useCallback(async (name) => {
    if (!supabase || !userId) return { error: t("error.notSignedIn") };
    const { data, error } = await supabase.auth.updateUser({ data: { first_name: name } });
    if (error) return { error: error.message };
    if (data?.user) {
      setSession(prev => (prev ? { ...prev, user: data.user } : prev));
    }
    return { error: null };
  }, [userId, t]);

  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const openAuth = useCallback((mode = "signin") => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);


  const tabStyle = (t, locked = false) => ({
    padding: "0 0 10px 0", marginRight: 24, background: "none", border: "none",
    borderBottom: tab === t ? `2px solid ${C.ink}` : "2px solid transparent",
    color: tab === t ? C.ink : locked ? C.inkFaint : C.inkMuted, fontSize: 12,
    fontWeight: tab === t ? 700 : 500, cursor: "pointer",
    textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)",
    opacity: locked ? 0.7 : 1,
  });
  const utilityTabStyle = (on) => ({
    padding: "0 0 10px 0",
    background: "none",
    border: "none",
    borderBottom: on ? `2px solid ${C.ink}` : "2px solid transparent",
    color: on ? C.ink : C.inkMuted,
    fontSize: 12,
    fontWeight: on ? 700 : 500,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontFamily: "var(--body)",
  });
  const openCharts = useCallback((intent) => {
    if (intent?.mode) setChartSelection(normalizeChartMode(intent.mode));
    setChartIntent(intent);
    setTab("charts");
  }, []);
  const consumeChartIntent = useCallback(() => setChartIntent(null), []);
  const navHelp = useMemo(() => ({
    home: { title: t("help.nav.home.title"), body: t("help.nav.home.body") },
    analysis: { title: t("help.nav.analysis.title"), body: t("help.nav.analysis.body") },
    charts: { title: t("help.nav.charts.title"), body: t("help.nav.charts.body") },
    heatmap: { title: t("help.nav.heatmap.title"), body: t("help.nav.heatmap.body") },
    comparison: { title: t("help.nav.comparison.title"), body: t("help.nav.comparison.body") },
  }), [t]);
  return (
    <I18nContext.Provider value={{ t, locale }}>
      <HelpContext.Provider value={{ enabled: helpMode, show: showHelp, hide: hideHelp }}>
        <div style={{ fontFamily: "var(--body)", background: C.cream, color: C.ink, minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", maxWidth: "70%", margin: "0 auto", width: "100%" }}>
      <header style={{ padding: "16px 24px 0", borderBottom: `1px solid ${C.rule}`, position: "relative", zIndex: 2000 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            <BrandMark size={22} pro={isPro} />
            <span style={{ width: 1, height: 14, background: C.rule, display: "inline-block", margin: "0 2px" }} />
            <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>{t("tagline.quant")}</span>
          </div>
          <div ref={searchRef} style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <HelpWrap
              enabled={helpMode}
              onShow={showHelp}
              onHide={hideHelp}
              help={{
                title: t("help.search.title"),
                body: t("help.search.body"),
              }}
            >
              <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowSearchDropdown(true); }} placeholder={t("search.placeholder")}
                style={{ width: 200, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", color: C.ink, fontSize: 12, fontFamily: "var(--body)", outline: "none" }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const sym = searchQuery.trim().toUpperCase();
                    if (sym) { analyze(sym); setSearchQuery(""); setShowSearchDropdown(false); }
                  }
                  if (e.key === "Escape") setShowSearchDropdown(false);
                }}
                onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
              />
            </HelpWrap>
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="menu-pop" style={{ position: "absolute", top: "100%", left: 0, width: 340, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 24px rgba(0,0,0,0.1)", zIndex: 200, maxHeight: 320, overflowY: "auto" }}>
                {searchResults.map((r) => (
                  <button key={r.symbol} onClick={() => { analyze(r.symbol); setSearchQuery(""); setShowSearchDropdown(false); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.paper}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, color: C.ink }}>{r.symbol}</span>
                      <span style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", marginLeft: 8 }}>{r.shortname || r.longname || ""}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)" }}>
                      {r.exchDisp && <span>{r.exchDisp}</span>}
                      {r.typeDisp && <span style={{ background: C.paper, padding: "1px 4px" }}>{r.typeDisp}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <HelpWrap
              enabled={helpMode}
              onShow={showHelp}
              onHide={hideHelp}
              help={{
                title: t("help.analyze.title"),
                body: t("help.analyze.body"),
              }}
            >
              <button onClick={() => { const sym = searchQuery.trim().toUpperCase(); if (sym) { analyze(sym); setSearchQuery(""); setShowSearchDropdown(false); } }} disabled={loading || !searchQuery.trim()}
                style={{ padding: "7px 20px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 11, cursor: loading ? "wait" : "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase", opacity: loading ? 0.5 : 1 }}>
                {loading ? t("search.running") : t("search.analyze")}
              </button>
            </HelpWrap>
          </div>
        </div>
        <nav style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}>
            {[
              { key: "home", label: t("nav.home") },
              { key: "analysis", label: t("nav.analysis") },
              { key: "charts", label: t("nav.charts") },
              { key: "heatmap", label: t("nav.heatmap"), pro: true },
              { key: "comparison", label: t("nav.comparison"), pro: true },
            ].map(({ key, label, pro, badge }) => {
              const locked = !!pro && !isPro;
              return (
                <HelpWrap key={key} help={navHelp[key]}>
                  <button onClick={() => setTab(key)} style={tabStyle(key, locked)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>{label}</span>
                      {locked && <ProTag small />}
                    </span>
                  </button>
                </HelpWrap>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
            <button
              onClick={() => setHelpMode(m => !m)}
              style={utilityTabStyle(helpMode)}
              aria-pressed={helpMode}
            >
              {t("nav.help")}
            </button>
            <HelpWrap
              enabled={helpMode}
              onShow={showHelp}
              onHide={hideHelp}
              help={{
                title: t("help.tools.title"),
                body: t("help.tools.body"),
              }}
            >
              <LiteTools
                onAnalyze={analyze}
                watchlist={watchlist}
                alerts={alerts}
                onAddWatchlist={addToWatchlist}
                onRemoveWatchlist={removeFromWatchlist}
                onAddAlert={addAlert}
                onRemoveAlert={removeAlert}
              />
            </HelpWrap>
            {session ? (
              <div ref={accountMenuRef} style={{ position: "relative" }}>
                <HelpWrap
                  enabled={helpMode}
                  onShow={showHelp}
                  onHide={hideHelp}
                  help={{
                    title: t("help.account.title"),
                    body: t("help.account.body"),
                  }}
                >
                  <button
                    onClick={() => setAccountMenuOpen(o => {
                      const next = !o;
                      if (!next) setLangMenuOpen(false);
                      return next;
                    })}
                    onKeyDown={e => {
                      if (e.key === "Escape") { setAccountMenuOpen(false); setLangMenuOpen(false); }
                    }}
                    style={tabStyle("account")}
                  >
                    {t("nav.account")}
                  </button>
                </HelpWrap>
                {accountMenuPresence.mounted && (
                <div className={`menu-pop menu-pop-rightOrigin${accountMenuPresence.phase === "closing" ? " menu-pop-exit" : ""}`} style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  width: 380,
                  background: C.cream,
                  color: C.ink,
                  borderRadius: 0,
                  border: `1px solid ${C.rule}`,
                  boxShadow: "4px 8px 24px rgba(0,0,0,0.08)",
                  padding: 16,
                  zIndex: 2200,
                  pointerEvents: accountMenuPresence.phase === "open" ? "auto" : "none",
                }}>
                  {session && (
                    <>
                      <div style={{ padding: "6px 8px 10px", fontSize: 12, color: C.inkMuted, fontFamily: "var(--mono)" }}>
                        {session?.user?.email}
                      </div>
                      <div style={{ height: 1, background: C.rule, margin: "4px 8px 8px" }} />
                    </>
                  )}

                  {!session ? (
                    <div style={{ display: "grid", gap: 10, padding: "6px 8px 4px" }}>
                      <button
                        onClick={() => { openAuth("signin"); setAccountMenuOpen(false); setLangMenuOpen(false); }}
                        style={{ padding: "10px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        {t("auth.signIn")}
                      </button>
                      <button
                        onClick={() => { openAuth("signup"); setAccountMenuOpen(false); setLangMenuOpen(false); }}
                        style={{ padding: "10px 12px", background: "transparent", color: C.ink, border: `1px solid ${C.rule}`, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        {t("auth.createAccount")}
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { setTab("account"); setAccountMenuOpen(false); setLangMenuOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.paper}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <IconGear color={C.inkMuted} />
                        <span style={{ flex: 1, textAlign: "left" }}>{t("menu.settings")}</span>
                      </button>

                      <div
                        onMouseEnter={() => setLangMenuOpen(true)}
                        onMouseLeave={() => setLangMenuOpen(false)}
                        style={{ position: "relative" }}
                      >
                        <button
                          onClick={() => setLangMenuOpen(o => !o)}
                          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                          onMouseEnter={e => e.currentTarget.style.background = C.paper}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <IconGlobe color={C.inkMuted} />
                          <span style={{ flex: 1, textAlign: "left" }}>{t("menu.language")}</span>
                          <IconChevronRight color={C.inkFaint} />
                        </button>
                        {langMenuPresence.mounted && (
                          <div
                            onMouseEnter={() => setLangMenuOpen(true)}
                            onMouseLeave={() => setLangMenuOpen(false)}
                            className={`menu-pop-side${langMenuPresence.phase === "closing" ? " menu-pop-exit" : ""}`}
                            style={{
                              position: "absolute",
                              left: "100%",
                              top: 0,
                              marginLeft: -1,
                              minWidth: 260,
                              background: C.cream,
                              borderRadius: 0,
                              border: `1px solid ${C.rule}`,
                              borderLeft: "none",
                              boxShadow: "4px 8px 24px rgba(0,0,0,0.08)",
                              padding: "8px 6px",
                              zIndex: 2300,
                              pointerEvents: langMenuPresence.phase === "open" ? "auto" : "none",
                            }}
                          >
                            {LANGUAGES.map((lang) => {
                              const active = lang.code === locale;
                              return (
                                <button
                                  key={lang.code}
                                  onClick={() => { setLocale(lang.code); setAccountMenuOpen(false); setLangMenuOpen(false); }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    width: "100%",
                                    padding: "8px 12px",
                                    background: active ? C.paper : "transparent",
                                    border: "none",
                                    color: C.ink,
                                    cursor: "pointer",
                                    fontSize: 13,
                                    fontFamily: "var(--body)",
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = C.paper}
                                  onMouseLeave={e => e.currentTarget.style.background = active ? C.paper : "transparent"}
                                >
                                  <span style={{ textAlign: "left" }}>{lang.label}</span>
                                  {active && <IconCheck color={C.inkFaint} />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div style={{ height: 1, background: C.rule, margin: "6px 8px 8px" }} />

                      <button
                        onClick={() => { setAccountMenuOpen(false); setLangMenuOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.paper}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <IconCrown color={C.inkMuted} />
                        <span style={{ flex: 1, textAlign: "left" }}>{t("menu.upgrade")}</span>
                      </button>
                      <button
                        onClick={() => { setAccountMenuOpen(false); setLangMenuOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.paper}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <IconGift color={C.inkMuted} />
                        <span style={{ flex: 1, textAlign: "left" }}>{t("menu.gift")}</span>
                      </button>

                      <div style={{ height: 1, background: C.rule, margin: "6px 8px 8px" }} />

                      <button
                        onClick={() => { handleSignOut(); setAccountMenuOpen(false); setLangMenuOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.paper}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <IconLogout color={C.inkMuted} />
                        <span style={{ flex: 1, textAlign: "left" }}>{t("menu.logout")}</span>
                      </button>
                    </>
                  )}
                </div>
                )}
              </div>
            ) : (
              <HelpWrap
                enabled={helpMode}
                onShow={showHelp}
                onHide={hideHelp}
                help={{
                  title: t("help.account.title"),
                  body: t("help.account.body"),
                }}
              >
                <button
                  onClick={() => openAuth("signin")}
                  style={tabStyle("account")}
                >
                  {t("common.signIn")}
                </button>
              </HelpWrap>
            )}
          </div>
        </nav>
      </header>

      <main style={{ flex: 1, padding: "20px 24px", overflowY: "auto", animation: "fadeIn 0.3s ease", position: "relative", zIndex: 1, minWidth: 0 }} key={tab + (result?.ticker || "")}>
        {loading && <LoadingScreen ticker={ticker} isPro={isPro} />}
        {!loading && error && <ErrorScreen error={error.message} debugInfo={error.debug} onRetry={() => analyze()} />}
        {!loading && !error && tab === "home" && <HomeTab onAnalyze={analyze} region={homeRegion} onRegionChange={setHomeRegion} greetingName={profileName} />}
        {!loading && !error && tab === "account" && (
          <AccountTab
            onAnalyze={analyze}
            watchlist={watchlist}
            alerts={alerts}
            recent={recentAnalyses}
            prefs={prefs}
            subTab={accountSubTab}
            onSubTabChange={setAccountSubTab}
            onAddWatchlist={addToWatchlist}
            onRemoveWatchlist={removeFromWatchlist}
            onAddAlert={addAlert}
            onRemoveAlert={removeAlert}
            onOpenAuth={openAuth}
            session={session}
            syncState={syncState}
            profileName={profileName}
            onUpdateName={updateFirstName}
            onSignOut={handleSignOut}
          />
        )}
        {!loading && !error && tab === "analysis" && (
          <AnalysisTab
            result={result}
            livePrice={livePrice}
            chartLivePrice={chartLivePrice}
            latency={latency}
            isPro={isPro}
            period={period}
            interval={interval}
            subTab={analysisSubTab}
            onSubTabChange={setAnalysisSubTab}
            onReanalyze={reanalyze}
            onOpenCharts={openCharts}
            openChartsLabel={t("chart.openCharts")}
            helpMode={helpMode}
            onShowHelp={showHelp}
            onHideHelp={hideHelp}
          />
        )}
        {!loading && !error && tab === "charts" && (
          <ChartsTab
            result={result}
            chartLivePrice={chartLivePrice}
            period={period}
            interval={interval}
            onReanalyze={reanalyze}
            intent={chartIntent}
            onConsumeIntent={consumeChartIntent}
            expandedMode={chartSelection}
            onExpandedModeChange={setChartSelection}
            chartType={chartType}
            onChartTypeChange={setChartType}
          />
        )}
        {!loading && !error && tab === "heatmap" && (isPro ? <HeatmapTab /> : (
          <ProGate
            title={t("pro.heatmap.title")}
            description={t("pro.heatmap.desc")}
            features={[t("pro.heatmap.f0"), t("pro.heatmap.f1"), t("pro.heatmap.f2")]}
          />
        ))}
        {!loading && !error && tab === "comparison" && (isPro ? <ComparisonTab /> : (
          <ProGate
            title={t("pro.comparison.title")}
            description={t("pro.comparison.desc")}
            features={[t("pro.comparison.f0"), t("pro.comparison.f1"), t("pro.comparison.f2")]}
          />
        ))}
      </main>

      <footer style={{ padding: "8px 24px", borderTop: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.04em", position: "relative", zIndex: 1, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LogoIcon size={12} color={C.inkFaint} />
          <span>{t("footer.disclaimer")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setIsPro(p => !p)} style={{ padding: "4px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)", letterSpacing: "0.08em", cursor: "pointer" }}>
            DEV: {isPro ? "DISABLE" : "ENABLE"} PRO
          </button>
          <button onClick={() => setShowPerf(p => !p)} style={{ padding: "4px 10px", border: `1px solid ${C.rule}`, background: showPerf ? C.ink : "transparent", color: showPerf ? C.cream : C.inkMuted, fontSize: 9, fontFamily: "var(--mono)", letterSpacing: "0.08em", cursor: "pointer" }}>
            DEV: PERF
          </button>
          <span style={{ fontFamily: "var(--mono)", fontSize: 9 }}>v0.3.12</span>
        </div>
      </footer>

      {helpMode && (
        <div style={{ position: "fixed", right: 16, bottom: 16, width: 280, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 24px rgba(0,0,0,0.12)", padding: 12, zIndex: 5500 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>
            {t("help.title")}
          </div>
          <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5, marginBottom: 10 }}>
            {t("help.body")}
          </div>
          <button onClick={() => setHelpMode(false)} style={{ padding: "6px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {t("help.exit")}
          </button>
        </div>
      )}

      {helpMode && helpTooltip && (
        <div style={{ position: "fixed", left: helpTooltip.x, top: helpTooltip.y, width: 280, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 20px rgba(0,0,0,0.12)", padding: 12, zIndex: 6000, pointerEvents: "none" }}>
          {helpTooltip.title && (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, fontFamily: "var(--body)", marginBottom: 6 }}>
              {helpTooltip.title}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5 }}>
            {helpTooltip.body}
          </div>
        </div>
      )}

          {authToast && (
            <div className="auth-toast" role="status" aria-live="polite">
              {authToast}
            </div>
          )}
          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} startMode={authMode} />
          {showPerf && <PerfMonitor onClose={() => setShowPerf(false)} />}
        </div>
      </HelpContext.Provider>
    </I18nContext.Provider>
  );
}

export default App;
