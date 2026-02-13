import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  UIButton, ControlChip, TabGroup, DataTable, MetricCard, GaugeBar, EmptyState,
} from "../components/ui/primitives";

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
  { key: "5d", label: "1W" },
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

function heatmapColor(changePct, C) {
  const clamped = Math.max(-5, Math.min(5, changePct));
  const ratio = (clamped + 5) / 10;
  if (ratio < 0.5) {
    const t = ratio / 0.5;
    return lerpColor(C.down, C.warmWhite || "#F5F0EB", t);
  }
  const t = (ratio - 0.5) / 0.5;
  return lerpColor(C.warmWhite || "#F5F0EB", C.up, t);
}

function lerpColor(a, b, t) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function parseHex(hex) {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

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

// ─── Sub-tab: Heatmap ────────────────────────────────────────

function HeatmapSubTab({ deps, viewport }) {
  const {
    C, useI18n, HEATMAP_INDEXES, fetchQuickQuote, Section, HelpWrap, labelFor,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const indexNames = Object.keys(HEATMAP_INDEXES);
  const [selectedIndex, setSelectedIndex] = useState(indexNames[0] || "S&P 500");
  const [changes, setChanges] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const stocks = HEATMAP_INDEXES[selectedIndex] || [];
  const totalCap = stocks.reduce((s, st) => s + st.cap, 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        stocks.map(s => fetchQuickQuote(s.ticker))
      );
      const map = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          map[stocks[i].ticker] = r.value.changePct || 0;
        } else {
          map[stocks[i].ticker] = 0;
        }
      });
      setChanges(map);
    } catch (e) {
      setError(t("markets.heatmapError"));
    } finally {
      setLoading(false);
    }
  }, [stocks, fetchQuickQuote, t]);

  useEffect(() => {
    load();
  }, [selectedIndex]);

  const cells = useMemo(() =>
    stocks.map(s => ({
      ...s,
      change: changes[s.ticker] || 0,
      relSize: s.cap / totalCap,
    })),
    [stocks, changes, totalCap]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <HelpWrap help={{ title: t("markets.heatmapHelp"), body: t("markets.heatmapHelpBody") }} block>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {indexNames.map(name => (
            <ControlChip
              key={name}
              C={C}
              active={selectedIndex === name}
              onClick={() => setSelectedIndex(name)}
            >
              {name}
            </ControlChip>
          ))}
        </div>
      </HelpWrap>

      {loading && (
        <div style={{ padding: 48, textAlign: "center", color: C.inkMuted, fontFamily: "var(--body)", fontSize: 12 }}>
          {t("markets.loading")}
        </div>
      )}

      {error && !loading && (
        <EmptyState C={C} title={t("markets.error")} message={error} />
      )}

      {!loading && !error && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0,
          width: "100%",
        }}>
          {cells.map(s => {
            const widthPct = Math.max(isMobile ? 20 : 8, s.relSize * 100);
            const bg = heatmapColor(s.change, C);
            const textColor = Math.abs(s.change) > 2 ? "#fff" : C.ink;
            return (
              <div
                key={s.ticker}
                style={{
                  width: `${widthPct}%`,
                  minHeight: 60,
                  padding: 8,
                  borderRadius: 0,
                  border: `1px solid ${C.ruleFaint}`,
                  background: bg,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  cursor: "default",
                }}
              >
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "var(--mono)",
                  color: textColor,
                  lineHeight: 1.2,
                }}>
                  {s.ticker}
                </span>
                <span style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: textColor,
                  opacity: 0.85,
                  marginTop: 2,
                }}>
                  {s.change >= 0 ? "+" : ""}{s.change.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: "flex", gap: 12, fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600 }}>{t("markets.legend")}:</span>
          {[[-4, "-4%"], [-2, "-2%"], [0, "0%"], [2, "+2%"], [4, "+4%"]].map(([v, l]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 12, height: 12, background: heatmapColor(v, C), border: `1px solid ${C.ruleFaint}` }} />
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
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
      const periods = ["5d", "1mo", "3mo", "6mo", "1y"];
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

function CryptoSubTab({ deps, viewport }) {
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
    { key: "rank", label: "#", align: "left", cellStyle: { fontWeight: 700, color: C.inkMuted, fontSize: 11 } },
    {
      key: "name",
      label: t("markets.name"),
      align: "left",
      cellStyle: { fontWeight: 700, color: C.ink },
      render: (v, row) => (
        <span style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--body)" }}>{v}</span>
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
      key: "spark",
      label: t("markets.sparkline"),
      render: (v, row) => v && v.length > 1
        ? <Sparkline data={v} color={row.change7d >= 0 ? C.up : C.down} prevClose={row.prevClose} width={80} height={28} />
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
          <Section title={t("markets.topCrypto")}>
            <DataTable
              C={C}
              columns={cryptoColumns}
              rows={cryptos}
              striped
            />
          </Section>

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
              <div style={{ padding: "12px 0" }}>
                <GaugeBar
                  C={C}
                  value={fgValue}
                  max={100}
                  label={t("markets.fearGreedIndex")}
                />
                <div style={{
                  marginTop: 12,
                  textAlign: "center",
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "var(--display)",
                  color: fgValue > 55 ? C.up : fgValue < 45 ? C.down : C.hold,
                }}>
                  {fgLabel}
                </div>
                <div style={{
                  marginTop: 4,
                  textAlign: "center",
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color: C.inkMuted,
                }}>
                  BTC RSI: {btcRSI.toFixed(1)}
                </div>
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-tab: Economic ───────────────────────────────────────

function EconomicSubTab({ deps, viewport }) {
  const {
    C, useI18n, fetchQuickQuote, Section, HelpWrap, fmt,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const [macroData, setMacroData] = useState(null);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState(null);

  const loadMacro = useCallback(async () => {
    setMacroLoading(true);
    setMacroError(null);
    try {
      const symbols = [
        { key: "vix", ticker: "^VIX", label: "VIX" },
        { key: "tnx", ticker: "^TNX", label: "10Y Yield" },
        { key: "fvx", ticker: "^FVX", label: "5Y Yield" },
        { key: "dxy", ticker: "DX-Y.NYB", label: "DXY" },
        { key: "oil", ticker: "CL=F", label: "Crude Oil" },
      ];
      const results = await Promise.allSettled(
        symbols.map(s => fetchQuickQuote(s.ticker))
      );
      const data = {};
      symbols.forEach((s, i) => {
        const r = results[i];
        if (r.status === "fulfilled") {
          data[s.key] = { price: r.value.price, change: r.value.changePct, label: s.label };
        } else {
          data[s.key] = { price: 0, change: 0, label: s.label };
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
      {/* Upcoming Events */}
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
            <MetricCard
              C={C}
              label={macroData.vix.label}
              value={fmt(macroData.vix.price)}
              change={macroData.vix.change}
            />
            <MetricCard
              C={C}
              label={t("markets.yieldSpread")}
              value={yieldSpread !== null ? `${yieldSpread >= 0 ? "+" : ""}${yieldSpread.toFixed(2)}` : "--"}
              suffix="bps"
              change={null}
            />
            <MetricCard
              C={C}
              label={macroData.dxy.label}
              value={fmt(macroData.dxy.price)}
              change={macroData.dxy.change}
            />
            <MetricCard
              C={C}
              label={macroData.oil.label}
              value={`$${fmt(macroData.oil.price)}`}
              change={macroData.oil.change}
            />
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
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

const SUB_TABS = [
  { key: "heatmap", label: "Heatmap" },
  { key: "sectors", label: "Sectors" },
  { key: "crypto", label: "Crypto" },
  { key: "economic", label: "Economic" },
];

function MarketsTab({ deps, viewport, subTab, onSubTabChange, isPro, onUpgradePro }) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <TabGroup
        C={C}
        tabs={SUB_TABS.map(st => ({ key: st.key, label: t(`markets.tab.${st.key}`) || st.label }))}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "heatmap" && (
        <LazySection minHeight={300}>
          <HeatmapSubTab deps={deps} viewport={viewport} />
        </LazySection>
      )}

      {activeTab === "sectors" && (
        <LazySection minHeight={300}>
          <SectorsSubTab deps={deps} viewport={viewport} />
        </LazySection>
      )}

      {activeTab === "crypto" && (
        <LazySection minHeight={300}>
          <CryptoSubTab deps={deps} viewport={viewport} />
        </LazySection>
      )}

      {activeTab === "economic" && (
        <LazySection minHeight={300}>
          <EconomicSubTab deps={deps} viewport={viewport} />
        </LazySection>
      )}
    </div>
  );
}

export default MarketsTab;
