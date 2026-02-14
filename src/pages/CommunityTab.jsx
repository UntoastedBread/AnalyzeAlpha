import React, { useState, useMemo, useCallback } from "react";
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

function formatTimeAgo(ts) {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

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
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);

  const [selectedTicker, setSelectedTicker] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);

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

  const handleShare = useCallback(() => {
    if (!selectedTicker) return;
    const url = `${window.location.origin}?tab=analysis&ticker=${encodeURIComponent(selectedTicker)}`;
    setShareLink(url);
    setCopied(false);
  }, [selectedTicker]);

  const handleCopy = useCallback(() => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareLink]);

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
    return combined.sort((a, b) => b.time - a.time);
  }, [localFeed]);

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
    <div style={{ maxWidth: 900, margin: "0 auto" }}>

      {/* ============ Share Analysis ============ */}
      <Section title={t("community.shareTitle")}>
        <div style={{ marginBottom: 24 }}>
          <p style={{
            fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)",
            lineHeight: 1.5, margin: "0 0 12px",
          }}>
            {t("community.shareDesc")}
          </p>

          {recentAnalyses && recentAnalyses.length > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={selectedTicker}
                onChange={(e) => { setSelectedTicker(e.target.value); setShareLink(""); setCopied(false); }}
                style={{
                  padding: "8px 12px",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  fontWeight: 600,
                  border: `1px solid ${C.rule}`,
                  background: C.cream,
                  color: C.ink,
                  cursor: "pointer",
                  minWidth: 160,
                }}
              >
                <option value="">{t("community.selectAnalysis")}</option>
                {recentAnalyses.map((a) => (
                  <option key={a.ticker || a} value={a.ticker || a}>
                    {a.ticker || a}
                  </option>
                ))}
              </select>
              <UIButton
                C={C}
                size="md"
                disabled={!selectedTicker}
                onClick={handleShare}
              >
                {t("community.share")}
              </UIButton>
            </div>
          ) : (
            <p style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)" }}>
              {t("community.noAnalyses")}
            </p>
          )}

          {shareLink && (
            <div style={{
              display: "flex", gap: 8, alignItems: "center",
              marginTop: 12, flexWrap: "wrap",
            }}>
              <input
                readOnly
                value={shareLink}
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: "8px 12px",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  border: `1px solid ${C.rule}`,
                  background: C.paper,
                  color: C.ink,
                  outline: "none",
                }}
                onFocus={(e) => e.target.select()}
              />
              <UIButton C={C} size="sm" variant="secondary" onClick={handleCopy}>
                {copied ? t("community.copied") : t("community.copy")}
              </UIButton>
              {copied && (
                <span style={{
                  fontSize: 10, color: C.up, fontWeight: 600,
                  fontFamily: "var(--body)", letterSpacing: "0.04em",
                }}>
                  {t("community.copiedToast")}
                </span>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ============ Community Feed ============ */}
      <Section title={t("community.feedTitle")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <UIButton C={C} size="sm" onClick={() => setShowPostForm(o => !o)}>
            {showPostForm ? t("common.close") : t("community.newPost")}
          </UIButton>
        </div>

        {showPostForm && (
          <div style={{ border: `1px solid ${C.rule}`, padding: 16, marginBottom: 16, background: C.warmWhite }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <input
                value={postTicker}
                onChange={e => setPostTicker(e.target.value.toUpperCase())}
                placeholder={t("community.postTicker")}
                style={{ padding: "6px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontSize: 12, fontFamily: "var(--mono)", outline: "none", width: 100 }}
              />
              <div style={{ display: "flex", gap: 0 }}>
                {["BUY", "SELL", "HOLD"].map(a => (
                  <ControlChip key={a} C={C} active={postAction === a} onClick={() => setPostAction(a)}>{a}</ControlChip>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
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
              rows={2}
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, fontSize: 11, fontFamily: "var(--body)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
            {postTicker && (
              <div style={{ border: `1px solid ${C.ruleFaint}`, padding: 10, marginTop: 8, fontSize: 10, fontFamily: "var(--body)", color: C.inkMuted }}>
                <span style={{ fontWeight: 700 }}>{t("community.postPreview")}:</span>{" "}
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: C.ink }}>{postTicker}</span>{" "}
                <span style={{ color: recColor(postAction), fontWeight: 700 }}>{postAction}</span>{" "}
                ({postConfidence}%) {postMessage && `— "${postMessage}"`}
              </div>
            )}
            <UIButton C={C} variant="primary" onClick={handlePostSubmit} style={{ marginTop: 10 }} disabled={!postTicker.trim()}>
              {t("community.postSubmit")}
            </UIButton>
          </div>
        )}

        <div style={{
          display: "grid", gridTemplateColumns: "1fr",
          gap: 8, marginBottom: 24,
        }}>
          {allFeed.map((item, i) => (
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
                  background: C.paper, color: C.ink,
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

                  {/* Ticker + action */}
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

                    {/* Confidence bar */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4,
                      marginLeft: "auto",
                    }}>
                      <div style={{
                        width: 60, height: 5,
                        background: C.paper,
                        position: "relative",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${item.confidence}%`,
                          background: recColor(item.action),
                          transition: "width 0.3s ease",
                        }} />
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        fontFamily: "var(--mono)", color: C.inkMuted,
                      }}>
                        {item.confidence}%
                      </span>
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
          ))}
        </div>
      </Section>

      {/* ============ Trending + Leaderboard side-by-side ============ */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 24,
        marginBottom: 24,
      }}>

        {/* ---- Trending Tickers ---- */}
        <Section title={t("community.trendingTitle")}>
          <div style={{ display: "grid", gap: 0 }}>
            {TRENDING.map((item) => (
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
            ))}
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
    </div>
  );
}

export default CommunityTab;
