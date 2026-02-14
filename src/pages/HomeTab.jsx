import React, { useState, useEffect, useCallback, useRef } from "react";

function HomeTab({
  deps,
  viewport,
  onAnalyze,
  region = "Global",
  onRegionChange,
  greetingName,
  isDark = false,
  onToggleTheme,
}) {
  const {
    useI18n,
    C,
    MARKET_REGIONS,
    REGION_MOVERS,
    HEATMAP_UNIVERSE,
    DEFAULT_TRENDING,
    ASSET_SECTIONS,
    PORTFOLIO_TILE,
    FALLBACK_NEWS,
    fetchTickerStrip,
    fetchIntradayData,
    fetchMarketMovers,
    fetchQuickQuote,
    fetchRSSNews,
    labelFor,
    HelpWrap,
    TickerStrip,
    Section,
    NewsSection,
    PortfolioTileCard,
    MiniIntradayChart,
    LazySection,
    MoverColumn,
    AssetRow,
    MarketScorecardCard,
    CrossAssetCard,
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
  const [trending, setTrending] = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [agoText, setAgoText] = useState("");
  const [customizing, setCustomizing] = useState(false);
  const [widgets, setWidgets] = useState(() => {
    try {
      const saved = localStorage.getItem("aa_home_widgets_v1");
      return saved ? JSON.parse(saved) : { tickerStrip: true, indexes: true, movers: true, news: true, assetClasses: true, marketBrief: true, changelog: true, earningsCalendar: true, economicSnapshot: true };
    } catch { return { tickerStrip: true, indexes: true, movers: true, news: true, assetClasses: true, marketBrief: true, changelog: true, earningsCalendar: true, economicSnapshot: true }; }
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

  useEffect(() => {
    const cancelled = { current: false };

    loadRegionData(region, cancelled, true);
    loadMovers(region, cancelled);
    loadTrending(cancelled);

    const loadNews = async () => {
      try {
        const data = await fetchRSSNews();
        if (!cancelled.current) { setNews(data); setNewsLoading(false); }
      } catch { if (!cancelled.current) { setNews(FALLBACK_NEWS); setNewsLoading(false); } }
    };
    loadNews();

    return () => { cancelled.current = true; };
  }, [region, loadRegionData, loadMovers, loadTrending]);

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

  return (
    <div style={{ display: "grid", gap: isMobile ? 20 : 18, minWidth: 0 }}>
      {customizing && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
          {[
            { key: "tickerStrip", label: "Ticker Strip" },
            { key: "indexes", label: "Indexes" },
            { key: "movers", label: "Movers" },
            { key: "news", label: "News" },
            { key: "assetClasses", label: "Asset Classes" },
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
              }}
            >
              {w.label}
            </button>
          ))}
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
        <button
          type="button"
          onClick={onToggleTheme}
          className={`theme-toggle ${isDark ? "theme-toggle-dark" : "theme-toggle-light"}`}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span className="theme-icon sun" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <g stroke={C.accent} strokeWidth="1.6" strokeLinecap="round">
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
                <line x1="4.5" y1="4.5" x2="7.5" y2="7.5" />
                <line x1="16.5" y1="16.5" x2="19.5" y2="19.5" />
                <line x1="4.5" y1="19.5" x2="7.5" y2="16.5" />
                <line x1="16.5" y1="7.5" x2="19.5" y2="4.5" />
              </g>
              <circle cx="12" cy="12" r="3" fill={C.accent} />
            </svg>
          </span>
          <span className="theme-icon moon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path
                d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z"
                fill="none"
                stroke={C.accent}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <div style={{ fontSize: isMobile ? 18 : 24, fontFamily: "var(--display)", color: C.ink, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
          {greetingText}
        </div>
        <button
          onClick={() => setCustomizing(c => !c)}
          style={{ marginLeft: "auto", padding: "4px 10px", border: `1px solid ${C.rule}`, background: customizing ? C.ink : "transparent", color: customizing ? C.cream : C.inkMuted, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
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
            <PortfolioTileCard data={PORTFOLIO_TILE} />
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

      {/* Asset Class Sections */}
      {widgets.assetClasses && <LazySection minHeight={200}>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          {ASSET_SECTIONS.map(section => (
            <HelpWrap key={section.title} help={{ title: t("help.assetClasses.title"), body: t("help.assetClasses.body") }} block>
              <AssetRow section={section} onAnalyze={onAnalyze} />
            </HelpWrap>
          ))}
        </div>
      </LazySection>}

      {/* Economic Snapshot */}
      {widgets.economicSnapshot && (
        <LazySection minHeight={120}>
          <EconomicSnapshot C={C} t={t} isMobile={isMobile} Section={Section} />
        </LazySection>
      )}

      {/* Market Brief */}
      {widgets.marketBrief && <LazySection minHeight={220}>
        <Section
          title={t("home.marketBriefSection")}
          help={{ title: t("help.marketBrief.title"), body: t("help.marketBrief.body") }}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 14 : 16, alignItems: "start" }}>
            <HelpWrap help={{ title: t("help.marketScorecard.title"), body: t("help.marketScorecard.body") }} block>
              <MarketScorecardCard />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.crossAsset.title"), body: t("help.crossAsset.body") }} block>
              <CrossAssetCard />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.sectorPerformance.title"), body: t("help.sectorPerformance.body") }} block>
              <SectorPerformanceCard />
            </HelpWrap>
            <HelpWrap help={{ title: t("help.yieldCurve.title"), body: t("help.yieldCurve.body") }} block>
              <YieldCurveCard />
            </HelpWrap>
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

function EconomicSnapshot({ C, t, isMobile, Section }) {
  const now = new Date().toISOString().slice(0, 10);
  const upcoming = UPCOMING_EVENTS.filter(e => e.date >= now).slice(0, 4);
  const impactColor = (imp) => imp === "HIGH" ? C.down : imp === "MEDIUM" ? C.hold : C.inkMuted;

  return (
    <Section C={C} title="Economic Calendar">
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

export default HomeTab;
