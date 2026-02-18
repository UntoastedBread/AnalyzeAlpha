import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Brush, Customized, Area,
} from "recharts";
import { ControlChip } from "../components/ui/primitives";

// ── Indicator definitions ──────────────────────────────────
const INDICATOR_CATALOG = [
  { key: "sma", label: "SMA (20/50/200)", group: "Trend", active: true },
  { key: "ema", label: "EMA (12/26)", group: "Trend", active: false },
  { key: "bb", label: "Bollinger Bands", group: "Volatility", active: true },
  { key: "vwap", label: "VWAP", group: "Volume", active: false },
  { key: "vol", label: "Volume", group: "Volume", active: true },
  { key: "rsi", label: "RSI (14)", group: "Momentum", active: true },
  { key: "macd", label: "MACD", group: "Momentum", active: false },
  { key: "stoch", label: "Stochastic", group: "Momentum", active: false },
  { key: "atr", label: "ATR (14)", group: "Volatility", active: false },
];

// ── EMA helper ─────────────────────────────────────────────
function computeEMA(data, period, key = "c") {
  const k = 2 / (period + 1);
  const result = [];
  let prev = null;
  for (const d of data) {
    const val = d[key];
    if (val == null) { result.push(null); continue; }
    if (prev == null) { prev = val; result.push(val); continue; }
    prev = val * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

// ── ATR helper ─────────────────────────────────────────────
function computeATR(data, period = 14) {
  const result = [];
  const trs = [];
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (i === 0 || d.h == null || d.l == null) { result.push(null); trs.push(0); continue; }
    const prev = data[i - 1];
    const tr = Math.max(d.h - d.l, Math.abs(d.h - (prev.c || 0)), Math.abs(d.l - (prev.c || 0)));
    trs.push(tr);
    if (i < period) { result.push(null); continue; }
    const slice = trs.slice(i - period + 1, i + 1);
    result.push(slice.reduce((s, v) => s + v, 0) / period);
  }
  return result;
}

function ChartsTab({
  deps,
  viewport,
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
  defaultChartType = "line",
}) {
  const {
    useI18n,
    C,
    applyLivePoint,
    Section,
    HelpWrap,
    LazySection,
    ExpandedChartModal,
    CandlestickSeries,
    CHART_ANIM_MS,
    normalizeChartMode,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const chartRef = useRef(null);

  // Indicator toggles
  const [show, setShow] = useState(() => {
    const init = {};
    INDICATOR_CATALOG.forEach(i => { init[i.key] = i.active; });
    return init;
  });

  // Chart settings
  const [settings, setSettings] = useState({ grid: true, logScale: false, crosshair: true });
  const [showSettings, setShowSettings] = useState(false);
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState("");

  // Drawing tools
  const [hLines, setHLines] = useState([]);
  const [drawingMode, setDrawingMode] = useState(null); // "hline" | "measure" | null
  const [measureStart, setMeasureStart] = useState(null);
  const [measureEnd, setMeasureEnd] = useState(null);

  // Compare ticker
  const [compareTicker, setCompareTicker] = useState("");
  const [compareData, setCompareData] = useState(null);
  const [showCompare, setShowCompare] = useState(false);

  const data = result?.data;
  const ticker = result?.ticker || "";
  const toggle = k => setShow(p => ({ ...p, [k]: !p[k] }));
  const activeChartType = chartType || "line";
  const [animatePriceLine, setAnimatePriceLine] = useState(true);
  const [brushRange, setBrushRange] = useState({ start: null, end: null });

  // Main chart data
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
        rsi: d.RSI, macd: d.MACD, ms: d.MACD_Signal, mh: d.MACD_Hist, sk: d.Stoch_K, sd: d.Stoch_D,
      };
    });
  }, [data, chartLivePrice, interval, result?.interval]);

  // Computed indicators
  const enriched = useMemo(() => {
    if (!cd.length) return cd;
    const ema12 = computeEMA(cd, 12);
    const ema26 = computeEMA(cd, 26);
    const atr = computeATR(cd);
    // VWAP (cumulative)
    let cumVP = 0, cumV = 0;
    return cd.map((d, i) => {
      const tp = (d.h || d.c) && (d.l || d.c) ? ((d.h || d.c) + (d.l || d.c) + d.c) / 3 : d.c;
      cumVP += tp * (d.v || 0);
      cumV += (d.v || 0);
      return {
        ...d,
        ema12: ema12[i],
        ema26: ema26[i],
        atr: atr[i],
        vwap: cumV > 0 ? cumVP / cumV : null,
      };
    });
  }, [cd]);

  const btn = (on) => ({ padding: "5px 14px", border: `1px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.cream : C.inkMuted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.04em" });
  const h = show.rsi || show.macd || show.stoch || show.atr ? 300 : 400;
  const expandBtn = { padding: "4px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" };
  const toolBtn = (active) => ({
    padding: "4px 8px", border: `1px solid ${active ? C.ink : C.rule}`,
    background: active ? C.ink : "transparent", color: active ? C.cream : C.inkMuted,
    fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body)",
  });

  useEffect(() => {
    onChartTypeChange?.(defaultChartType || "line");
    onExpandedModeChange?.(null);
  }, [result?.ticker, onChartTypeChange, onExpandedModeChange, defaultChartType]);

  useEffect(() => {
    setBrushRange({ start: null, end: null });
  }, [ticker, period, interval]);

  useEffect(() => {
    if (!cd.length) {
      setBrushRange(prev => (prev.start === 0 && prev.end === 0 ? prev : { start: 0, end: 0 }));
      return;
    }
    setBrushRange((prev) => {
      const max = cd.length - 1;
      if (prev.start == null || prev.end == null) {
        const end = max;
        const span = Math.min(cd.length, 180);
        return { start: Math.max(0, end - span + 1), end };
      }
      const start = Math.max(0, Math.min(prev.start, max));
      const end = Math.max(start, Math.min(prev.end, max));
      if (start === prev.start && end === prev.end) return prev;
      return { start, end };
    });
  }, [cd.length]);

  useEffect(() => {
    setAnimatePriceLine(true);
    const id = setTimeout(() => setAnimatePriceLine(false), CHART_ANIM_MS + 40);
    return () => clearTimeout(id);
  }, [ticker, period, interval, activeChartType, CHART_ANIM_MS]);

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

  // Crosshair tooltip
  const CrosshairCursor = useCallback(({ viewBox, points }) => {
    if (!settings.crosshair || !points || !points.length) return null;
    return null; // Recharts handles cursor via <Tooltip cursor={{ ... }} />
  }, [settings.crosshair]);

  // Handle chart click for drawing tools
  const handleChartClick = useCallback((e) => {
    if (!e || !e.activePayload || !e.activePayload.length) return;
    const price = e.activePayload[0]?.payload?.c;
    if (price == null) return;
    if (drawingMode === "hline") {
      setHLines(prev => [...prev, { price, color: C.accent, id: Date.now() }]);
      setDrawingMode(null);
    } else if (drawingMode === "measure") {
      if (!measureStart) {
        setMeasureStart({ price, label: e.activeLabel });
      } else {
        setMeasureEnd({ price, label: e.activeLabel });
        setDrawingMode(null);
      }
    }
  }, [drawingMode, measureStart, C.accent]);

  // Measure info
  const measureInfo = useMemo(() => {
    if (!measureStart || !measureEnd) return null;
    const diff = measureEnd.price - measureStart.price;
    const pct = measureStart.price ? (diff / measureStart.price) * 100 : 0;
    return { diff, pct, from: measureStart.price, to: measureEnd.price };
  }, [measureStart, measureEnd]);

  // Filtered indicator catalog
  const filteredIndicators = useMemo(() => {
    if (!indicatorSearch) return INDICATOR_CATALOG;
    const q = indicatorSearch.toLowerCase();
    return INDICATOR_CATALOG.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
  }, [indicatorSearch]);

  if (!result) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: C.inkMuted, fontFamily: "var(--display)", fontSize: 24 }}>{t("charts.runAnalysisFirst")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 18 : 16 }}>
      {/* ── Toolbar ────────────────────────────── */}
      <HelpWrap help={{ title: t("help.chartsControls.title"), body: t("help.chartsControls.body") }} block>
        <div style={{ display: "grid", gap: 10, borderBottom: `1px solid ${C.rule}`, paddingBottom: 12 }}>
          {/* Row 1: Indicators + Settings */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setShowIndicatorPanel(p => !p)} style={toolBtn(showIndicatorPanel)} title="Indicator Panel">
              <span style={{ marginRight: 4 }}>📊</span> Indicators
            </button>
            <span style={{ width: 1, height: 18, background: C.ruleFaint, margin: "0 2px" }} />
            {[["sma", t("charts.movingAvg")], ["ema", "EMA"], ["bb", t("charts.bollinger")], ["vwap", "VWAP"]].map(([k, l]) => (
              <ControlChip key={k} C={C} active={show[k]} onClick={() => toggle(k)}>{l}</ControlChip>
            ))}
            <span style={{ width: 1, height: 18, background: C.ruleFaint, margin: "0 2px" }} />
            {[["vol", t("charts.volume")], ["rsi", t("charts.rsi")], ["macd", t("charts.macd")], ["stoch", t("charts.stochastic")], ["atr", "ATR"]].map(([k, l]) => (
              <ControlChip key={k} C={C} active={show[k]} onClick={() => toggle(k)}>{l}</ControlChip>
            ))}
          </div>
          {/* Row 2: Chart type + Period + Drawing tools + Settings */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <ControlChip C={C} active={activeChartType === "line"} onClick={() => onChartTypeChange?.("line")}>{t("common.line")}</ControlChip>
            <ControlChip C={C} active={activeChartType === "candles"} onClick={() => onChartTypeChange?.("candles")}>{t("common.candles")}</ControlChip>
            {onReanalyze && (
              <>
                <span style={{ width: 1, height: 18, background: C.ruleFaint, margin: "0 2px" }} />
                {[["1d","1D"],["5d","5D"],["1mo","1M"],["3mo","3M"],["6mo","6M"],["1y","1Y"],["2y","2Y"]].map(([v,l]) => (
                  <ControlChip key={v} C={C} active={(period || "1y") === v} onClick={() => onReanalyze(ticker, v, v === "1d" || v === "5d" ? "5m" : "1d")}>{l}</ControlChip>
                ))}
              </>
            )}
            <span style={{ width: 1, height: 18, background: C.ruleFaint, margin: "0 4px" }} />
            {/* Drawing tools */}
            <button onClick={() => { setDrawingMode(drawingMode === "hline" ? null : "hline"); setMeasureStart(null); setMeasureEnd(null); }} style={toolBtn(drawingMode === "hline")} title="Horizontal Line">
              ─ Line
            </button>
            <button onClick={() => { setDrawingMode(drawingMode === "measure" ? null : "measure"); setMeasureStart(null); setMeasureEnd(null); }} style={toolBtn(drawingMode === "measure")} title="Measure Tool">
              📏 Measure
            </button>
            <button onClick={() => setShowSettings(p => !p)} style={toolBtn(showSettings)} title="Chart Settings">
              ⚙
            </button>
            <button onClick={() => setShowCompare(p => !p)} style={toolBtn(showCompare)} title="Compare Ticker">
              Compare
            </button>
          </div>
          {/* Drawing mode hint */}
          {drawingMode && (
            <div style={{ fontSize: 10, color: C.accent, fontFamily: "var(--body)", fontWeight: 600 }}>
              {drawingMode === "hline" ? "Click on chart to place horizontal line" : "Click start point, then end point to measure"}
              <button onClick={() => { setDrawingMode(null); setMeasureStart(null); setMeasureEnd(null); }} style={{ marginLeft: 8, background: "none", border: "none", color: C.down, cursor: "pointer", fontSize: 10, fontWeight: 700 }}>Cancel</button>
            </div>
          )}
          {/* Measure result */}
          {measureInfo && (
            <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: C.ink, padding: "6px 10px", background: C.warmWhite, border: `1px solid ${C.rule}`, display: "flex", gap: 16, alignItems: "center" }}>
              <span>From: ${measureInfo.from.toFixed(2)}</span>
              <span>To: ${measureInfo.to.toFixed(2)}</span>
              <span style={{ color: measureInfo.diff >= 0 ? C.up : C.down, fontWeight: 700 }}>
                {measureInfo.diff >= 0 ? "+" : ""}{measureInfo.diff.toFixed(2)} ({measureInfo.pct >= 0 ? "+" : ""}{measureInfo.pct.toFixed(2)}%)
              </span>
              <button onClick={() => { setMeasureStart(null); setMeasureEnd(null); }} style={{ background: "none", border: "none", color: C.inkMuted, cursor: "pointer", fontSize: 10 }}>Clear</button>
            </div>
          )}
        </div>
      </HelpWrap>

      {/* ── Settings Panel ─────────────────────── */}
      {showSettings && (
        <div style={{ padding: "12px 16px", background: C.warmWhite, border: `1px solid ${C.rule}`, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "var(--body)", color: C.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={settings.grid} onChange={() => setSettings(s => ({ ...s, grid: !s.grid }))} />
            Grid Lines
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "var(--body)", color: C.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={settings.logScale} onChange={() => setSettings(s => ({ ...s, logScale: !s.logScale }))} />
            Log Scale
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "var(--body)", color: C.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={settings.crosshair} onChange={() => setSettings(s => ({ ...s, crosshair: !s.crosshair }))} />
            Crosshair
          </label>
          {hLines.length > 0 && (
            <button onClick={() => setHLines([])} style={{ ...toolBtn(false), fontSize: 10 }}>
              Clear Lines ({hLines.length})
            </button>
          )}
        </div>
      )}

      {/* ── Indicator Panel ────────────────────── */}
      {showIndicatorPanel && (
        <div style={{ padding: "12px 16px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
          <input
            type="text"
            placeholder="Search indicators..."
            value={indicatorSearch}
            onChange={e => setIndicatorSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.rule}`, background: C.cream, color: C.ink, fontSize: 12, fontFamily: "var(--body)", marginBottom: 10, outline: "none" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
            {filteredIndicators.map(ind => (
              <button
                key={ind.key}
                onClick={() => toggle(ind.key)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", border: `1px solid ${show[ind.key] ? C.ink : C.rule}`,
                  background: show[ind.key] ? `${C.ink}11` : "transparent",
                  color: C.ink, fontSize: 11, fontFamily: "var(--body)", cursor: "pointer",
                }}
              >
                <span>{ind.label}</span>
                <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)" }}>{ind.group}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Compare Ticker Input ───────────────── */}
      {showCompare && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
          <span style={{ fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted }}>Compare with:</span>
          <input
            type="text"
            placeholder="e.g. SPY"
            value={compareTicker}
            onChange={e => setCompareTicker(e.target.value.toUpperCase())}
            style={{ padding: "4px 8px", border: `1px solid ${C.rule}`, background: C.cream, color: C.ink, fontSize: 12, fontFamily: "var(--mono)", width: 80, outline: "none" }}
            onKeyDown={e => {
              if (e.key === "Enter" && compareTicker && onReanalyze) {
                setCompareData({ ticker: compareTicker, loading: true });
              }
            }}
          />
          {compareData && (
            <button onClick={() => { setCompareData(null); setCompareTicker(""); }} style={{ ...toolBtn(false), fontSize: 10 }}>
              Remove
            </button>
          )}
          <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)" }}>Press Enter to overlay</span>
        </div>
      )}

      {/* ── Main Price Chart ───────────────────── */}
      <Section title={t("charts.fullPeriod", { ticker })} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("price")}>{t("common.expand")}</button>}>
        <div ref={chartRef}>
          <ResponsiveContainer width="100%" height={h}>
            <ComposedChart data={enriched} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={handleChartClick}>
              {settings.grid && <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />}
              <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={Math.floor(enriched.length / 12)} />
              <YAxis
                domain={["auto", "auto"]}
                scale={settings.logScale ? "log" : "auto"}
                tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }}
                axisLine={false} tickLine={false} width={55}
              />
              <Tooltip
                contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                cursor={settings.crosshair ? { stroke: C.inkFaint, strokeDasharray: "3 3" } : false}
              />

              {/* Bollinger Bands */}
              {show.bb && <>
                <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" isAnimationActive={false} />
                <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" isAnimationActive={false} />
                <Line dataKey="bm" stroke={C.inkFaint} dot={false} strokeWidth={1} opacity={0.4} isAnimationActive={false} />
              </>}

              {/* SMA */}
              {show.sma && <>
                <Line dataKey="s20" stroke={C.accent} dot={false} strokeWidth={1} isAnimationActive={false} name="SMA 20" />
                <Line dataKey="s50" stroke={C.chart4} dot={false} strokeWidth={1} isAnimationActive={false} name="SMA 50" />
                <Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} isAnimationActive={false} name="SMA 200" />
              </>}

              {/* EMA */}
              {show.ema && <>
                <Line dataKey="ema12" stroke="#F59E0B" dot={false} strokeWidth={1} isAnimationActive={false} name="EMA 12" />
                <Line dataKey="ema26" stroke="#8B5CF6" dot={false} strokeWidth={1} isAnimationActive={false} name="EMA 26" />
              </>}

              {/* VWAP */}
              {show.vwap && (
                <Line dataKey="vwap" stroke="#06B6D4" dot={false} strokeWidth={1.5} strokeDasharray="6 3" isAnimationActive={false} name="VWAP" />
              )}

              {/* Horizontal lines (drawing tool) */}
              {hLines.map(hl => (
                <ReferenceLine key={hl.id} y={hl.price} stroke={hl.color} strokeDasharray="4 2" label={{ value: `$${hl.price.toFixed(2)}`, position: "right", fill: hl.color, fontSize: 9, fontFamily: "var(--mono)" }} />
              ))}

              {/* Measure lines */}
              {measureStart && (
                <ReferenceLine y={measureStart.price} stroke={C.hold} strokeDasharray="2 2" />
              )}
              {measureEnd && (
                <ReferenceLine y={measureEnd.price} stroke={C.hold} strokeDasharray="2 2" />
              )}

              {/* Price line or candlesticks */}
              {activeChartType === "candles" ? <Customized component={CandlestickSeries} /> : <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive={animatePriceLine} animationDuration={CHART_ANIM_MS} name="Close" />}

              <Brush
                dataKey="n"
                height={18}
                stroke={C.rule}
                fill={C.warmWhite}
                travellerWidth={7}
                startIndex={brushRange.start ?? 0}
                endIndex={brushRange.end ?? Math.max(0, enriched.length - 1)}
                onChange={(r) => {
                  if (!r || r.startIndex == null || r.endIndex == null) return;
                  const max = Math.max(0, enriched.length - 1);
                  let start = Math.max(0, Math.min(r.startIndex, max));
                  let end = Math.max(0, Math.min(r.endIndex, max));
                  if (end < start) [start, end] = [end, start];
                  setBrushRange(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkFaint }}>
            {show.sma && <>
              <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.accent, marginRight: 4 }} />SMA 20</span>
              <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.chart4, marginRight: 4 }} />SMA 50</span>
              <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.down + "66", marginRight: 4 }} />SMA 200</span>
            </>}
            {show.ema && <>
              <span><span style={{ display: "inline-block", width: 12, height: 2, background: "#F59E0B", marginRight: 4 }} />EMA 12</span>
              <span><span style={{ display: "inline-block", width: 12, height: 2, background: "#8B5CF6", marginRight: 4 }} />EMA 26</span>
            </>}
            {show.vwap && <span><span style={{ display: "inline-block", width: 12, height: 2, background: "#06B6D4", marginRight: 4, borderBottom: "1px dashed #06B6D4" }} />VWAP</span>}
            {show.bb && <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.inkFaint, marginRight: 4, borderBottom: "1px dashed " + C.inkFaint }} />Bollinger</span>}
          </div>
        </div>
      </Section>

      {/* ── Volume ──────────────────────────────── */}
      {show.vol && (
        <LazySection minHeight={120}>
          <Section title={t("charts.volumeTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("volume")}>{t("common.expand")}</button>}>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={enriched} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="n" hide /><YAxis hide />
                <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </LazySection>
      )}

      {/* ── Technical Indicator Panels ──────────── */}
      <LazySection minHeight={180}>
        <div style={{ display: "grid", gridTemplateColumns: [show.rsi, show.macd, show.stoch, show.atr].filter(Boolean).length > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
          {show.rsi && (
            <Section title={t("charts.rsiTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("rsi")}>{t("common.expand")}</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={enriched} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  {settings.grid && <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />}
                  <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[30, 70]} axisLine={false} tickLine={false} width={30} />
                  <ReferenceLine y={70} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
          {show.macd && (
            <Section title={t("charts.macdTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("macd")}>{t("common.expand")}</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <ComposedChart data={enriched} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  {settings.grid && <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />}
                  <XAxis dataKey="n" hide /><YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={0} stroke={C.rule} />
                  <Bar dataKey="mh" fill={C.inkSoft + "20"} stroke={C.inkSoft + "40"} strokeWidth={0.5} isAnimationActive={false} />
                  <Line dataKey="macd" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line dataKey="ms" stroke={C.accent} dot={false} strokeWidth={1} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Section>
          )}
          {show.stoch && (
            <Section title={t("charts.stochTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("stoch")}>{t("common.expand")}</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={enriched} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  {settings.grid && <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />}
                  <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={30} />
                  <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
          {show.atr && (
            <Section title="ATR (14)" actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("price")}>{t("common.expand")}</button>}>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={enriched} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  {settings.grid && <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />}
                  <XAxis dataKey="n" hide />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="atr" stroke="#F97316" dot={false} strokeWidth={1.5} isAnimationActive={false} name="ATR" />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}
        </div>
      </LazySection>

      {/* ── Expanded Modal ──────────────────────── */}
      {expanded && (
        <ExpandedChartModal
          title={expanded.title}
          mode={expanded.mode}
          data={enriched}
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


export default ChartsTab;
