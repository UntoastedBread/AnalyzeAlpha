import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Brush, Customized,
} from "recharts";
import { ControlChip } from "../components/ui/primitives";

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
  const [show, setShow] = useState({ sma: true, bb: true, vol: true, rsi: true, macd: false, stoch: false });
  const data = result?.data;
  const ticker = result?.ticker || "";
  const toggle = k => setShow(p => ({ ...p, [k]: !p[k] }));
  const activeChartType = chartType || "line";
  const [animatePriceLine, setAnimatePriceLine] = useState(true);
  const [brushRange, setBrushRange] = useState({ start: null, end: null });
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

  if (!result) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: C.inkMuted, fontFamily: "var(--display)", fontSize: 24 }}>{t("charts.runAnalysisFirst")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 18 : 16 }}>
      <HelpWrap help={{ title: t("help.chartsControls.title"), body: t("help.chartsControls.body") }} block>
        <div style={{ display: "grid", gap: 10, borderBottom: `1px solid ${C.rule}`, paddingBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {[
              ["sma", t("charts.movingAvg")],
              ["bb", t("charts.bollinger")],
              ["vol", t("charts.volume")],
              ["rsi", t("charts.rsi")],
              ["macd", t("charts.macd")],
              ["stoch", t("charts.stochastic")]
            ].map(([k, l]) => (
              <ControlChip key={k} C={C} active={show[k]} onClick={() => toggle(k)}>{l}</ControlChip>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.08em" }}>{t("charts.chart")}</span>
            <ControlChip C={C} active={activeChartType === "line"} onClick={() => onChartTypeChange?.("line")}>{t("common.line")}</ControlChip>
            <ControlChip C={C} active={activeChartType === "candles"} onClick={() => onChartTypeChange?.("candles")}>{t("common.candles")}</ControlChip>
            {onReanalyze && (
              <>
                <span style={{ marginLeft: 4, fontSize: 11, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.08em" }}>{t("charts.period")}</span>
                <select value={period || "1y"} onChange={e => onReanalyze(ticker, e.target.value, interval)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", color: C.inkMuted, fontSize: 11, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                  {[["1d","1D"],["5d","5D"],["1mo","1M"],["3mo","3M"],["6mo","6M"],["1y","1Y"],["2y","2Y"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
                <select value={interval || "1d"} onChange={e => onReanalyze(ticker, period, e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", color: C.inkMuted, fontSize: 11, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
                  {(["1d","5d"].includes(period) ? [["1m","1m"],["5m","5m"],["15m","15m"],["30m","30m"],["60m","1h"]] : period === "1mo" ? [["15m","15m"],["30m","30m"],["60m","1h"],["1d","1d"]] : [["1d","1d"]]).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </>
            )}
          </div>
        </div>
      </HelpWrap>
      <Section title={t("charts.fullPeriod", { ticker })} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("price")}>{t("common.expand")}</button>}>
        <ResponsiveContainer width="100%" height={h}>
          <ComposedChart data={cd} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
            <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={Math.floor(cd.length / 12)} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
            <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
            {show.bb && <><Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" isAnimationActive={false} /><Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" isAnimationActive={false} /><Line dataKey="bm" stroke={C.inkFaint} dot={false} strokeWidth={1} opacity={0.4} isAnimationActive={false} /></>}
            {show.sma && <><Line dataKey="s20" stroke={C.accent} dot={false} strokeWidth={1} isAnimationActive={false} /><Line dataKey="s50" stroke={C.chart4} dot={false} strokeWidth={1} isAnimationActive={false} /><Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} isAnimationActive={false} /></>}
            {activeChartType === "candles" ? <Customized component={CandlestickSeries} /> : <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive={animatePriceLine} animationDuration={CHART_ANIM_MS} />}
            <Brush
              dataKey="n"
              height={18}
              stroke={C.rule}
              fill={C.warmWhite}
              travellerWidth={7}
              startIndex={brushRange.start ?? 0}
              endIndex={brushRange.end ?? Math.max(0, cd.length - 1)}
              onChange={(r) => {
                if (!r || r.startIndex == null || r.endIndex == null) return;
                const max = Math.max(0, cd.length - 1);
                let start = Math.max(0, Math.min(r.startIndex, max));
                let end = Math.max(0, Math.min(r.endIndex, max));
                if (end < start) [start, end] = [end, start];
                setBrushRange(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
      {show.vol && (
        <LazySection minHeight={120}>
          <Section title={t("charts.volumeTitle")} actions={<button style={expandBtn} onClick={() => onExpandedModeChange?.("volume")}>{t("common.expand")}</button>}>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={cd} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="n" hide /><YAxis hide />
                <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} isAnimationActive={false} />
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
                  <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} isAnimationActive={false} />
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
                <LineChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={30} />
                  <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} isAnimationActive={false} />
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


export default ChartsTab;
