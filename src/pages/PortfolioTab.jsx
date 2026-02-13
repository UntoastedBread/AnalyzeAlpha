import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  UIButton, ControlChip, TabGroup, DataTable, MetricCard, EmptyState,
} from "../components/ui/primitives";
import BacktestTab from "./BacktestTab";

const PIE_COLORS = ["#4A90D9", "#E8913A", "#50B87A", "#8B6BB5", "#D4534E", "#6DBFB8", "#7A8B99", "#E06B9F"];

const SUB_TABS = [
  { key: "holdings", label: "Holdings" },
  { key: "paper-trading", label: "Paper Trading" },
  { key: "backtesting", label: "Backtesting" },
];

const inputStyle = (C) => ({
  background: "transparent",
  border: `1px solid ${C.rule}`,
  color: C.ink,
  fontSize: 12,
  fontFamily: "var(--mono)",
  padding: "8px 12px",
  outline: "none",
});

function PortfolioTab({
  deps,
  viewport,
  portfolio,
  onPortfolioChange,
  paperPortfolio,
  onPaperPortfolioChange,
  onAnalyze,
}) {
  const {
    useI18n,
    C,
    fetchQuickQuote,
    fmt,
    fmtPct,
    fmtMoney,
    Section,
    recColor,
    LazySection,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);

  const [subTab, setSubTab] = useState("holdings");
  const [livePrices, setLivePrices] = useState({});
  const [tickerInput, setTickerInput] = useState("");
  const [sharesInput, setSharesInput] = useState("");
  const [costInput, setCostInput] = useState("");

  // Paper trading state
  const [paperTicker, setPaperTicker] = useState("");
  const [paperAction, setPaperAction] = useState("BUY");
  const [paperShares, setPaperShares] = useState("");
  const [paperQuote, setPaperQuote] = useState(null);
  const [tradeError, setTradeError] = useState("");

  const holdings = portfolio?.holdings || [];
  const paper = paperPortfolio || { cash: 100000, positions: [], history: [], equityCurve: [{ date: new Date().toISOString().slice(0, 10), value: 100000 }] };

  // ── fetch live prices for all holdings ──────────────────
  const fetchPrices = useCallback(async (tickers) => {
    if (!tickers.length) return;
    const results = await Promise.allSettled(tickers.map((tk) => fetchQuickQuote(tk)));
    const next = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        next[tickers[i]] = { price: r.value.price, change: r.value.change, changePct: r.value.changePct };
      }
    });
    setLivePrices((prev) => ({ ...prev, ...next }));
  }, [fetchQuickQuote]);

  const allTickers = useMemo(() => {
    const set = new Set(holdings.map((h) => h.ticker));
    paper.positions.forEach((p) => set.add(p.ticker));
    return [...set];
  }, [holdings, paper.positions]);

  useEffect(() => {
    fetchPrices(allTickers);
    const id = setInterval(() => fetchPrices(allTickers), 30000);
    return () => clearInterval(id);
  }, [allTickers, fetchPrices]);

  // ── fetch paper ticker quote on input ───────────────────
  const paperTickerTimeout = useRef(null);
  useEffect(() => {
    if (!paperTicker) { setPaperQuote(null); return; }
    clearTimeout(paperTickerTimeout.current);
    paperTickerTimeout.current = setTimeout(async () => {
      try {
        const q = await fetchQuickQuote(paperTicker.toUpperCase());
        setPaperQuote(q);
      } catch { setPaperQuote(null); }
    }, 400);
    return () => clearTimeout(paperTickerTimeout.current);
  }, [paperTicker, fetchQuickQuote]);

  // ── holdings calculations ───────────────────────────────
  const holdingsData = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    const rows = holdings.map((h) => {
      const lp = livePrices[h.ticker];
      const currentPrice = lp?.price || 0;
      const changePct = lp?.changePct || 0;
      const marketValue = currentPrice * h.shares;
      const cost = h.costBasis * h.shares;
      const pnl = marketValue - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      totalValue += marketValue;
      totalCost += cost;
      return { ...h, currentPrice, changePct, marketValue, cost, pnl, pnlPct, _key: h.ticker };
    });
    const enriched = rows.map((r) => ({
      ...r,
      weight: totalValue > 0 ? (r.marketValue / totalValue) * 100 : 0,
    }));
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const dayChange = rows.reduce((sum, r) => sum + (r.changePct || 0) * (r.marketValue / (totalValue || 1)), 0);
    return { rows: enriched, totalValue, totalCost, totalPnl, totalPnlPct, dayChange };
  }, [holdings, livePrices]);

  // ── paper portfolio calculations ────────────────────────
  const paperData = useMemo(() => {
    let portfolioValue = 0;
    const positions = paper.positions.map((p) => {
      const lp = livePrices[p.ticker];
      const currentPrice = lp?.price || 0;
      const marketValue = currentPrice * p.shares;
      const cost = p.avgCost * p.shares;
      const pnl = marketValue - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      portfolioValue += marketValue;
      return { ...p, currentPrice, marketValue, pnl, pnlPct, _key: p.ticker };
    });
    const totalAccountValue = paper.cash + portfolioValue;
    const initialValue = 100000;
    const totalPnlPct = ((totalAccountValue - initialValue) / initialValue) * 100;
    return { positions, portfolioValue, totalAccountValue, totalPnlPct };
  }, [paper, livePrices]);

  // ── add holding ─────────────────────────────────────────
  const addHolding = () => {
    const tk = tickerInput.trim().toUpperCase();
    const shares = parseFloat(sharesInput);
    const costBasis = parseFloat(costInput);
    if (!tk || Number.isNaN(shares) || shares <= 0 || Number.isNaN(costBasis) || costBasis <= 0) return;
    const existing = holdings.find((h) => h.ticker === tk);
    let next;
    if (existing) {
      const totalShares = existing.shares + shares;
      const totalCost = existing.shares * existing.costBasis + shares * costBasis;
      const avgCost = totalCost / totalShares;
      next = holdings.map((h) => h.ticker === tk ? { ...h, shares: totalShares, costBasis: parseFloat(avgCost.toFixed(2)) } : h);
    } else {
      next = [...holdings, { ticker: tk, shares, costBasis, addedAt: new Date().toISOString() }];
    }
    onPortfolioChange?.({ ...portfolio, holdings: next });
    setTickerInput("");
    setSharesInput("");
    setCostInput("");
    fetchPrices([tk]);
  };

  const removeHolding = (ticker) => {
    const next = holdings.filter((h) => h.ticker !== ticker);
    onPortfolioChange?.({ ...portfolio, holdings: next });
  };

  // ── execute paper trade ─────────────────────────────────
  const executeTrade = () => {
    setTradeError("");
    const tk = paperTicker.trim().toUpperCase();
    const shares = parseFloat(paperShares);
    const price = paperQuote?.price;
    if (!tk || Number.isNaN(shares) || shares <= 0 || !price) {
      setTradeError(t("portfolio.invalidTrade"));
      return;
    }

    let nextCash = paper.cash;
    let nextPositions = [...paper.positions];
    const total = price * shares;

    if (paperAction === "BUY") {
      if (total > nextCash) { setTradeError(t("portfolio.insufficientCash")); return; }
      nextCash -= total;
      const existing = nextPositions.find((p) => p.ticker === tk);
      if (existing) {
        const newShares = existing.shares + shares;
        const newAvgCost = (existing.avgCost * existing.shares + price * shares) / newShares;
        nextPositions = nextPositions.map((p) => p.ticker === tk ? { ...p, shares: newShares, avgCost: parseFloat(newAvgCost.toFixed(2)) } : p);
      } else {
        nextPositions.push({ ticker: tk, shares, avgCost: parseFloat(price.toFixed(2)) });
      }
    } else {
      const existing = nextPositions.find((p) => p.ticker === tk);
      if (!existing || existing.shares < shares) { setTradeError(t("portfolio.insufficientShares")); return; }
      nextCash += total;
      const remainingShares = existing.shares - shares;
      if (remainingShares === 0) {
        nextPositions = nextPositions.filter((p) => p.ticker !== tk);
      } else {
        nextPositions = nextPositions.map((p) => p.ticker === tk ? { ...p, shares: remainingShares } : p);
      }
    }

    const historyEntry = { date: new Date().toISOString(), type: paperAction, ticker: tk, shares, price };
    const nextHistory = [historyEntry, ...(paper.history || [])];

    // compute portfolio value for equity curve
    let posValue = 0;
    nextPositions.forEach((p) => {
      const lp = livePrices[p.ticker];
      posValue += (lp?.price || p.avgCost) * p.shares;
    });
    const equityEntry = { date: new Date().toISOString().slice(0, 10), value: parseFloat((nextCash + posValue).toFixed(2)) };
    const nextEquity = [...(paper.equityCurve || []), equityEntry];

    onPaperPortfolioChange?.({ cash: parseFloat(nextCash.toFixed(2)), positions: nextPositions, history: nextHistory, equityCurve: nextEquity });
    setPaperTicker("");
    setPaperShares("");
    setPaperQuote(null);
    fetchPrices([tk]);
  };

  // ── pie chart data ──────────────────────────────────────
  const pieData = useMemo(() => {
    return holdingsData.rows
      .filter((r) => r.marketValue > 0)
      .map((r) => ({ name: r.ticker, value: r.marketValue }));
  }, [holdingsData.rows]);

  // ── holdings table columns ──────────────────────────────
  const holdingsCols = useMemo(() => [
    { key: "ticker", label: t("portfolio.ticker"), align: "left", render: (v) => (
      <span onClick={() => onAnalyze?.(v)} style={{ fontWeight: 700, cursor: "pointer", color: C.ink, fontFamily: "var(--mono)" }}>{v}</span>
    )},
    { key: "shares", label: t("portfolio.shares") },
    { key: "costBasis", label: t("portfolio.costBasis"), render: (v) => `$${fmt(v)}` },
    { key: "currentPrice", label: t("portfolio.currentPrice"), render: (v) => v > 0 ? `$${fmt(v)}` : "\u2014" },
    { key: "marketValue", label: t("portfolio.marketValue"), render: (v) => v > 0 ? fmtMoney(v) : "\u2014" },
    { key: "pnl", label: t("portfolio.pnlDollar"), render: (v) => (
      <span style={{ color: v >= 0 ? C.up : C.down, fontWeight: 600 }}>{v >= 0 ? "+" : ""}{fmtMoney(v)}</span>
    )},
    { key: "pnlPct", label: t("portfolio.pnlPct"), render: (v) => (
      <span style={{ color: v >= 0 ? C.up : C.down, fontWeight: 600 }}>{v >= 0 ? "+" : ""}{fmtPct(v)}</span>
    )},
    { key: "weight", label: t("portfolio.weight"), render: (v) => fmtPct(v) },
    { key: "_remove", label: "", render: (_, row) => (
      <button onClick={() => removeHolding(row.ticker)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14, fontFamily: "var(--mono)" }}>{"\u00D7"}</button>
    )},
  ], [C, t, fmt, fmtPct, fmtMoney, onAnalyze]);

  // ── paper positions table columns ───────────────────────
  const paperPosCols = useMemo(() => [
    { key: "ticker", label: t("portfolio.ticker"), align: "left", render: (v) => (
      <span style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)" }}>{v}</span>
    )},
    { key: "shares", label: t("portfolio.shares") },
    { key: "avgCost", label: t("portfolio.avgCost"), render: (v) => `$${fmt(v)}` },
    { key: "currentPrice", label: t("portfolio.currentPrice"), render: (v) => v > 0 ? `$${fmt(v)}` : "\u2014" },
    { key: "marketValue", label: t("portfolio.marketValue"), render: (v) => v > 0 ? fmtMoney(v) : "\u2014" },
    { key: "pnl", label: t("portfolio.pnlDollar"), render: (v) => (
      <span style={{ color: v >= 0 ? C.up : C.down, fontWeight: 600 }}>{v >= 0 ? "+" : ""}{fmtMoney(v)}</span>
    )},
    { key: "pnlPct", label: t("portfolio.pnlPct"), render: (v) => (
      <span style={{ color: v >= 0 ? C.up : C.down, fontWeight: 600 }}>{v >= 0 ? "+" : ""}{fmtPct(v)}</span>
    )},
  ], [C, t, fmt, fmtPct, fmtMoney]);

  // ── trade history table columns ─────────────────────────
  const historyCols = useMemo(() => [
    { key: "date", label: t("portfolio.date"), align: "left", render: (v) => (
      <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{new Date(v).toLocaleDateString()}</span>
    )},
    { key: "type", label: t("portfolio.type"), render: (v) => (
      <span style={{ color: v === "BUY" ? C.up : C.down, fontWeight: 700, fontSize: 10, fontFamily: "var(--mono)" }}>{v}</span>
    )},
    { key: "ticker", label: t("portfolio.ticker"), render: (v) => (
      <span style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{v}</span>
    )},
    { key: "shares", label: t("portfolio.shares") },
    { key: "price", label: t("portfolio.price"), render: (v) => `$${fmt(v)}` },
    { key: "_total", label: t("portfolio.total"), render: (_, row) => fmtMoney(row.price * row.shares) },
  ], [C, t, fmt, fmtMoney]);

  // ── portfolio metrics ───────────────────────────────────
  const portfolioMetrics = useMemo(() => {
    if (!holdingsData.rows.length) return null;
    const largest = holdingsData.rows.reduce((max, r) => r.weight > max.weight ? r : max, holdingsData.rows[0]);
    const avgCost = holdingsData.totalCost / holdingsData.rows.reduce((s, r) => s + r.shares, 0) || 0;
    return { count: holdingsData.rows.length, largest: largest.ticker, avgCost };
  }, [holdingsData]);

  // ── render ──────────────────────────────────────────────
  const formRow = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 };
  const sectionGap = { marginBottom: 24 };
  const chartSize = isMobile ? 180 : 220;
  const innerR = isMobile ? 45 : 60;
  const outerR = isMobile ? 72 : 90;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabGroup C={C} tabs={SUB_TABS} active={subTab} onChange={setSubTab} />

      {/* ═══ HOLDINGS ═══ */}
      {subTab === "holdings" && (
        <div>
          {/* Add Holding Form */}
          <div style={formRow}>
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              placeholder={t("portfolio.tickerPlaceholder")}
              style={{ ...inputStyle(C), flex: isMobile ? "1 1 100%" : "0 0 120px" }}
              onKeyDown={(e) => e.key === "Enter" && addHolding()}
            />
            <input
              value={sharesInput}
              onChange={(e) => setSharesInput(e.target.value)}
              placeholder={t("portfolio.shares")}
              type="number"
              min="0"
              style={{ ...inputStyle(C), width: isMobile ? "100%" : 100 }}
            />
            <input
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder={t("portfolio.costBasisPerShare")}
              type="number"
              min="0"
              step="0.01"
              style={{ ...inputStyle(C), width: isMobile ? "100%" : 140 }}
            />
            <UIButton C={C} variant="primary" onClick={addHolding} style={{ minWidth: 80 }}>
              {t("portfolio.add")}
            </UIButton>
          </div>

          {holdings.length === 0 ? (
            <EmptyState
              C={C}
              title={t("portfolio.noHoldings")}
              message={t("portfolio.noHoldingsMsg")}
            />
          ) : (
            <>
              {/* Portfolio Summary */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, ...sectionGap }}>
                <MetricCard C={C} label={t("portfolio.totalValue")} value={fmtMoney(holdingsData.totalValue)} />
                <MetricCard
                  C={C}
                  label={t("portfolio.totalPnl")}
                  value={`${holdingsData.totalPnl >= 0 ? "+" : ""}${fmtMoney(holdingsData.totalPnl)}`}
                  change={holdingsData.totalPnlPct}
                />
                <MetricCard
                  C={C}
                  label={t("portfolio.totalPnlPct")}
                  value={`${holdingsData.totalPnlPct >= 0 ? "+" : ""}${fmtPct(holdingsData.totalPnlPct)}`}
                  change={holdingsData.totalPnlPct}
                />
                <MetricCard
                  C={C}
                  label={t("portfolio.dayChange")}
                  value={`${holdingsData.dayChange >= 0 ? "+" : ""}${fmtPct(holdingsData.dayChange)}`}
                  change={holdingsData.dayChange}
                />
              </div>

              {/* Holdings Table */}
              <Section title={t("portfolio.holdingsTable")} style={sectionGap}>
                <DataTable C={C} columns={holdingsCols} rows={holdingsData.rows} />
              </Section>

              {/* Allocation Chart + Metrics */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 24, ...sectionGap }}>
                {pieData.length > 0 && (
                  <Section title={t("portfolio.allocation")}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <PieChart width={chartSize} height={chartSize}>
                        <Pie
                          data={pieData}
                          cx={chartSize / 2}
                          cy={chartSize / 2}
                          innerRadius={innerR}
                          outerRadius={outerR}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                          formatter={(v) => [fmtMoney(v)]}
                        />
                      </PieChart>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12, justifyContent: "center" }}>
                        {pieData.map((d, i) => (
                          <span key={d.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>
                            <span style={{ width: 10, height: 10, background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 1 }} />
                            {d.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Section>
                )}

                {portfolioMetrics && (
                  <Section title={t("portfolio.metrics")}>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                        <span style={{ color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("portfolio.totalPositions")}</span>
                        <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12, color: C.ink }}>{portfolioMetrics.count}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                        <span style={{ color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("portfolio.largestPosition")}</span>
                        <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12, color: C.ink }}>{portfolioMetrics.largest}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                        <span style={{ color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("portfolio.avgCostBasis")}</span>
                        <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12, color: C.ink }}>${fmt(portfolioMetrics.avgCost)}</span>
                      </div>
                    </div>
                  </Section>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ PAPER TRADING ═══ */}
      {subTab === "paper-trading" && (
        <div>
          {/* Account Summary */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, ...sectionGap }}>
            <MetricCard C={C} label={t("portfolio.cashBalance")} value={fmtMoney(paper.cash)} />
            <MetricCard C={C} label={t("portfolio.portfolioValue")} value={fmtMoney(paperData.portfolioValue)} />
            <MetricCard C={C} label={t("portfolio.totalAccountValue")} value={fmtMoney(paperData.totalAccountValue)} />
            <MetricCard
              C={C}
              label={t("portfolio.totalPnlPct")}
              value={`${paperData.totalPnlPct >= 0 ? "+" : ""}${fmtPct(paperData.totalPnlPct)}`}
              change={paperData.totalPnlPct}
            />
          </div>

          {/* Trade Form */}
          <Section title={t("portfolio.executeTrade")} style={sectionGap}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <input
                value={paperTicker}
                onChange={(e) => setPaperTicker(e.target.value.toUpperCase())}
                placeholder={t("portfolio.tickerPlaceholder")}
                style={{ ...inputStyle(C), flex: isMobile ? "1 1 100%" : "0 0 120px" }}
              />
              <div style={{ display: "flex", gap: 0 }}>
                <ControlChip C={C} active={paperAction === "BUY"} onClick={() => setPaperAction("BUY")}>
                  {t("portfolio.buy")}
                </ControlChip>
                <ControlChip C={C} active={paperAction === "SELL"} onClick={() => setPaperAction("SELL")}>
                  {t("portfolio.sell")}
                </ControlChip>
              </div>
              <input
                value={paperShares}
                onChange={(e) => setPaperShares(e.target.value)}
                placeholder={t("portfolio.shares")}
                type="number"
                min="0"
                style={{ ...inputStyle(C), width: isMobile ? "100%" : 100 }}
              />
              <UIButton C={C} variant="primary" onClick={executeTrade} style={{ minWidth: 120 }}>
                {t("portfolio.executeTrade")}
              </UIButton>
            </div>
            {paperQuote && (
              <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: C.inkMuted, marginBottom: 4 }}>
                {paperQuote.ticker}: ${fmt(paperQuote.price)}
                <span style={{ color: paperQuote.changePct >= 0 ? C.up : C.down, marginLeft: 8 }}>
                  {paperQuote.changePct >= 0 ? "+" : ""}{fmtPct(paperQuote.changePct)}
                </span>
              </div>
            )}
            {tradeError && (
              <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: C.down, padding: "4px 0" }}>{tradeError}</div>
            )}
          </Section>

          {/* Positions */}
          {paper.positions.length === 0 ? (
            <EmptyState
              C={C}
              title={t("portfolio.noPositions")}
              message={t("portfolio.noPositionsMsg")}
              style={sectionGap}
            />
          ) : (
            <Section title={t("portfolio.positions")} style={sectionGap}>
              <DataTable C={C} columns={paperPosCols} rows={paperData.positions} />
            </Section>
          )}

          {/* Trade History */}
          {(paper.history || []).length > 0 && (
            <Section title={t("portfolio.tradeHistory")} style={sectionGap}>
              <DataTable
                C={C}
                columns={historyCols}
                rows={(paper.history || []).map((h, i) => ({
                  ...h,
                  _key: `${h.date}-${i}`,
                  _total: h.price * h.shares,
                }))}
              />
            </Section>
          )}

          {/* Performance Chart */}
          {(paper.equityCurve || []).length > 1 && (
            <LazySection minHeight={240}>
              <Section title={t("portfolio.performanceChart")}>
                <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
                  <LineChart data={paper.equityCurve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }}
                      axisLine={{ stroke: C.rule }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      tickFormatter={(v) => fmtMoney(v)}
                    />
                    <Tooltip
                      contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                      formatter={(v) => [fmtMoney(v), t("portfolio.accountValue")]}
                    />
                    <Line
                      dataKey="value"
                      stroke={C.ink}
                      dot={false}
                      strokeWidth={1.8}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Section>
            </LazySection>
          )}
        </div>
      )}

      {/* ═══ BACKTESTING ═══ */}
      {subTab === "backtesting" && (
        <BacktestTab deps={deps} viewport={viewport} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════

export default PortfolioTab;
