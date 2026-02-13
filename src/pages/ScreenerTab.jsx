import React, { useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { UIButton, ControlChip, TabGroup, DataTable, EmptyState } from "../components/ui/primitives";

const COMP_LINE_COLORS = ["#1A1612", "#8B2500", "#5B4A8A", "#1B6B3A", "#D4A017", "#2E86AB", "#A23B72", "#C73E1D"];

const BATCH_SIZE = 10;

const RSI_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "<30", label: "<30 (Oversold)" },
  { value: "30-70", label: "30-70 (Neutral)" },
  { value: ">70", label: ">70 (Overbought)" },
];

const SHARPE_OPTIONS = [
  { value: "any", label: "Any" },
  { value: ">0.5", label: ">0.5" },
  { value: ">1.0", label: ">1.0" },
  { value: ">1.5", label: ">1.5" },
];

const REGIME_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "UPTREND", label: "Uptrend" },
  { value: "DOWNTREND", label: "Downtrend" },
  { value: "MEAN_REVERTING", label: "Mean Reverting" },
  { value: "RANGING", label: "Ranging" },
];

const REC_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "BUY", label: "Buy" },
  { value: "SELL", label: "Sell" },
  { value: "HOLD", label: "Hold" },
];

const RISK_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Moderate" },
  { value: "HIGH", label: "High" },
];

const PRESETS = {
  oversold: { rsi: "<30", sharpe: "any", regime: "any", rec: "any", risk: "any" },
  momentum: { rsi: "any", sharpe: ">0.5", regime: "UPTREND", rec: "BUY", risk: "any" },
  highSharpe: { rsi: "any", sharpe: ">1.0", regime: "any", rec: "any", risk: "any" },
  lowVol: { rsi: "any", sharpe: "any", regime: "any", rec: "any", risk: "LOW" },
};

const DEFAULT_FILTERS = { rsi: "any", sharpe: "any", regime: "any", rec: "any", risk: "any" };

function matchesFilter(result, filters) {
  if (filters.rsi !== "any") {
    const rsi = result.rsi;
    if (rsi == null) return false;
    if (filters.rsi === "<30" && rsi >= 30) return false;
    if (filters.rsi === "30-70" && (rsi < 30 || rsi > 70)) return false;
    if (filters.rsi === ">70" && rsi <= 70) return false;
  }
  if (filters.sharpe !== "any") {
    const s = result.sharpe;
    if (filters.sharpe === ">0.5" && s <= 0.5) return false;
    if (filters.sharpe === ">1.0" && s <= 1.0) return false;
    if (filters.sharpe === ">1.5" && s <= 1.5) return false;
  }
  if (filters.regime !== "any") {
    if (!result.regime || !result.regime.toUpperCase().includes(filters.regime)) return false;
  }
  if (filters.rec !== "any") {
    if (!result.rec || !result.rec.toUpperCase().includes(filters.rec)) return false;
  }
  if (filters.risk !== "any") {
    if (!result.risk || result.risk.toUpperCase() !== filters.risk) return false;
  }
  return true;
}

function ScreenerTab({ deps, viewport, onAnalyze, isPro, onUpgradePro, comparisonTickers, onComparisonTickersChange }) {
  const {
    useI18n,
    C,
    fetchStockData,
    runAnalysis,
    recColor,
    translateEnum,
    fmt,
    fmtPct,
    fmtMoney,
    Section,
    HelpWrap,
    ProTag,
    ProGate,
    HEATMAP_INDEXES,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);

  // Sub-tab state
  const [subTab, setSubTab] = useState("screener");

  // ─── Screener state ───────────────────────────────────────
  const indexNames = useMemo(() => Object.keys(HEATMAP_INDEXES), [HEATMAP_INDEXES]);
  const [universe, setUniverse] = useState(indexNames[0] || "S&P 500");
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [scanResults, setScanResults] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);

  // ─── Comparison state ─────────────────────────────────────
  const [compTickers, setCompTickers] = useState(comparisonTickers || "AAPL, MSFT, GOOGL, AMZN");
  const [compResults, setCompResults] = useState(null);
  const [compRawData, setCompRawData] = useState(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState(null);
  const [compSortCol, setCompSortCol] = useState(null);
  const [compSortDir, setCompSortDir] = useState(1);

  // ─── Shared styles ────────────────────────────────────────
  const selectStyle = {
    background: "transparent",
    border: `1px solid ${C.rule}`,
    color: C.ink,
    fontSize: 11,
    fontFamily: "var(--body)",
    padding: "6px 10px",
    outline: "none",
    cursor: "pointer",
    minWidth: 0,
  };

  const sectionHeader = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: C.inkMuted,
    fontFamily: "var(--body)",
  };

  // ─── Screener scan logic ──────────────────────────────────
  const runScan = useCallback(async (activeFilters) => {
    const stocks = HEATMAP_INDEXES[universe];
    if (!stocks || stocks.length === 0) return;

    setScanning(true);
    setScanProgress({ done: 0, total: stocks.length });
    const allResults = [];

    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
      const batch = stocks.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (s) => {
          const fd = await fetchStockData(s.ticker, "6mo");
          if (!fd.data) return null;
          const a = runAnalysis(s.ticker, fd.data);
          const lastData = a.data[a.data.length - 1];
          const firstClose = a.data[0]?.Close || a.currentPrice;
          const changePct = firstClose > 0 ? ((a.currentPrice - firstClose) / firstClose) * 100 : 0;
          return {
            _key: s.ticker,
            ticker: s.ticker,
            name: s.name,
            price: a.currentPrice,
            changePct,
            rsi: lastData?.RSI ?? null,
            sharpe: a.risk.sharpe,
            regime: a.regime.overall,
            rec: a.recommendation.action,
            confidence: a.recommendation.confidence,
            risk: a.risk.riskLevel,
            vol: a.risk.volatility,
          };
        })
      );

      batchResults.forEach((r) => {
        if (r.status === "fulfilled" && r.value) {
          allResults.push(r.value);
        }
      });

      setScanProgress({ done: Math.min(i + BATCH_SIZE, stocks.length), total: stocks.length });
    }

    // Apply filters
    const filtersToApply = activeFilters || filters;
    const filtered = allResults.filter((r) => matchesFilter(r, filtersToApply));
    setScanResults(filtered);
    setScanning(false);
  }, [universe, filters, HEATMAP_INDEXES, fetchStockData, runAnalysis]);

  const handlePreset = useCallback((presetKey) => {
    const preset = PRESETS[presetKey];
    setFilters({ ...preset });
    runScan(preset);
  }, [runScan]);

  const handleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir((d) => -d);
    } else {
      setSortCol(col);
      setSortDir(1);
    }
  }, [sortCol]);

  // ─── Comparison logic ─────────────────────────────────────
  const runComparison = useCallback(async () => {
    setCompLoading(true);
    setCompError(null);
    const list = compTickers.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const dataMap = {};

    const tasks = list.map(async (symbol) => {
      try {
        const fd = await fetchStockData(symbol, "6mo");
        if (fd.data) {
          const a = runAnalysis(symbol, fd.data);
          dataMap[symbol] = fd.data;
          return {
            _key: symbol,
            ticker: symbol,
            price: a.currentPrice,
            rec: a.recommendation.action,
            conf: a.recommendation.confidence,
            regime: a.regime.overall,
            risk: a.risk.riskLevel,
            sharpe: a.risk.sharpe,
            vol: a.risk.volatility,
            maxDD: a.risk.maxDrawdown,
            mom: a.statSignals.momentum.avgMomentum,
          };
        }
        return { _key: symbol, ticker: symbol, price: 0, rec: "N/A", conf: 0, regime: "N/A", risk: "N/A", sharpe: 0, vol: 0, maxDD: 0, mom: 0 };
      } catch (e) {
        setCompError((prev) => (prev || "") + `${symbol}: ${e.message || "failed"}; `);
        return { _key: symbol, ticker: symbol, price: 0, rec: "N/A", conf: 0, regime: "N/A", risk: "N/A", sharpe: 0, vol: 0, maxDD: 0, mom: 0 };
      }
    });

    const res = await Promise.all(tasks);
    setCompResults(res);
    setCompRawData(dataMap);
    setCompLoading(false);
    onComparisonTickersChange?.(compTickers);
  }, [compTickers, fetchStockData, runAnalysis, onComparisonTickersChange]);

  const handleCompSort = useCallback((col) => {
    if (compSortCol === col) {
      setCompSortDir((d) => -d);
    } else {
      setCompSortCol(col);
      setCompSortDir(1);
    }
  }, [compSortCol]);

  // ─── Derived: normalized overlay chart for comparison ─────
  const overlayData = useMemo(() => {
    if (!compRawData || !compResults) return null;
    const validTickers = compResults.filter((r) => compRawData[r.ticker] && compRawData[r.ticker].length > 10).map((r) => r.ticker);
    if (validTickers.length < 2) return null;
    const minLen = Math.min(...validTickers.map((sym) => compRawData[sym].length));
    const chartPoints = [];
    for (let i = 0; i < minLen; i++) {
      const point = { date: compRawData[validTickers[0]][i].date?.slice(5) || i };
      validTickers.forEach((sym) => {
        const base = compRawData[sym][0].Close;
        point[sym] = base > 0 ? ((compRawData[sym][i].Close - base) / base) * 100 : 0;
      });
      chartPoints.push(point);
    }
    return { data: chartPoints, tickers: validTickers };
  }, [compRawData, compResults]);

  // ─── Screener columns ─────────────────────────────────────
  const screenerColumns = useMemo(() => [
    {
      key: "ticker",
      label: t("screener.ticker"),
      align: "left",
      render: (val) => (
        <span
          onClick={() => onAnalyze?.(val)}
          style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", textDecoration: "underline", textDecorationColor: C.ruleFaint, textUnderlineOffset: 2 }}
        >
          {val}
        </span>
      ),
    },
    { key: "name", label: t("screener.name"), align: "left", cellStyle: { fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
    { key: "price", label: t("screener.price"), render: (val) => <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>${fmt(val)}</span> },
    {
      key: "changePct",
      label: t("screener.change"),
      render: (val) => (
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: val >= 0 ? C.up : C.down }}>
          {val >= 0 ? "+" : ""}{fmt(val, 1)}%
        </span>
      ),
    },
    {
      key: "rsi",
      label: "RSI",
      render: (val) => (
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: val != null ? (val < 30 ? C.up : val > 70 ? C.down : C.inkMuted) : C.inkFaint }}>
          {val != null ? fmt(val, 1) : "--"}
        </span>
      ),
    },
    {
      key: "sharpe",
      label: t("screener.sharpe"),
      render: (val) => (
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: val > 1 ? C.up : val > 0 ? C.hold : C.down }}>
          {fmt(val)}
        </span>
      ),
    },
    {
      key: "regime",
      label: t("screener.regime"),
      render: (val) => (
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: C.inkMuted, letterSpacing: "0.04em" }}>
          {val ? translateEnum(val, t, "regime") : "--"}
        </span>
      ),
    },
    {
      key: "rec",
      label: t("screener.signal"),
      render: (val) => (
        <span style={{ color: recColor(val), fontWeight: 700, fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>
          {val ? translateEnum(val, t, "signal") : "--"}
        </span>
      ),
    },
    {
      key: "risk",
      label: t("screener.risk"),
      render: (val) => (
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: val === "HIGH" ? C.down : val === "LOW" ? C.up : C.hold }}>
          {val ? translateEnum(val, t, "risk") : "--"}
        </span>
      ),
    },
  ], [C, t, fmt, recColor, translateEnum, onAnalyze]);

  // ─── Comparison columns ────────────────────────────────────
  const compColumns = useMemo(() => [
    {
      key: "ticker",
      label: t("screener.ticker"),
      align: "left",
      render: (val) => (
        <span
          onClick={() => onAnalyze?.(val)}
          style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)", fontSize: 12, cursor: "pointer", textDecoration: "underline", textDecorationColor: C.ruleFaint, textUnderlineOffset: 2 }}
        >
          {val}
        </span>
      ),
    },
    { key: "price", label: t("screener.price"), render: (val) => <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>${fmt(val)}</span> },
    {
      key: "rec",
      label: t("screener.signal"),
      render: (val) => (
        <span style={{ color: recColor(val), fontWeight: 700, fontSize: 10, fontFamily: "var(--mono)" }}>
          {val === "N/A" ? t("common.na") : translateEnum(val, t, "signal")}
        </span>
      ),
    },
    { key: "conf", label: t("screener.confidence"), render: (val) => <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{fmtPct(val * 100, 0)}</span> },
    {
      key: "sharpe",
      label: t("screener.sharpe"),
      render: (val) => <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: val > 1 ? C.up : val > 0 ? C.hold : C.down }}>{fmt(val)}</span>,
    },
    { key: "vol", label: t("screener.volatility"), render: (val) => <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{fmtPct(val)}</span> },
    { key: "maxDD", label: t("screener.maxDD"), render: (val) => <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.down }}>{fmtPct(val)}</span> },
    {
      key: "mom",
      label: t("screener.momentum"),
      render: (val) => <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: val > 0 ? C.up : C.down }}>{val > 0 ? "+" : ""}{fmtPct(val)}</span>,
    },
  ], [C, t, fmt, fmtPct, recColor, translateEnum, onAnalyze]);

  // ─── Progress bar ─────────────────────────────────────────
  const progressPct = scanProgress.total > 0 ? (scanProgress.done / scanProgress.total) * 100 : 0;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gap: isMobile ? 20 : 18, minWidth: 0 }}>
      <TabGroup
        C={C}
        tabs={[
          { key: "screener", label: t("screener.screener") },
          { key: "comparison", label: t("screener.comparison") },
        ]}
        active={subTab}
        onChange={setSubTab}
      />

      {/* ════════════════════════════════════════════════════════
          SCREENER SUB-TAB
          ════════════════════════════════════════════════════════ */}
      {subTab === "screener" && (
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {/* Universe selector */}
          <div>
            <div style={{ ...sectionHeader, marginBottom: 8 }}>{t("screener.universe")}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {indexNames.map((name) => (
                <ControlChip
                  key={name}
                  C={C}
                  active={universe === name}
                  onClick={() => { setUniverse(name); setScanResults(null); }}
                >
                  {name} ({HEATMAP_INDEXES[name].length})
                </ControlChip>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div>
            <div style={{ ...sectionHeader, marginBottom: 8 }}>{t("screener.filters")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>RSI</span>
                <select value={filters.rsi} onChange={(e) => setFilters((f) => ({ ...f, rsi: e.target.value }))} style={selectStyle}>
                  {RSI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("screener.sharpe")}</span>
                <select value={filters.sharpe} onChange={(e) => setFilters((f) => ({ ...f, sharpe: e.target.value }))} style={selectStyle}>
                  {SHARPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("screener.regime")}</span>
                <select value={filters.regime} onChange={(e) => setFilters((f) => ({ ...f, regime: e.target.value }))} style={selectStyle}>
                  {REGIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("screener.signal")}</span>
                <select value={filters.rec} onChange={(e) => setFilters((f) => ({ ...f, rec: e.target.value }))} style={selectStyle}>
                  {REC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("screener.risk")}</span>
                <select value={filters.risk} onChange={(e) => setFilters((f) => ({ ...f, risk: e.target.value }))} style={selectStyle}>
                  {RISK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {/* Quick scan presets */}
          <div>
            <div style={{ ...sectionHeader, marginBottom: 8 }}>{t("screener.quickScan")}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <ControlChip C={C} onClick={() => handlePreset("oversold")} style={{ borderRadius: 2 }}>
                {t("screener.presetOversold")}
              </ControlChip>
              <ControlChip C={C} onClick={() => handlePreset("momentum")} style={{ borderRadius: 2 }}>
                {t("screener.presetMomentum")}
              </ControlChip>
              <ControlChip C={C} onClick={() => handlePreset("highSharpe")} style={{ borderRadius: 2 }}>
                {t("screener.presetHighSharpe")}
              </ControlChip>
              <ControlChip C={C} onClick={() => handlePreset("lowVol")} style={{ borderRadius: 2 }}>
                {t("screener.presetLowVol")}
              </ControlChip>
              <div style={{ marginLeft: "auto" }}>
                <UIButton C={C} variant="primary" onClick={() => runScan(filters)} disabled={scanning} style={{ minWidth: 100 }}>
                  {scanning ? t("screener.scanning") : t("screener.scan")}
                </UIButton>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {scanning && (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: C.inkMuted }}>
                {t("screener.scanningProgress")} {scanProgress.done} / {scanProgress.total}...
              </div>
              <div style={{ height: 4, background: C.warmWhite || C.paper, border: `1px solid ${C.ruleFaint}`, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progressPct}%`, background: C.ink, transition: "width 0.3s ease" }} />
              </div>
            </div>
          )}

          {/* Results */}
          {!scanning && scanResults && scanResults.length > 0 && (
            <Section title={`${t("screener.results")} (${scanResults.length})`}>
              <DataTable
                C={C}
                columns={screenerColumns}
                rows={scanResults}
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={handleSort}
                striped
              />
            </Section>
          )}

          {/* No results */}
          {!scanning && scanResults && scanResults.length === 0 && (
            <EmptyState
              C={C}
              title={t("screener.noResults")}
              message={t("screener.noResultsMessage")}
              action={
                <UIButton C={C} variant="secondary" onClick={() => { setFilters({ ...DEFAULT_FILTERS }); runScan(DEFAULT_FILTERS); }}>
                  {t("screener.clearFilters")}
                </UIButton>
              }
            />
          )}

          {/* Empty state - no scan run yet */}
          {!scanning && !scanResults && (
            <EmptyState
              C={C}
              title={t("screener.emptyTitle")}
              message={t("screener.emptyMessage")}
              action={
                <UIButton C={C} variant="primary" onClick={() => runScan(filters)}>
                  {t("screener.runFirstScan")}
                </UIButton>
              }
            />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          COMPARISON SUB-TAB
          ════════════════════════════════════════════════════════ */}
      {subTab === "comparison" && (
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {/* Input */}
          <HelpWrap help={{ title: t("help.comparisonInput.title"), body: t("help.comparisonInput.body") }} block>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={compTickers}
                onChange={(e) => setCompTickers(e.target.value)}
                placeholder={t("screener.compPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && runComparison()}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: `1px solid ${C.rule}`,
                  padding: "8px 12px",
                  color: C.ink,
                  fontSize: 13,
                  fontFamily: "var(--mono)",
                  letterSpacing: "0.06em",
                  outline: "none",
                  minWidth: 180,
                }}
              />
              <UIButton C={C} variant="primary" onClick={runComparison} disabled={compLoading} style={{ minWidth: 118 }}>
                {compLoading ? t("screener.comparing") : t("screener.compare")}
              </UIButton>
            </div>
          </HelpWrap>

          {/* Error */}
          {compError && (
            <div style={{ padding: "6px 12px", background: C.downBg, color: C.down, fontSize: 11, fontFamily: "var(--mono)" }}>
              {compError}
            </div>
          )}

          {/* Normalized performance chart */}
          {overlayData && (
            <Section title={t("screener.normalizedPerformance")}>
              <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                {overlayData.tickers.map((ticker, i) => (
                  <span key={ticker} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>
                    <span style={{ width: 12, height: 3, background: COMP_LINE_COLORS[i % COMP_LINE_COLORS.length] }} />
                    {ticker}
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={overlayData.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }}
                    axisLine={{ stroke: C.rule }}
                    tickLine={false}
                    interval={Math.floor(overlayData.data.length / 10)}
                  />
                  <YAxis
                    tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                    tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                  />
                  <ReferenceLine y={0} stroke={C.rule} strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                    formatter={(v, name) => [`${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`, name]}
                  />
                  {overlayData.tickers.map((ticker, i) => (
                    <Line key={ticker} dataKey={ticker} stroke={COMP_LINE_COLORS[i % COMP_LINE_COLORS.length]} dot={false} strokeWidth={1.8} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}

          {/* Comparison table */}
          {compResults && (
            <Section title={t("screener.comparisonResults")}>
              <DataTable
                C={C}
                columns={compColumns}
                rows={compResults}
                sortCol={compSortCol}
                sortDir={compSortDir}
                onSort={handleCompSort}
                striped
              />
            </Section>
          )}

          {/* Comparison empty state */}
          {!compLoading && !compResults && (
            <EmptyState
              C={C}
              title={t("screener.compEmptyTitle")}
              message={t("screener.compEmptyMessage")}
              action={
                <UIButton C={C} variant="primary" onClick={runComparison}>
                  {t("screener.compare")}
                </UIButton>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

export default ScreenerTab;
