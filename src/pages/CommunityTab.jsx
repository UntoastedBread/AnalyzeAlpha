import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { UIButton, DataTable, EmptyState, ControlChip } from "../components/ui/primitives";

const SIMULATED_FEED = [
  { user: "QuantTrader42", ticker: "NVDA", action: "STRONG BUY", confidence: 87, time: Date.now() - 300000, message: "AI infrastructure spending accelerating. Data center revenue could double by next quarter." },
  { user: "AlphaSeeker", ticker: "AAPL", action: "BUY", confidence: 72, time: Date.now() - 900000, message: "Services segment growing faster than hardware. Ecosystem moat widening." },
  { user: "MarketOwl", ticker: "TSLA", action: "HOLD", confidence: 65, time: Date.now() - 1800000, message: "Valuation is stretched but autonomous driving progress is real. Wait for pullback." },
  { user: "DeepValue99", ticker: "MSFT", action: "BUY", confidence: 81, time: Date.now() - 3600000, message: "Azure growth re-accelerating. Copilot monetization starting to show in enterprise." },
  { user: "TechBull", ticker: "META", action: "STRONG BUY", confidence: 90, time: Date.now() - 7200000, message: "Ad revenue inflection point. Reels monetization gap closing fast with TikTok." },
  { user: "RiskManager", ticker: "JPM", action: "HOLD", confidence: 58, time: Date.now() - 10800000, message: "Strong balance sheet but net interest income peaking. Watch for credit quality." },
  { user: "SwingKing", ticker: "AMD", action: "BUY", confidence: 76, time: Date.now() - 14400000, message: "MI300 ramp on track. Server CPU market share gains continuing." },
  { user: "DividendHunter", ticker: "KO", action: "BUY", confidence: 69, time: Date.now() - 21600000, message: "61 years of dividend growth. Pricing power intact despite volume headwinds." },
];

const TRENDING = [
  { ticker: "NVDA", analyses: 142, sentiment: "BULLISH" },
  { ticker: "AAPL", analyses: 128, sentiment: "BULLISH" },
  { ticker: "TSLA", analyses: 89, sentiment: "MIXED" },
  { ticker: "META", analyses: 76, sentiment: "BULLISH" },
  { ticker: "AMZN", analyses: 65, sentiment: "BULLISH" },
];

const LEADERBOARD = [
  { rank: 1, user: "QuantTrader42", accuracy: 78, totalCalls: 156, streak: 8 },
  { rank: 2, user: "AlphaSeeker", accuracy: 75, totalCalls: 203, streak: 5 },
  { rank: 3, user: "DeepValue99", accuracy: 73, totalCalls: 187, streak: 12 },
  { rank: 4, user: "TechBull", accuracy: 71, totalCalls: 142, streak: 3 },
  { rank: 5, user: "MarketOwl", accuracy: 69, totalCalls: 98, streak: 6 },
];

const RANK_COLORS = { 1: "#D4A017", 2: "#B6B6B6", 3: "#CD7F32" };

// Deterministic avatar colors based on username
const AVATAR_COLORS = ["#4A90D9", "#E8913A", "#50B87A", "#8B6BB5", "#D4534E", "#6DBFB8", "#7A8B99", "#E06B9F", "#5B8C5A", "#C4A05A"];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTimeAgo(ts) {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function confidenceLabel(conf) {
  if (conf >= 85) return { text: "Very confident", color: "#1B5E20" };
  if (conf >= 70) return { text: "Confident", color: "#388E3C" };
  if (conf >= 55) return { text: "Somewhat confident", color: "#F9A825" };
  if (conf >= 40) return { text: "Uncertain", color: "#E65100" };
  return { text: "Not confident", color: "#C62828" };
}

// ═══════════════════════════════════════════════════════════
// GAME OF LIFE CANVAS
// ═══════════════════════════════════════════════════════════
function GameOfLifeCanvas({ C }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const COLS = 140, ROWS = 16, CELL = 8;
  const TICK_MS = 260;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;

    const grid = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => Math.random() < 0.32 ? 1 : 0)
    );
    const ages = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => grid[r][c] ? 1.0 : 0.0)
    );
    stateRef.current = { grid, ages, lastTick: performance.now() };

    function step() {
      const { grid: g, ages: a } = stateRef.current;
      const nextGrid = g.map((row, r) => row.map((cell, c) => {
        let neighbors = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = (r + dr + ROWS) % ROWS;
            const nc = (c + dc + COLS) % COLS;
            neighbors += g[nr][nc];
          }
        }
        if (cell && (neighbors === 2 || neighbors === 3)) return 1;
        if (!cell && neighbors === 3) return 1;
        return 0;
      }));
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (nextGrid[r][c] && !g[r][c]) a[r][c] = 0.05;
          else if (!nextGrid[r][c] && g[r][c]) a[r][c] = Math.max(a[r][c], 0.05);
        }
      }
      stateRef.current.grid = nextGrid;
      stateRef.current.lastTick = performance.now();
    }

    function draw() {
      const bgColor = C.warmWhite || C.cream || "#FAF8F5";
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const { grid: g, ages: a } = stateRef.current;
      const baseColor = C.up || "#2E7D32";
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const age = a[r][c];
          if (age > 0.01) {
            if (g[r][c]) {
              a[r][c] = Math.min(1, age + 0.05);
            } else {
              a[r][c] = Math.max(0, age - 0.04);
            }
            const alpha = Math.min(1, a[r][c]);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = baseColor;
            ctx.fillRect(c * CELL, r * CELL, CELL - 1, CELL - 1);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    let rafId;
    let tickAcc = 0;
    let lastFrame = performance.now();
    function loop(now) {
      const dt = now - lastFrame;
      lastFrame = now;
      tickAcc += dt;
      if (tickAcc >= TICK_MS) {
        step();
        tickAcc -= TICK_MS;
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }
    draw();
    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, [C]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════
// SENTIMENT VOTING WIDGET
// ═══════════════════════════════════════════════════════════
function SentimentVoting({ C }) {
  const [userVote, setUserVote] = useState(() => {
    try { return localStorage.getItem("aa_sentiment_vote") || null; } catch { return null; }
  });
  const [votes, setVotes] = useState(() => {
    try {
      const saved = localStorage.getItem("aa_sentiment_votes_v1");
      return saved ? JSON.parse(saved) : { bullish: 247, neutral: 89, bearish: 64 };
    } catch { return { bullish: 247, neutral: 89, bearish: 64 }; }
  });

  const handleVote = useCallback((sentiment) => {
    if (userVote === sentiment) return;
    setVotes(prev => {
      const next = { ...prev };
      if (userVote) next[userVote] = Math.max(0, next[userVote] - 1);
      next[sentiment] = (next[sentiment] || 0) + 1;
      try { localStorage.setItem("aa_sentiment_votes_v1", JSON.stringify(next)); } catch {}
      return next;
    });
    setUserVote(sentiment);
    try { localStorage.setItem("aa_sentiment_vote", sentiment); } catch {}
  }, [userVote]);

  const total = votes.bullish + votes.neutral + votes.bearish;
  const pctBull = total > 0 ? Math.round((votes.bullish / total) * 100) : 33;
  const pctNeutral = total > 0 ? Math.round((votes.neutral / total) * 100) : 34;
  const pctBear = total > 0 ? Math.round((votes.bearish / total) * 100) : 33;
  const dominant = pctBull >= pctBear && pctBull >= pctNeutral ? "Bullish" : pctBear >= pctBull && pctBear >= pctNeutral ? "Bearish" : "Neutral";
  const dominantColor = dominant === "Bullish" ? C.up : dominant === "Bearish" ? C.down : C.hold;
  const dominantEmoji = dominant === "Bullish" ? "\u{1F4C8}" : dominant === "Bearish" ? "\u{1F4C9}" : "\u26D6\uFE0F";

  const btnStyle = (key) => ({
    flex: 1,
    padding: "12px 8px",
    border: `2px solid ${userVote === key ? (key === "bullish" ? C.up : key === "bearish" ? C.down : C.hold) : C.rule}`,
    background: userVote === key ? (key === "bullish" ? C.upBg : key === "bearish" ? C.downBg : C.holdBg) : "transparent",
    color: key === "bullish" ? C.up : key === "bearish" ? C.down : C.hold,
    cursor: "pointer",
    fontFamily: "var(--body)",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    transition: "all 0.15s",
    opacity: userVote && userVote !== key ? 0.5 : 1,
  });

  return (
    <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 28 }}>{dominantEmoji}</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--body)", color: C.inkMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Community Sentiment
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--display)", color: dominantColor }}>
            {dominant}
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint }}>
          {total} votes
        </div>
      </div>

      {/* Vote buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={btnStyle("bullish")} onClick={() => handleVote("bullish")}>
          {userVote === "bullish" ? "\u2713 " : ""}Bullish
        </button>
        <button style={btnStyle("neutral")} onClick={() => handleVote("neutral")}>
          {userVote === "neutral" ? "\u2713 " : ""}Neutral
        </button>
        <button style={btnStyle("bearish")} onClick={() => handleVote("bearish")}>
          {userVote === "bearish" ? "\u2713 " : ""}Bearish
        </button>
      </div>

      {/* Results bar */}
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pctBull}%`, background: C.up, transition: "width 0.3s" }} />
        <div style={{ width: `${pctNeutral}%`, background: C.hold, transition: "width 0.3s" }} />
        <div style={{ width: `${pctBear}%`, background: C.down, transition: "width 0.3s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.up, fontWeight: 600 }}>{pctBull}% Bullish</span>
        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.hold, fontWeight: 600 }}>{pctNeutral}% Neutral</span>
        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.down, fontWeight: 600 }}>{pctBear}% Bearish</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMMUNITY TAB
// ═══════════════════════════════════════════════════════════
function CommunityTab({ deps, viewport, session, recentAnalyses, onAnalyze }) {
  const {
    useI18n,
    C,
    recColor,
    translateEnum,
    fmt,
    fmtPct,
    Section,
    LazySection,
    ProTag,
    BrandMark,
    Sparkline,
    fetchQuickQuote,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);

  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [trendingSparks, setTrendingSparks] = useState({});
  const [feedFilter, setFeedFilter] = useState("ALL");

  // Create post state
  const [showPostForm, setShowPostForm] = useState(false);
  const [postTicker, setPostTicker] = useState("");
  const [postAction, setPostAction] = useState("BUY");
  const [postConfidence, setPostConfidence] = useState(75);
  const [postMessage, setPostMessage] = useState("");
  const [localFeed, setLocalFeed] = useState(() => {
    try {
      const saved = localStorage.getItem("aa_community_posts_v1");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Fetch sparklines for trending tickers
  useEffect(() => {
    let cancelled = false;
    async function loadSparks() {
      const tickers = TRENDING.map(t => t.ticker);
      const results = await Promise.allSettled(tickers.map(t => fetchQuickQuote(t)));
      if (cancelled) return;
      const sparks = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value.spark) {
          sparks[tickers[i]] = { spark: r.value.spark, changePct: r.value.changePct };
        }
      });
      setTrendingSparks(sparks);
    }
    loadSparks();
    return () => { cancelled = true; };
  }, [fetchQuickQuote]);

  const handleSort = useCallback((col) => {
    if (sortCol === col) setSortDir((d) => -d);
    else { setSortCol(col); setSortDir(1); }
  }, [sortCol]);

  const handlePostSubmit = useCallback(() => {
    if (!postTicker.trim()) return;
    const post = {
      user: "You",
      ticker: postTicker.trim().toUpperCase(),
      action: postAction,
      confidence: postConfidence,
      time: Date.now(),
      message: postMessage.trim(),
      isLocal: true,
    };
    const next = [post, ...localFeed];
    setLocalFeed(next);
    try { localStorage.setItem("aa_community_posts_v1", JSON.stringify(next)); } catch {}
    setPostTicker("");
    setPostAction("BUY");
    setPostConfidence(75);
    setPostMessage("");
    setShowPostForm(false);
  }, [postTicker, postAction, postConfidence, postMessage, localFeed]);

  const allFeed = useMemo(() => {
    const combined = [...localFeed, ...SIMULATED_FEED];
    const sorted = combined.sort((a, b) => b.time - a.time);
    if (feedFilter === "ALL") return sorted;
    return sorted.filter(item => item.action.toUpperCase().includes(feedFilter));
  }, [localFeed, feedFilter]);

  const sentimentColor = useCallback((s) => {
    if (s === "BULLISH") return C.up;
    if (s === "BEARISH") return C.down;
    return C.hold;
  }, [C]);

  const leaderboardColumns = useMemo(() => [
    {
      key: "rank",
      label: t("community.rank"),
      align: "center",
      render: (v) => (
        <span style={{
          fontWeight: 700,
          fontSize: 13,
          fontFamily: "var(--display)",
          color: RANK_COLORS[v] || C.ink,
        }}>
          {v}
        </span>
      ),
    },
    {
      key: "user",
      label: t("community.analyst"),
      align: "left",
      render: (v) => (
        <span style={{ fontWeight: 600, fontFamily: "var(--body)", fontSize: 11 }}>{v}</span>
      ),
    },
    {
      key: "accuracy",
      label: t("community.accuracy"),
      align: "right",
      render: (v) => (
        <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: C.ink }}>{v}%</span>
      ),
    },
    {
      key: "totalCalls",
      label: t("community.totalCalls"),
      align: "right",
      render: (v) => (
        <span style={{ fontFamily: "var(--mono)" }}>{v}</span>
      ),
    },
    {
      key: "streak",
      label: t("community.winStreak"),
      align: "right",
      render: (v) => (
        <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: v >= 8 ? C.up : C.ink }}>{v}</span>
      ),
    },
  ], [C, t]);

  const leaderboardRows = useMemo(() =>
    LEADERBOARD.map((r) => ({ ...r, _key: r.rank })),
  []);

  /* ------------------------------------------------------------------ */
  /* RENDER                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", position: "relative" }}>

      {/* ============ Trending + Leaderboard ============ */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 24,
        marginBottom: 24,
      }}>

        {/* ---- Trending Tickers with sparklines ---- */}
        <Section title={t("community.trendingTitle")}>
          <div style={{ display: "grid", gap: 0 }}>
            {TRENDING.map((item) => {
              const sparkData = trendingSparks[item.ticker];
              return (
                <div
                  key={item.ticker}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: `1px solid ${C.ruleFaint}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      onClick={() => onAnalyze && onAnalyze(item.ticker)}
                      style={{
                        fontSize: 12, fontWeight: 700,
                        fontFamily: "var(--mono)", color: C.ink,
                        cursor: "pointer", textDecoration: "underline",
                        textDecorationColor: C.ruleFaint,
                        textUnderlineOffset: 2,
                        minWidth: 44,
                      }}
                    >
                      {item.ticker}
                    </span>
                    <span style={{
                      fontSize: 10, color: C.inkMuted,
                      fontFamily: "var(--mono)",
                    }}>
                      {item.analyses} {t("community.analyses")}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {sparkData && sparkData.spark.length > 5 && Sparkline && (
                      <Sparkline
                        data={sparkData.spark}
                        width={60}
                        height={20}
                        color={sparkData.changePct >= 0 ? C.up : C.down}
                      />
                    )}
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      fontFamily: "var(--body)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: C.cream,
                      background: sentimentColor(item.sentiment),
                      padding: "3px 8px",
                    }}>
                      {item.sentiment}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ---- Top Analysts Leaderboard ---- */}
        <Section title={t("community.leaderboardTitle")}>
          <DataTable
            C={C}
            columns={leaderboardColumns}
            rows={leaderboardRows}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
            striped
          />
        </Section>
      </div>

      {/* ============ Sentiment Voting ============ */}
      <div style={{ marginBottom: 24 }}>
        <SentimentVoting C={C} />
      </div>

      {/* ============ New Post CTA ============ */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => setShowPostForm(o => !o)}
          style={{
            width: "100%",
            padding: "18px 24px",
            border: `2px solid ${C.ink}`,
            background: showPostForm ? C.warmWhite : C.ink,
            color: showPostForm ? C.ink : C.cream,
            fontSize: 16,
            fontWeight: 800,
            fontFamily: "var(--display)",
            cursor: "pointer",
            letterSpacing: "0.02em",
            transition: "all 0.15s",
          }}
        >
          {showPostForm ? "Close" : "\u270F\uFE0F  Share Your Analysis"}
        </button>
      </div>

      {/* ============ Post Form (expanded) ============ */}
      {showPostForm && (
        <div style={{ border: `1px solid ${C.rule}`, padding: 20, marginBottom: 24, background: C.warmWhite }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              value={postTicker}
              onChange={e => setPostTicker(e.target.value.toUpperCase())}
              placeholder={t("community.postTicker")}
              style={{ padding: "8px 12px", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontSize: 13, fontFamily: "var(--mono)", fontWeight: 600, outline: "none", width: 120 }}
            />
            <div style={{ display: "flex", gap: 0 }}>
              {["BUY", "SELL", "HOLD"].map(a => (
                <ControlChip key={a} C={C} active={postAction === a} onClick={() => setPostAction(a)}>{a}</ControlChip>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 4 }}>
              {t("community.postConfidence")}: {postConfidence}%
            </div>
            <input
              type="range" min="0" max="100" value={postConfidence}
              onChange={e => setPostConfidence(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
          <textarea
            value={postMessage}
            onChange={e => setPostMessage(e.target.value)}
            placeholder={t("community.messagePlaceholder")}
            rows={3}
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontSize: 12, fontFamily: "var(--body)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          />
          {postTicker && (
            <div style={{ border: `1px solid ${C.ruleFaint}`, padding: 12, marginTop: 10, fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted }}>
              <span style={{ fontWeight: 700 }}>{t("community.postPreview")}:</span>{" "}
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: C.ink }}>{postTicker}</span>{" "}
              <span style={{ color: recColor(postAction), fontWeight: 700 }}>{postAction}</span>{" "}
              ({postConfidence}%) {postMessage && `\u2014 "${postMessage}"`}
            </div>
          )}
          <UIButton C={C} variant="primary" onClick={handlePostSubmit} style={{ marginTop: 12, width: "100%", padding: "12px 0", fontSize: 13, fontWeight: 700 }} disabled={!postTicker.trim()}>
            {t("community.postSubmit")}
          </UIButton>
        </div>
      )}

      {/* ============ Community Feed ============ */}
      <Section title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{t("community.feedTitle")} <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.inkFaint, fontFamily: "var(--mono)", background: C.paper, padding: "2px 6px" }}>DEMO DATA</span></span>}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[["ALL", "All"], ["BUY", "Buy"], ["SELL", "Sell"], ["HOLD", "Hold"]].map(([key, label]) => (
            <ControlChip key={key} C={C} active={feedFilter === key} onClick={() => setFeedFilter(key)}>{label}</ControlChip>
          ))}
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr",
          gap: 8, marginBottom: 24,
        }}>
          {allFeed.map((item, i) => {
            const confInfo = confidenceLabel(item.confidence);
            return (
              <div
                key={`${item.user}-${item.ticker}-${i}`}
                style={{
                  border: `1px solid ${C.ruleFaint}`,
                  padding: 14,
                  background: C.cream,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: item.isLocal ? C.ink : avatarColor(item.user),
                    color: "#fff",
                    fontSize: 14, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--display)", flexShrink: 0,
                    position: "relative",
                  }}>
                    {item.user.charAt(0)}
                    {item.isLocal && (
                      <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 7, fontWeight: 700, background: C.ink, color: C.cream, padding: "1px 3px", fontFamily: "var(--mono)" }}>
                        {t("community.you")}
                      </span>
                    )}
                  </div>

                  {/* User + time */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        fontFamily: "var(--body)", color: C.ink,
                      }}>
                        {item.user}
                      </span>
                      <span style={{
                        fontSize: 10, color: C.inkMuted,
                        fontFamily: "var(--mono)",
                      }}>
                        {formatTimeAgo(item.time)}
                      </span>
                    </div>

                    {/* Ticker + action + sparkline */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      marginTop: 6, flexWrap: "wrap",
                    }}>
                      <span
                        onClick={() => onAnalyze && onAnalyze(item.ticker)}
                        style={{
                          fontSize: 12, fontWeight: 700,
                          fontFamily: "var(--mono)", color: C.ink,
                          cursor: "pointer", textDecoration: "underline",
                          textDecorationColor: C.ruleFaint,
                          textUnderlineOffset: 2,
                        }}
                      >
                        {item.ticker}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        fontFamily: "var(--mono)",
                        color: recColor(item.action),
                        letterSpacing: "0.04em",
                      }}>
                        {item.action}
                      </span>

                      {/* Inline sparkline for feed ticker */}
                      {trendingSparks[item.ticker] && trendingSparks[item.ticker].spark.length > 5 && Sparkline && (
                        <Sparkline
                          data={trendingSparks[item.ticker].spark}
                          width={48}
                          height={16}
                          color={trendingSparks[item.ticker].changePct >= 0 ? C.up : C.down}
                        />
                      )}

                      {/* Confidence with label */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginLeft: "auto",
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 8, fontWeight: 700, fontFamily: "var(--body)", color: C.inkFaint, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                              Confidence
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              fontFamily: "var(--mono)", color: confInfo.color,
                            }}>
                              {item.confidence}%
                            </span>
                          </div>
                          <span style={{ fontSize: 8, fontFamily: "var(--body)", color: confInfo.color, fontWeight: 600 }}>
                            {confInfo.text}
                          </span>
                        </div>
                        <div style={{
                          width: 40, height: 5,
                          background: C.paper,
                          position: "relative",
                          overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${item.confidence}%`,
                            background: confInfo.color,
                            transition: "width 0.3s ease",
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {item.message && (
                  <div style={{ marginTop: 8, fontSize: 11, fontFamily: "var(--body)", color: C.inkMuted, lineHeight: 1.5, paddingLeft: 42 }}>
                    {item.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ============ CTA for signed-out users ============ */}
      {!session && (
        <div style={{
          border: `1px solid ${C.rule}`,
          background: C.warmWhite,
          padding: isMobile ? "28px 20px" : "36px 32px",
          textAlign: "center",
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 16, fontWeight: 700,
            fontFamily: "var(--display)", color: C.ink,
            marginBottom: 8,
          }}>
            {t("community.ctaTitle")}
          </div>
          <p style={{
            fontSize: 12, color: C.inkMuted,
            fontFamily: "var(--body)", lineHeight: 1.5,
            maxWidth: 420, margin: "0 auto 16px",
          }}>
            {t("community.ctaDesc")}
          </p>
          <UIButton C={C} size="lg">
            {t("community.signIn")}
          </UIButton>
        </div>
      )}

      {/* ============ Game of Life (bottom accent) ============ */}
      <div style={{ position: "relative", height: 40, border: `1px solid ${C.ruleFaint}`, overflow: "hidden", background: C.warmWhite, opacity: 0.6 }}>
        <GameOfLifeCanvas C={C} />
      </div>
    </div>
  );
}

export default CommunityTab;
