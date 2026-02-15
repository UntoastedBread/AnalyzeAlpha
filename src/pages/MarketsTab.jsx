import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  UIButton, ControlChip, TabGroup, DataTable, MetricCard, EmptyState,
} from "../components/ui/primitives";
import HeatmapTab from "./HeatmapTab";

// ─── Constants ───────────────────────────────────────────────

const SECTOR_ETFS = [
  { ticker: "XLK", name: "Technology" },
  { ticker: "XLF", name: "Financials" },
  { ticker: "XLV", name: "Healthcare" },
  { ticker: "XLE", name: "Energy" },
  { ticker: "XLY", name: "Consumer Disc" },
  { ticker: "XLP", name: "Consumer Staples" },
  { ticker: "XLI", name: "Industrials" },
  { ticker: "XLC", name: "Comm Services" },
  { ticker: "XLU", name: "Utilities" },
  { ticker: "XLRE", name: "Real Estate" },
  { ticker: "XLB", name: "Materials" },
];

const PERIOD_OPTIONS = [
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
];

const CRYPTO_TICKERS = [
  { ticker: "BTC-USD", name: "Bitcoin", capEst: 1300 },
  { ticker: "ETH-USD", name: "Ethereum", capEst: 400 },
  { ticker: "SOL-USD", name: "Solana", capEst: 80 },
  { ticker: "XRP-USD", name: "XRP", capEst: 70 },
  { ticker: "ADA-USD", name: "Cardano", capEst: 25 },
  { ticker: "DOGE-USD", name: "Dogecoin", capEst: 30 },
  { ticker: "AVAX-USD", name: "Avalanche", capEst: 15 },
  { ticker: "DOT-USD", name: "Polkadot", capEst: 10 },
  { ticker: "MATIC-USD", name: "Polygon", capEst: 8 },
  { ticker: "LINK-USD", name: "Chainlink", capEst: 12 },
];

const ECONOMIC_EVENTS = [
  { date: "2026-03-18", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-03-12", event: "CPI Report", impact: "HIGH" },
  { date: "2026-04-03", event: "Non-Farm Payrolls", impact: "HIGH" },
  { date: "2026-04-29", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-05-13", event: "CPI Report", impact: "HIGH" },
  { date: "2026-06-17", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-07-01", event: "Non-Farm Payrolls", impact: "MEDIUM" },
  { date: "2026-07-29", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-09-16", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-11-04", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-12-16", event: "FOMC Meeting", impact: "HIGH" },
];

const LOW_CORRELATION_MAP = {
  Technology: ["Utilities", "Healthcare", "Consumer Staples"],
  Financials: ["Healthcare", "Utilities", "Consumer Staples"],
  Healthcare: ["Energy", "Technology", "Financials"],
  Energy: ["Technology", "Healthcare", "Utilities"],
  "Consumer Disc": ["Utilities", "Healthcare", "Consumer Staples"],
  "Consumer Staples": ["Technology", "Energy", "Financials"],
  Industrials: ["Utilities", "Healthcare", "Consumer Staples"],
  "Comm Services": ["Utilities", "Energy", "Materials"],
  Utilities: ["Technology", "Energy", "Financials"],
  "Real Estate": ["Technology", "Energy", "Industrials"],
  Materials: ["Technology", "Healthcare", "Utilities"],
};

// ─── Helpers ─────────────────────────────────────────────────

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function fearGreedLabel(rsi) {
  if (rsi > 70) return "Extreme Greed";
  if (rsi > 55) return "Greed";
  if (rsi >= 45) return "Neutral";
  if (rsi >= 30) return "Fear";
  return "Extreme Fear";
}

function fearGreedValue(rsi) {
  return Math.max(0, Math.min(100, rsi));
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function compactNumber(value, opts = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  const abs = Math.abs(num);
  const minimumFractionDigits = opts.minimumFractionDigits ?? 0;
  const maximumFractionDigits = opts.maximumFractionDigits ?? (abs < 100 ? 1 : 0);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(maximumFractionDigits)}B`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(maximumFractionDigits)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(maximumFractionDigits)}K`;
  return num.toLocaleString(undefined, { minimumFractionDigits, maximumFractionDigits });
}

function formatPredictionVolume(market, field = "volume24h") {
  const value = Number(market?.[field]);
  if (!Number.isFinite(value)) return "--";
  const unit = market?.source === "Polymarket" ? "$" : "M$";
  return `${unit}${compactNumber(value, { maximumFractionDigits: value < 100 ? 1 : 0 })}`;
}

function closeTimeLabel(closeTime) {
  const ts = Date.parse(closeTime || "");
  if (!Number.isFinite(ts)) return "Open-ended";
  const diffMs = ts - Date.now();
  if (diffMs <= 0) return "Closing now";
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `Closes in ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `Closes in ${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  return `Closes in ${diffMonths}mo`;
}

function safeExternalHref(url, fallback) {
  const raw = String(url || "").trim();
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

// ─── Sub-tab: Sectors ────────────────────────────────────────

function SectorsSubTab({ deps, viewport }) {
  const {
    C, useI18n, SECTOR_COLORS, fetchStockData, Section, HelpWrap, fmt, fmtPct,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const [period, setPeriod] = useState("1mo");
  const [sectorPerf, setSectorPerf] = useState(null);
  const [allPerf, setAllPerf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadSectors = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        SECTOR_ETFS.map(s => fetchStockData(s.ticker, p))
      );
      const perfs = SECTOR_ETFS.map((s, i) => {
        const r = results[i];
        if (r.status === "fulfilled" && r.value.data && r.value.data.length > 1) {
          const data = r.value.data;
          const first = data[0].Close;
          const last = data[data.length - 1].Close;
          const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
          return { ...s, changePct, color: SECTOR_COLORS[s.name] || C.inkMuted };
        }
        return { ...s, changePct: 0, color: SECTOR_COLORS[s.name] || C.inkMuted };
      }).sort((a, b) => b.changePct - a.changePct);
      setSectorPerf(perfs);
    } catch (e) {
      setError(t("markets.sectorError"));
    } finally {
      setLoading(false);
    }
  }, [fetchStockData, C, SECTOR_COLORS, t]);

  const loadAllPeriods = useCallback(async () => {
    try {
      const periods = ["1mo", "3mo", "6mo", "1y"];
      const allResults = {};
      for (const p of periods) {
        const results = await Promise.allSettled(
          SECTOR_ETFS.map(s => fetchStockData(s.ticker, p))
        );
        allResults[p] = SECTOR_ETFS.map((s, i) => {
          const r = results[i];
          if (r.status === "fulfilled" && r.value.data && r.value.data.length > 1) {
            const data = r.value.data;
            const first = data[0].Close;
            const last = data[data.length - 1].Close;
            return first > 0 ? ((last - first) / first) * 100 : 0;
          }
          return 0;
        });
      }
      const table = SECTOR_ETFS.map((s, i) => {
        const row = { name: s.name, ticker: s.ticker };
        periods.forEach(p => { row[p] = allResults[p][i]; });
        return row;
      });
      setAllPerf(table);
    } catch { /* fail gracefully */ }
  }, [fetchStockData]);

  useEffect(() => {
    loadSectors(period);
  }, [period]);

  useEffect(() => {
    loadAllPeriods();
  }, []);

  const topSector = sectorPerf && sectorPerf.length > 0 ? sectorPerf[0].name : null;
  const suggestions = topSector && LOW_CORRELATION_MAP[topSector]
    ? LOW_CORRELATION_MAP[topSector]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {PERIOD_OPTIONS.map(p => (
          <ControlChip
            key={p.key}
            C={C}
            active={period === p.key}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </ControlChip>
        ))}
      </div>

      {loading && (
        <div style={{ padding: 48, textAlign: "center", color: C.inkMuted, fontFamily: "var(--body)", fontSize: 12 }}>
          {t("markets.loading")}
        </div>
      )}

      {error && !loading && (
        <EmptyState C={C} title={t("markets.error")} message={error} />
      )}

      {!loading && sectorPerf && (
        <Section title={t("markets.sectorPerformance")}>
          <ResponsiveContainer width="100%" height={Math.max(200, SECTOR_ETFS.length * 32)}>
            <BarChart
              data={sectorPerf}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }}
                axisLine={{ stroke: C.rule }}
                tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: C.ink, fontSize: 10, fontWeight: 600, fontFamily: "var(--body)" }}
                width={isMobile ? 80 : 110}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                formatter={(v) => [`${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`, t("markets.return")]}
              />
              <Bar
                dataKey="changePct"
                radius={[0, 2, 2, 0]}
                barSize={24}
              >
                {(sectorPerf || []).map((entry, idx) => (
                  <Cell key={idx} fill={entry.changePct >= 0 ? C.up : C.down} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {allPerf && (
        <Section title={t("markets.sectorRotation")}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--body)", borderBottom: `2px solid ${C.ink}`, color: C.inkMuted }}>
                    {t("markets.sector")}
                  </th>
                  {PERIOD_OPTIONS.map(p => (
                    <th key={p.key} style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--body)", borderBottom: `2px solid ${C.ink}`, color: C.inkMuted }}>
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPerf.map((row, ri) => (
                  <tr key={row.ticker} style={{ borderBottom: `1px solid ${C.ruleFaint}`, background: ri % 2 === 1 ? C.warmWhite : "transparent" }}>
                    <td style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, fontFamily: "var(--body)", fontSize: 11, color: C.ink }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: SECTOR_COLORS[row.name] || C.inkMuted, flexShrink: 0 }} />
                        {row.name}
                      </span>
                    </td>
                    {PERIOD_OPTIONS.map(p => (
                      <td key={p.key} style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: row[p.key] >= 0 ? C.up : C.down }}>
                        {row[p.key] >= 0 ? "+" : ""}{row[p.key].toFixed(2)}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {topSector && suggestions.length > 0 && (
        <Section title={t("markets.diversification")}>
          <div style={{ fontSize: 12, fontFamily: "var(--body)", color: C.inkMuted, lineHeight: 1.6, padding: "8px 0" }}>
            {t("markets.diversificationHint", { sector: topSector })}{" "}
            <span style={{ fontWeight: 700, color: C.ink }}>{suggestions.join(", ")}</span>.
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Sub-tab: Crypto ─────────────────────────────────────────

function CryptoSubTab({ deps, viewport, onAnalyze }) {
  const {
    C, useI18n, fetchStockData, fetchQuickQuote, Section, HelpWrap,
    fmt, fmtPct, fmtMoney, Sparkline,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const [cryptos, setCryptos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [btcRSI, setBtcRSI] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const quoteResults = await Promise.allSettled(
        CRYPTO_TICKERS.map(c => fetchQuickQuote(c.ticker))
      );

      let btcCloses = [];
      try {
        const btcData = await fetchStockData("BTC-USD", "3mo");
        if (btcData.data) {
          btcCloses = btcData.data.map(d => d.Close);
        }
      } catch { /* use default RSI */ }

      const rsi = btcCloses.length > 15 ? computeRSI(btcCloses) : 50;
      setBtcRSI(rsi);

      const rows = CRYPTO_TICKERS.map((c, i) => {
        const r = quoteResults[i];
        if (r.status === "fulfilled") {
          const q = r.value;
          const spark = q.spark || [];
          const sevenDayChange = spark.length > 7
            ? ((spark[spark.length - 1] - spark[spark.length - 8]) / spark[spark.length - 8]) * 100
            : 0;
          return {
            _key: c.ticker,
            rank: i + 1,
            name: c.name,
            ticker: c.ticker,
            price: q.price,
            change24h: q.changePct,
            change7d: sevenDayChange,
            spark: spark,
            prevClose: q.prevClose,
            capEst: c.capEst,
          };
        }
        return {
          _key: c.ticker,
          rank: i + 1,
          name: c.name,
          ticker: c.ticker,
          price: 0,
          change24h: 0,
          change7d: 0,
          spark: [],
          prevClose: 0,
          capEst: c.capEst,
        };
      });

      setCryptos(rows);
    } catch (e) {
      setError(t("markets.cryptoError"));
    } finally {
      setLoading(false);
    }
  }, [fetchQuickQuote, fetchStockData, t]);

  useEffect(() => {
    load();
  }, []);

  const dominanceData = useMemo(() => {
    if (!cryptos) return [];
    const btcCap = cryptos.find(c => c.ticker === "BTC-USD")?.capEst || 1300;
    const ethCap = cryptos.find(c => c.ticker === "ETH-USD")?.capEst || 400;
    const othersCap = cryptos
      .filter(c => c.ticker !== "BTC-USD" && c.ticker !== "ETH-USD")
      .reduce((s, c) => s + c.capEst, 0);
    return [
      { name: "BTC", value: btcCap, color: "#F7931A" },
      { name: "ETH", value: ethCap, color: "#627EEA" },
      { name: t("markets.others"), value: othersCap, color: C.inkFaint },
    ];
  }, [cryptos, C, t]);

  const fgLabel = fearGreedLabel(btcRSI);
  const fgValue = fearGreedValue(btcRSI);

  const cryptoColumns = [
    {
      key: "rank", label: "#", align: "left",
      render: (v) => {
        const badgeColor = v === 1 ? "#D4A017" : v === 2 ? "#B6B6B6" : v === 3 ? "#CD7F32" : null;
        return badgeColor ? (
          <span style={{
            width: 22, height: 22, borderRadius: "50%",
            background: badgeColor, color: "#fff",
            fontWeight: 700, fontSize: 10, fontFamily: "var(--mono)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>{v}</span>
        ) : (
          <span style={{ fontWeight: 700, color: C.inkMuted, fontSize: 11 }}>{v}</span>
        );
      },
    },
    {
      key: "name",
      label: t("markets.name"),
      align: "left",
      cellStyle: { fontWeight: 700, color: C.ink },
      render: (v, row) => (
        <span
          onClick={() => onAnalyze?.(row.ticker)}
          style={{ display: "flex", flexDirection: "column", cursor: "pointer" }}
        >
          <span style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--body)", textDecoration: "underline", textDecorationColor: C.ruleFaint, textUnderlineOffset: 2 }}>{v}</span>
          <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)" }}>{row.ticker}</span>
        </span>
      ),
    },
    {
      key: "price",
      label: t("markets.price"),
      render: (v) => v > 0 ? `$${fmt(v)}` : "--",
    },
    {
      key: "change24h",
      label: t("markets.change24h"),
      render: (v) => (
        <span style={{ color: v >= 0 ? C.up : C.down, fontWeight: 600 }}>
          {v >= 0 ? "+" : ""}{Number(v).toFixed(2)}%
        </span>
      ),
    },
    {
      key: "change7d",
      label: t("markets.change7d"),
      render: (v) => (
        <span style={{ color: v >= 0 ? C.up : C.down, fontWeight: 600 }}>
          {v >= 0 ? "+" : ""}{Number(v).toFixed(2)}%
        </span>
      ),
    },
    {
      key: "capEst",
      label: "Mkt Cap",
      render: (v) => <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>${v}B</span>,
    },
    {
      key: "spark",
      label: t("markets.sparkline"),
      render: (v, row) => v && v.length > 1
        ? <Sparkline data={v} color={row.change7d >= 0 ? C.up : C.down} prevClose={row.prevClose} width={120} height={36} />
        : <span style={{ color: C.inkFaint }}>--</span>,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {loading && (
        <div style={{ padding: 48, textAlign: "center", color: C.inkMuted, fontFamily: "var(--body)", fontSize: 12 }}>
          {t("markets.loading")}
        </div>
      )}

      {error && !loading && (
        <EmptyState C={C} title={t("markets.error")} message={error} />
      )}

      {!loading && cryptos && (
        <>
          {/* Pulse animation */}
          <style>{`
            @keyframes pulseDot {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.5; transform: scale(1.5); }
            }
          `}</style>

          {/* Hero cards for BTC and ETH */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 8 }}>
            {cryptos.filter(c => c.ticker === "BTC-USD" || c.ticker === "ETH-USD").map(c => {
              const totalCap = cryptos.reduce((s, cr) => s + cr.capEst, 0);
              const domPct = totalCap > 0 ? ((c.capEst / totalCap) * 100).toFixed(1) : "0";
              return (
                <div key={c.ticker} style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: isMobile ? 16 : 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--display)", color: C.ink }}>{c.name}</span>
                    <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--mono)" }}>{c.ticker}</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--mono)", color: C.ink, marginBottom: 4 }}>
                    ${c.price > 0 ? Number(c.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: c.change24h >= 0 ? C.up : C.down,
                      animation: "pulseDot 2s ease-in-out infinite",
                      display: "inline-block",
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--mono)", color: c.change24h >= 0 ? C.up : C.down }}>
                      {c.change24h >= 0 ? "+" : ""}{Number(c.change24h).toFixed(2)}%
                    </span>
                    <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--mono)", marginLeft: "auto" }}>
                      {domPct}% {t("markets.dominance")}
                    </span>
                  </div>
                  {c.spark && c.spark.length > 1 && (
                    <Sparkline data={c.spark} color={c.change24h >= 0 ? C.up : C.down} prevClose={c.prevClose} width={isMobile ? 200 : 320} height={44} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Charts: Dominance + Fear & Greed BEFORE table */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 16,
          }}>
            <Section title={t("markets.marketDominance")}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={dominanceData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      strokeWidth={1}
                      stroke={C.cream}
                    >
                      {dominanceData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                      formatter={(v, name) => [`$${v}B`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4 }}>
                {dominanceData.map(d => (
                  <span key={d.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600 }}>
                    <span style={{ width: 10, height: 10, background: d.color, borderRadius: 1 }} />
                    {d.name}
                  </span>
                ))}
              </div>
            </Section>

            <Section title={t("markets.fearGreed")}>
              <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 48, lineHeight: 1 }}>
                  {fgValue > 70 ? "\u{1F911}" : fgValue > 55 ? "\u{1F60F}" : fgValue >= 45 ? "\u{1F610}" : fgValue >= 30 ? "\u{1F61F}" : "\u{1F631}"}
                </span>
                <div style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "var(--display)",
                  color: fgValue > 55 ? C.up : fgValue < 45 ? C.down : C.hold,
                }}>
                  {fgLabel}
                </div>
                {/* 5-segment color bar */}
                <div style={{ width: "100%", maxWidth: 220, position: "relative", marginTop: 4 }}>
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ flex: 1, background: "#E53E3E" }} />
                    <div style={{ flex: 1, background: "#ED8936" }} />
                    <div style={{ flex: 1, background: "#A0AEC0" }} />
                    <div style={{ flex: 1, background: "#68D391" }} />
                    <div style={{ flex: 1, background: "#38A169" }} />
                  </div>
                  <div style={{
                    position: "absolute",
                    top: -4,
                    left: `${Math.max(0, Math.min(100, fgValue))}%`,
                    transform: "translateX(-50%)",
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: `6px solid ${C.ink}`,
                  }} />
                </div>
                <div style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: C.inkMuted,
                }}>
                  BTC RSI: {btcRSI.toFixed(1)}
                </div>
              </div>
            </Section>
          </div>

          {/* Data table AFTER charts */}
          <Section title={t("markets.topCrypto")}>
            <DataTable
              C={C}
              columns={cryptoColumns}
              rows={cryptos}
              striped
            />
          </Section>
        </>
      )}
    </div>
  );
}

// ─── Sub-tab: Prediction Markets ───────────────────────────

function PredictionMarketsSubTab({ deps, viewport }) {
  const {
    C, useI18n, fetchPredictionMarkets, Section, EmptyState,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const [payload, setPayload] = useState({ items: [], stats: null, updatedAt: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("support");
  const [visibleCount, setVisibleCount] = useState(12);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);

  const POLY_BLUE = "#2E5CFF";
  const POLY_NAVY = "#0A1026";
  const POLY_SOFT = "#E9EEFF";
  const POLY_LOGO_URL = "https://polymarket.com/images/brand/logo-blue.png";

  // ── Card design helpers ──
  const CAT_STYLES = {
    Politics: { bg: "rgba(59,130,246,0.12)", color: "#3B82F6", icon: "⚖" },
    Sports:   { bg: "rgba(34,197,94,0.12)",  color: "#22C55E", icon: "🏆" },
    Economy:  { bg: "rgba(234,179,8,0.12)",  color: "#B8860B", icon: "📊" },
    Crypto:   { bg: "rgba(249,115,22,0.12)", color: "#F97316", icon: "₿" },
    Tech:     { bg: "rgba(168,85,247,0.12)", color: "#A855F7", icon: "⚡" },
  };
  const DEFAULT_CAT = { bg: "rgba(156,163,175,0.10)", color: "#9CA3AF", icon: "◈" };
  const catStyle = (cat) => CAT_STYLES[cat] || DEFAULT_CAT;

  const accentForConviction = (probYes) => {
    const conv = Math.abs((probYes || 0.5) - 0.5) * 2;
    if (conv > 0.6) return POLY_BLUE;
    if (conv > 0.3) return "rgba(46,92,255,0.4)";
    return "rgba(46,92,255,0.15)";
  };

  const yesPctColor = (probYes) => {
    const conv = Math.abs((probYes || 0.5) - 0.5) * 2;
    if (conv > 0.6) return C.up;
    if (conv < 0.2) return C.hold;
    return C.ink;
  };

  const barGradient = (yesPct) => {
    if (yesPct >= 70) return `linear-gradient(90deg, ${POLY_BLUE}, #22C55E)`;
    if (yesPct <= 30) return `linear-gradient(90deg, ${POLY_BLUE}, #EF4444)`;
    return POLY_BLUE;
  };

  const closingSoon = (closeTime) => {
    const ts = Date.parse(closeTime || "");
    if (!Number.isFinite(ts)) return false;
    const diff = ts - Date.now();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
  };

  const cardHover = (e, enter) => {
    e.currentTarget.style.borderColor = enter ? POLY_BLUE : C.rule;
    e.currentTarget.style.transform = enter ? "translateY(-2px)" : "none";
    e.currentTarget.style.boxShadow = enter ? "0 4px 12px rgba(46,92,255,0.12)" : "none";
  };

  const tx = useCallback((key, fallback, vars) => {
    const translated = t(key, vars);
    return translated && translated !== key ? translated : fallback;
  }, [t]);
  const sortOptions = useMemo(() => ([
    { key: "support", label: tx("markets.sortSupport", "Sort: Most Supported") },
    { key: "activity", label: tx("markets.sortActivity", "Sort: Activity") },
    { key: "conviction", label: tx("markets.sortConviction", "Sort: Conviction") },
    { key: "closing", label: tx("markets.sortClosing", "Sort: Closing Soon") },
  ]), [tx]);
  const activeSortOption = sortOptions.find(opt => opt.key === sortBy) || sortOptions[0];

  const loadPredictionMarkets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchPredictionMarkets();
      if (data && Array.isArray(data.items)) {
        setPayload({
          items: data.items,
          stats: data.stats || null,
          updatedAt: data.updatedAt || null,
        });
        setError(null);
      } else {
        throw new Error(tx("markets.predictionInvalidData", "Prediction feed returned invalid data."));
      }
    } catch (e) {
      const message = e?.message || tx("markets.predictionLoadError", "Failed to load prediction markets.");
      setError(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchPredictionMarkets, tx]);

  useEffect(() => {
    loadPredictionMarkets();
  }, [loadPredictionMarkets]);

  useEffect(() => {
    const id = setInterval(() => {
      loadPredictionMarkets(true);
    }, 60000);
    return () => clearInterval(id);
  }, [loadPredictionMarkets]);

  const items = payload.items || [];

  useEffect(() => {
    setVisibleCount(12);
  }, [categoryFilter, sortBy]);

  useEffect(() => {
    if (!sortMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!sortMenuRef.current) return;
      if (!sortMenuRef.current.contains(event.target)) {
        setSortMenuOpen(false);
      }
    };
    const onEscape = (event) => {
      if (event.key === "Escape") setSortMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [sortMenuOpen]);

  const categories = useMemo(() => {
    const counts = new Map();
    items.forEach((m) => {
      const key = m.category || "General";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const filtered = useMemo(() => {
    let next = [...items];
    if (categoryFilter !== "all") {
      next = next.filter(m => (m.category || "General") === categoryFilter);
    }

    if (sortBy === "support") {
      // Support Index: combines yes probability with market activity (volume + liquidity)
      // Markets with high yes% AND high participation rank highest
      const supportScore = (m) => {
        const yes = Number(m.probYes) || 0;
        const vol = Number(m.volume24h) || 0;
        const liq = Number(m.liquidity) || 0;
        const totalVol = Number(m.volumeTotal) || 0;
        // Weight = yes probability * log-scaled popularity
        return yes * Math.log10(1 + vol + liq * 0.5 + totalVol * 0.1);
      };
      next.sort((a, b) => supportScore(b) - supportScore(a));
    } else if (sortBy === "conviction") {
      next.sort((a, b) => {
        const aScore = Math.abs((Number(a.probYes) || 0.5) - 0.5);
        const bScore = Math.abs((Number(b.probYes) || 0.5) - 0.5);
        return bScore - aScore;
      });
    } else if (sortBy === "closing") {
      next.sort((a, b) => {
        const aTs = Date.parse(a.closeTime || "");
        const bTs = Date.parse(b.closeTime || "");
        if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0;
        if (!Number.isFinite(aTs)) return 1;
        if (!Number.isFinite(bTs)) return -1;
        return aTs - bTs;
      });
    } else {
      next.sort((a, b) => Number(b.rankScore || 0) - Number(a.rankScore || 0));
    }

    return next;
  }, [items, categoryFilter, sortBy]);

  const featured = filtered.slice(0, 3);
  const rest = filtered.slice(3, 3 + visibleCount);
  const hasMore = filtered.length > (3 + visibleCount);
  const sourceStats = Array.isArray(payload.stats?.bySource) ? payload.stats.bySource : [];
  const polyStats = sourceStats.find(s => s.source === "Polymarket");
  const avgConviction = Number(payload.stats?.averageConviction || 0);
  const updatedAtLabel = payload.updatedAt
    ? new Date(payload.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--";

  const ctaBase = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    padding: isMobile ? "11px 14px" : "12px 16px",
    border: `1px solid ${C.rule}`,
    fontFamily: "var(--body)",
    fontSize: 12,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 700,
    minHeight: 40,
  };

  const metricCardStyle = {
    border: `1px solid ${C.rule}`,
    background: C.warmWhite,
    padding: isMobile ? "14px 14px" : "16px 16px",
    minHeight: 102,
    display: "grid",
    gap: 8,
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{
          border: `1px solid ${POLY_BLUE}`,
          background: `linear-gradient(140deg, ${POLY_NAVY} 0%, ${POLY_BLUE} 58%, #4A72FF 100%)`,
          padding: isMobile ? "14px 14px" : "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 22, fontFamily: "var(--display)", color: "#fff", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>
            <span style={{ opacity: 0.7, marginRight: 6 }}>◈</span>Polymarket
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: isMobile ? 16 : 18, fontFamily: "var(--display)", color: "#fff", lineHeight: 1.2, marginBottom: 4 }}>
              {tx("markets.predictionHero", "Real-time probability markets")}
            </div>
            <div style={{ fontSize: 11, fontFamily: "var(--body)", color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
              {tx("markets.liveFeed", "Live feed")} · {tx("markets.lastUpdate", "Last update")}: {updatedAtLabel}
            </div>
          </div>
        </div>

      {loading && (
        <div style={{ display: "grid", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: "16px 16px", height: 126 }} />
          ))}
        </div>
      )}

      {!loading && error && items.length === 0 && (
        <EmptyState
          C={C}
          title={tx("markets.predictionLoadErrorTitle", "Markets unavailable")}
          message={error}
          action={(
            <UIButton C={C} onClick={() => loadPredictionMarkets(false)} size="md">
              {tx("markets.retry", "Retry")}
            </UIButton>
          )}
        />
      )}

      {!loading && items.length > 0 && (
        <>
          {error && (
            <div style={{
              border: `1px solid ${C.rule}`,
              background: C.paper,
              padding: "10px 12px",
              fontSize: 11,
              color: C.inkMuted,
              fontFamily: "var(--body)",
            }}>
              {tx("markets.partialDataWarning", "Showing cached data while one source is unavailable.")} {error}
            </div>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}>
            <div style={metricCardStyle}>
              <div style={{ fontSize: 10, color: C.inkFaint, letterSpacing: "0.09em", fontWeight: 700, textTransform: "uppercase", fontFamily: "var(--body)" }}>
                {tx("markets.activeMarkets", "Active Markets")}
              </div>
              <div style={{ fontSize: 30, fontFamily: "var(--display)", color: C.ink, lineHeight: 1 }}>
                {payload.stats?.totalMarkets || items.length}
              </div>
            </div>

            <div style={metricCardStyle}>
              <div style={{ fontSize: 10, color: C.inkFaint, letterSpacing: "0.09em", fontWeight: 700, textTransform: "uppercase", fontFamily: "var(--body)" }}>
                {tx("markets.convictionIndex", "Conviction Index")}
              </div>
              <div style={{ fontSize: 30, fontFamily: "var(--display)", color: C.ink, lineHeight: 1 }}>
                {avgConviction.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>
                {tx("markets.convictionScale", "0 to 100 scale")}
              </div>
            </div>

            <div style={metricCardStyle}>
              <div style={{ fontSize: 10, color: C.inkFaint, letterSpacing: "0.09em", fontWeight: 700, textTransform: "uppercase", fontFamily: "var(--body)" }}>
                {tx("markets.polyVolume24h", "24h Volume")}
              </div>
              <div style={{ fontSize: 28, fontFamily: "var(--display)", color: C.ink, lineHeight: 1 }}>
                ${compactNumber(polyStats?.volume24h || 0)}
              </div>
              <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>
                {polyStats?.count || 0} {tx("markets.markets", "markets")}
              </div>
            </div>

            <div style={metricCardStyle}>
              <div style={{ fontSize: 10, color: C.inkFaint, letterSpacing: "0.09em", fontWeight: 700, textTransform: "uppercase", fontFamily: "var(--body)" }}>
                {tx("markets.polyLiquidity", "Liquidity")}
              </div>
              <div style={{ fontSize: 28, fontFamily: "var(--display)", color: C.ink, lineHeight: 1 }}>
                ${compactNumber(polyStats?.liquidity || 0)}
              </div>
              <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>
                {tx("markets.depthHint", "Live order depth")}
              </div>
            </div>
          </div>

          <Section title={tx("markets.featuredMarkets", "Featured Markets")}>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}>
              {featured.map((market) => {
                const yesPct = Math.round((Number(market.probYes) || 0) * 100);
                const noPct = Math.max(0, 100 - yesPct);
                const conviction = Math.round(Math.abs((Number(market.probYes) || 0.5) - 0.5) * 200);
                const cs = catStyle(market.category);
                const closing = closingSoon(market.closeTime);
                return (
                  <a
                    key={market.id}
                    href={safeExternalHref(market.url, "https://polymarket.com")}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      border: `1px solid ${C.rule}`,
                      borderLeft: `4px solid ${accentForConviction(market.probYes)}`,
                      background: C.warmWhite,
                      padding: isMobile ? "14px 14px" : "16px 16px",
                      display: "grid",
                      gap: 10,
                      textDecoration: "none",
                      color: "inherit",
                      transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
                    }}
                    onMouseEnter={e => cardHover(e, true)}
                    onMouseLeave={e => cardHover(e, false)}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                        fontFamily: "var(--body)", color: cs.color, background: cs.bg,
                        padding: "3px 8px", borderRadius: 3, lineHeight: 1.4,
                      }}>
                        {cs.icon} {market.category || "General"}
                      </span>
                      {closing && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                          fontFamily: "var(--body)", color: C.down, background: C.downBg,
                          padding: "3px 7px", borderRadius: 3, lineHeight: 1.4,
                        }}>
                          ● Closing soon
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: isMobile ? 20 : 23, fontFamily: "var(--display)", color: C.ink, lineHeight: 1.25, fontWeight: 800, letterSpacing: "-0.01em" }}>
                      {market.title}
                    </div>

                    {market.subtitle && (
                      <div style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted }}>
                        {market.subtitle}
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontSize: 30, fontFamily: "var(--display)", color: yesPctColor(market.probYes), lineHeight: 1 }}>
                        {yesPct}%
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)" }}>
                        {market.yesLabel || "YES"}
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: C.inkMuted, fontFamily: "var(--mono)" }}>
                        {market.noLabel || "NO"} {noPct}%
                      </span>
                    </div>

                    <div style={{ height: 10, border: `1px solid ${C.rule}`, background: C.paper, overflow: "hidden", borderRadius: 2 }}>
                      <div style={{ width: `${yesPct}%`, height: "100%", background: barGradient(yesPct), transition: "width 0.2s ease" }} />
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                    }}>
                      <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>
                        <strong style={{ color: C.ink }}>{formatPredictionVolume(market, "volume24h")}</strong><br />
                        {tx("markets.vol24h", "24h volume")}
                      </div>
                      <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>
                        <strong style={{ color: C.ink }}>{formatPredictionVolume(market, "liquidity")}</strong><br />
                        {tx("markets.liquidity", "liquidity")}
                      </div>
                      <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>
                        <strong style={{ color: C.ink }}>{conviction}/100</strong><br />
                        {tx("markets.conviction", "conviction")}
                      </div>
                      <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>
                        <strong style={{ color: C.ink }}>{closeTimeLabel(market.closeTime)}</strong><br />
                        {tx("markets.timeToClose", "time to close")}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </Section>

          <Section title={tx("markets.exploreMarkets", "Explore Markets")}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <ControlChip
                    C={C}
                    active={categoryFilter === "all"}
                    onClick={() => setCategoryFilter("all")}
                    style={{ fontSize: 12, padding: "7px 12px" }}
                  >
                    {tx("markets.allCategories", "All Categories")}
                  </ControlChip>
                  {categories.slice(0, 6).map(cat => (
                    <ControlChip
                      key={cat.name}
                      C={C}
                      active={categoryFilter === cat.name}
                      onClick={() => setCategoryFilter(cat.name)}
                      style={{ fontSize: 12, padding: "7px 12px" }}
                    >
                      {cat.name} ({cat.count})
                    </ControlChip>
                  ))}
                </div>

                <div ref={sortMenuRef} style={{ position: "relative", width: isMobile ? "100%" : 300 }}>
                  <button
                    type="button"
                    onClick={() => setSortMenuOpen(v => !v)}
                    style={{
                      width: "100%",
                      minHeight: 42,
                      border: `1px solid ${sortMenuOpen ? POLY_BLUE : C.rule}`,
                      background: sortMenuOpen ? POLY_SOFT : C.warmWhite,
                      color: C.ink,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "0 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontFamily: "var(--body)",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      transition: "all 0.18s ease",
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={sortMenuOpen}
                  >
                    <span>{activeSortOption?.label || tx("markets.sortActivity", "Sort: Activity")}</span>
                    <span style={{ transform: sortMenuOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", color: C.inkMuted }}>
                      ▼
                    </span>
                  </button>
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      border: `1px solid ${C.rule}`,
                      background: C.warmWhite,
                      boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
                      overflow: "hidden",
                      zIndex: 20,
                      opacity: sortMenuOpen ? 1 : 0,
                      transform: sortMenuOpen ? "translateY(0)" : "translateY(-6px)",
                      maxHeight: sortMenuOpen ? 220 : 0,
                      pointerEvents: sortMenuOpen ? "auto" : "none",
                      transition: "opacity 0.2s ease, transform 0.2s ease, max-height 0.24s ease",
                    }}
                    role="listbox"
                    aria-label={tx("markets.sortBy", "Sort by")}
                  >
                    {sortOptions.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setSortBy(opt.key);
                          setSortMenuOpen(false);
                        }}
                        style={{
                          width: "100%",
                          minHeight: 40,
                          border: "none",
                          borderBottom: `1px solid ${C.ruleFaint}`,
                          background: sortBy === opt.key ? POLY_SOFT : "transparent",
                          color: sortBy === opt.key ? POLY_BLUE : C.ink,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "0 12px",
                          cursor: "pointer",
                          fontSize: 12,
                          fontFamily: "var(--body)",
                          fontWeight: sortBy === opt.key ? 700 : 600,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                        role="option"
                        aria-selected={sortBy === opt.key}
                      >
                        <span>{opt.label}</span>
                        {sortBy === opt.key && <span style={{ color: POLY_BLUE }}>●</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filtered.length === 0 && (
                <EmptyState
                  C={C}
                  title={tx("markets.noMarketsTitle", "No markets match these filters")}
                  message={tx("markets.noMarketsBody", "Try changing source, category, or sort options.")}
                />
              )}

              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}>
                {rest.map((market) => {
                  const yesPct = Math.round((Number(market.probYes) || 0) * 100);
                  const cs = catStyle(market.category);
                  const closing = closingSoon(market.closeTime);
                  return (
                    <a
                      key={market.id}
                      href={safeExternalHref(market.url, "https://polymarket.com")}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        border: `1px solid ${C.rule}`,
                        borderLeft: `3px solid ${accentForConviction(market.probYes)}`,
                        background: C.warmWhite,
                        padding: "14px 14px",
                        display: "grid",
                        gap: 9,
                        textDecoration: "none",
                        color: "inherit",
                        transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
                      }}
                      onMouseEnter={e => cardHover(e, true)}
                      onMouseLeave={e => cardHover(e, false)}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                          fontFamily: "var(--body)", color: cs.color, background: cs.bg,
                          padding: "2px 7px", borderRadius: 3, lineHeight: 1.4,
                        }}>
                          {cs.icon} {market.category || "General"}
                        </span>
                        {closing ? (
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                            fontFamily: "var(--body)", color: C.down, background: C.downBg,
                            padding: "2px 7px", borderRadius: 3, lineHeight: 1.4,
                          }}>
                            ● Closing soon
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--mono)" }}>
                            {closeTimeLabel(market.closeTime)}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: isMobile ? 17 : 19, fontFamily: "var(--display)", color: C.ink, lineHeight: 1.28, fontWeight: 800, letterSpacing: "-0.005em" }}>
                        {market.title}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 20, fontFamily: "var(--display)", color: yesPctColor(market.probYes) }}>
                          {yesPct}%
                        </div>
                        <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                          {market.yesLabel || "YES"}
                        </div>
                      </div>

                      <div style={{ height: 8, border: `1px solid ${C.rule}`, background: C.paper, overflow: "hidden", borderRadius: 2 }}>
                        <div style={{ width: `${yesPct}%`, height: "100%", background: barGradient(yesPct) }} />
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11, color: C.inkMuted, fontFamily: "var(--mono)" }}>
                        <span>{tx("markets.vol24hShort", "24h")} {formatPredictionVolume(market, "volume24h")}</span>
                        <span>{tx("markets.totalVolumeShort", "Tot")} {formatPredictionVolume(market, "volumeTotal")}</span>
                        <span>{tx("markets.liquidityShort", "Liq")} {formatPredictionVolume(market, "liquidity")}</span>
                      </div>
                    </a>
                  );
                })}
              </div>

              {hasMore && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <UIButton C={C} variant="secondary" size="md" onClick={() => setVisibleCount(n => n + 12)}>
                    {tx("markets.showMore", "Show More")}
                  </UIButton>
                </div>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// ─── Sub-tab: Economic ───────────────────────────────────────

function EconomicSubTab({ deps, viewport, focusKey, onFocusHandled }) {
  const {
    C, useI18n, fetchQuickQuote, Section, HelpWrap, fmt, Sparkline,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const [macroData, setMacroData] = useState(null);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState(null);
  const upcomingEventsRef = useRef(null);

  const loadMacro = useCallback(async () => {
    setMacroLoading(true);
    setMacroError(null);
    try {
      const symbols = [
        { key: "vix", ticker: "^VIX", label: "Volatility Index (VIX)" },
        { key: "tnx", ticker: "^TNX", label: "10-Year Treasury" },
        { key: "fvx", ticker: "^FVX", label: "5-Year Treasury" },
        { key: "dxy", ticker: "DX-Y.NYB", label: "US Dollar Index (DXY)" },
        { key: "oil", ticker: "CL=F", label: "WTI Crude Oil" },
      ];
      const results = await Promise.allSettled(
        symbols.map(s => fetchQuickQuote(s.ticker))
      );
      const data = {};
      symbols.forEach((s, i) => {
        const r = results[i];
        if (r.status === "fulfilled") {
          data[s.key] = { price: r.value.price, change: r.value.changePct, label: s.label, spark: r.value.spark || [] };
        } else {
          data[s.key] = { price: 0, change: 0, label: s.label, spark: [] };
        }
      });
      setMacroData(data);
    } catch {
      setMacroError(t("markets.macroError"));
    } finally {
      setMacroLoading(false);
    }
  }, [fetchQuickQuote, t]);

  useEffect(() => {
    loadMacro();
  }, []);

  useEffect(() => {
    if (focusKey !== "upcoming-events") return;
    const id = setTimeout(() => {
      upcomingEventsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      onFocusHandled?.();
    }, 80);
    return () => clearTimeout(id);
  }, [focusKey, onFocusHandled]);

  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = ECONOMIC_EVENTS.filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pastEvents = ECONOMIC_EVENTS.filter(e => e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  const yieldSpread = macroData
    ? (macroData.tnx.price - macroData.fvx.price)
    : null;

  let yieldCurveText = t("markets.yieldFlat");
  if (yieldSpread !== null) {
    if (yieldSpread > 0.5) {
      yieldCurveText = t("markets.yieldNormal");
    } else if (yieldSpread < 0) {
      yieldCurveText = t("markets.yieldInverted");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Macro Indicators */}
      <Section title={t("markets.macroIndicators")}>
        {macroLoading && (
          <div style={{ padding: 32, textAlign: "center", color: C.inkMuted, fontFamily: "var(--body)", fontSize: 12 }}>
            {t("markets.loading")}
          </div>
        )}
        {macroError && !macroLoading && (
          <EmptyState C={C} title={t("markets.error")} message={macroError} />
        )}
        {!macroLoading && macroData && (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: 12,
          }}>
            <div>
              <MetricCard
                C={C}
                label={macroData.vix.label}
                value={fmt(macroData.vix.price)}
                change={macroData.vix.change}
              />
              {macroData.vix.spark.length > 1 && (
                <div style={{ padding: "4px 10px 6px" }}>
                  <Sparkline data={macroData.vix.spark} color={macroData.vix.change >= 0 ? C.up : C.down} width={120} height={32} />
                </div>
              )}
            </div>
            <div>
              <MetricCard
                C={C}
                label={t("markets.yieldSpread")}
                value={yieldSpread !== null ? `${yieldSpread >= 0 ? "+" : ""}${yieldSpread.toFixed(2)}` : "--"}
                suffix="bps"
                change={null}
              />
              {macroData.tnx.spark.length > 1 && (
                <div style={{ padding: "4px 10px 6px" }}>
                  <Sparkline data={macroData.tnx.spark} color={macroData.tnx.change >= 0 ? C.up : C.down} width={120} height={32} />
                </div>
              )}
            </div>
            <div>
              <MetricCard
                C={C}
                label={macroData.dxy.label}
                value={fmt(macroData.dxy.price)}
                change={macroData.dxy.change}
              />
              {macroData.dxy.spark.length > 1 && (
                <div style={{ padding: "4px 10px 6px" }}>
                  <Sparkline data={macroData.dxy.spark} color={macroData.dxy.change >= 0 ? C.up : C.down} width={120} height={32} />
                </div>
              )}
            </div>
            <div>
              <MetricCard
                C={C}
                label={macroData.oil.label}
                value={`$${fmt(macroData.oil.price)}`}
                change={macroData.oil.change}
              />
              {macroData.oil.spark.length > 1 && (
                <div style={{ padding: "4px 10px 6px" }}>
                  <Sparkline data={macroData.oil.spark} color={macroData.oil.change >= 0 ? C.up : C.down} width={120} height={32} />
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Rate / Yield Curve Interpretation */}
      {macroData && (
        <Section title={t("markets.rateProbability")}>
          <div style={{
            padding: "16px 14px",
            border: `1px solid ${C.rule}`,
            background: C.warmWhite,
            fontSize: 13,
            fontFamily: "var(--body)",
            color: C.ink,
            lineHeight: 1.7,
          }}>
            <span style={{ fontWeight: 700, fontFamily: "var(--display)" }}>
              {t("markets.yieldCurveShape")}:
            </span>{" "}
            {yieldCurveText}
          </div>
          <div style={{
            marginTop: 8,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 12,
          }}>
            <div style={{
              padding: "10px 14px",
              border: `1px solid ${C.ruleFaint}`,
              fontSize: 11,
              fontFamily: "var(--body)",
              color: C.inkMuted,
              lineHeight: 1.6,
            }}>
              <span style={{ fontWeight: 700, color: C.ink }}>10Y:</span> {macroData.tnx.price > 0 ? `${fmt(macroData.tnx.price)}%` : "--"}
              {" | "}
              <span style={{ fontWeight: 700, color: C.ink }}>5Y:</span> {macroData.fvx.price > 0 ? `${fmt(macroData.fvx.price)}%` : "--"}
              {" | "}
              <span style={{ fontWeight: 700, color: C.ink }}>{t("markets.spread")}:</span>{" "}
              <span style={{ color: yieldSpread !== null && yieldSpread < 0 ? C.down : C.up }}>
                {yieldSpread !== null ? `${yieldSpread >= 0 ? "+" : ""}${yieldSpread.toFixed(2)}` : "--"}
              </span>
            </div>
            <div style={{
              padding: "10px 14px",
              border: `1px solid ${C.ruleFaint}`,
              fontSize: 11,
              fontFamily: "var(--body)",
              color: C.inkMuted,
              lineHeight: 1.6,
            }}>
              <span style={{ fontWeight: 700, color: C.ink }}>VIX:</span> {macroData.vix.price > 0 ? fmt(macroData.vix.price) : "--"}
              {macroData.vix.price > 25
                ? ` — ${t("markets.vixElevated")}`
                : macroData.vix.price > 15
                  ? ` — ${t("markets.vixNormal")}`
                  : ` — ${t("markets.vixLow")}`
              }
            </div>
          </div>
        </Section>
      )}

      {/* Upcoming Events */}
      <div ref={upcomingEventsRef} id="markets-upcoming-events">
        <Section title={t("markets.upcomingEvents")}>
          {upcomingEvents.length === 0 && (
            <div style={{ padding: 16, color: C.inkMuted, fontFamily: "var(--body)", fontSize: 12 }}>
              {t("markets.noUpcoming")}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {upcomingEvents.map((ev, i) => {
              const days = daysUntil(ev.date);
              return (
                <div
                  key={`${ev.date}-${ev.event}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderBottom: `1px solid ${C.ruleFaint}`,
                    background: i % 2 === 0 ? "transparent" : C.warmWhite,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: "var(--mono)",
                      padding: "2px 6px",
                      background: ev.impact === "HIGH" ? C.down : C.hold,
                      color: "#fff",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}>
                      {ev.impact}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--body)", color: C.ink }}>
                      {ev.event}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: C.inkMuted }}>
                      {ev.date}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: "var(--mono)",
                      color: days <= 7 ? C.down : days <= 30 ? C.hold : C.inkMuted,
                      minWidth: 60,
                      textAlign: "right",
                    }}>
                      {days === 0 ? t("markets.today") : days === 1 ? t("markets.tomorrow") : `${days}d`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {pastEvents.length > 0 && (
            <div style={{ marginTop: 8, padding: "8px 12px", fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)" }}>
              {t("markets.pastEventsNote", { count: pastEvents.length })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

const SUB_TABS = [
  { key: "heatmap", label: "Heatmap" },
  { key: "sectors", label: "Sectors" },
  { key: "crypto", label: "Crypto" },
  { key: "economic", label: "Economic" },
  { key: "prediction", label: "Polymarket" },
];


function MarketsTab({ deps, viewport, subTab, onSubTabChange, focusKey, onFocusHandled, isPro, onUpgradePro, onAnalyze }) {
  const {
    useI18n,
    C,
    HEATMAP_INDEXES,
    SECTOR_COLORS,
    ASSET_SECTIONS,
    fetchStockData,
    fetchQuickQuote,
    runAnalysis,
    labelFor,
    fmt,
    fmtPct,
    fmtMoney,
    Section,
    LazySection,
    HelpWrap,
    ProTag,
    ProGate,
    Sparkline,
  } = deps;
  const { t } = useI18n();
  const activeTab = subTab || "heatmap";
  const setActiveTab = onSubTabChange || (() => {});
  const tabLabel = (key, fallback) => {
    const trKey = `markets.tab.${key}`;
    const tr = t(trKey);
    return tr && tr !== trKey ? tr : fallback;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabGroup
        C={C}
        tabs={SUB_TABS.map(st => ({ key: st.key, label: tabLabel(st.key, st.label) }))}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "heatmap" && (
        <LazySection minHeight={300}>
          <HeatmapTab deps={deps} viewport={viewport} />
        </LazySection>
      )}

      {activeTab === "sectors" && (
        <LazySection minHeight={300}>
          <SectorsSubTab deps={deps} viewport={viewport} />
        </LazySection>
      )}

      {activeTab === "crypto" && (
        <LazySection minHeight={300}>
          <CryptoSubTab deps={deps} viewport={viewport} onAnalyze={onAnalyze} />
        </LazySection>
      )}

      {activeTab === "economic" && (
        <LazySection minHeight={300}>
          <EconomicSubTab deps={deps} viewport={viewport} focusKey={focusKey} onFocusHandled={onFocusHandled} />
        </LazySection>
      )}

      {activeTab === "prediction" && (
        <LazySection minHeight={320}>
          <PredictionMarketsSubTab deps={deps} viewport={viewport} />
        </LazySection>
      )}

    </div>
  );
}

export default MarketsTab;
