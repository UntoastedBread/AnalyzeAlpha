import React, { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { UIButton, TableHeadCell, TableCell } from "../components/ui/primitives";

const COMP_LINE_COLORS = ["#1A1612", "#8B2500", "#5B4A8A", "#1B6B3A", "#D4A017", "#2E86AB", "#A23B72", "#C73E1D"];

function ComparisonTab({ deps, viewport }) {
  const {
    useI18n,
    C,
    fetchStockData,
    runAnalysis,
    recColor,
    translateEnum,
    fmt,
    fmtPct,
    Section,
    HelpWrap,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <HelpWrap help={{ title: t("help.comparisonInput.title"), body: t("help.comparisonInput.body") }} block>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={tickers} onChange={e => setTickers(e.target.value)} placeholder={t("comparison.placeholder")}
            style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "8px 12px", color: C.ink, fontSize: 13, fontFamily: "var(--mono)", letterSpacing: "0.06em", outline: "none" }}
            onKeyDown={e => e.key === "Enter" && run()} />
          <UIButton C={C} variant="primary" onClick={run} disabled={loading} style={{ minWidth: 118 }}>
            {loading ? t("comparison.running") : t("comparison.compare")}
          </UIButton>
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
                    <TableHeadCell C={C} align="left">{t("comparison.ticker")}</TableHeadCell>
                    <TableHeadCell C={C} active={sortCol === "price"} onClick={() => doSort("price")}>{t("comparison.price")}{sortCol === "price" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</TableHeadCell>
                    <TableHeadCell C={C} active={sortCol === "rec"} onClick={() => doSort("rec")}>{t("comparison.signal")}{sortCol === "rec" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</TableHeadCell>
                    <TableHeadCell C={C} active={sortCol === "conf"} onClick={() => doSort("conf")}>{t("comparison.conf")}{sortCol === "conf" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</TableHeadCell>
                    <TableHeadCell C={C} active={sortCol === "sharpe"} onClick={() => doSort("sharpe")}>{t("comparison.sharpe")}{sortCol === "sharpe" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</TableHeadCell>
                    <TableHeadCell C={C} active={sortCol === "vol"} onClick={() => doSort("vol")}>{t("comparison.vol")}{sortCol === "vol" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</TableHeadCell>
                    <TableHeadCell C={C} active={sortCol === "maxDD"} onClick={() => doSort("maxDD")}>{t("comparison.maxDD")}{sortCol === "maxDD" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</TableHeadCell>
                    <TableHeadCell C={C} active={sortCol === "mom"} onClick={() => doSort("mom")}>{t("comparison.momentum")}{sortCol === "mom" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</TableHeadCell>
                    <TableHeadCell C={C} active={sortCol === "stretch"} onClick={() => doSort("stretch")}>{t("comparison.stretch")}{sortCol === "stretch" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</TableHeadCell>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.ticker} style={{ borderBottom: `1px solid ${C.ruleFaint}`, background: i % 2 ? C.warmWhite + "80" : "transparent" }}>
                      <TableCell align="left" style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)", fontSize: 12 }}>{r.ticker}</TableCell>
                      <TableCell style={{ fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(r.price)}</TableCell>
                      <TableCell>
                        <span style={{ color: recColor(r.rec), fontWeight: 700, fontSize: 10, fontFamily: "var(--mono)" }}>
                          {r.rec === "N/A" || !r.rec ? t("common.na") : translateEnum(r.rec, t, "signal")}
                        </span>
                      </TableCell>
                      <TableCell style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{fmtPct(r.conf * 100, 0)}</TableCell>
                      <TableCell style={{ fontFamily: "var(--mono)", fontSize: 11, color: r.sharpe > 1 ? C.up : r.sharpe > 0 ? C.hold : C.down }}>{fmt(r.sharpe)}</TableCell>
                      <TableCell style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{fmtPct(r.vol)}</TableCell>
                      <TableCell style={{ fontFamily: "var(--mono)", fontSize: 11, color: C.down }}>{fmtPct(r.maxDD)}</TableCell>
                      <TableCell style={{ fontFamily: "var(--mono)", fontSize: 11, color: r.mom > 0 ? C.up : C.down }}>{r.mom > 0 ? "+" : ""}{fmtPct(r.mom)}</TableCell>
                      <TableCell style={{ fontFamily: "var(--mono)", fontSize: 11, color: r.stretch > 65 ? C.down : r.stretch < 35 ? C.up : C.hold }}>{fmt(r.stretch, 0)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HelpWrap>
          {sorted.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
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

export default ComparisonTab;
