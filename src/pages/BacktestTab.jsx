import React, { useState, useMemo, useCallback } from "react";
import {
  ComposedChart, LineChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Customized,
} from "recharts";
import { UIButton, ControlChip, DataTable, MetricCard, EmptyState } from "../components/ui/primitives";

const STRATEGIES = [
  { key: "rsi", label: "RSI Crossover" },
  { key: "macd", label: "MACD Signal" },
  { key: "bollinger", label: "Bollinger Bounce" },
  { key: "sma", label: "SMA Crossover" },
  { key: "meanrev", label: "Mean Reversion" },
];

const DEFAULT_PARAMS = {
  rsi: { oversold: 30, overbought: 70 },
  macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  bollinger: { period: 20, stdDev: 2 },
  sma: { shortPeriod: 20, longPeriod: 50 },
  meanrev: { zThreshold: 2, lookback: 20 },
};

const PARAM_LABELS = {
  rsi: { oversold: "Oversold", overbought: "Overbought" },
  macd: { fastPeriod: "Fast Period", slowPeriod: "Slow Period", signalPeriod: "Signal Period" },
  bollinger: { period: "Period", stdDev: "Std Dev" },
  sma: { shortPeriod: "Short Period", longPeriod: "Long Period" },
  meanrev: { zThreshold: "Z-Score Threshold", lookback: "Lookback" },
};

const STRATEGY_DESCS = {
  rsi: "Buy when RSI drops below oversold, sell when it rises above overbought.",
  macd: "Buy on MACD bullish crossover, sell on bearish crossover.",
  bollinger: "Buy when price touches lower band, sell at upper band.",
  sma: "Buy when short SMA crosses above long SMA, sell on cross below.",
  meanrev: "Buy when Z-score is deeply negative, sell when deeply positive.",
};

const STRATEGY_ICONS = {
  rsi: "📊",
  macd: "📈",
  bollinger: "📉",
  sma: "〰️",
  meanrev: "↩️",
};

const PERIODS = [
  { key: "1y", label: "1Y" }, { key: "2y", label: "2Y" },
  { key: "5y", label: "5Y" }, { key: "max", label: "Max" },
];

function generateSignal(strategy, bar, prev, params) {
  if (!bar || !prev) return null;
  switch (strategy) {
    case "rsi":
      if (bar.RSI != null) {
        if (bar.RSI < params.oversold) return "BUY";
        if (bar.RSI > params.overbought) return "SELL";
      }
      return null;
    case "macd":
      if (bar.MACD != null && bar.MACD_Signal != null && prev.MACD != null && prev.MACD_Signal != null) {
        if (prev.MACD <= prev.MACD_Signal && bar.MACD > bar.MACD_Signal) return "BUY";
        if (prev.MACD >= prev.MACD_Signal && bar.MACD < bar.MACD_Signal) return "SELL";
      }
      return null;
    case "bollinger":
      if (bar.BB_Lower != null && bar.BB_Upper != null) {
        if (bar.Close < bar.BB_Lower) return "BUY";
        if (bar.Close > bar.BB_Upper) return "SELL";
      }
      return null;
    case "sma":
      if (bar.SMA_20 != null && bar.SMA_50 != null && prev.SMA_20 != null && prev.SMA_50 != null) {
        if (prev.SMA_20 <= prev.SMA_50 && bar.SMA_20 > bar.SMA_50) return "BUY";
        if (prev.SMA_20 >= prev.SMA_50 && bar.SMA_20 < bar.SMA_50) return "SELL";
      }
      return null;
    case "meanrev": {
      const lb = params.lookback || 20;
      if (bar._index != null && bar._index >= lb && bar._meanArr) {
        const slice = bar._meanArr.slice(bar._index - lb, bar._index);
        const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
        const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
        if (std > 0) {
          const z = (bar.Close - mean) / std;
          if (z < -params.zThreshold) return "BUY";
          if (z > params.zThreshold) return "SELL";
        }
      }
      return null;
    }
    default: return null;
  }
}

function runBacktest(enriched, strategy, params, capital, commission) {
  let cash = capital, shares = 0, entryPrice = 0;
  const equity = [], trades = [];
  const closes = enriched.map(d => d.Close);
  const data = enriched.map((d, i) => ({ ...d, _index: i, _meanArr: closes }));
  const basePrice = data[0]?.Close || 1;

  for (let i = 1; i < data.length; i++) {
    const bar = data[i], prev = data[i - 1];
    const signal = generateSignal(strategy, bar, prev, params);
    const cost = commission || 0;

    if (signal === "BUY" && shares === 0) {
      const available = cash - cost;
      if (available > 0) {
        shares = Math.floor(available / bar.Close);
        if (shares > 0) {
          entryPrice = bar.Close;
          cash -= shares * bar.Close + cost;
          trades.push({ _key: `t-${trades.length}`, date: bar.date, type: "BUY", price: bar.Close, shares, pnl: null, pnlPct: null });
        }
      }
    }
    if (signal === "SELL" && shares > 0) {
      cash += shares * bar.Close - cost;
      const pnl = (bar.Close - entryPrice) * shares - cost * 2;
      const pnlPct = ((bar.Close - entryPrice) / entryPrice) * 100;
      trades.push({ _key: `t-${trades.length}`, date: bar.date, type: "SELL", price: bar.Close, shares, pnl, pnlPct });
      shares = 0;
    }
    equity.push({ date: bar.date, value: cash + shares * bar.Close, benchmark: capital * (bar.Close / basePrice) });
  }

  const finalValue = equity.length > 0 ? equity[equity.length - 1].value : capital;
  const totalReturn = ((finalValue - capital) / capital) * 100;
  const years = equity.length / 252;
  const cagr = years > 0 ? (Math.pow(finalValue / capital, 1 / years) - 1) * 100 : 0;

  let maxPeak = capital, maxDrawdown = 0;
  for (const pt of equity) {
    if (pt.value > maxPeak) maxPeak = pt.value;
    const dd = ((pt.value - maxPeak) / maxPeak) * 100;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  const returns = [];
  for (let i = 1; i < equity.length; i++) returns.push((equity[i].value - equity[i - 1].value) / equity[i - 1].value);
  const avgRet = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdRet = returns.length > 1 ? Math.sqrt(returns.reduce((s, r) => s + (r - avgRet) ** 2, 0) / (returns.length - 1)) : 0;
  const sharpe = stdRet > 0 ? (avgRet / stdRet) * Math.sqrt(252) : 0;

  const sells = trades.filter(tr => tr.type === "SELL");
  const wins = sells.filter(tr => tr.pnlPct > 0);
  const losses = sells.filter(tr => tr.pnlPct <= 0);
  const winRate = sells.length > 0 ? (wins.length / sells.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, tr) => s + tr.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, tr) => s + tr.pnlPct, 0) / losses.length : 0;
  const grossProfit = wins.reduce((s, tr) => s + (tr.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, tr) => s + (tr.pnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  return { equity, trades, metrics: { totalReturn, cagr, maxDrawdown, sharpe, winRate, totalTrades: sells.length, avgWin, avgLoss, profitFactor, finalValue } };
}

function BacktestTab({ deps, viewport }) {
  const { useI18n, C, fetchStockData, runAnalysis, fmt, fmtPct, fmtMoney, Section, recColor } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);

  const [strategy, setStrategy] = useState("rsi");
  const [params, setParams] = useState({ ...DEFAULT_PARAMS.rsi });
  const [ticker, setTicker] = useState("AAPL");
  const [period, setPeriod] = useState("1y");
  const [capital, setCapital] = useState(100000);
  const [commission, setCommission] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);

  const handleStrategyChange = useCallback((key) => {
    setStrategy(key);
    setParams({ ...DEFAULT_PARAMS[key] });
    setResult(null);
  }, []);

  const handleParamChange = useCallback((key, value) => {
    setParams(prev => ({ ...prev, [key]: Number(value) || 0 }));
  }, []);

  const handleSort = useCallback((col) => {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(1); }
  }, [sortCol]);

  const labelStyle = { fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 4 };
  const inputStyle = { border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontSize: 11, fontFamily: "var(--body)", padding: "6px 10px", outline: "none", minWidth: 0 };

  const handleRun = async () => {
    setLoading(true); setError(null); setResult(null);
    setProgress(t("backtest.fetchingData"));
    try {
      const fd = await fetchStockData(ticker.toUpperCase().trim(), period);
      if (!fd?.data || fd.data.length < 20) throw new Error(t("backtest.insufficientData"));
      setProgress(t("backtest.runningAnalysis"));
      const analysis = runAnalysis(ticker.toUpperCase().trim(), fd.data);
      if (!analysis.data || analysis.data.length < 20) throw new Error(t("backtest.insufficientData"));
      setProgress(t("backtest.simulatingTrades"));
      setResult(runBacktest(analysis.data, strategy, params, capital, commission));
    } catch (e) {
      setError(e.message || t("backtest.error"));
    } finally {
      setLoading(false); setProgress("");
    }
  };

  const tradeColumns = useMemo(() => [
    { key: "date", label: t("backtest.date"), align: "left" },
    { key: "type", label: t("backtest.type"), align: "center",
      render: (v) => (
        <span style={{
          display: "inline-block",
          padding: "2px 8px",
          background: v === "BUY" ? C.up + "20" : C.down + "20",
          color: v === "BUY" ? C.up : C.down,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: "0.06em",
          fontFamily: "var(--mono)",
        }}>{v}</span>
      ) },
    { key: "price", label: t("backtest.price"), render: (v) => `$${fmt(v)}` },
    { key: "shares", label: t("backtest.shares") },
    { key: "pnl", label: t("backtest.pnl"),
      render: (v) => v != null ? <span style={{ color: v >= 0 ? C.up : C.down, fontWeight: 600 }}>{v >= 0 ? "+" : ""}{fmtMoney(v)}</span> : "\u2014" },
    { key: "pnlPct", label: t("backtest.pnlPct"),
      render: (v) => v != null ? <span style={{ color: v >= 0 ? C.up : C.down, fontWeight: 600 }}>{v >= 0 ? "+" : ""}{fmt(v)}%</span> : "\u2014" },
  ], [C, t, fmt, fmtMoney]);

  const chartData = useMemo(() => {
    if (!result?.equity) return [];
    const step = Math.max(1, Math.floor(result.equity.length / 300));
    return result.equity.filter((_, i) => i % step === 0 || i === result.equity.length - 1);
  }, [result]);

  const m = result?.metrics;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Strategy Selection */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
        {STRATEGIES.map(s => (
          <button
            key={s.key}
            onClick={() => handleStrategyChange(s.key)}
            style={{
              padding: "14px 16px",
              border: `2px solid ${strategy === s.key ? C.ink : C.ruleFaint}`,
              background: strategy === s.key ? C.warmWhite : "transparent",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16 }}>{STRATEGY_ICONS[s.key] || "📊"}</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--body)", color: C.ink }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 10, fontFamily: "var(--body)", color: C.inkMuted, lineHeight: 1.4 }}>
              {STRATEGY_DESCS[s.key] || ""}
            </span>
          </button>
        ))}
      </div>

      {/* Parameters */}
      <div style={{ background: C.warmWhite, border: `1px solid ${C.rule}`, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 10 }}>
          {t("backtest.parameters")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {Object.entries(PARAM_LABELS[strategy] || {}).map(([key, label]) => (
            <div key={key}>
              <div style={labelStyle}>{label}</div>
              <input type="number" value={params[key] ?? ""} onChange={e => handleParamChange(key, e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
          ))}
          <div>
            <div style={labelStyle}>{t("backtest.initialCapital")}</div>
            <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value) || 0)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={labelStyle}>{t("backtest.commission")}</div>
            <input type="number" value={commission} onChange={e => setCommission(Number(e.target.value) || 0)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
      </div>

      {/* Ticker & Period & Run */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
          <div style={labelStyle}>{t("backtest.ticker")}</div>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL"
            onKeyDown={e => e.key === "Enter" && !loading && handleRun()}
            style={{ ...inputStyle, fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", width: isMobile ? "100%" : 100, boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
          <div style={labelStyle}>{t("backtest.period")}</div>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <UIButton C={C} variant="primary" onClick={handleRun} disabled={loading || !ticker.trim()}
          style={{ width: "100%", padding: "12px 24px", fontSize: 13, background: C.ink, marginTop: 8 }}>
          {loading ? t("backtest.running") : t("backtest.runBacktest")}
        </UIButton>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: "16px 0", textAlign: "center", fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", fontStyle: "italic" }}>
          {progress || t("backtest.running")}
        </div>
      )}

      {/* Error */}
      {error && <div style={{ padding: "8px 12px", background: C.downBg, color: C.down, fontSize: 11, fontFamily: "var(--mono)" }}>{error}</div>}

      {/* Empty State */}
      {!result && !loading && !error && (
        <EmptyState C={C} title={t("backtest.emptyTitle")} message={t("backtest.emptyMessage")} />
      )}

      {/* Results */}
      {result && m && (
        <>
          <div style={{ borderTop: `3px solid ${C.ink}`, marginTop: 8, paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 16 }}>
              {t("backtest.results")}
            </div>
          </div>

          {/* Equity Curve with Trade Signals */}
          <Section title={t("backtest.equityCurve")}>
            <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>
                <span style={{ width: 16, height: 2, background: C.ink }} />
                {t("backtest.portfolio")}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: C.inkMuted }}>
                <span style={{ width: 16, height: 0, borderTop: `2px dashed ${C.inkMuted}` }} />
                {t("backtest.buyAndHold")}
              </span>
              {result && result.trades && result.trades.length > 0 && (
                <>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: C.up }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.up }} />
                    Buy
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700, color: C.down }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.down }} />
                    Sell
                  </span>
                </>
              )}
            </div>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.ink} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={C.ink} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }}
                  axisLine={{ stroke: C.rule }} tickLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / (isMobile ? 5 : 10)))} />
                <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }}
                  axisLine={false} tickLine={false} width={55}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <ReferenceLine y={capital} stroke={C.rule} strokeDasharray="3 3" />
                <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                  formatter={(v, name) => [`$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name === "value" ? t("backtest.portfolio") : t("backtest.buyAndHold")]} />
                <Area dataKey="value" stroke={C.ink} fill="url(#equityGrad)" strokeWidth={1.8} dot={false} name="value" />
                <Line dataKey="benchmark" stroke={C.inkMuted} dot={false} strokeWidth={1.2} strokeDasharray="6 3" name="benchmark" />
                {result && result.trades && result.trades.length > 0 && (
                  <Customized component={({ xAxisMap, yAxisMap }) => {
                    const xAxis = xAxisMap && Object.values(xAxisMap)[0];
                    const yAxis = yAxisMap && Object.values(yAxisMap)[0];
                    if (!xAxis || !yAxis) return null;
                    const tradeMap = {};
                    result.trades.forEach(tr => { tradeMap[tr.date] = tr.type; });
                    return (
                      <g>
                        {chartData.map((pt, i) => {
                          const type = tradeMap[pt.date];
                          if (!type) return null;
                          const cx = xAxis.scale(i) + (xAxis.bandSize ? xAxis.bandSize / 2 : 0);
                          const cy = yAxis.scale(pt.value);
                          if (isNaN(cx) || isNaN(cy)) return null;
                          return (
                            <circle
                              key={`sig-${i}`}
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill={type === "BUY" ? C.up : C.down}
                              stroke="#fff"
                              strokeWidth={1.5}
                            />
                          );
                        })}
                      </g>
                    );
                  }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </Section>

          {/* Metrics Grid */}
          <Section title={t("backtest.performanceMetrics")}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
              <MetricCard C={C} label={t("backtest.totalReturn")}
                value={`${m.totalReturn >= 0 ? "+" : ""}${fmt(m.totalReturn)}%`}
                style={{ borderLeft: `3px solid ${m.totalReturn >= 0 ? C.up : C.down}` }} />
              <MetricCard C={C} label={t("backtest.cagr")}
                value={`${m.cagr >= 0 ? "+" : ""}${fmt(m.cagr)}%`}
                style={{ borderLeft: `3px solid ${m.cagr >= 0 ? C.up : C.down}` }} />
              <MetricCard C={C} label={t("backtest.maxDrawdown")}
                value={`${fmt(m.maxDrawdown)}%`}
                style={{ borderLeft: `3px solid ${C.down}` }} />
              <MetricCard C={C} label={t("backtest.sharpe")}
                value={fmt(m.sharpe)}
                style={{ borderLeft: `3px solid ${m.sharpe > 1 ? C.up : m.sharpe > 0 ? C.hold : C.down}` }} />
              <MetricCard C={C} label={t("backtest.winRate")}
                value={`${fmt(m.winRate, 1)}%`}
                style={{ borderLeft: `3px solid ${m.winRate >= 50 ? C.up : C.down}` }} />
              <MetricCard C={C} label={t("backtest.totalTrades")} value={m.totalTrades} />
              <MetricCard C={C} label={t("backtest.avgWin")}
                value={`+${fmt(m.avgWin)}%`}
                style={{ borderLeft: `3px solid ${C.up}` }} />
              <MetricCard C={C} label={t("backtest.avgLoss")}
                value={`${fmt(m.avgLoss)}%`}
                style={{ borderLeft: `3px solid ${C.down}` }} />
              <MetricCard C={C} label={t("backtest.profitFactor")}
                value={m.profitFactor === Infinity ? "\u221E" : fmt(m.profitFactor)}
                style={{ borderLeft: `3px solid ${m.profitFactor >= 1 ? C.up : C.down}` }} />
            </div>
          </Section>

          {/* Trade Log */}
          <Section title={`${t("backtest.tradeLog")} (${result.trades.length})`}>
            {result.trades.length > 0 ? (
              <DataTable C={C} columns={tradeColumns} rows={result.trades}
                sortCol={sortCol} sortDir={sortDir} onSort={handleSort} striped />
            ) : (
              <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)" }}>
                {t("backtest.noTrades")}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════

export default BacktestTab;
