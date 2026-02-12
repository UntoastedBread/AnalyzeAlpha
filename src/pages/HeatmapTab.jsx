import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

function squarify(items, W, H) {
  if (!items.length) return [];
  const total = items.reduce((s, i) => s + i.size, 0);
  const scaled = items.map((i) => ({ ...i, area: (i.size / total) * W * H })).sort((a, b) => b.area - a.area);
  const rects = [];
  let rem = [...scaled];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;

  function worst(row, side) {
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    const rowW = rowArea / side;
    let mx = 0;
    for (const r of row) {
      const rh = r.area / rowW;
      const asp = Math.max(rowW / rh, rh / rowW);
      if (asp > mx) mx = asp;
    }
    return mx;
  }

  while (rem.length > 0) {
    const vert = w < h;
    const side = vert ? w : h;
    let row = [rem[0]];
    let rowArea = rem[0].area;
    for (let i = 1; i < rem.length; i++) {
      const nr = [...row, rem[i]];
      const na = rowArea + rem[i].area;
      if (worst(nr, side) <= worst(row, side)) {
        row = nr;
        rowArea = na;
      } else {
        break;
      }
    }
    const rowSize = rowArea / side;
    let off = 0;
    for (const item of row) {
      const itemSize = item.area / rowSize;
      rects.push({
        ...item,
        x: vert ? x + off : x,
        y: vert ? y : y + off,
        w: vert ? itemSize : rowSize,
        h: vert ? rowSize : itemSize,
      });
      off += itemSize;
    }
    if (vert) {
      y += rowSize;
      h -= rowSize;
    } else {
      x += rowSize;
      w -= rowSize;
    }
    rem = rem.slice(row.length);
  }
  return rects;
}

function sharpeToColor(s) {
  if (s > 1.5) return "#0D5F2C";
  if (s > 1) return "#1B6B3A";
  if (s > 0.5) return "#3D8B5A";
  if (s > 0) return "#8BAA7A";
  if (s > -0.5) return "#C4A05A";
  if (s > -1) return "#C47A5A";
  return "#9B1B1B";
}

function HeatmapPanel({ deps, viewport, indexName, universe }) {
  const {
    useI18n,
    C,
    useInView,
    fetchStockData,
    runAnalysis,
    labelFor,
    BrandMark,
    fmt,
    fmtPct,
    translateEnum,
    SECTOR_COLORS,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const [stocks, setStocks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(null);
  const [progress, setProgress] = useState("");
  const [viewRef, inView] = useInView("300px 0px");
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: isMobile ? 320 : 420 });

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
      <div ref={containerRef} style={{ position: "relative", width: "100%", height: isMobile ? 320 : 420, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
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

function HeatmapTab({ deps, viewport }) {
  const { useI18n, C, HEATMAP_INDEXES, HelpWrap } = deps;
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
        <HeatmapPanel deps={deps} viewport={viewport} key={name} indexName={name} universe={HEATMAP_INDEXES[name]} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPARISON TAB
// ═══════════════════════════════════════════════════════════
export default HeatmapTab;
