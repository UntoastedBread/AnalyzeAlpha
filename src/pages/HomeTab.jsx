import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Prediction Markets helpers (shared with MarketsTab) ───
function compactNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(0)}B`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(abs < 10_000 ? 1 : 0)}K`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function supportScore(m) {
  const yes = Number(m.probYes) || 0;
  const vol = Number(m.volume24h) || 0;
  const liq = Number(m.liquidity) || 0;
  const totalVol = Number(m.volumeTotal) || 0;
  return yes * Math.log10(1 + vol + liq * 0.5 + totalVol * 0.1);
}

function safeExternalHref(url, fallback) {
  const raw = String(url || "").trim();
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return fallback;
    return parsed.toString();
  } catch { return fallback; }
}

function HomeTab({
  deps,
  viewport,
  onAnalyze,
  region = "Global",
  onRegionChange,
  greetingName,
  portfolio,
  onOpenDestination,
}) {
  const {
    useI18n,
    C,
    MARKET_REGIONS,
    REGION_MOVERS,
    HEATMAP_UNIVERSE,
    ASSET_SECTIONS,
    DEFAULT_TRENDING,
    PORTFOLIO_TILE,
    FALLBACK_NEWS,
    fetchTickerStrip,
    fetchIntradayData,
    fetchMarketMovers,
    fetchQuickQuote,
    fetchRSSNews,
    fetchStockData,
    fetchPredictionMarkets,
    labelFor,
    HelpWrap,
    TickerStrip,
    Section,
    OpenActionButton,
    NewsSection,
    PortfolioTileCard,
    MiniIntradayChart,
    LazySection,
    MoverColumn,
    AssetRow,
    Sparkline,
    SectorPerformanceCard,
    YieldCurveCard,
    ChangelogBanner,
  } = deps;
  const { t, locale } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const isTablet = Boolean(viewport?.isTablet);
  const [indexPage, setIndexPage] = useState(0);
  const [stripData, setStripData] = useState([]);
  const [stripLoading, setStripLoading] = useState(true);
  const [charts, setCharts] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [movers, setMovers] = useState(null);
  const [moversLoading, setMoversLoading] = useState(true);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [portfolioTileData, setPortfolioTileData] = useState(PORTFOLIO_TILE);
  const [trending, setTrending] = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [agoText, setAgoText] = useState("");
  const [fearGreed, setFearGreed] = useState({ rsi: 50, spark: [], loading: true });
  const [predictionMarkets, setPredictionMarkets] = useState([]);
  const [predictionLoading, setPredictionLoading] = useState(true);
  const [customizing, setCustomizing] = useState(false);
  const [widgets, setWidgets] = useState(() => {
    try {
      const saved = localStorage.getItem("aa_home_widgets_v1");
      return saved ? JSON.parse(saved) : { tickerStrip: true, indexes: true, movers: true, news: true, fearGreed: true, predictionMarkets: true, marketBrief: true, changelog: true, earningsCalendar: true, economicSnapshot: true };
    } catch { return { tickerStrip: true, indexes: true, movers: true, news: true, fearGreed: true, predictionMarkets: true, marketBrief: true, changelog: true, earningsCalendar: true, economicSnapshot: true }; }
  });
  const toggleWidget = (key) => {
    setWidgets(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("aa_home_widgets_v1", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // "Updated Xs ago" counter
  useEffect(() => {
    if (!lastRefresh) return;
    const tick = () => {
      const sec = Math.round((Date.now() - lastRefresh) / 1000);
      setAgoText(sec < 60
        ? t("time.secondsAgo", { count: sec })
        : t("time.minutesAgo", { count: Math.floor(sec / 60) })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastRefresh]);

  const loadRegionData = useCallback(async (rgn, cancelled, skeleton) => {
    const cfg = MARKET_REGIONS[rgn];
    if (skeleton) { setStripLoading(true); setChartsLoading(true); }
    try {
      const data = await fetchTickerStrip(cfg.strip);
      if (!cancelled.current) { setStripData(data); setStripLoading(false); }
    } catch { if (!cancelled.current) setStripLoading(false); }
    try {
      const chartResults = await Promise.allSettled(cfg.charts.map(c => fetchIntradayData(c.symbol)));
      if (!cancelled.current) {
        setCharts(chartResults.map((r, i) => ({
          data: r.status === "fulfilled" ? r.value : null,
          label: cfg.charts[i].label,
        })));
        setChartsLoading(false);
        setLastRefresh(Date.now());
      }
    } catch { if (!cancelled.current) setChartsLoading(false); }
  }, []);

  const loadMovers = useCallback(async (rgn, cancelled) => {
    try {
      const universe = REGION_MOVERS[rgn] || HEATMAP_UNIVERSE;
      const data = await fetchMarketMovers(universe);
      if (!cancelled.current) { setMovers(data); setMoversLoading(false); }
    } catch { if (!cancelled.current) setMoversLoading(false); }
  }, []);

  const loadTrending = useCallback(async (cancelled) => {
    try {
      const results = await Promise.allSettled(DEFAULT_TRENDING.map(s => fetchQuickQuote(s.ticker)));
      if (!cancelled.current) {
        const stocks = DEFAULT_TRENDING.map((s, i) => {
          const r = results[i];
          if (r.status === "fulfilled") return { ...s, price: r.value.price, changePct: r.value.changePct, spark: r.value.spark, prevClose: r.value.prevClose, loaded: true };
          return { ...s, price: 0, changePct: 0, spark: [], loaded: false };
        }).filter(s => s.loaded);
        setTrending(stocks);
        setTrendingLoading(false);
      }
    } catch { if (!cancelled.current) setTrendingLoading(false); }
  }, []);

  const loadPortfolioTile = useCallback(async (cancelled) => {
    const holdings = (portfolio?.holdings || [])
      .filter((h) => h && h.ticker && Number(h.shares) > 0);
    if (!holdings.length) {
      if (!cancelled.current) {
        setPortfolioTileData({ value: 0, dayChangePct: 0, ytdPct: 0, cash: 0, risk: "LOW", top: [] });
      }
      return;
    }
    try {
      const quoteResults = await Promise.allSettled(
        holdings.map((h) => fetchQuickQuote(h.ticker))
      );
      if (cancelled.current) return;
      const rows = holdings.map((h, i) => {
        const quote = quoteResults[i].status === "fulfilled" ? quoteResults[i].value : null;
        const shares = Number(h.shares) || 0;
        const costBasis = Number(h.costBasis) || 0;
        const currentPrice = quote?.price > 0 ? quote.price : costBasis;
        const changePct = Number.isFinite(quote?.changePct) ? quote.changePct : 0;
        const marketValue = currentPrice * shares;
        const cost = costBasis * shares;
        return { ticker: h.ticker, marketValue, cost, changePct };
      });
      const totalValue = rows.reduce((sum, r) => sum + r.marketValue, 0);
      const totalCost = rows.reduce((sum, r) => sum + r.cost, 0);
      const weightedDay = rows.reduce((sum, r) => sum + (r.changePct || 0) * r.marketValue, 0);
      const dayChangePct = totalValue > 0 ? weightedDay / totalValue : 0;
      const ytdPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
      const sorted = [...rows].sort((a, b) => b.marketValue - a.marketValue);
      const top = sorted.slice(0, 5).map((r) => r.ticker);
      const topWeight = totalValue > 0 && sorted[0] ? sorted[0].marketValue / totalValue : 0;
      const risk = topWeight > 0.45 ? "HIGH" : topWeight > 0.25 ? "MEDIUM" : "LOW";
      setPortfolioTileData({
        value: totalValue,
        dayChangePct,
        ytdPct,
        cash: 0,
        risk,
        top,
      });
    } catch {
      if (!cancelled.current) {
        setPortfolioTileData(PORTFOLIO_TILE);
      }
    }
  }, [portfolio, fetchQuickQuote, PORTFOLIO_TILE]);

  useEffect(() => {
    const cancelled = { current: false };

    loadRegionData(region, cancelled, true);
    loadMovers(region, cancelled);
    loadTrending(cancelled);

    const loadFearGreed = async () => {
      try {
        const [quoteRes, stockRes] = await Promise.allSettled([
          fetchQuickQuote("BTC-USD"),
          fetchStockData("BTC-USD", "3mo"),
        ]);
        const spark = quoteRes.status === "fulfilled" ? (quoteRes.value.spark || []) : [];
        let rsi = 50;
        if (stockRes.status === "fulfilled" && stockRes.value.data) {
          const closes = stockRes.value.data.map(d => d.Close);
          if (closes.length > 15) {
            const period = 14;
            let gains = 0, losses = 0;
            for (let i = 1; i <= period; i++) {
              const diff = closes[i] - closes[i - 1];
              if (diff > 0) gains += diff; else losses -= diff;
            }
            let avgGain = gains / period, avgLoss = losses / period;
            for (let i = period + 1; i < closes.length; i++) {
              const diff = closes[i] - closes[i - 1];
              avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
              avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
            }
            rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
          }
        }
        if (!cancelled.current) setFearGreed({ rsi, spark, loading: false });
      } catch {
        if (!cancelled.current) setFearGreed({ rsi: 50, spark: [], loading: false });
      }
    };
    loadFearGreed();

    const loadNews = async () => {
      try {
        const data = await fetchRSSNews();
        if (!cancelled.current) { setNews(data); setNewsLoading(false); }
      } catch { if (!cancelled.current) { setNews(FALLBACK_NEWS); setNewsLoading(false); } }
    };
    loadNews();

    const loadPredictions = async () => {
      try {
        const data = await fetchPredictionMarkets();
        if (!cancelled.current && data?.items) {
          const sorted = [...data.items].sort((a, b) => supportScore(b) - supportScore(a));
          setPredictionMarkets(sorted.slice(0, 6));
          setPredictionLoading(false);
        }
      } catch { if (!cancelled.current) setPredictionLoading(false); }
    };
    loadPredictions();

    return () => { cancelled.current = true; };
  }, [region, loadRegionData, loadMovers, loadTrending]);

  useEffect(() => {
    const cancelled = { current: false };
    loadPortfolioTile(cancelled);
    const id = setInterval(() => loadPortfolioTile(cancelled), 60000);
    return () => { cancelled.current = true; clearInterval(id); };
  }, [loadPortfolioTile]);

  // Live tickers polling — refreshes only strip + charts every 30s (lightweight)
  useEffect(() => {
    const cancelled = { current: false };
    const poll = () => {
      loadRegionData(region, cancelled, false);
    };
    const id = setInterval(poll, 30000);
    return () => { cancelled.current = true; clearInterval(id); };
  }, [region, loadRegionData]);

  const handleRegionChange = (rgn) => {
    if (rgn === region) return;
    onRegionChange?.(rgn);
    setIndexPage(0);
    setCharts([]);
    setMovers(null);
    setMoversLoading(true);
  };

  const cfg = MARKET_REGIONS[region];
  const INDEXES_PER_PAGE = 3;
  const totalIndexPages = Math.max(1, Math.ceil(cfg.charts.length / INDEXES_PER_PAGE));
  const safeIndexPage = Math.min(indexPage, totalIndexPages - 1);
  const pageCharts = cfg.charts.slice(
    safeIndexPage * INDEXES_PER_PAGE,
    safeIndexPage * INDEXES_PER_PAGE + INDEXES_PER_PAGE
  );
  const indexActions = totalIndexPages > 1 ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => setIndexPage(p => Math.max(0, p - 1))}
        disabled={safeIndexPage === 0}
        style={{
          padding: "2px 8px",
          border: `1px solid ${C.rule}`,
          background: "transparent",
          color: safeIndexPage === 0 ? C.inkFaint : C.ink,
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10,
        }}
      >
        ←
      </button>
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint }}>
        {safeIndexPage + 1}/{totalIndexPages}
      </span>
      <button
        type="button"
        onClick={() => setIndexPage(p => Math.min(totalIndexPages - 1, p + 1))}
        disabled={safeIndexPage >= totalIndexPages - 1}
        style={{
          padding: "2px 8px",
          border: `1px solid ${C.rule}`,
          background: "transparent",
          color: safeIndexPage >= totalIndexPages - 1 ? C.inkFaint : C.ink,
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 10,
        }}
      >
        →
      </button>
    </div>
  ) : null;
  const regionTabStyle = (r) => ({
    padding: "6px 16px", border: `1px solid ${C.rule}`, borderRadius: 20,
    background: region === r ? C.ink : "transparent",
    color: region === r ? C.cream : C.inkMuted,
    fontSize: 11, fontFamily: "var(--body)", fontWeight: 600, cursor: "pointer",
    letterSpacing: "0.06em", transition: "all 0.15s",
  });

  const greetingVariantRef = useRef(Math.floor(Math.random() * 5));
  const dayPart = (() => {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 18) return "afternoon";
    if (h < 22) return "evening";
    return "night";
  })();
  const dayPartLabel = t(`day.${dayPart}`);
  const greetingPhrases = greetingName ? [
    t("greeting.goodDaypart", { dayPart: dayPartLabel }),
    t("greeting.hey"),
    t("greeting.welcomeBack"),
    t("greeting.niceToSeeYou"),
    t("greeting.hello"),
  ] : [
    t("greeting.goodDaypart", { dayPart: dayPartLabel }),
    t("greeting.marketBrief"),
    t("greeting.quickPulse"),
    t("greeting.snapshot"),
    t("greeting.todaysGlance"),
  ];
  const greetingBase = greetingPhrases[greetingVariantRef.current % greetingPhrases.length];
  const greetingText = greetingName ? `${greetingBase}, ${greetingName}` : greetingBase;
  const renderOpenAction = (onClick, label) => onClick
    ? <OpenActionButton onClick={onClick} label={label} />
    : null;
  const marketBriefTabBySection = {
    Cryptocurrencies: "crypto",
    Rates: "rates",
    Commodities: "commodities",
    Currencies: "currencies",
  };

  return (
    <div style={{ display: "grid", gap: isMobile ? 20 : 18, minWidth: 0 }}>
      {customizing && (
        <div style={{ padding: "12px 16px", border: `1px solid ${C.rule}`, background: C.warmWhite, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--body)", color: C.inkMuted }}>
            Toggle widgets
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              { key: "tickerStrip", label: "Ticker Strip" },
              { key: "indexes", label: "Indexes" },
              { key: "movers", label: "Movers" },
              { key: "news", label: "News" },
              { key: "fearGreed", label: "Fear & Greed" },
              { key: "predictionMarkets", label: "Polymarket" },
              { key: "marketBrief", label: "Market Brief" },
              { key: "earningsCalendar", label: "Earnings Calendar" },
              { key: "economicSnapshot", label: "Economic Snapshot" },
              { key: "changelog", label: "Changelog" },
            ].map(w => (
              <button
                key={w.key}
                onClick={() => toggleWidget(w.key)}
                style={{
                  padding: "6px 12px", border: `1px solid ${widgets[w.key] ? C.ink : C.rule}`,
                  background: widgets[w.key] ? C.ink : "transparent",
                  color: widgets[w.key] ? C.cream : C.inkMuted,
                  fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.06em",
                  display: "inline-flex", alignItems: "center", gap: 5, transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 11, lineHeight: 1 }}>{widgets[w.key] ? "✓" : "○"}</span>
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ticker Strip */}
      {widgets.tickerStrip && <HelpWrap help={{ title: t("help.tickerStrip.title"), body: t("help.tickerStrip.body") }} block>
        <TickerStrip data={stripData} loading={stripLoading} onAnalyze={onAnalyze} />
      </HelpWrap>}

      {/* Region Selector + Updated timestamp */}
      <HelpWrap help={{ title: t("help.region.title"), body: t("help.region.body") }} block>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {Object.keys(MARKET_REGIONS).map((r) => (
            <button key={r} onClick={() => handleRegionChange(r)} style={regionTabStyle(r)}>{labelFor(r, t)}</button>
          ))}
          {lastRefresh && (
            <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.04em" }}>
              {t("home.updated", { ago: agoText })}
            </span>
          )}
        </div>
      </HelpWrap>

      {/* Greeting */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px 14px", marginTop: 6, marginBottom: 6 }}>
        <div style={{ fontSize: isMobile ? 18 : 24, fontFamily: "var(--display)", color: C.ink, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
          {greetingText}
        </div>
        <button
          onClick={() => setCustomizing(c => !c)}
          style={{
            marginLeft: "auto", padding: "5px 10px", border: `1px solid ${customizing ? C.ink : C.rule}`,
            background: customizing ? C.ink : "transparent", color: customizing ? C.cream : C.inkMuted,
            fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase",
            display: "inline-flex", alignItems: "center", gap: 5,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="16" cy="12" r="2" fill="currentColor" /><circle cx="11" cy="18" r="2" fill="currentColor" />
          </svg>
          {customizing ? "Done" : "Customize"}
        </button>
      </div>

      {/* Headlines + Indexes */}
      <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.35fr) minmax(0, 0.65fr)", gap: isMobile ? 18 : 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: isMobile ? 18 : 16, minWidth: 0, overflow: "hidden" }}>
          {widgets.news && <Section
            title={t("home.marketNews")}
            help={{ title: t("help.marketNews.title"), body: t("help.marketNews.body") }}
          >
            <NewsSection news={news} loading={newsLoading} />
          </Section>}
          <HelpWrap help={{ title: t("help.portfolioSnapshot.title"), body: t("help.portfolioSnapshot.body") }} block>
            {portfolioTileData.value === 0 && !(portfolio?.holdings || []).some(h => h && h.ticker && Number(h.shares) > 0) ? (
              <div
                onClick={() => onOpenDestination?.({ tab: "portfolio" })}
                style={{
                  border: `1px solid ${C.rule}`, background: C.warmWhite, padding: "20px 20px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 16,
                }}
              >
                <div style={{ width: 44, height: 44, border: `2px dashed ${C.rule}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.inkMuted} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--body)", color: C.ink, marginBottom: 2 }}>Track your portfolio</div>
                  <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5 }}>Add holdings to see live P&L, sector allocation, and risk metrics.</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.inkFaint} strokeWidth="2" strokeLinecap="round" style={{ marginLeft: "auto", flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
              </div>
            ) : (
              <PortfolioTileCard
                data={portfolioTileData}
                onOpen={() => onOpenDestination?.({ tab: "portfolio" })}
              />
            )}
          </HelpWrap>
        </div>
        {widgets.indexes && <Section
          title={t("home.indexes")}
          actions={indexActions}
          style={{ minWidth: 0 }}
          help={{ title: t("help.indexes.title"), body: t("help.indexes.body") }}
        >
          <div key={safeIndexPage} style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, animation: "fadeIn 0.25s ease" }}>
            {pageCharts.map((c) => {
              const idx = cfg.charts.findIndex(x => x.symbol === c.symbol);
              return (
                <MiniIntradayChart
                  key={c.symbol}
                  data={charts[idx]?.data}
                  label={c.label}
                  loading={chartsLoading && !charts[idx]?.data}
                  onAnalyze={onAnalyze}
                  ticker={c.symbol}
                  compact
                />
              );
            })}
          </div>
        </Section>}
      </div>

      {/* Earnings Calendar */}
      {widgets.earningsCalendar && (
        <LazySection minHeight={120}>
          <EarningsCalendar C={C} t={t} isMobile={isMobile} Section={Section} onAnalyze={onAnalyze} />
        </LazySection>
      )}

      {/* Market Movers — 3 columns */}
      {widgets.movers && <LazySection minHeight={240}>
        <HelpWrap help={{ title: t("help.movers.title"), body: t("help.movers.body") }} block>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            <HelpWrap help={{ title: t("help.moverGainers.title"), body: t("help.moverGainers.body") }} block>
              <MoverColumn title={t("home.topGainers")} stocks={movers?.gainers} allStocks={movers?.gainers} loading={moversLoading} onAnalyze={onAnalyze} />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.moverLosers.title"), body: t("help.moverLosers.body") }} block>
              <MoverColumn title={t("home.topLosers")} stocks={movers?.losers} allStocks={movers?.losers} loading={moversLoading} onAnalyze={onAnalyze} />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.moverTrending.title"), body: t("help.moverTrending.body") }} block>
              <MoverColumn title={t("home.trendingStocks")} stocks={trending} allStocks={trending} loading={trendingLoading} onAnalyze={onAnalyze} />
            </HelpWrap>
          </div>
        </HelpWrap>
      </LazySection>}

      {/* Fear & Greed Index */}
      {widgets.fearGreed && (
        <FearGreedWidget C={C} t={t} data={fearGreed} Sparkline={Sparkline} />
      )}

      {/* Prediction Markets */}
      {widgets.predictionMarkets !== false && (
        <LazySection minHeight={160}>
          <PredictionMarketsWidget
            C={C}
            t={t}
            isMobile={isMobile}
            Section={Section}
            markets={predictionMarkets}
            loading={predictionLoading}
            openAction={renderOpenAction(
              () => onOpenDestination?.({ tab: "markets", subTab: "prediction" }),
              "Open Polymarket"
            )}
          />
        </LazySection>
      )}

      {/* Economic Snapshot */}
      {widgets.economicSnapshot && (
        <LazySection minHeight={120}>
          <EconomicSnapshot
            C={C}
            t={t}
            isMobile={isMobile}
            Section={Section}
            openAction={renderOpenAction(
              () => onOpenDestination?.({ tab: "markets", subTab: "economic", focusKey: "upcoming-events" }),
              "Open economic calendar"
            )}
          />
        </LazySection>
      )}

      {/* Market Brief */}
      {widgets.marketBrief && <LazySection minHeight={220}>
        <Section
          title={t("home.marketBriefSection")}
          help={{ title: t("help.marketBrief.title"), body: t("help.marketBrief.body") }}
        >
          <div style={{ display: "grid", gap: isMobile ? 14 : 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 14 : 16, alignItems: "start" }}>
              <HelpWrap help={{ title: t("help.sectorPerformance.title"), body: t("help.sectorPerformance.body") }} block>
                <SectorPerformanceCard onOpen={() => onOpenDestination?.({ tab: "markets", subTab: "sectors" })} />
              </HelpWrap>
              <HelpWrap help={{ title: t("help.yieldCurve.title"), body: t("help.yieldCurve.body") }} block>
                <YieldCurveCard onOpen={() => onOpenDestination?.({ tab: "markets", subTab: "economic" })} />
              </HelpWrap>
            </div>
            <div style={{ display: "grid", gap: 0 }}>
              {ASSET_SECTIONS.map((section) => {
                const marketTab = marketBriefTabBySection[section.title];
                return (
                  <AssetRow
                    key={section.title}
                    section={section}
                    onAnalyze={onAnalyze}
                    onOpen={marketTab ? () => onOpenDestination?.({ tab: "markets", subTab: marketTab }) : undefined}
                  />
                );
              })}
            </div>
          </div>
        </Section>
      </LazySection>}

      {/* Changelog Banner */}
      {widgets.changelog && <LazySection minHeight={120}>
        <HelpWrap help={{ title: t("help.changelog.title"), body: t("help.changelog.body") }} block>
          <ChangelogBanner />
        </HelpWrap>
      </LazySection>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FEAR & GREED INDEX (Home widget)
// ═══════════════════════════════════════════════════════════
function FearGreedWidget({ C, t, data, Sparkline }) {
  const { rsi, spark, loading } = data;
  const value = Math.max(0, Math.min(100, rsi));
  const emoji = value > 70 ? "\u{1F911}" : value > 55 ? "\u{1F60F}" : value >= 45 ? "\u{1F610}" : value >= 30 ? "\u{1F61F}" : "\u{1F631}";
  const label = value > 70 ? "Extreme Greed" : value > 55 ? "Greed" : value >= 45 ? "Neutral" : value >= 30 ? "Fear" : "Extreme Fear";
  const color = value > 55 ? C.up : value < 45 ? C.down : C.hold;
  const segments = [
    { c: "#e74c3c", l: "Extreme Fear" },
    { c: "#e67e22", l: "Fear" },
    { c: "#95a5a6", l: "Neutral" },
    { c: "#27ae60", l: "Greed" },
    { c: "#2ecc71", l: "Extreme Greed" },
  ];

  if (loading) {
    return (
      <div style={{ padding: 24, border: `1px solid ${C.rule}`, background: C.warmWhite, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>Loading Fear & Greed Index...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px", border: `1px solid ${C.rule}`, background: C.warmWhite }}>
      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--body)", color: C.inkMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
        Fear & Greed Index
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        {/* Emoji + label */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 100 }}>
          <div style={{ fontSize: 48, lineHeight: 1 }}>{emoji}</div>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--mono)", color, marginTop: 6 }}>{Math.round(value)}</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--body)", color, marginTop: 2 }}>{label}</div>
        </div>

        {/* Bar */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
            {segments.map((s, i) => (
              <div key={i} style={{ flex: 1, background: s.c }} />
            ))}
          </div>
          <div style={{ position: "relative", height: 14, marginTop: -2 }}>
            <div style={{
              position: "absolute",
              left: `${value}%`,
              transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderBottom: `6px solid ${C.ink}`,
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 8, fontFamily: "var(--body)", color: C.inkFaint }}>Fear</span>
            <span style={{ fontSize: 8, fontFamily: "var(--body)", color: C.inkFaint }}>Greed</span>
          </div>
        </div>

        {/* BTC Sparkline */}
        {spark.length > 5 && Sparkline && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 100 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: C.inkFaint, marginBottom: 4 }}>BTC-USD (90d)</div>
            <Sparkline data={spark} width={120} height={36} color={color} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 9, fontFamily: "var(--body)", color: C.inkFaint, marginTop: 12 }}>
        Based on BTC RSI (14-day) as a proxy for market sentiment
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EARNINGS CALENDAR (Home widget)
// ═══════════════════════════════════════════════════════════
const WATCHLIST_EARNINGS = [
  { ticker: "AAPL", name: "Apple", date: "2026-04-30", estEPS: "2.35", prevEPS: "2.18" },
  { ticker: "MSFT", name: "Microsoft", date: "2026-04-22", estEPS: "3.22", prevEPS: "3.03" },
  { ticker: "GOOGL", name: "Alphabet", date: "2026-04-29", estEPS: "2.01", prevEPS: "1.89" },
  { ticker: "AMZN", name: "Amazon", date: "2026-05-01", estEPS: "1.36", prevEPS: "1.17" },
  { ticker: "NVDA", name: "NVIDIA", date: "2026-05-28", estEPS: "0.88", prevEPS: "0.82" },
  { ticker: "META", name: "Meta", date: "2026-04-23", estEPS: "6.29", prevEPS: "5.85" },
  { ticker: "TSLA", name: "Tesla", date: "2026-04-22", estEPS: "0.73", prevEPS: "0.52" },
  { ticker: "JPM", name: "JPMorgan", date: "2026-04-11", estEPS: "4.61", prevEPS: "4.33" },
];

function EarningsCalendar({ C, t, isMobile, Section, onAnalyze }) {
  const now = new Date().toISOString().slice(0, 10);
  const upcoming = WATCHLIST_EARNINGS.filter(e => e.date >= now).sort((a, b) => a.date.localeCompare(b.date));
  const past = WATCHLIST_EARNINGS.filter(e => e.date < now).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Section C={C} title="Upcoming Earnings">
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {(upcoming.length > 0 ? upcoming : past.slice(0, 4)).map(e => {
          const daysUntil = Math.ceil((new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return (
            <div
              key={e.ticker}
              onClick={() => onAnalyze?.(e.ticker)}
              style={{ padding: "12px 14px", border: `1px solid ${C.ruleFaint}`, background: C.warmWhite, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", color: C.ink }}>{e.ticker}</span>
                {daysUntil > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", background: daysUntil <= 7 ? C.downBg : C.holdBg, color: daysUntil <= 7 ? C.down : C.hold, fontFamily: "var(--body)" }}>
                    {daysUntil}d
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 4 }}>{e.name}</div>
              <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)" }}>{e.date}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, fontFamily: "var(--mono)" }}>
                <span style={{ color: C.inkMuted }}>Est: ${e.estEPS}</span>
                <span style={{ color: C.inkFaint }}>Prev: ${e.prevEPS}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════
// ECONOMIC SNAPSHOT (Home widget)
// ═══════════════════════════════════════════════════════════
const UPCOMING_EVENTS = [
  { date: "2026-03-12", event: "CPI Report", impact: "HIGH" },
  { date: "2026-03-18", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-04-03", event: "Non-Farm Payrolls", impact: "HIGH" },
  { date: "2026-04-29", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-05-13", event: "CPI Report", impact: "HIGH" },
  { date: "2026-06-17", event: "FOMC Meeting", impact: "HIGH" },
  { date: "2026-07-01", event: "Non-Farm Payrolls", impact: "MEDIUM" },
];

function EconomicSnapshot({ C, t, isMobile, Section, openAction }) {
  const now = new Date().toISOString().slice(0, 10);
  const upcoming = UPCOMING_EVENTS.filter(e => e.date >= now).slice(0, 4);
  const impactColor = (imp) => imp === "HIGH" ? C.down : imp === "MEDIUM" ? C.hold : C.inkMuted;

  return (
    <Section C={C} title="Economic Calendar" actions={openAction}>
      <div style={{ display: "grid", gap: 6 }}>
        {upcoming.map((e, i) => {
          const daysUntil = Math.ceil((new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", border: `1px solid ${C.ruleFaint}`, background: i % 2 === 0 ? C.warmWhite : "transparent" }}>
              <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted, minWidth: 75 }}>{e.date}</span>
              <span style={{ flex: 1, fontSize: 11, fontFamily: "var(--body)", color: C.ink, fontWeight: 600 }}>{e.event}</span>
              <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", background: `${impactColor(e.impact)}22`, color: impactColor(e.impact), fontFamily: "var(--body)", letterSpacing: "0.08em" }}>{e.impact}</span>
              <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint, minWidth: 35, textAlign: "right" }}>{daysUntil > 0 ? `${daysUntil}d` : "Today"}</span>
            </div>
          );
        })}
        {upcoming.length === 0 && <div style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", padding: 12 }}>No upcoming events scheduled.</div>}
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════
// PREDICTION MARKETS (Home widget)
// ═══════════════════════════════════════════════════════════
const POLY_BLUE = "#2E5CFF";

function PredictionMarketsWidget({ C, t, isMobile, Section, markets, loading, openAction }) {
  if (loading) {
    return (
      <Section C={C} title="Polymarket" actions={openAction}>
        <div style={{ padding: 24, textAlign: "center", color: C.inkMuted, fontFamily: "var(--body)", fontSize: 11 }}>
          Loading markets...
        </div>
      </Section>
    );
  }

  if (!markets || markets.length === 0) return null;

  return (
    <Section C={C} title="Polymarket" actions={openAction}>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
        gap: 10,
      }}>
        {markets.map((market) => {
          const yesPct = Math.round((Number(market.probYes) || 0) * 100);
          const barColor = market.source === "Polymarket" ? POLY_BLUE : C.ink;
          const vol = Number(market.volume24h) || 0;
          const liq = Number(market.liquidity) || 0;
          return (
            <a
              key={market.id}
              href={safeExternalHref(market.url, "https://polymarket.com")}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                border: `1px solid ${C.rule}`,
                background: C.warmWhite,
                padding: "14px 14px",
                display: "grid",
                gap: 8,
                textDecoration: "none",
                color: "inherit",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = POLY_BLUE}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.rule}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {market.category || "General"}
                </span>
              </div>

              <div style={{ fontSize: 14, fontFamily: "var(--display)", color: C.ink, lineHeight: 1.3, fontWeight: 800 }}>
                {market.title}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 22, fontFamily: "var(--display)", color: C.ink, lineHeight: 1 }}>
                  {yesPct}%
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)" }}>
                  YES
                </span>
              </div>

              <div style={{ height: 6, border: `1px solid ${C.rule}`, background: C.paper, overflow: "hidden" }}>
                <div style={{ width: `${yesPct}%`, height: "100%", background: barColor }} />
              </div>

              <div style={{ display: "flex", gap: 10, fontSize: 10, color: C.inkMuted, fontFamily: "var(--mono)" }}>
                {vol > 0 && <span>${compactNumber(vol)} vol</span>}
                {liq > 0 && <span>${compactNumber(liq)} liq</span>}
              </div>
            </a>
          );
        })}
      </div>
    </Section>
  );
}

export default HomeTab;
