import React, { useState, useEffect } from "react";
import { UIButton } from "../components/ui/primitives";

function AccountTab({
  deps,
  viewport,
  onAnalyze,
  watchlist = [],
  alerts = [],
  recent = [],
  prefs,
  subTab = "overview",
  onSubTabChange,
  onAddWatchlist,
  onRemoveWatchlist,
  onAddAlert,
  onRemoveAlert,
  onOpenAuth,
  session,
  syncState,
  profileName,
  onUpdateName,
  onSignOut,
}) {
  const {
    useI18n,
    C,
    formatAgo,
    Section,
    HelpWrap,
    Sparkline,
    recColor,
    translateEnum,
    fmt,
    fmtPct,
    Row,
  } = deps;
  const { t } = useI18n();
  const isMobile = Boolean(viewport?.isMobile);
  const activeSubTab = subTab || "overview";
  const setActiveSubTab = onSubTabChange || (() => {});
  const [wlInput, setWlInput] = useState("");
  const [alForm, setAlForm] = useState({ ticker: "", type: "above", value: "" });
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [nameInput, setNameInput] = useState(profileName || "");
  const [nameStatus, setNameStatus] = useState("");

  useEffect(() => {
    setNameInput(profileName || "");
  }, [profileName]);

  if (!session) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 320 }}>
        <div style={{ display: "grid", gap: 12, width: "min(360px, 92vw)" }}>
          <UIButton
            C={C}
            variant="primary"
            onClick={() => onOpenAuth?.("signin")}
          >
            {t("auth.signIn")}
          </UIButton>
          <UIButton
            C={C}
            variant="secondary"
            onClick={() => onOpenAuth?.("signup")}
          >
            {t("auth.createAccount")}
          </UIButton>
        </div>
      </div>
    );
  }

  const syncLabel = !session
    ? t("account.syncLocal")
    : syncState?.status === "syncing"
      ? t("account.syncing")
      : syncState?.status === "error"
        ? t("account.syncError")
        : syncState?.last
          ? t("account.syncedAgo", { ago: formatAgo(syncState.last, t) })
          : t("account.synced");

  const addWl = async () => {
    const t = wlInput.trim().toUpperCase();
    if (!t) return;
    setBusy(true);
    try { await onAddWatchlist?.(t); } catch (e) { console.error(e); }
    setWlInput(""); setBusy(false);
  };

  const addAlert = async () => {
    if (!alForm.ticker || !alForm.value) return;
    const t = alForm.ticker.trim().toUpperCase();
    const v = parseFloat(alForm.value);
    if (!t || Number.isNaN(v)) return;
    setBusy(true);
    try { await onAddAlert?.(t, alForm.type, v); } catch (e) { console.error(e); }
    setAlForm({ ticker: "", type: "above", value: "" }); setBusy(false);
  };

  const saveName = async () => {
    const next = nameInput.trim();
    if (!next) { setNameStatus(t("account.enterFirstName")); return; }
    if (!session) { setNameStatus(t("account.signInToSave")); return; }
    setProfileBusy(true);
    const res = await onUpdateName?.(next);
    if (res?.error) setNameStatus(res.error);
    else setNameStatus(t("account.saved"));
    setProfileBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <HelpWrap help={{ title: t("help.accountSync.title"), body: t("help.accountSync.body") }} block>
          <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 16, display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--mono)", color: C.inkFaint, marginBottom: 6 }}>{t("account.syncTitle")}</div>
              <div style={{ fontSize: 13, color: C.ink, fontFamily: "var(--body)" }}>
                {session ? t("account.signedInAs", { email: session?.user?.email || t("account.user") }) : t("account.signInToSync")}
              </div>
              {syncState?.error && <div style={{ fontSize: 11, color: C.down, fontFamily: "var(--body)", marginTop: 4 }}>{syncState.error}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted }}>{syncLabel}</span>
              {!session && (
                <button onClick={() => onOpenAuth?.("signin")} style={{ padding: "8px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {t("common.signIn")}
                </button>
              )}
            </div>
          </div>
        </HelpWrap>

        <HelpWrap help={{ title: t("help.profile.title"), body: t("help.profile.body") }} block>
          <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 16, display: "grid", gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--mono)", color: C.inkFaint }}>{t("account.profile")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.ink, color: C.cream, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontWeight: 700 }}>
                {(profileName || session?.user?.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, display: "grid", gap: 6 }}>
                <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder={t("account.firstName")}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "8px 10px", fontSize: 12, fontFamily: "var(--body)", color: C.ink, outline: "none" }}
                  disabled={!session} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={saveName} disabled={!session || profileBusy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: !session || profileBusy ? 0.5 : 1 }}>
                    {t("common.save")}
                  </button>
                  {session && (
                    <button onClick={onSignOut} style={{ padding: "6px 12px", background: "transparent", color: C.ink, border: `1px solid ${C.rule}`, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)" }}>
                      {t("common.signOut")}
                    </button>
                  )}
                  {nameStatus && <span style={{ fontSize: 10, color: nameStatus === t("account.saved") ? C.up : C.inkMuted, fontFamily: "var(--mono)" }}>{nameStatus}</span>}
                </div>
              </div>
            </div>
          </div>
        </HelpWrap>
      </div>

      <div style={{ display: "flex", gap: 12, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8 }}>
        {["overview", "preferences"].map(t => (
          <button
            key={t}
            onClick={() => setActiveSubTab(t)}
            style={{
              background: "none",
              border: "none",
              color: activeSubTab === t ? C.ink : C.inkMuted,
              fontSize: 11,
              fontWeight: activeSubTab === t ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontFamily: "var(--body)",
              borderBottom: activeSubTab === t ? `2px solid ${C.ink}` : "none",
              paddingBottom: 6,
            }}
          >
            {t === "overview" ? t("account.overview") : t("account.preferences")}
          </button>
        ))}
      </div>

      {activeSubTab === "overview" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <Section title={t("tools.watchlist")} help={{ title: t("help.accountWatchlist.title"), body: t("help.accountWatchlist.body") }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input value={wlInput} onChange={e => setWlInput(e.target.value)} placeholder={t("tools.ticker")}
                  style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", fontSize: 12, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addWl()} />
                <button onClick={addWl} disabled={busy} style={{ padding: "6px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>{t("tools.add")}</button>
              </div>
              {watchlist.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("tools.emptyWatchlist")}</div>
              ) : (
                watchlist.map(w => (
                  <div key={w.ticker} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13, color: C.ink }}>{w.ticker}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(w.price)}</span>
                        <span style={{ color: w.change >= 0 ? C.up : C.down, fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600 }}>{w.change >= 0 ? "+" : ""}{fmtPct(w.change)}</span>
                      </div>
                      {w.spark && w.spark.length > 1 && (
                        <div style={{ marginTop: 6, opacity: 0.7 }}>
                          <Sparkline data={w.spark} color={w.change >= 0 ? C.up : C.down} prevClose={w.prevClose} width={160} height={44} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: recColor(w.rec), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>
                        {w.rec ? translateEnum(w.rec, t, "signal") : t("common.na")}
                      </span>
                      <button onClick={() => onAnalyze(w.ticker)} style={{ background: "transparent", border: `1px solid ${C.rule}`, color: C.ink, fontSize: 10, fontFamily: "var(--body)", padding: "4px 8px", cursor: "pointer" }}>{t("search.analyze")}</button>
                      <button onClick={() => onRemoveWatchlist?.(w.ticker)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))
              )}
            </Section>

            <Section title={t("tools.alerts")} help={{ title: t("help.accountAlerts.title"), body: t("help.accountAlerts.body") }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={alForm.ticker} onChange={e => setAlForm(p => ({ ...p, ticker: e.target.value }))} placeholder={t("tools.ticker")}
                  style={{ width: 70, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }} />
                <select value={alForm.type} onChange={e => setAlForm(p => ({ ...p, type: e.target.value }))}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 6px", fontSize: 11, fontFamily: "var(--body)", color: C.ink, outline: "none" }}>
                  <option value="above">{t("tools.above")}</option><option value="below">{t("tools.below")}</option>
                </select>
                <input value={alForm.value} onChange={e => setAlForm(p => ({ ...p, value: e.target.value }))} placeholder="$" type="number"
                  style={{ width: 80, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addAlert()} />
                <button onClick={addAlert} disabled={busy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>{t("tools.set")}</button>
              </div>
              {alerts.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("tools.noAlerts")}</div>
              ) : (
                alerts.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12 }}>{a.ticker}</span>
                      <span style={{ color: C.inkMuted, fontSize: 11, marginLeft: 6 }}>{a.type === "above" ? "≥" : "≤"} ${fmt(a.value)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: a.triggered ? C.up : C.hold }}>{a.triggered ? t("tools.triggered") : t("tools.watching")}</span>
                      <button onClick={() => onRemoveAlert?.(a.id)} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))
              )}
            </Section>
          </div>

          <Section title={t("account.recentAnalyses")} help={{ title: t("help.accountRecent.title"), body: t("help.accountRecent.body") }}>
            {recent.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{t("account.noAnalyses")}</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {recent.map(r => {
                  const regimeLabel = r.regime ? translateEnum(r.regime, t, "regime") : t("common.na");
                  const riskTone = r.riskLevel === "HIGH" ? C.down : r.riskLevel === "MEDIUM" ? C.hold : C.up;
                  return (
                    <button
                      key={`${r.ticker}-${r.ts || r.timestamp}`}
                      onClick={() => onAnalyze(r.ticker)}
                      style={{ textAlign: "left", border: `1px solid ${C.rule}`, background: C.warmWhite, padding: 14, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto", gap: 12, alignItems: "center", cursor: "pointer" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13 }}>{r.ticker}</span>
                          <span style={{ color: recColor(r.action), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>
                            {r.action ? translateEnum(r.action, t, "signal") : t("analysis.neutral")}
                          </span>
                          <span style={{ color: C.inkFaint, fontSize: 10, fontFamily: "var(--mono)" }}>{r.period || prefs?.period}/{r.interval || prefs?.interval}</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--body)", marginTop: 4 }}>
                          {r.price != null ? `$${fmt(r.price)}` : "—"} · {formatAgo(r.ts || r.timestamp, t)}
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: recColor(r.action), display: "inline-block" }} />
                            {t("account.signal")} {r.action ? translateEnum(r.action, t, "signal") : t("analysis.neutral")}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, display: "inline-block" }} />
                            {t("account.regime")} {regimeLabel}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: riskTone, display: "inline-block" }} />
                            {t("account.risk")} {r.riskLevel ? translateEnum(r.riskLevel, t, "risk") : t("common.na")}
                          </span>
                          {r.confidence != null && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: "var(--mono)", color: C.inkMuted }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.inkSoft, display: "inline-block" }} />
                              {t("account.conf")} {Math.round(r.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: isMobile ? "space-between" : "flex-start" }}>
                        {r.spark && r.spark.length > 1 && (
                          <Sparkline data={r.spark} prevClose={r.prevClose} color={recColor(r.action)} width={200} height={64} />
                        )}
                        <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--mono)" }}>{t("account.view")} →</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      ) : (
        <Section title={t("account.preferences")} help={{ title: t("help.accountPreferences.title"), body: t("help.accountPreferences.body") }}>
          <div style={{ display: "grid", gap: 6 }}>
            <Row label={t("account.defaultPeriod")} value={prefs?.period || "1y"} />
            <Row label={t("account.defaultInterval")} value={prefs?.interval || "1d"} />
            <Row label={t("account.homeRegion")} value={labelFor(prefs?.region || "Global", t)} border={false} />
          </div>
        </Section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS TAB
// ═══════════════════════════════════════════════════════════

export default AccountTab;
