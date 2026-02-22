import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { createPortal } from "react-dom";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Brush, Customized,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Area
} from "recharts";
import { supabase, hasSupabaseConfig } from "./supabaseClient";
import { LANGUAGES, TRANSLATIONS } from "./i18n/translations";
import HomeTab from "./pages/HomeTab";
import AccountTab from "./pages/AccountTab";
import AnalysisTab from "./pages/AnalysisTab";
import ChartsTab from "./pages/ChartsTab";
import HeatmapTab from "./pages/HeatmapTab";
import ComparisonTab from "./pages/ComparisonTab";
import ScreenerTab from "./pages/ScreenerTab";
import BacktestTab from "./pages/BacktestTab";
import PortfolioTab from "./pages/PortfolioTab";
import MarketsTab from "./pages/MarketsTab";
import CommunityTab from "./pages/CommunityTab";
import { UIButton, ControlChip } from "./components/ui/primitives";
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
const THEME_STORAGE_KEY = "aa_theme_v1";
const A11Y_STORAGE_KEY = "aa_a11y_v1";

const APP_TABS = ["home", "analysis", "charts", "screener", "markets", "portfolio", "community", "heatmap", "comparison", "account"];
const ANALYSIS_TABS = ["stock", "financials", "options", "dividends"];
const ACCOUNT_TABS = ["overview", "preferences"];
const MARKETS_TABS = ["heatmap", "sectors", "crypto", "economic", "prediction", "rates", "commodities", "currencies"];
const PORTFOLIO_TABS = ["holdings", "paper-trading", "backtesting"];
const SCREENER_TABS = ["screener", "comparison"];
const CHART_MODES = ["price", "volume", "rsi", "macd", "stoch"];
const CHART_TYPES = ["line", "candles"];

const normalizeTab = (tab) => (APP_TABS.includes(tab) ? tab : "home");
const normalizeAnalysisTab = (tab) => (ANALYSIS_TABS.includes(tab) ? tab : "stock");
const normalizeAccountTab = (tab) => (ACCOUNT_TABS.includes(tab) ? tab : "overview");
const normalizeMarketsTab = (tab) => (MARKETS_TABS.includes(tab) ? tab : "heatmap");
const normalizePortfolioTab = (tab) => (PORTFOLIO_TABS.includes(tab) ? tab : "holdings");
const normalizeScreenerTab = (tab) => (SCREENER_TABS.includes(tab) ? tab : "screener");
const normalizeChartMode = (mode) => {
  if (!mode) return null;
  const val = String(mode).toLowerCase();
  return CHART_MODES.includes(val) ? val : null;
};
const normalizeChartType = (type) => {
  if (!type) return null;
  const val = String(type).toLowerCase();
  return CHART_TYPES.includes(val) ? val : null;
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
    portfolio: { holdings: [] },
    paperPortfolio: { cash: 100000, positions: [], history: [], equityCurve: [{ date: new Date().toISOString().slice(0, 10), value: 100000 }] },
    notificationPrefs: { enabled: false, priceAlerts: true, earnings: false },
    prefs: {
      period: "1y",
      interval: "1d",
      region: "Global",
      chartType: "line",
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
    portfolio: data.portfolio && typeof data.portfolio === "object" ? { holdings: Array.isArray(data.portfolio.holdings) ? data.portfolio.holdings : [] } : base.portfolio,
    paperPortfolio: data.paperPortfolio && typeof data.paperPortfolio === "object" ? {
      cash: typeof data.paperPortfolio.cash === "number" ? data.paperPortfolio.cash : 100000,
      positions: Array.isArray(data.paperPortfolio.positions) ? data.paperPortfolio.positions : [],
      history: Array.isArray(data.paperPortfolio.history) ? data.paperPortfolio.history : [],
      equityCurve: Array.isArray(data.paperPortfolio.equityCurve) ? data.paperPortfolio.equityCurve : base.paperPortfolio.equityCurve,
    } : base.paperPortfolio,
    notificationPrefs: data.notificationPrefs && typeof data.notificationPrefs === "object" ? data.notificationPrefs : base.notificationPrefs,
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

const NEWS_IMAGE_BASE_TAGS = ["finance", "stock-market", "business", "wall-street"];
const NEWS_IMAGE_STOP_WORDS = new Set([
  "about", "after", "amid", "analyst", "analysts", "and", "are", "ahead", "as", "at",
  "be", "by", "for", "from", "has", "have", "in", "into", "its", "market", "markets",
  "news", "new", "on", "of", "or", "out", "over", "says", "stocks", "stock", "the",
  "their", "this", "to", "today", "under", "update", "vs", "what", "when", "why", "with",
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
const NEWS_SOURCE_QUALITY_RULES = [
  { pattern: /\b(reuters|associated press|\bap\b|bloomberg|financial times|wall street journal|\bwsj\b|economist)\b/i, score: 3.6 },
  { pattern: /\b(cnbc|marketwatch|barron'?s|ft|nikkei)\b/i, score: 3.0 },
  { pattern: /\b(yahoo finance|investing\.com|seeking alpha|benzinga|the motley fool|the street|marketbeat)\b/i, score: 1.9 },
];
const NEWS_IMPACT_RULES = [
  { pattern: /\b(fed|federal reserve|fomc|interest rates?|rate cuts?|rate hikes?|treasury yields?)\b/i, score: 2.7 },
  { pattern: /\b(cpi|pce|inflation|nonfarm payrolls?|jobs report|unemployment|gdp|recession)\b/i, score: 2.6 },
  { pattern: /\b(earnings|guidance|outlook|forecast|eps|revenue|margin|profit warning)\b/i, score: 1.8 },
  { pattern: /\b(merger|acquisition|buyout|takeover|antitrust|regulator|sec)\b/i, score: 1.8 },
  { pattern: /\b(bankruptcy|default|downgrade|credit rating|liquidity)\b/i, score: 2.1 },
  { pattern: /\b(opec|oil supply|sanctions?|tariffs?|geopolitical|war)\b/i, score: 1.6 },
];
const NEWS_CLICKBAIT_RULES = [
  { pattern: /\b(you need to know|what to know|what to watch|should you buy|is it time to buy|buy now|sell now)\b/i, penalty: 2.2 },
  { pattern: /\b(\d+\s+(reasons|things|stocks|ways|charts?|lessons)|top\s+\d+)\b/i, penalty: 1.4 },
  { pattern: /\b(soars?|plunges?|skyrockets?|slams?|crashes?|explodes?|surges?)\b/i, penalty: 1.0 },
  { pattern: /\b(opinion|video|podcast|watch live)\b/i, penalty: 1.0 },
  { pattern: /!+/, penalty: 1.1 },
];

function parseNewsTimestamp(pubDate) {
  const ts = Date.parse(pubDate || "");
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeNewsLink(link) {
  const raw = String(link || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${path}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function tokenizeNewsHeadline(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/&amp;/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => word.length >= 3 && !NEWS_IMAGE_STOP_WORDS.has(word));
}

function newsTokenSimilarity(tokensA, tokensB) {
  if (!tokensA?.length || !tokensB?.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function newsSourceBucket(source) {
  const text = String(source || "").toLowerCase();
  if (!text) return "unknown";
  if (/reuters/.test(text)) return "reuters";
  if (/bloomberg/.test(text)) return "bloomberg";
  if (/associated press|\bap\b/.test(text)) return "ap";
  if (/yahoo/.test(text)) return "yahoo";
  if (/investing/.test(text)) return "investing";
  if (/marketwatch/.test(text)) return "marketwatch";
  if (/cnbc/.test(text)) return "cnbc";
  return text.replace(/[^a-z0-9]+/g, " ").trim().slice(0, 30) || "unknown";
}

function newsSourceQualityScore(source) {
  const text = String(source || "").toLowerCase();
  if (!text) return 0.8;
  for (const rule of NEWS_SOURCE_QUALITY_RULES) {
    if (rule.pattern.test(text)) return rule.score;
  }
  return /\b(blog|opinion|podcast|video)\b/i.test(text) ? 0.7 : 1.2;
}

function newsImpactScore(title, description) {
  const text = `${title || ""} ${description || ""}`;
  let score = 0;
  for (const rule of NEWS_IMPACT_RULES) {
    if (rule.pattern.test(text)) score += rule.score;
  }
  if (/\b(s&p 500|sp 500|nasdaq|dow jones|dollar index|treasury|bitcoin|ethereum|gold|oil)\b/i.test(text)) {
    score += 0.8;
  }
  return Math.min(score, 7.5);
}

function newsClickbaitPenalty(title) {
  const text = String(title || "");
  if (!text) return 0;
  let penalty = 0;
  for (const rule of NEWS_CLICKBAIT_RULES) {
    if (rule.pattern.test(text)) penalty += rule.penalty;
  }
  if (text.trim().endsWith("?")) penalty += 0.7;
  if (text.length < 40) penalty += 0.5;
  return Math.min(penalty, 5);
}

function newsFreshnessScore(pubDate) {
  const ts = parseNewsTimestamp(pubDate);
  if (!ts) return 0.2;
  const ageHours = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
  if (ageHours <= 1) return 2.2;
  if (ageHours <= 6) return 1.8;
  if (ageHours <= 12) return 1.4;
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 48) return 0.7;
  if (ageHours <= 72) return 0.4;
  if (ageHours <= 120) return 0.1;
  return -0.1;
}

function isNearDuplicateNews(a, b) {
  if (!a || !b) return false;
  if (a._newsLinkKey && b._newsLinkKey && a._newsLinkKey === b._newsLinkKey) return true;
  const titleA = String(a.title || "").trim().toLowerCase();
  const titleB = String(b.title || "").trim().toLowerCase();
  if (titleA && titleA === titleB) return true;
  const sim = newsTokenSimilarity(a._newsTokens, b._newsTokens);
  if (sim >= 0.84) return true;
  if (a._newsSourceBucket === b._newsSourceBucket && sim >= 0.72) return true;
  return false;
}

function rankAndFilterNewsItems(items, limit = 40) {
  if (!Array.isArray(items)) return [];
  const prepared = items
    .map((item, idx) => {
      const title = String(item?.title || "").trim();
      const description = String(item?.description || "").trim();
      const source = String(item?.source || "").trim();
      const ts = parseNewsTimestamp(item?.pubDate);
      const sourceScore = newsSourceQualityScore(source);
      const impactScore = newsImpactScore(title, description);
      const freshnessScore = newsFreshnessScore(item?.pubDate);
      const clickbaitPenalty = newsClickbaitPenalty(title);
      const detailBonus = description.length >= 80 ? 0.25 : 0;
      return {
        ...item,
        source,
        _newsTs: ts,
        _newsScore: sourceScore + impactScore + freshnessScore + detailBonus - clickbaitPenalty,
        _newsSourceBucket: newsSourceBucket(source),
        _newsTokens: tokenizeNewsHeadline(title),
        _newsLinkKey: normalizeNewsLink(item?.link),
        _newsIdx: idx,
      };
    })
    .filter((item) => item.title || item.link);

  prepared.sort((a, b) => (
    b._newsScore - a._newsScore
    || b._newsTs - a._newsTs
    || a._newsIdx - b._newsIdx
  ));

  const selected = [];
  const sourceCounts = new Map();
  for (const item of prepared) {
    if (selected.length >= limit) break;
    const sourceCap = selected.length < 8 ? 2 : 5;
    const count = sourceCounts.get(item._newsSourceBucket) || 0;
    if (count >= sourceCap) continue;
    if (selected.some((existing) => isNearDuplicateNews(existing, item))) continue;
    selected.push(item);
    sourceCounts.set(item._newsSourceBucket, count + 1);
  }

  for (const item of prepared) {
    if (selected.length >= limit) break;
    if (selected.includes(item)) continue;
    if (selected.some((existing) => isNearDuplicateNews(existing, item))) continue;
    selected.push(item);
  }

  return selected.map((item) => {
    const {
      _newsTs,
      _newsScore,
      _newsSourceBucket,
      _newsTokens,
      _newsLinkKey,
      _newsIdx,
      ...rest
    } = item;
    return rest;
  });
}

function extractNewsKeywords(text) {
  const raw = String(text || "")
    .toLowerCase()
    .replace(/&amp;/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
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

function buildNewsPlaceholder(text) {
  let hash = 0;
  const str = text || "news";
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  const seed = Math.abs(hash);
  const hueA = seed % 360;
  const hueB = (hueA + 32) % 360;
  const keywords = extractNewsKeywords(str);
  const titleText = (keywords.length ? keywords : NEWS_IMAGE_BASE_TAGS.slice(0, 3))
    .join(" · ")
    .toUpperCase()
    .slice(0, 48);
  const bars = Array.from({ length: 8 }, (_, i) => {
    const h = 30 + ((seed >> (i % 12)) % 70);
    const x = 64 + i * 78;
    const y = 412 - h;
    return `<rect x="${x}" y="${y}" width="44" height="${h}" fill="rgba(255,255,255,0.24)" />`;
  }).join("");
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
  <text x="56" y="75" fill="rgba(255,255,255,0.95)" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${titleText || "MARKET UPDATE"}</text>
</svg>
`.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function isLikelyAiImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  return NEWS_IMAGE_AI_MARKERS.some((pattern) => pattern.test(url));
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
    portfolio: (a.portfolio?.holdings?.length || 0) >= (b.portfolio?.holdings?.length || 0) ? a.portfolio : b.portfolio,
    paperPortfolio: (a.paperPortfolio?.history?.length || 0) >= (b.paperPortfolio?.history?.length || 0) ? a.paperPortfolio : b.paperPortfolio,
    notificationPrefs: a.notificationPrefs || b.notificationPrefs,
    prefs,
  };
}

function loadA11yPrefs() {
  if (typeof window === "undefined") {
    return { reducedMotion: false, colorBlind: "none", highContrast: false };
  }
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return { reducedMotion: false, colorBlind: "none", highContrast: false };
    const parsed = JSON.parse(raw);
    return {
      reducedMotion: Boolean(parsed?.reducedMotion),
      colorBlind: typeof parsed?.colorBlind === "string" ? parsed.colorBlind : "none",
      highContrast: Boolean(parsed?.highContrast),
    };
  } catch {
    return { reducedMotion: false, colorBlind: "none", highContrast: false };
  }
}

function colorBlindFilter(mode) {
  if (mode === "deuteranopia") return "saturate(0.8) contrast(1.05)";
  if (mode === "protanopia") return "saturate(0.7) contrast(1.1)";
  if (mode === "tritanopia") return "hue-rotate(-18deg) saturate(0.85)";
  return "none";
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
    if (json.items && json.items.length > 0) {
      const rankedItems = rankAndFilterNewsItems(json.items, 40);
      if (rankedItems.length === 0) return FALLBACK_NEWS;
      return rankedItems.map((item) => ({
        ...item,
        image: (!item.image || isLikelyAiImageUrl(item.image))
          ? buildNewsPlaceholder(item.title || item.description || "market news")
          : item.image,
      }));
    }
    return FALLBACK_NEWS;
  } catch {
    return FALLBACK_NEWS;
  }
}

async function fetchPredictionMarkets() {
  const resp = await fetchWithTimeout("/api/prediction", {}, 12000);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json || !Array.isArray(json.items)) throw new Error("Invalid response");
  return json;
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
const LIGHT_THEME = {
  cream: "#FAF7F2", warmWhite: "#F5F1EA", paper: "#EDE8DF",
  rule: "#D4CBBB", ruleFaint: "#E8E1D6",
  ink: "#1A1612", inkSoft: "#3D362E", inkMuted: "#7A7067", inkFaint: "#A69E94",
  up: "#1B6B3A", upBg: "#E8F5ED", down: "#9B1B1B", downBg: "#FBE8E8",
  hold: "#8B6914", holdBg: "#FDF6E3", accent: "#8B2500", chart4: "#5B4A8A",
  stripBg: "#FAF7F2", stripText: "#1A1612", stripMuted: "rgba(122,112,103,0.85)",
  stripBorder: "#D4CBBB", stripHover: "rgba(26,22,18,0.04)",
};

const DARK_THEME = {
  cream: "#14110E", warmWhite: "#1B1713", paper: "#242019",
  rule: "#3A3228", ruleFaint: "#2B251F",
  ink: "#F5EFE7", inkSoft: "#E1D7CA", inkMuted: "#B6A99A", inkFaint: "#8A7E70",
  up: "#3CCB7F", upBg: "#193123", down: "#FF6B6B", downBg: "#3A1B1B",
  hold: "#E0B35A", holdBg: "#3A2F12", accent: "#F28A5C", chart4: "#8C78D4",
  stripBg: "#14110E", stripText: "#F5EFE7", stripMuted: "rgba(245,239,231,0.68)",
  stripBorder: "#3A3228", stripHover: "rgba(245,239,231,0.06)",
};

let C = LIGHT_THEME;

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

function IconAccessibility({ size = 18, color = C.inkFaint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <circle cx="12" cy="5" r="2" stroke={color} strokeWidth="1.4" />
      <path d="M5 9.5h14" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 9.5v10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.2 20.5 12 14.5l3.8 6" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--body)", paddingBottom: 8, borderBottom: `2px solid ${C.ink}`, marginBottom: 12 }}>
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

function AnimatedDot({ cx, cy, fill, r = 4, index = 0, totalPoints = 1 }) {
  if (cx == null || cy == null) return null;
  const delay = (index / Math.max(1, totalPoints - 1)) * CHART_ANIM_MS;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={0}
      fill={fill}
      style={{
        animation: `dotPopIn 0.35s ease-out ${delay}ms forwards`,
      }}
    />
  );
}

function OpenActionButton({ onClick, label = "Open" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 22,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: `1px solid ${C.rule}`,
        color: C.inkMuted,
        cursor: "pointer",
        padding: 0,
        lineHeight: 1,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = C.paper;
        e.currentTarget.style.color = C.ink;
        e.currentTarget.style.borderColor = C.inkFaint;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = C.inkMuted;
        e.currentTarget.style.borderColor = C.rule;
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 3h6v6" />
        <path d="M10 14L21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    </button>
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
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.up, display: "inline-block", animation: "livePulse 2s ease infinite", boxShadow: "none" }} />
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
        const xRaw = xScale(d.n);
        if (xRaw == null || !isFinite(xRaw)) return null;
        const x = xRaw + band / 2;
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
  const [measureMode, setMeasureMode] = useState(false);
  const [measure, setMeasure] = useState(null); // { startIdx, endIdx, startPrice, endPrice }
  const measureRef = useRef(null);
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
    const browserWindow = typeof globalThis !== "undefined" ? globalThis.window : undefined;
    if (typeof document === "undefined" || !browserWindow) return undefined;
    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overscrollBehavior = "none";

    const preventScroll = (e) => e.preventDefault();
    browserWindow.addEventListener("wheel", preventScroll, { passive: false });
    browserWindow.addEventListener("touchmove", preventScroll, { passive: false });

    return () => {
      browserWindow.removeEventListener("wheel", preventScroll);
      browserWindow.removeEventListener("touchmove", preventScroll);
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      html.style.overscrollBehavior = prevHtmlOverscroll;
    };
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

  const getDataIndexFromX = (clientX) => {
    if (!containerRef.current || !data) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const chartLeft = rect.left + 55; // approx YAxis width
    const chartRight = rect.right - 12; // approx right margin
    const pct = (clientX - chartLeft) / (chartRight - chartLeft);
    const w = windowRef.current;
    const idx = Math.round(w.start + pct * (w.end - w.start));
    return Math.max(w.start, Math.min(w.end, idx));
  };

  const onMouseDown = (e) => {
    if (measureMode) {
      const idx = getDataIndexFromX(e.clientX);
      if (idx != null && data[idx]) {
        measureRef.current = { startIdx: idx, startPrice: data[idx].c };
        setMeasure({ startIdx: idx, endIdx: idx, startPrice: data[idx].c, endPrice: data[idx].c });
      }
      return;
    }
    dragRef.current = { x: e.clientX, start: windowRef.current.start, end: windowRef.current.end };
  };
  const onMouseMove = (e) => {
    if (measureMode && measureRef.current) {
      const idx = getDataIndexFromX(e.clientX);
      if (idx != null && data[idx]) {
        setMeasure(prev => prev ? { ...prev, endIdx: idx, endPrice: data[idx].c } : prev);
      }
      return;
    }
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.x;
    const size = dragRef.current.end - dragRef.current.start + 1;
    const shift = Math.round(-dx / rect.width * size);
    const next = clampWindow(dragRef.current.start + shift, dragRef.current.end + shift);
    commitWindow(next);
  };
  const onMouseUp = () => {
    dragRef.current = null;
    measureRef.current = null;
  };

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
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.35)", zIndex: 12000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overscrollBehavior: "none" }}>
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
            <button onClick={() => { setMeasureMode(m => !m); setMeasure(null); measureRef.current = null; }} style={controlBtn(measureMode)} title={t("chart.measure") || "Measure"}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
                <path d="M2 12h4l3-9 4 18 3-9h6" />
              </svg>
            </button>
            <button onClick={() => zoomWindow(0.85)} style={controlBtn(false)}>{t("common.zoomIn")}</button>
            <button onClick={() => zoomWindow(1.15)} style={controlBtn(false)}>{t("common.zoomOut")}</button>
            <button onClick={() => commitWindow(clampWindow(0, (data?.length || 1) - 1))} style={controlBtn(false)}>{t("common.reset")}</button>
            <button onClick={onClose} style={controlBtn(false)}>{t("common.close")}</button>
          </div>
        </div>
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div ref={containerRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            style={{ flex: 1, background: C.warmWhite, border: `1px solid ${C.rule}`, position: "relative", cursor: measureMode ? "crosshair" : dragRef.current ? "grabbing" : "grab", userSelect: "none" }}>
            <ResponsiveContainer width="100%" height="100%">
              {mode === "volume" ? (
                <BarChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} isAnimationActive={false} />
                </BarChart>
              ) : mode === "rsi" ? (
                <LineChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} ticks={[30, 70]} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={70} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </LineChart>
              ) : mode === "macd" ? (
                <ComposedChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={0} stroke={C.rule} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Bar dataKey="mh" fill={C.inkSoft + "20"} stroke={C.inkSoft + "40"} strokeWidth={0.5} isAnimationActive={false} />
                  <Line dataKey="macd" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line dataKey="ms" stroke={C.accent} dot={false} strokeWidth={1} isAnimationActive={false} />
                </ComposedChart>
              ) : mode === "stoch" ? (
                <LineChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} isAnimationActive={false} />
                </LineChart>
              ) : (
                <ComposedChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
                  <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" isAnimationActive={false} />
                  <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" isAnimationActive={false} />
                  <Line dataKey="s20" stroke={C.accent + "AA"} dot={false} strokeWidth={1} isAnimationActive={false} />
                  <Line dataKey="s50" stroke={C.chart4 + "88"} dot={false} strokeWidth={1} isAnimationActive={false} />
                  <Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} isAnimationActive={false} />
                  {chartType === "candles" ? (
                    <Customized component={CandlestickSeries} />
                  ) : (
                    <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  )}
                </ComposedChart>
              )}
            </ResponsiveContainer>
            {measureMode && measure && measure.startIdx !== measure.endIdx && (() => {
              const w = windowRef.current;
              const wSize = w.end - w.start;
              if (wSize <= 0) return null;
              const leftPct = ((Math.min(measure.startIdx, measure.endIdx) - w.start) / wSize) * 100;
              const rightPct = ((Math.max(measure.startIdx, measure.endIdx) - w.start) / wSize) * 100;
              const dollarChange = measure.endPrice - measure.startPrice;
              const pctChange = measure.startPrice ? (dollarChange / measure.startPrice) * 100 : 0;
              const isUp = dollarChange >= 0;
              return (
                <div style={{ position: "absolute", left: `calc(55px + ${leftPct}% * (100% - 67px) / 100)`, width: `calc(${rightPct - leftPct}% * (100% - 67px) / 100)`, top: 12, bottom: 0, background: isUp ? C.up + "15" : C.down + "15", borderLeft: `1px dashed ${isUp ? C.up : C.down}`, borderRight: `1px dashed ${isUp ? C.up : C.down}`, pointerEvents: "none", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8 }}>
                  <div style={{ background: C.cream, border: `1px solid ${isUp ? C.up : C.down}`, padding: "4px 8px", fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: isUp ? C.up : C.down, whiteSpace: "nowrap" }}>
                    {isUp ? "+" : ""}{dollarChange.toFixed(2)} ({isUp ? "+" : ""}{pctChange.toFixed(2)}%)
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)" }}>
            {t("charts.windowHint", { count: window.end - window.start + 1, total: data?.length || 0 })}
          </div>
          <div style={{ height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data || []}>
                <XAxis dataKey="n" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Line dataKey="c" stroke={C.inkSoft} dot={false} strokeWidth={1} isAnimationActive={false} />
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

function LoadingScreen({ ticker, isPro, chartType = "line" }) {
  const { t } = useI18n();
  const candleMode = chartType === "candles";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 420, gap: 20, position: "relative" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, zIndex: 1 }}>
        {candleMode ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 78, padding: "0 4px" }}>
            {Array.from({ length: 12 }).map((_, i) => {
              const up = i % 3 !== 0;
              const color = up ? C.up : C.down;
              const bodyHeight = 14 + ((i * 9) % 16);
              const bodyBottom = 11 + ((i * 5) % 10);
              const wickHeight = bodyHeight + 16 + (i % 4) * 4;
              return (
                <div key={i} style={{ position: "relative", width: 9, height: 74, animation: `candleFloat 1.6s ease-in-out ${i * 0.08}s infinite` }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: 8,
                      width: 1,
                      height: wickHeight,
                      transform: "translateX(-50%)",
                      background: color,
                      opacity: 0.6,
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: 1,
                      bottom: bodyBottom,
                      width: 7,
                      height: bodyHeight,
                      background: color,
                      borderRadius: 1,
                      transformOrigin: "bottom center",
                      animation: `candleBodyPulse 1.25s ease-in-out ${i * 0.05}s infinite`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{ position: "relative", zIndex: 1, animation: "alphaFloat 3s ease-in-out infinite" }}>
              <LogoIcon size={40} />
            </div>
          </div>
        )}
        <BrandMark size={28} pro={isPro} weight={300} />
      </div>
      <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.inkMuted, zIndex: 1 }}>
        {candleMode ? "Building candle view for " : `${t("loading.analyzing")} `}
        <span style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)" }}>{ticker}</span>
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
        borderRight: `1px solid ${C.stripBorder}`,
        whiteSpace: "nowrap",
        background: "transparent",
        border: "none",
        color: "inherit",
        cursor: "pointer",
        textAlign: "left",
        transition: "transform 0.2s ease, background 0.2s ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.background = C.stripHover; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.stripMuted, letterSpacing: "0.06em", fontWeight: 600 }}>{labelFor(item.label, t)}</span>
      <span style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 700, color: item.changePct > 0 ? "#4ADE80" : item.changePct < 0 ? "#F87171" : C.stripMuted }}>
        {item.loaded ? `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%` : ""}
      </span>
      <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: C.stripMuted, fontWeight: 500 }}>
        {item.loaded ? (item.price >= 1000 ? item.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : item.price.toFixed(2)) : "—"}
      </span>
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", background: C.stripBg, color: C.stripText, overflow: "hidden", minWidth: 0 }}>
      {/* LIVE badge — fixed, does not scroll */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRight: `1px solid ${C.stripBorder}`, flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE80", display: "inline-block", animation: "livePulse 2s ease-in-out infinite", boxShadow: "none" }} />
        <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "#4ADE80", fontWeight: 700, letterSpacing: "0.08em" }}>{t("common.live")}</span>
      </div>
      {/* Scrolling content */}
      <div className="ticker-strip-scroll" style={{ flex: 1, overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex" }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", minWidth: 140, borderRight: `1px solid ${C.stripBorder}` }}>
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
          <span style={{ fontSize: compact ? 22 : 30, fontFamily: "var(--display)", color, fontWeight: 600, marginLeft: 12 }}>
            {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
          </span>
        </div>
        <span style={{ fontSize: compact ? 11 : 13, fontFamily: "var(--mono)", fontWeight: 600, color: C.inkSoft }}>
          {fmt(lastPrice)}
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

function NewsPopup({ title, items, onClose }) {
  const { t } = useI18n();
  return (
    <div className="popup-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.35)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="popup-card" onClick={e => e.stopPropagation()} style={{ background: C.cream, border: `1px solid ${C.rule}`, width: "min(820px, 94vw)", maxHeight: "84vh", boxShadow: "8px 16px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.rule}` }}>
          <span style={{ fontFamily: "var(--display)", fontSize: 18, color: C.ink }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.inkMuted, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: "14px 20px 20px", display: "grid", gap: 12 }}>
          {(!items || items.length === 0) ? (
            <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--body)", padding: "12px 0" }}>{t("common.noData")}</div>
          ) : items.map((n, i) => {
            const itemTitle = n.titleKey ? t(n.titleKey) : n.title;
            const itemSource = n.sourceKey ? t(n.sourceKey) : n.source || t("news.sourceYahoo");
            const itemDesc = n.descriptionKey ? t(n.descriptionKey) : n.description;
            const ago = n.pubDate ? timeAgo(n.pubDate, t) : t("news.publishedRecently");
            const itemImage = n.image || buildNewsPlaceholder(itemTitle || `popup-news-${i}`);
            return (
              <a
                key={`${n.link || itemTitle || "news"}-${i}`}
                href={n.link || "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                style={{ display: "grid", gridTemplateColumns: "160px minmax(0, 1fr)", gap: 14, width: "100%", padding: 10, textDecoration: "none", color: C.ink, border: `1px solid ${C.ruleFaint}`, borderRadius: 12, background: C.warmWhite, transition: "transform 0.15s, background 0.15s, border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.paper}
                onMouseLeave={e => e.currentTarget.style.background = C.warmWhite}
              >
                <div style={{ position: "relative", width: "100%", height: 102, borderRadius: 10, overflow: "hidden", background: C.paper }}>
                  <img
                    src={itemImage}
                    alt=""
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    onError={e => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = buildNewsPlaceholder(itemTitle || `popup-news-${i}`);
                    }}
                  />
                </div>
                <div style={{ display: "grid", gap: 8, minWidth: 0, alignContent: "center" }}>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: 21, color: C.ink, lineHeight: 1.2 }}>{itemTitle}</span>
                  {itemDesc && (
                    <span style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5 }}>{itemDesc}</span>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)", fontWeight: 600 }}>{itemSource}</span>
                    <span style={{ color: C.ruleFaint, fontFamily: "var(--mono)", fontSize: 10 }}>•</span>
                    <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--mono)" }}>{ago}</span>
                  </div>
                </div>
              </a>
            );
          })}
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
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: C.inkMuted, fontFamily: "var(--body)", fontWeight: 600, marginBottom: 12 }}>
        {title.toLowerCase().includes("gainer") && <span style={{ color: C.up, marginRight: 4 }}>▲</span>}
        {title.toLowerCase().includes("loser") && <span style={{ color: C.down, marginRight: 4 }}>▼</span>}
        {title}
      </div>
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

function TickerBadge({ sym, quote }) {
  if (!quote) return null;
  const price = quote.price;
  const closes = quote.spark || [];
  const weekAgoClose = closes.length >= 5 ? closes[closes.length - 5] : closes[0];
  const weeklyPct = weekAgoClose ? ((price - weekAgoClose) / weekAgoClose) * 100 : 0;
  const isUp = weeklyPct >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", fontSize: 10, fontFamily: "var(--mono)",
      background: isUp ? "rgba(34,139,34,0.08)" : "rgba(200,40,40,0.08)",
      color: isUp ? "#1a7a1a" : "#b22222",
      border: `1px solid ${isUp ? "rgba(34,139,34,0.18)" : "rgba(200,40,40,0.18)"}`,
      letterSpacing: "0.02em", whiteSpace: "nowrap",
    }}>
      <span style={{ fontWeight: 700 }}>{sym}</span>
      <span>${price < 1 ? price.toFixed(4) : price.toFixed(2)}</span>
      <span>{isUp ? "+" : ""}{weeklyPct.toFixed(1)}%</span>
    </span>
  );
}

function NewsSection({ news, loading }) {
  const { t } = useI18n();
  const [showPopup, setShowPopup] = useState(false);
  const [tickerQuotes, setTickerQuotes] = useState({});
  useEffect(() => {
    if (!news || news.length === 0) return;
    const allTickers = [...new Set(news.flatMap(n => n.tickers || []))];
    if (allTickers.length === 0) return;
    let cancelled = false;
    (async () => {
      const quotes = {};
      await Promise.allSettled(allTickers.map(async (sym) => {
        try {
          const q = await fetchQuickQuote(sym);
          if (!cancelled) quotes[sym] = q;
        } catch { /* skip */ }
      }));
      if (!cancelled) setTickerQuotes(quotes);
    })();
    return () => { cancelled = true; };
  }, [news]);
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
  const heroTitle = hero.titleKey ? t(hero.titleKey) : hero.title;
  const heroDesc = hero.descriptionKey ? t(hero.descriptionKey) : hero.description;
  const heroSource = hero.sourceKey ? t(hero.sourceKey) : hero.source || t("news.sourceYahoo");
  const heroImage = hero.image || buildNewsPlaceholder(heroTitle || "market news");
  const rest = news.slice(1);
  const cards = rest.slice(0, 3);
  const overflowNews = rest.slice(3);
  const showSeeMore = overflowNews.length > 0;
  const articleCols = Math.max(1, cards.length);
  const seeMoreColWidth = 120;
  const rowGridCols = showSeeMore
    ? `repeat(${articleCols}, minmax(176px, 1fr)) ${seeMoreColWidth}px`
    : `repeat(${articleCols}, minmax(176px, 1fr))`;
  const rowMinWidth = showSeeMore
    ? `${(articleCols * 196) + seeMoreColWidth}px`
    : `${articleCols * 196}px`;
  const publishedText = hero.pubDate ? t("news.published", { ago: timeAgo(hero.pubDate, t) }) : t("news.publishedRecently");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <HelpWrap help={{ title: t("help.newsHero.title"), body: t("help.newsHero.body") }} block>
        <a href={hero.link || "#"} target="_blank" rel="noopener noreferrer"
          style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", minHeight: 260, background: C.warmWhite, border: `1px solid ${C.rule}`, borderRadius: 16, textDecoration: "none", color: C.ink, overflow: "hidden" }}>
          <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.24em", textTransform: "uppercase", color: C.inkFaint }}>{t("news.topStory")}</div>
            <div style={{ fontSize: 28, fontFamily: "var(--display)", lineHeight: 1.2, color: C.inkSoft }}>{heroTitle}</div>
            {heroDesc && (
              <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.inkMuted, lineHeight: 1.6 }}>{heroDesc}</div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.02em" }}>
              <span>{publishedText}</span>
              <span style={{ color: C.ruleFaint }}>·</span>
              <span style={{ fontWeight: 600 }}>{heroSource}</span>
            </div>
            {(hero.tickers || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {hero.tickers.map(sym => <TickerBadge key={sym} sym={sym} quote={tickerQuotes[sym]} />)}
              </div>
            )}
          </div>
          <div style={{ position: "relative", background: C.paper }}>
            <img src={heroImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = buildNewsPlaceholder(heroTitle || "market news");
            }} />
          </div>
        </a>
      </HelpWrap>
      <HelpWrap help={{ title: t("help.newsList.title"), body: t("help.newsList.body") }} block>
        {(cards.length > 0 || showSeeMore) && (
          <div style={{ overflowX: "auto", paddingBottom: 2 }}>
            <div style={{ display: "grid", gridTemplateColumns: rowGridCols, gap: 12, minWidth: rowMinWidth }}>
              {cards.map((n, i) => {
                const cardTitle = n.titleKey ? t(n.titleKey) : n.title;
                const cardImage = n.image || buildNewsPlaceholder(cardTitle || `news-${i}`);
                const cardSource = n.sourceKey ? t(n.sourceKey) : n.source || t("news.sourceYahoo");
                return (
                  <a key={i} href={n.link || "#"} target="_blank" rel="noopener noreferrer"
                    style={{ display: "grid", gridTemplateRows: "120px auto", background: C.warmWhite, border: `1px solid ${C.rule}`, borderRadius: 14, textDecoration: "none", color: C.ink, overflow: "hidden", transition: "transform 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
                    <div style={{ position: "relative", background: C.paper }}>
                      <img src={cardImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = buildNewsPlaceholder(cardTitle || `news-${i}`);
                      }} />
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
                      {(n.tickers || []).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {n.tickers.map(sym => <TickerBadge key={sym} sym={sym} quote={tickerQuotes[sym]} />)}
                        </div>
                      )}
                    </div>
                  </a>
                );
              })}
              {showSeeMore && (
                <button
                  type="button"
                  onClick={() => setShowPopup(true)}
                  style={{ display: "grid", gridTemplateRows: "1fr", alignItems: "center", justifyItems: "center", background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 14, color: C.ink, cursor: "pointer", textAlign: "center", transition: "transform 0.15s, background 0.15s", minHeight: 214, padding: "12px 10px" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = C.warmWhite; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = C.paper; }}
                >
                  <span style={{ fontFamily: "var(--body)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.inkMuted }}>
                    SEE MORE
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </HelpWrap>
      {showPopup && (
        <NewsPopup
          title={`${t("home.marketNews")} (${overflowNews.length})`}
          items={overflowNews}
          onClose={() => setShowPopup(false)}
        />
      )}
    </div>
  );
}

function MiniCard({ title, children, style, actions }) {
  return (
    <div style={{ background: C.warmWhite, border: `1px solid ${C.rule}`, padding: "14px 16px", display: "grid", gap: 10, ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--body)", letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700 }}>
            {title}
          </div>
          {actions && <div style={{ display: "inline-flex", alignItems: "center" }}>{actions}</div>}
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

function SectorPerformanceCard({ onOpen }) {
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
    <MiniCard
      title={t("home.sectorPerformance")}
      actions={onOpen ? <OpenActionButton onClick={onOpen} label="Open sectors" /> : null}
    >
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
                <span style={{ fontSize: 10, fontFamily: "var(--body)", color: C.inkMuted, minWidth: 130, flexShrink: 0 }}>{labelFor(d.label, t)}</span>
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

function YieldCurveCard({ onOpen }) {
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
    <MiniCard
      title={t("home.yieldCurve")}
      actions={onOpen ? <OpenActionButton onClick={onOpen} label="Open economic" /> : null}
    >
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
              <Line type="monotone" dataKey="yield" stroke={lineColor} strokeWidth={2}
                dot={(props) => <AnimatedDot key={props.index} cx={props.cx} cy={props.cy} fill={lineColor} index={props.index} totalPoints={data.length} />}
                isAnimationActive={true} animationDuration={CHART_ANIM_MS}
                label={{ position: "top", fontSize: 10, fontFamily: "var(--mono)", fill: C.ink, formatter: v => v.toFixed(2) + "%" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </MiniCard>
  );
}

function PortfolioTileCard({ data, onOpen }) {
  const { t } = useI18n();
  const changeColor = data.dayChangePct >= 0 ? C.up : C.down;
  return (
    <MiniCard
      title={t("home.portfolioSnapshot")}
      actions={onOpen ? <OpenActionButton onClick={onOpen} label="Open portfolio" /> : null}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 800, color: changeColor }}>
            {data.dayChangePct >= 0 ? "+" : ""}{data.dayChangePct.toFixed(2)}%
          </div>
          <div style={{ fontSize: 18, fontFamily: "var(--display)", color: C.ink }}>{fmtMoney(data.value)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 700 }}>{t("home.returnYtd")}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: data.ytdPct >= 0 ? C.up : C.down }}>{data.ytdPct >= 0 ? "+" : ""}{data.ytdPct.toFixed(2)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 700 }}>Capital Gains</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: (data.value * data.ytdPct / 100) >= 0 ? C.up : C.down }}>
              {(data.value * data.ytdPct / 100) >= 0 ? "+" : ""}{fmtMoney(data.value * data.ytdPct / 100)}
            </div>
          </div>
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

function AssetRow({ section, onAnalyze, onOpen }) {
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "var(--mono)" }}>
          {labelFor(section.title, t)}
        </div>
        {onOpen && <OpenActionButton onClick={onOpen} label={`Open ${section.title}`} />}
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
function LiteTools({ onAnalyze, watchlist = [], alerts = [], onAddWatchlist, onRemoveWatchlist, onAddAlert, onRemoveAlert }) {
  const [open, setOpen] = useState(false);
  const menuPresence = useMenuPresence(open, 140);
  const { t } = useI18n();
  const [subTab, setSubTab] = useState("watchlist");
  const [wlInput, setWlInput] = useState("");
  const [alForm, setAlForm] = useState({ ticker: "", type: "above", value: "" });
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const toolCount = watchlist.length + alerts.length;

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
      <button onClick={() => setOpen(!open)} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", padding: "0 0 10px 0", background: "none", border: "none", borderBottom: open ? `2px solid ${C.ink}` : "2px solid transparent", color: open ? C.ink : C.inkMuted, fontSize: 12, fontWeight: open ? 700 : 500, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>
        <span>{t("nav.tools")}</span>
        <span style={{ fontSize: 10, lineHeight: 1, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▾</span>
        {toolCount > 0 && <span style={{ fontSize: 9, background: C.ink, color: C.cream, borderRadius: "50%", width: 16, height: 16, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 2 }}>{toolCount}</span>}
      </button>
      {menuPresence.mounted && (
        <div
          className={`menu-pop menu-pop-rightOrigin mobile-dropdown${menuPresence.phase === "closing" ? " menu-pop-exit" : ""}`}
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

function useViewport() {
  const getState = () => {
    if (typeof window === "undefined") return { width: 1280, isMobile: false, isTablet: false };
    const width = window.innerWidth || 1280;
    return {
      width,
      isMobile: width <= 767,
      isTablet: width <= 1100,
    };
  };
  const [state, setState] = useState(getState);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setState(getState());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return state;
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
function App() {
  const viewport = useViewport();
  const initialWorkspace = useMemo(() => loadLocalWorkspace(), []);
  const initialRoute = useMemo(() => readRouteFromLocation(), []);
  const [tab, setTab] = useState(initialRoute.tab);
  const [analysisSubTab, setAnalysisSubTab] = useState(initialRoute.analysisSubTab);
  const [accountSubTab, setAccountSubTab] = useState(initialRoute.accountSubTab);
  const [routeTicker, setRouteTicker] = useState(initialRoute.ticker);
  const [chartSelection, setChartSelection] = useState(initialRoute.chart);
  const [chartType, setChartType] = useState(() => initialRoute.chartType || initialWorkspace.prefs?.chartType || "candles");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "system";
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
    return "system";
  });
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
  const [portfolio, setPortfolio] = useState(initialWorkspace.portfolio || { holdings: [] });
  const [paperPortfolio, setPaperPortfolio] = useState(initialWorkspace.paperPortfolio || { cash: 100000, positions: [], history: [], equityCurve: [{ date: new Date().toISOString().slice(0, 10), value: 100000 }] });
  const [notificationPrefs, setNotificationPrefs] = useState(initialWorkspace.notificationPrefs || { enabled: false, priceAlerts: true, earnings: false });
  const [marketsSubTab, setMarketsSubTab] = useState("heatmap");
  const [marketsFocusKey, setMarketsFocusKey] = useState(null);
  const [portfolioSubTab, setPortfolioSubTab] = useState("holdings");
  const [screenerSubTab, setScreenerSubTab] = useState("screener");
  const [prefs, setPrefs] = useState(initialWorkspace.prefs);
  const accountChartTypePref = prefs?.chartType === "candles" ? "candles" : "line";
  const resolvedChartType = chartType || accountChartTypePref;
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
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef(null);
  const searchRef = useRef(null);
  const accountMenuRef = useRef(null);
  const liveRef = useRef(null);
  const prevPriceRef = useRef(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [a11yMenuOpen, setA11yMenuOpen] = useState(false);
  const [a11y, setA11y] = useState(() => loadA11yPrefs());
  const accountMenuPresence = useMenuPresence(accountMenuOpen, 140);
  const langMenuPresence = useMenuPresence(langMenuOpen, 120);
  const a11yMenuPresence = useMenuPresence(a11yMenuOpen, 120);
  const [helpMode, setHelpMode] = useState(false);
  const [helpTooltip, setHelpTooltip] = useState(null);
  const [chartIntent, setChartIntent] = useState(null);
  const routeSyncRef = useRef(false);
  const routeHydratedRef = useRef(false);
  const routedTickerRef = useRef(null);
  const authToastTimerRef = useRef(null);
  const prevSessionRef = useRef(null);
  const authHydratedRef = useRef(false);

  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener?.("change", handler) || mq.addListener?.(handler);
    return () => { mq.removeEventListener?.("change", handler) || mq.removeListener?.(handler); };
  }, []);
  const isDark = theme === "system" ? systemDark : theme === "dark";
  C = isDark ? DARK_THEME : LIGHT_THEME;

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

  const [shareToast, setShareToast] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setShareUrl(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 3000);
    }).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === "light" ? "dark" : prev === "dark" ? "system" : "light");
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
        setA11yMenuOpen(false);
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
    if (typeof window === "undefined") return;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.setProperty("--app-bg", C.cream);
    root.style.setProperty("--ink", C.ink);
    root.style.setProperty("--hover-bg", C.paper);
    root.style.setProperty("--placeholder-color", C.inkFaint);
    root.style.setProperty("--scroll-track", C.warmWhite);
    root.style.setProperty("--scroll-thumb", C.rule);
    root.style.setProperty("--toast-bg", isDark ? "rgba(12,10,8,0.92)" : "rgba(26,22,18,0.92)");
    root.style.setProperty("--toast-text", isDark ? C.ink : "#F9F6F1");
    root.style.setProperty("--toast-border", "rgba(255,255,255,0.12)");
    root.style.setProperty("--spinner-track", isDark ? "rgba(20,17,14,0.35)" : "rgba(255,255,255,0.35)");
    root.style.setProperty("--spinner-head", isDark ? C.cream : "#fff");
    root.style.setProperty("--theme-focus", C.accent);
  }, [theme, isDark]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(a11y));
    const root = document.documentElement;
    root.dataset.reducedMotion = a11y.reducedMotion ? "true" : "false";
    root.dataset.highContrast = a11y.highContrast ? "true" : "false";
    root.style.setProperty("--a11y-color-filter", colorBlindFilter(a11y.colorBlind));
    root.style.setProperty("--a11y-contrast-filter", a11y.highContrast ? "contrast(1.14)" : "none");
  }, [a11y]);

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
    if (chartType) return;
    setChartType(accountChartTypePref);
  }, [chartType, accountChartTypePref]);

  useEffect(() => {
    if (tab === "analysis" || tab === "charts" || tab === "screener") return;
    if (routeSyncRef.current) return;
    if (!routeTicker) return;
    setRouteTicker("");
  }, [tab, routeTicker]);

  useEffect(() => {
    if (!helpMode) setHelpTooltip(null);
  }, [helpMode]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const results = await fetchSearch(searchQuery);
      setSearchResults(results);
      setSearchLoading(false);
      setShowSearchDropdown(true);
    }, 350);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const workspaceData = useMemo(() => ({
    version: WORKSPACE_VERSION,
    watchlist,
    alerts,
    recent: recentAnalyses,
    comparisons: savedComparisons,
    portfolio,
    paperPortfolio,
    notificationPrefs,
    prefs,
  }), [watchlist, alerts, recentAnalyses, savedComparisons, portfolio, paperPortfolio, notificationPrefs, prefs]);

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
    setA11yMenuOpen(false);
  }, [session]);

  const applyWorkspace = useCallback((ws) => {
    const safe = sanitizeWorkspace(ws);
    setWatchlist(safe.watchlist);
    setAlerts(safe.alerts);
    setRecentAnalyses(safe.recent);
    setSavedComparisons(safe.comparisons);
    setPortfolio(safe.portfolio);
    setPaperPortfolio(safe.paperPortfolio);
    setNotificationPrefs(safe.notificationPrefs);
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
          setChartLivePrice(last.Close);
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

  const analyze = useCallback(async (t, options = {}) => {
    const sym = (t || ticker).trim().toUpperCase();
    if (!sym) return;
    setChartType(accountChartTypePref);
    setTicker(sym); setLoading(true); setError(null); setLivePrice(null); setChartLivePrice(null); setLatency(null);
    try {
      const fd = await fetchStockData(sym, period, interval);
      const analysis = runAnalysis(sym, fd.data);
      analysis.period = period;
      analysis.interval = interval;
      analysis.source = fd.source;
      analysis.latency = fd.latency;
      analysis.debug = fd.debug;
      setResult(analysis);
      setChartLivePrice(analysis.currentPrice);
      setLatency(fd.latency);
      recordRecent(analysis);
      if (!options.preserveTab) setTab("analysis");
    } catch (e) {
      setError({ message: t("error.allSourcesFailed"), debug: e.debug || { error: String(e) } });
    }
    setLoading(false);
  }, [ticker, period, interval, recordRecent, accountChartTypePref]);

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
    setChartType(accountChartTypePref);
    setTicker(sym); setLoading(true); setError(null); setLivePrice(null); setChartLivePrice(null); setLatency(null);
    try {
      const fd = await fetchStockData(sym, p, i);
      const analysis = runAnalysis(sym, fd.data);
      analysis.period = p;
      analysis.interval = i;
      analysis.source = fd.source;
      analysis.latency = fd.latency;
      analysis.debug = fd.debug;
      setResult(analysis);
      setChartLivePrice(analysis.currentPrice);
      setLatency(fd.latency);
      recordRecent(analysis);
    } catch (e) {
      setError({ message: t("error.allSourcesFailed"), debug: e.debug || { error: String(e) } });
    }
    setLoading(false);
  }, [recordRecent, accountChartTypePref]);

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
  const setDefaultChartType = useCallback((type) => {
    const next = type === "candles" ? "candles" : "line";
    setPrefs(prev => {
      if (prev?.chartType === next) return prev;
      return { ...prev, chartType: next, updatedAt: Date.now() };
    });
    setChartType(next);
  }, []);
  const openProSignup = useCallback(() => {
    setTab("account");
    setAccountSubTab("overview");
    if (!session) openAuth("signup");
  }, [session, openAuth]);

  // Service worker registration for push notifications
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    const handler = (event) => {
      if (event.data?.type === "ALERT_TRIGGERED") {
        setAlerts(prev => prev.map(a => a.id === event.data.alertId ? { ...a, triggered: true } : a));
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);


  const tabStyle = (t, locked = false) => ({
    padding: "0 0 10px 0", marginRight: viewport.isMobile ? 14 : 24, background: "none", border: "none",
    borderBottom: tab === t ? `2px solid ${C.ink}` : "2px solid transparent",
    color: tab === t ? C.ink : locked ? C.inkFaint : C.inkMuted, fontSize: 12,
    fontWeight: tab === t ? 700 : 500, cursor: "pointer",
    textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)",
    opacity: locked ? 0.7 : 1,
    transition: "color 0.15s, border-color 0.15s",
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
    whiteSpace: "nowrap",
    transition: "color 0.15s, border-color 0.15s",
  });
  const openCharts = useCallback((intent) => {
    if (intent?.mode) setChartSelection(normalizeChartMode(intent.mode));
    setChartIntent(intent);
    setTab("charts");
  }, []);
  const consumeChartIntent = useCallback(() => setChartIntent(null), []);
  const openFromHome = useCallback((dest) => {
    const targetTab = dest?.tab;
    if (targetTab === "portfolio") {
      setTab("portfolio");
      return;
    }
    if (targetTab === "markets") {
      setMarketsSubTab(normalizeMarketsTab(dest?.subTab));
      setMarketsFocusKey(dest?.focusKey || null);
      setTab("markets");
    }
  }, []);

  const navHelp = useMemo(() => ({
    home: { title: t("help.nav.home.title"), body: t("help.nav.home.body") },
    analysis: { title: t("help.nav.analysis.title"), body: t("help.nav.analysis.body") },
    charts: { title: t("help.nav.charts.title"), body: t("help.nav.charts.body") },
    screener: { title: "Stock Screener", body: "Filter and scan stocks by technical and fundamental criteria." },
    markets: { title: "Markets", body: "Heatmaps, sector analysis, crypto dashboard, and economic calendar." },
    portfolio: { title: "Portfolio", body: "Track your holdings, paper trade, and backtest strategies." },
    community: { title: "Community", body: "Share analyses, view trending tickers, and see the leaderboard." },
    heatmap: { title: t("help.nav.heatmap.title"), body: t("help.nav.heatmap.body") },
    comparison: { title: t("help.nav.comparison.title"), body: t("help.nav.comparison.body") },
  }), [t]);
  const pageDeps = {
    useI18n,
    C,
    CHART_ANIM_MS,
    normalizeChartMode,
    MARKET_REGIONS,
    REGION_MOVERS,
    HEATMAP_UNIVERSE,
    HEATMAP_INDEXES,
    ASSET_SECTIONS,
    DEFAULT_TRENDING,
    FALLBACK_NEWS,
    PORTFOLIO_TILE,
    STRATEGIES,
    SECTOR_COLORS,
    SECTOR_ETFS,
    fetchTickerStrip,
    fetchIntradayData,
    fetchMarketMovers,
    fetchQuickQuote,
    fetchRSSNews,
    fetchPredictionMarkets,
    fetchStockData,
    runAnalysis,
    applyLivePoint,
    runValuationModels,
    calcFundamentals,
    hashCode,
    seededRange,
    usePrevious,
    useInView,
    labelFor,
    fmt,
    fmtPct,
    fmtMoney,
    recColor,
    valColor,
    translateEnum,
    formatAgo,
    BrandMark,
    ProTag,
    ProGate,
    Signal,
    Row,
    HelpWrap,
    Section,
    OpenActionButton,
    Sparkline,
    LazySection,
    AnimatedPrice,
    CandlestickSeries,
    ExpandedChartModal,
    LiveBadge,
    TickerStrip,
    MiniIntradayChart,
    MoverColumn,
    AssetRow,
    MarketScorecardCard,
    CrossAssetCard,
    SectorPerformanceCard,
    YieldCurveCard,
    NewsSection,
    PortfolioTileCard,
    ChangelogBanner,
  };
  return (
    <I18nContext.Provider value={{ t, locale }}>
      <HelpContext.Provider value={{ enabled: helpMode, show: showHelp, hide: hideHelp }}>
        <div className="app-shell" style={{ fontFamily: "var(--body)", background: C.cream, color: C.ink, minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", width: "min(1200px, 100%)", marginInline: "auto", filter: `${colorBlindFilter(a11y.colorBlind)} ${a11y.highContrast ? "contrast(1.14)" : ""}`.trim() }}>
      <header style={{ padding: viewport.isMobile ? "12px 14px 0" : "16px 24px 0", borderBottom: `1px solid ${C.rule}`, position: "relative", zIndex: 2000 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            <a onClick={() => { setTab("home"); window.history.pushState({}, "", "/"); }} style={{ cursor: "pointer", textDecoration: "none" }}><BrandMark size={22} pro={isPro} /></a>
            <span style={{ width: 1, height: 14, background: C.rule, display: "inline-block", margin: "0 2px" }} />
            <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>{t("tagline.quant")}</span>
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
                style={{ width: viewport.isMobile ? 130 : 200, minWidth: 0, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", color: C.ink, fontSize: 12, fontFamily: "var(--body)", outline: "none", borderRadius: 0, transition: "border-color 0.15s" }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (searchResults.length > 0) {
                      analyze(searchResults[0].symbol); setSearchQuery(""); setShowSearchDropdown(false);
                    } else if (searchQuery.trim()) {
                      setShowSearchDropdown(true);
                    }
                  }
                  if (e.key === "Escape") setShowSearchDropdown(false);
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.ink; if (searchResults.length > 0) setShowSearchDropdown(true); }}
                onBlur={e => { e.currentTarget.style.borderColor = C.rule; }}
              />
            </HelpWrap>
            {showSearchDropdown && searchQuery.trim().length > 0 && (
              <div className="menu-pop mobile-dropdown" style={{ position: "absolute", top: "100%", left: "auto", right: 0, width: 340, background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 200, maxHeight: 320, overflowY: "auto" }}>
                {searchLoading && (
                  <div style={{ padding: "14px 16px", fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span className="search-spinner" style={{ width: 14, height: 14, border: `2px solid ${C.rule}`, borderTop: `2px solid ${C.ink}` }} />
                    Searching...
                  </div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div style={{ padding: "14px 16px", fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", textAlign: "center" }}>
                    No results found for "{searchQuery.trim()}"
                  </div>
                )}
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
              <button onClick={() => { if (searchResults.length > 0) { analyze(searchResults[0].symbol); setSearchQuery(""); setShowSearchDropdown(false); } else if (searchQuery.trim()) { setShowSearchDropdown(true); } }} disabled={loading || !searchQuery.trim() || searchResults.length === 0}
                className="btn-primary"
                style={{ padding: viewport.isMobile ? "7px 12px" : "7px 20px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 11, cursor: loading ? "wait" : "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase", opacity: loading ? 0.5 : 1 }}>
                {loading ? t("search.running") : t("search.analyze")}
              </button>
            </HelpWrap>
          </div>
        </div>
        <nav style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexDirection: viewport.isTablet ? "column" : "row", gap: viewport.isTablet ? 10 : 0 }}>
          <div className="hide-scrollbar" style={{ display: "flex", flexWrap: "nowrap", width: "100%", overflowX: "auto" }}>
            {[
              { key: "home", label: t("nav.home") },
              { key: "analysis", label: t("nav.analysis") },
              { key: "charts", label: t("nav.charts") },
              { key: "screener", label: "Screener" },
              { key: "markets", label: "Markets" },
              { key: "portfolio", label: "Portfolio" },
              { key: "community", label: "Community" },
            ].map(({ key, label, pro, badge }) => {
              const locked = !!pro && !isPro;
              return (
                <HelpWrap key={key} help={navHelp[key]}>
                  <button onClick={() => setTab(key)} className="nav-tab" style={tabStyle(key, locked)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>{label}</span>
                      {locked && <ProTag small />}
                    </span>
                  </button>
                </HelpWrap>
              );
            })}
          </div>
          <div className="hide-scrollbar" style={{ display: "flex", alignItems: "flex-end", gap: viewport.isMobile ? 10 : 16, width: "auto", justifyContent: viewport.isTablet ? "flex-start" : "flex-end", flexWrap: "nowrap", overflowX: "auto", maxWidth: "100%", alignSelf: "stretch" }}>
            <button
              type="button"
              onClick={toggleTheme}
              className={`theme-toggle ${isDark ? "theme-toggle-dark" : "theme-toggle-light"}`}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              style={{ background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", padding: 0, marginBottom: 6, display: "inline-flex", alignItems: "center" }}
            >
              <span className="theme-icon sun" aria-hidden="true" style={{ display: "inline-flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <g stroke={C.inkMuted} strokeWidth="1.6" strokeLinecap="round">
                    <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="4.5" y1="4.5" x2="7.5" y2="7.5" /><line x1="16.5" y1="16.5" x2="19.5" y2="19.5" />
                    <line x1="4.5" y1="19.5" x2="7.5" y2="16.5" /><line x1="16.5" y1="7.5" x2="19.5" y2="4.5" />
                  </g>
                  <circle cx="12" cy="12" r="3" fill={C.inkMuted} />
                </svg>
              </span>
              <span className="theme-icon moon" aria-hidden="true" style={{ display: "inline-flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" fill="none" stroke={C.inkMuted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
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
                      if (!next) {
                        setLangMenuOpen(false);
                        setA11yMenuOpen(false);
                      }
                      return next;
                    })}
                    onKeyDown={e => {
                      if (e.key === "Escape") { setAccountMenuOpen(false); setLangMenuOpen(false); setA11yMenuOpen(false); }
                    }}
                    style={{ ...tabStyle("account"), marginRight: 0 }}
                  >
                    {t("nav.account")}
                  </button>
                </HelpWrap>
                {accountMenuPresence.mounted && (
                <div className={`menu-pop menu-pop-rightOrigin mobile-dropdown${accountMenuPresence.phase === "closing" ? " menu-pop-exit" : ""}`} style={{
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
                        onClick={() => { openAuth("signin"); setAccountMenuOpen(false); setLangMenuOpen(false); setA11yMenuOpen(false); }}
                        style={{ padding: "10px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        {t("auth.signIn")}
                      </button>
                      <button
                        onClick={() => { openAuth("signup"); setAccountMenuOpen(false); setLangMenuOpen(false); setA11yMenuOpen(false); }}
                        style={{ padding: "10px 12px", background: "transparent", color: C.ink, border: `1px solid ${C.rule}`, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        {t("auth.createAccount")}
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { setTab("account"); setAccountMenuOpen(false); setLangMenuOpen(false); setA11yMenuOpen(false); }}
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
                          onClick={() => {
                            setLangMenuOpen(o => !o);
                            setA11yMenuOpen(false);
                          }}
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
                              right: "100%",
                              top: 0,
                              marginRight: -1,
                              minWidth: 260,
                              background: C.cream,
                              borderRadius: 0,
                              border: `1px solid ${C.rule}`,
                              borderRight: "none",
                              boxShadow: "-4px 8px 24px rgba(0,0,0,0.08)",
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
                                  onClick={() => { setLocale(lang.code); setAccountMenuOpen(false); setLangMenuOpen(false); setA11yMenuOpen(false); }}
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

                      <div
                        onMouseEnter={() => setA11yMenuOpen(true)}
                        onMouseLeave={() => setA11yMenuOpen(false)}
                        style={{ position: "relative" }}
                      >
                        <button
                          onClick={() => {
                            setA11yMenuOpen(o => !o);
                            setLangMenuOpen(false);
                          }}
                          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                          onMouseEnter={e => e.currentTarget.style.background = C.paper}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <IconAccessibility color={C.inkMuted} />
                          <span style={{ flex: 1, textAlign: "left" }}>Accessibility</span>
                          <IconChevronRight color={C.inkFaint} />
                        </button>
                        {a11yMenuPresence.mounted && (
                          <div
                            onMouseEnter={() => setA11yMenuOpen(true)}
                            onMouseLeave={() => setA11yMenuOpen(false)}
                            className={`menu-pop-side${a11yMenuPresence.phase === "closing" ? " menu-pop-exit" : ""}`}
                            style={{
                              position: "absolute",
                              right: "100%",
                              top: 0,
                              marginRight: -1,
                              minWidth: 300,
                              background: C.cream,
                              borderRadius: 0,
                              border: `1px solid ${C.rule}`,
                              borderRight: "none",
                              boxShadow: "-4px 8px 24px rgba(0,0,0,0.08)",
                              padding: "8px 6px",
                              zIndex: 2300,
                              pointerEvents: a11yMenuPresence.phase === "open" ? "auto" : "none",
                            }}
                          >
                            {[
                              {
                                key: "reducedMotion",
                                label: "Reduced motion",
                                active: a11y.reducedMotion,
                                onClick: () => setA11y(prev => ({ ...prev, reducedMotion: !prev.reducedMotion })),
                              },
                              {
                                key: "highContrast",
                                label: "High contrast",
                                active: a11y.highContrast,
                                onClick: () => setA11y(prev => ({ ...prev, highContrast: !prev.highContrast })),
                              },
                            ].map(item => (
                              <button
                                key={item.key}
                                onClick={item.onClick}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  width: "100%",
                                  padding: "8px 12px",
                                  background: item.active ? C.paper : "transparent",
                                  border: "none",
                                  color: C.ink,
                                  cursor: "pointer",
                                  fontSize: 13,
                                  fontFamily: "var(--body)",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = C.paper}
                                onMouseLeave={e => e.currentTarget.style.background = item.active ? C.paper : "transparent"}
                              >
                                <span style={{ textAlign: "left" }}>{item.label}</span>
                                {item.active && <IconCheck color={C.inkFaint} />}
                              </button>
                            ))}
                            <div style={{ height: 1, background: C.rule, margin: "6px 8px" }} />
                            {[
                              { code: "none", label: "Color mode: Standard" },
                              { code: "deuteranopia", label: "Color mode: Deuteranopia" },
                              { code: "protanopia", label: "Color mode: Protanopia" },
                              { code: "tritanopia", label: "Color mode: Tritanopia" },
                            ].map(mode => {
                              const active = a11y.colorBlind === mode.code;
                              return (
                                <button
                                  key={mode.code}
                                  onClick={() => setA11y(prev => ({ ...prev, colorBlind: mode.code }))}
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
                                  <span style={{ textAlign: "left" }}>{mode.label}</span>
                                  {active && <IconCheck color={C.inkFaint} />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div style={{ height: 1, background: C.rule, margin: "6px 8px 8px" }} />

                      <button
                        onClick={() => { setAccountMenuOpen(false); setLangMenuOpen(false); setA11yMenuOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.paper}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <IconCrown color={C.inkMuted} />
                        <span style={{ flex: 1, textAlign: "left" }}>{t("menu.upgrade")}</span>
                      </button>
                      <button
                        onClick={() => { setAccountMenuOpen(false); setLangMenuOpen(false); setA11yMenuOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 8px", background: "transparent", border: "none", color: C.ink, cursor: "pointer", fontSize: 13, fontFamily: "var(--body)" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.paper}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <IconGift color={C.inkMuted} />
                        <span style={{ flex: 1, textAlign: "left" }}>{t("menu.gift")}</span>
                      </button>

                      <div style={{ height: 1, background: C.rule, margin: "6px 8px 8px" }} />

                      <button
                        onClick={() => { handleSignOut(); setAccountMenuOpen(false); setLangMenuOpen(false); setA11yMenuOpen(false); }}
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
                  style={{ ...tabStyle("account"), marginRight: 0 }}
                >
                  {t("common.signIn")}
                </button>
              </HelpWrap>
            )}
          </div>
        </nav>
      </header>

      <main style={{ flex: 1, padding: viewport.isMobile ? "16px 14px" : "20px 24px", overflowY: "auto", animation: "fadeIn 0.3s ease", position: "relative", zIndex: 1, minWidth: 0 }} key={tab + (result?.ticker || "")}>
        {/* Floating share button — hidden on home and on mobile */}
        {tab !== "home" && !viewport.isMobile && (
        <div style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
          <button
            onClick={handleShare}
            title={t("share.copyLink") || "Copy link"}
            style={{ padding: "6px 8px", background: "transparent", border: `1px solid ${C.rule}`, color: C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          {shareToast && (
            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, padding: "10px 14px", background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 100, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, fontFamily: "var(--body)", marginBottom: 4 }}>Link copied!</div>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted, wordBreak: "break-all", lineHeight: 1.4 }}>{shareUrl}</div>
            </div>
          )}
        </div>
        )}
        {loading && <LoadingScreen ticker={ticker} isPro={isPro} chartType={resolvedChartType} />}
        {!loading && error && <ErrorScreen error={error.message} debugInfo={error.debug} onRetry={() => analyze()} />}
        {!loading && !error && tab === "home" && (
          <HomeTab
            deps={pageDeps}
            viewport={viewport}
            onAnalyze={analyze}
            region={homeRegion}
            onRegionChange={setHomeRegion}
            greetingName={profileName}
            portfolio={portfolio}
            onOpenDestination={openFromHome}
          />
        )}
        {!loading && !error && tab === "account" && (
          <AccountTab
            deps={pageDeps}
            viewport={viewport}
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
            defaultChartType={accountChartTypePref}
            onSetDefaultChartType={setDefaultChartType}
            notificationPrefs={notificationPrefs}
            onNotificationPrefsChange={setNotificationPrefs}
            theme={theme}
            onThemeChange={setTheme}
          />
        )}
        {!loading && !error && tab === "analysis" && (
          <AnalysisTab
            deps={pageDeps}
            viewport={viewport}
            result={result}
            livePrice={livePrice}
            chartLivePrice={chartLivePrice}
            latency={latency}
            isPro={isPro}
            period={period}
            interval={interval}
            chartType={resolvedChartType}
            subTab={analysisSubTab}
            onSubTabChange={setAnalysisSubTab}
            onReanalyze={reanalyze}
            onOpenCharts={openCharts}
            onChartTypeChange={setChartType}
            defaultChartType={accountChartTypePref}
            onUpgradePro={openProSignup}
            openChartsLabel={t("chart.openCharts")}
            helpMode={helpMode}
            onShowHelp={showHelp}
            onHideHelp={hideHelp}
          />
        )}
        {!loading && !error && tab === "charts" && (
          <ChartsTab
            deps={pageDeps}
            viewport={viewport}
            result={result}
            chartLivePrice={chartLivePrice}
            period={period}
            interval={interval}
            onReanalyze={reanalyze}
            intent={chartIntent}
            onConsumeIntent={consumeChartIntent}
            expandedMode={chartSelection}
            onExpandedModeChange={setChartSelection}
            chartType={resolvedChartType}
            onChartTypeChange={setChartType}
            defaultChartType={accountChartTypePref}
          />
        )}
        {!loading && !error && tab === "screener" && (
          <ScreenerTab
            deps={pageDeps}
            viewport={viewport}
            onAnalyze={analyze}
            isPro={isPro}
            onUpgradePro={openProSignup}
          />
        )}
        {!loading && !error && tab === "markets" && (
          <MarketsTab
            deps={pageDeps}
            viewport={viewport}
            subTab={marketsSubTab}
            onSubTabChange={(next) => {
              setMarketsSubTab(next);
              if (marketsFocusKey) setMarketsFocusKey(null);
            }}
            focusKey={marketsFocusKey}
            onFocusHandled={() => setMarketsFocusKey(null)}
            isPro={isPro}
            onUpgradePro={openProSignup}
            onAnalyze={analyze}
          />
        )}
        {!loading && !error && tab === "portfolio" && (
          <PortfolioTab
            deps={pageDeps}
            viewport={viewport}
            portfolio={portfolio}
            onPortfolioChange={setPortfolio}
            paperPortfolio={paperPortfolio}
            onPaperPortfolioChange={setPaperPortfolio}
            onAnalyze={analyze}
          />
        )}
        {!loading && !error && tab === "community" && (
          <CommunityTab
            deps={pageDeps}
            viewport={viewport}
            session={session}
            recentAnalyses={recentAnalyses}
            onAnalyze={analyze}
          />
        )}
        {/* Heatmap is now accessible under Markets tab */}
        {!loading && !error && tab === "comparison" && (isPro ? <ComparisonTab deps={pageDeps} viewport={viewport} /> : (
          <ProGate
            title={t("pro.comparison.title")}
            description={t("pro.comparison.desc")}
            features={[t("pro.comparison.f0"), t("pro.comparison.f1"), t("pro.comparison.f2")]}
          />
        ))}
      </main>

      <footer style={{ padding: viewport.isMobile ? "8px 14px" : "8px 24px", borderTop: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.04em", position: "relative", zIndex: 1, flexWrap: "wrap", gap: 6 }}>
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
          <span style={{ fontFamily: "var(--mono)", fontSize: 9 }}>v0.4.1</span>
        </div>
      </footer>

      {helpMode && (
        <div style={{ position: "fixed", right: 16, bottom: 16, width: "min(280px, calc(100vw - 32px))", background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 24px rgba(0,0,0,0.12)", padding: 12, zIndex: 5500 }}>
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
