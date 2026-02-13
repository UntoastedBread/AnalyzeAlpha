import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Customized,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { ControlChip, MetricCard, GaugeBar, DataTable, EmptyState } from "../components/ui/primitives";

function AnalysisTab({
  deps,
  viewport,
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
  chartType,
  onChartTypeChange,
  defaultChartType = "line",
  onUpgradePro,
  openChartsLabel,
  helpMode,
  onShowHelp,
  onHideHelp,
}) {
  const {
    useI18n,
    C,
    hashCode,
    seededRange,
    runValuationModels,
    applyLivePoint,
    usePrevious,
    BrandMark,
    ProTag,
    recColor,
    valColor,
    translateEnum,
    STRATEGIES,
    Row,
    Section,
    Signal,
    fmt,
    fmtPct,
    fmtMoney,
    LazySection,
    AnimatedPrice,
    LiveBadge,
    HelpWrap,
    CandlestickSeries,
    CHART_ANIM_MS,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const isTablet = Boolean(viewport?.isTablet);
  const activeSubTab = subTab || "stock";
  const setActiveSubTab = onSubTabChange || (() => {});
  const activeChartType = chartType || defaultChartType || "line";
  const [finPeriod, setFinPeriod] = useState("LTM");
  const [assumptions, setAssumptions] = useState(null);
  const [animateMainLine, setAnimateMainLine] = useState(true);
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
    onChartTypeChange?.(defaultChartType || "line");
  }, [result, onSubTabChange, onChartTypeChange, defaultChartType]);

  useEffect(() => {
    if (!result?.ticker) return undefined;
    setAnimateMainLine(true);
    const id = setTimeout(() => setAnimateMainLine(false), CHART_ANIM_MS + 40);
    return () => clearTimeout(id);
  }, [result?.ticker, period, interval, activeChartType, CHART_ANIM_MS]);

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
      <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8, marginBottom: 18, overflowX: "auto" }}>
        <button onClick={() => setActiveSubTab("stock")} style={subTabStyle("stock")}>{t("analysis.stockTab")}</button>
        <button onClick={() => setActiveSubTab("financials")} style={subTabStyle("financials", !isPro)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {t("analysis.financialsTab")}
            {!isPro && <ProTag small />}
          </span>
        </button>
        <button onClick={() => setActiveSubTab("options")} style={subTabStyle("options")}>
          {t("analysis.optionsTab") === "analysis.optionsTab" ? "Options" : t("analysis.optionsTab")}
        </button>
        <button onClick={() => setActiveSubTab("dividends")} style={subTabStyle("dividends")}>
          {t("analysis.dividendsTab") === "analysis.dividendsTab" ? "Dividends" : t("analysis.dividendsTab")}
        </button>
      </div>

      {activeSubTab === "stock" && (
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "240px 1fr", gap: isMobile ? 16 : 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <ControlChip C={C} active={activeChartType === "line"} onClick={() => onChartTypeChange?.("line")}>{t("common.line")}</ControlChip>
            <ControlChip C={C} active={activeChartType === "candles"} onClick={() => onChartTypeChange?.("candles")}>{t("common.candles")}</ControlChip>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
              <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={9} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
              <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" name={t("analysis.bbUpper")} isAnimationActive={false} />
              <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" name={t("analysis.bbLower")} isAnimationActive={false} />
              <Line dataKey="s20" stroke={C.accent + "AA"} dot={false} strokeWidth={1} name={t("analysis.sma20")} isAnimationActive={false} />
              <Line dataKey="s50" stroke={C.chart4 + "88"} dot={false} strokeWidth={1} name={t("analysis.sma50")} isAnimationActive={false} />
              {activeChartType === "candles" ? (
                <Customized component={CandlestickSeries} />
              ) : (
                <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={2} name={t("analysis.close")} isAnimationActive={animateMainLine} animationDuration={CHART_ANIM_MS} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          </Section>
        </HelpWrap>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 24 }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
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
        <div style={{ border: `1px dashed ${C.rule}`, background: C.warmWhite, padding: isMobile ? 18 : 26, display: "grid", gap: 14, justifyItems: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><ProTag /></div>
          <div style={{ fontFamily: "var(--display)", fontSize: isMobile ? 34 : 42, color: C.ink, lineHeight: 1.05, textAlign: "center" }}>
            Financials Are Pro
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.6, textAlign: "center", maxWidth: 700 }}>
            {t("analysis.financialsProDesc")}
          </div>
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
            tabIndex={-1}
            aria-hidden="true"
            draggable={false}
            style={{
              width: "min(520px, 100%)",
              borderRadius: 14,
              border: `1px solid ${C.rule}`,
              background: C.paper,
              pointerEvents: "none",
            }}
          >
            <source src="/media/financials-pro-preview.m4v" type="video/mp4" />
            <source src="/media/financials-pro-preview.mov" type="video/quicktime" />
          </video>
          <ul style={{ display: "grid", gap: 6, marginTop: 2, marginBottom: 2, paddingLeft: 18, color: C.inkFaint, width: "min(560px, 100%)" }}>
            {[t("analysis.financialsProF0"), t("analysis.financialsProF1"), t("analysis.financialsProF2")].map((feature) => (
              <li key={feature} style={{ fontSize: 11, fontFamily: "var(--mono)", lineHeight: 1.45 }}>
                {feature}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onUpgradePro?.()}
            style={{
              padding: isMobile ? "9px 14px" : "10px 16px",
              border: "none",
              background: C.ink,
              color: C.cream,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "var(--body)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Sign Up For Pro
          </button>
        </div>
      )}

      {activeSubTab === "financials" && isPro && (
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "240px 1fr", gap: isMobile ? 16 : 20 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 12 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12, marginTop: 12 }}>
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

      {activeSubTab === "options" && <OptionsSubTab C={C} ticker={result?.ticker} price={price} t={t} Section={Section} isMobile={isMobile} />}
      {activeSubTab === "dividends" && <DividendsSubTab C={C} ticker={result?.ticker} price={price} t={t} Section={Section} LazySection={LazySection} fmt={fmt} fmtPct={fmtPct} fmtMoney={fmtMoney} isMobile={isMobile} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// OPTIONS SUB-TAB
// ═══════════════════════════════════════════════════════════
function OptionsSubTab({ C, ticker, price, t, Section, isMobile }) {
  const [chain, setChain] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [selectedExpiry, setSelectedExpiry] = React.useState(0);
  const [showCalls, setShowCalls] = React.useState(true);

  React.useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/options/${encodeURIComponent(ticker)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => {
        if (cancelled) return;
        const oc = json?.optionChain?.result?.[0];
        if (!oc) throw new Error("No options data");
        setChain(oc);
        setLoading(false);
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ticker]);

  if (!ticker) return <EmptyState C={C} icon="📊" title="No Stock Selected" message="Analyze a stock first to view its options chain." />;
  if (loading) return <div style={{ padding: 24, color: C.inkMuted, fontFamily: "var(--body)", fontSize: 12 }}>Loading options for {ticker}...</div>;
  if (error) return <EmptyState C={C} icon="⚠️" title="Options Unavailable" message={`Could not load options data: ${error}`} />;
  if (!chain) return null;

  const expirations = (chain.expirationDates || []).map(ts => new Date(ts * 1000).toISOString().slice(0, 10));
  const options = chain.options?.[selectedExpiry] || chain.options?.[0] || {};
  const calls = options.calls || [];
  const puts = options.puts || [];
  const items = showCalls ? calls : puts;
  const underlyingPrice = chain.quote?.regularMarketPrice || price || 0;

  // Black-Scholes Greeks approximation
  function bsGreeks(S, K, T, r, sigma, isCall) {
    if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const nd1 = 0.5 * (1 + erf(d1 / Math.SQRT2));
    const nd2 = 0.5 * (1 + erf(d2 / Math.SQRT2));
    const npd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
    const delta = isCall ? nd1 : nd1 - 1;
    const gamma = npd1 / (S * sigma * Math.sqrt(T));
    const theta = isCall
      ? (-(S * npd1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * nd2) / 365
      : (-(S * npd1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * (1 - nd2)) / 365;
    const vega = S * npd1 * Math.sqrt(T) / 100;
    return { delta: +delta.toFixed(4), gamma: +gamma.toFixed(6), theta: +theta.toFixed(4), vega: +vega.toFixed(4) };
  }

  function erf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const tt = 1.0 / (1.0 + p * x);
    return sign * (1 - (((((a5 * tt + a4) * tt) + a3) * tt + a2) * tt + a1) * tt * Math.exp(-x * x));
  }

  // Max pain calculation
  const allStrikes = [...new Set([...calls.map(c => c.strike), ...puts.map(p => p.strike)])].sort((a, b) => a - b);
  let maxPainStrike = 0, minPain = Infinity;
  for (const strike of allStrikes) {
    let pain = 0;
    for (const c of calls) { if (strike > c.strike) pain += (strike - c.strike) * (c.openInterest || 0); }
    for (const p of puts) { if (strike < p.strike) pain += (p.strike - strike) * (p.openInterest || 0); }
    if (pain < minPain) { minPain = pain; maxPainStrike = strike; }
  }

  const totalCallOI = calls.reduce((s, c) => s + (c.openInterest || 0), 0);
  const totalPutOI = puts.reduce((s, p) => s + (p.openInterest || 0), 0);
  const pcRatio = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : "N/A";

  return (
    <div>
      <Section C={C} title={`Options Chain — ${ticker}`}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.inkMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--body)" }}>Expiry:</span>
          <select
            value={selectedExpiry}
            onChange={e => setSelectedExpiry(Number(e.target.value))}
            style={{ background: "transparent", border: `1px solid ${C.rule}`, color: C.ink, fontSize: 11, fontFamily: "var(--body)", padding: "6px 10px" }}
          >
            {expirations.map((exp, i) => <option key={i} value={i}>{exp}</option>)}
          </select>
          <ControlChip C={C} active={showCalls} onClick={() => setShowCalls(true)}>Calls</ControlChip>
          <ControlChip C={C} active={!showCalls} onClick={() => setShowCalls(false)}>Puts</ControlChip>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <MetricCard C={C} label="Max Pain" value={`$${maxPainStrike.toFixed(2)}`} style={{ flex: 1, minWidth: 100 }} />
          <MetricCard C={C} label="P/C Ratio" value={pcRatio} style={{ flex: 1, minWidth: 100 }} />
          <MetricCard C={C} label="Call OI" value={totalCallOI.toLocaleString()} style={{ flex: 1, minWidth: 100 }} />
          <MetricCard C={C} label="Put OI" value={totalPutOI.toLocaleString()} style={{ flex: 1, minWidth: 100 }} />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: 11 }}>
            <thead>
              <tr>
                {["Strike", "Last", "Bid", "Ask", "Change", "Vol", "OI", "IV", "Delta", "Gamma", "Theta"].map(h => (
                  <th key={h} style={{ padding: "8px 8px", textAlign: "right", color: C.inkMuted, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--body)", borderBottom: `2px solid ${C.ink}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 30).map((opt, i) => {
                const iv = opt.impliedVolatility || 0;
                const T = Math.max(0.01, selectedExpiry < expirations.length ? ((new Date(expirations[selectedExpiry])).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000) : 0.1);
                const greeks = bsGreeks(underlyingPrice, opt.strike, T, 0.05, iv, showCalls);
                const itm = showCalls ? opt.strike <= underlyingPrice : opt.strike >= underlyingPrice;
                return (
                  <tr key={i} style={{ background: itm ? (showCalls ? `${C.upBg}` : `${C.downBg}`) : (i % 2 === 1 ? C.warmWhite : "transparent"), borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: opt.strike === Math.round(underlyingPrice) ? 700 : 400 }}>{opt.strike?.toFixed(2)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{opt.lastPrice?.toFixed(2) ?? "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{opt.bid?.toFixed(2) ?? "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{opt.ask?.toFixed(2) ?? "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: (opt.change || 0) >= 0 ? C.up : C.down }}>{opt.change?.toFixed(2) ?? "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{opt.volume ?? "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{opt.openInterest ?? "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{(iv * 100).toFixed(1)}%</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{greeks.delta}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{greeks.gamma}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{greeks.theta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section C={C} title="IV Skew" style={{ marginTop: 20 }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={items.filter(o => o.impliedVolatility).map(o => ({ strike: o.strike, iv: +(o.impliedVolatility * 100).toFixed(1) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.ruleFaint} />
            <XAxis dataKey="strike" tick={{ fontSize: 10, fill: C.inkMuted }} />
            <YAxis tick={{ fontSize: 10, fill: C.inkMuted }} />
            <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, fontSize: 11 }} />
            <ReferenceLine x={Math.round(underlyingPrice)} stroke={C.ink} strokeDasharray="3 3" label={{ value: "ATM", fontSize: 9, fill: C.inkMuted }} />
            <Line type="monotone" dataKey="iv" stroke={C.accent} dot={false} strokeWidth={2} name="IV %" />
          </LineChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DIVIDENDS SUB-TAB
// ═══════════════════════════════════════════════════════════
function DividendsSubTab({ C, ticker, price, t, Section, LazySection, fmt, fmtPct, fmtMoney, isMobile }) {
  const [divData, setDivData] = React.useState(null);
  const [fundData, setFundData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [sharesOwned, setSharesOwned] = React.useState(100);

  React.useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      fetch(`/api/dividends/${encodeURIComponent(ticker)}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/fundamentals/${encodeURIComponent(ticker)}`).then(r => r.ok ? r.json() : null),
    ]).then(([divRes, fundRes]) => {
      if (cancelled) return;
      const divJson = divRes.status === "fulfilled" ? divRes.value : null;
      const fundJson = fundRes.status === "fulfilled" ? fundRes.value : null;

      // Parse dividend events from chart response
      const chartResult = divJson?.chart?.result?.[0];
      const events = chartResult?.events?.dividends || {};
      const dividends = Object.values(events)
        .map(d => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Parse fundamentals
      const summary = fundJson?.quoteSummary?.result?.[0] || {};
      const summaryDetail = summary.summaryDetail || {};
      const keyStats = summary.defaultKeyStatistics || {};

      setDivData({
        dividends,
        yield: summaryDetail.dividendYield?.raw || summaryDetail.trailingAnnualDividendYield?.raw || 0,
        annualDividend: summaryDetail.trailingAnnualDividendRate?.raw || 0,
        exDate: summaryDetail.exDividendDate?.fmt || "N/A",
        payoutRatio: summaryDetail.payoutRatio?.raw || keyStats.payoutRatio?.raw || 0,
        fiveYearAvgYield: keyStats.fiveYearAvgDividendYield?.raw || 0,
      });
      setFundData(summary);
      setLoading(false);
    }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ticker]);

  if (!ticker) return <EmptyState C={C} icon="💰" title="No Stock Selected" message="Analyze a stock first to view dividend data." />;
  if (loading) return <div style={{ padding: 24, color: C.inkMuted, fontFamily: "var(--body)", fontSize: 12 }}>Loading dividend data for {ticker}...</div>;
  if (error) return <EmptyState C={C} icon="⚠️" title="Data Unavailable" message={error} />;
  if (!divData) return null;

  const dividends = divData.dividends || [];
  const annualDiv = divData.annualDividend || 0;
  const divYield = divData.yield || 0;
  const annualIncome = sharesOwned * annualDiv;

  // Calculate growth rate from last 8 dividends
  const recent = dividends.slice(-8);
  let growthRate = 0;
  if (recent.length >= 4) {
    const oldAvg = recent.slice(0, Math.floor(recent.length / 2)).reduce((s, d) => s + d.amount, 0) / Math.floor(recent.length / 2);
    const newAvg = recent.slice(Math.floor(recent.length / 2)).reduce((s, d) => s + d.amount, 0) / (recent.length - Math.floor(recent.length / 2));
    if (oldAvg > 0) growthRate = (newAvg / oldAvg - 1);
  }

  // Determine frequency
  let frequency = "Unknown";
  if (dividends.length >= 2) {
    const gaps = [];
    for (let i = 1; i < Math.min(dividends.length, 10); i++) {
      gaps.push((new Date(dividends[i].date).getTime() - new Date(dividends[i - 1].date).getTime()) / (1000 * 60 * 60 * 24));
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGap < 45) frequency = "Monthly";
    else if (avgGap < 120) frequency = "Quarterly";
    else if (avgGap < 200) frequency = "Semi-Annual";
    else frequency = "Annual";
  }

  // DRIP simulator: project 10 years of reinvested dividends
  const dripYears = [];
  let dripShares = sharesOwned;
  let dripValue = dripShares * (price || 100);
  const annualGrowth = growthRate || 0.03;
  let currentAnnualDiv = annualDiv;
  for (let y = 0; y <= 10; y++) {
    dripYears.push({ year: y, shares: +dripShares.toFixed(2), value: +dripValue.toFixed(0), income: +(dripShares * currentAnnualDiv).toFixed(0) });
    const income = dripShares * currentAnnualDiv;
    dripShares += price > 0 ? income / price : 0;
    currentAnnualDiv *= (1 + annualGrowth);
    dripValue = dripShares * (price || 100);
  }

  return (
    <div>
      <Section C={C} title={`Dividend Analysis — ${ticker}`}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <MetricCard C={C} label="Dividend Yield" value={fmtPct(divYield * 100)} />
          <MetricCard C={C} label="Annual Dividend" value={`$${annualDiv.toFixed(2)}`} />
          <MetricCard C={C} label="Payout Ratio" value={fmtPct(divData.payoutRatio * 100)} />
          <MetricCard C={C} label="Frequency" value={frequency} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <MetricCard C={C} label="Ex-Dividend Date" value={divData.exDate} />
          <MetricCard C={C} label="Div Growth Rate" value={fmtPct(growthRate * 100)} change={growthRate * 100} />
          <MetricCard C={C} label="5Y Avg Yield" value={fmtPct(divData.fiveYearAvgYield)} />
          <MetricCard C={C} label="Consecutive Payments" value={dividends.length > 0 ? `${dividends.length}+` : "N/A"} />
        </div>
      </Section>

      {dividends.length > 0 && (
        <Section C={C} title="Dividend History" style={{ marginTop: 20 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dividends.slice(-20)}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.ruleFaint} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.inkMuted }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMuted }} />
              <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, fontSize: 11 }} />
              <Bar dataKey="amount" fill={C.up} name="Dividend ($)" />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      <Section C={C} title="Income Calculator" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>Shares Owned:</span>
          <input
            type="number"
            value={sharesOwned}
            onChange={e => setSharesOwned(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 100, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", fontSize: 12, fontFamily: "var(--mono)", color: C.ink }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", color: C.up }}>
            Annual Income: ${annualIncome.toFixed(2)}
          </span>
          <span style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--mono)" }}>
            (${(annualIncome / 12).toFixed(2)}/month)
          </span>
        </div>
      </Section>

      {annualDiv > 0 && (
        <Section C={C} title="DRIP Simulator (10 Year Projection)" style={{ marginTop: 20 }}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dripYears}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.ruleFaint} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: C.inkMuted }} label={{ value: "Years", fontSize: 10, fill: C.inkMuted, position: "bottom" }} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMuted }} />
              <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, fontSize: 11 }} />
              <Line type="monotone" dataKey="value" stroke={C.up} strokeWidth={2} dot={false} name="Portfolio Value ($)" />
              <Line type="monotone" dataKey="income" stroke={C.accent} strokeWidth={1.5} dot={false} name="Annual Income ($)" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", marginTop: 8 }}>
            Projection assumes {fmtPct(annualGrowth * 100)} annual dividend growth and full reinvestment at current price.
          </div>
        </Section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════

export default AnalysisTab;
