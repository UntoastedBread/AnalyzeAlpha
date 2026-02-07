import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, Brush, Customized,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import "./App.css";

// ═══════════════════════════════════════════════════════════
// DATA LAYER — Local proxy to Yahoo Finance
// ═══════════════════════════════════════════════════════════
function formatDateLabel(ts, interval) {
  const iso = new Date(ts * 1000).toISOString();
  const day = iso.slice(0, 10);
  if (interval && interval !== "1d") {
    return `${day} ${iso.slice(11, 16)}`;
  }
  return day;
}

async function fetchStockData(ticker, period = "1y", interval = "1d") {
  const debug = { attempts: [], ticker, period, interval, timestamp: new Date().toISOString() };
  const t0 = performance.now();

  // Via local Express proxy (no CORS issues)
  try {
    const s = performance.now();
    const url = `/api/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
    const json = await resp.json();
    const r = json?.chart?.result?.[0];
    if (!r?.timestamp || !r?.indicators?.quote?.[0]?.close) throw new Error("Bad response structure");
    const q = r.indicators.quote[0];
    const data = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const c = q.close[i], o = q.open[i], h = q.high[i], l = q.low[i], v = q.volume[i];
      if (c == null || o == null) continue;
      data.push({
        date: formatDateLabel(r.timestamp[i], interval),
        Open: +o.toFixed(2), High: +(h ?? Math.max(o, c)).toFixed(2),
        Low: +(l ?? Math.min(o, c)).toFixed(2), Close: +c.toFixed(2), Volume: v || 0,
      });
    }
    const minPoints = interval === "1d" ? 10 : 5;
    if (data.length < minPoints) throw new Error(`Only ${data.length} data points`);
    const lat = Math.round(performance.now() - s);
    debug.attempts.push({ source: "local-proxy", status: "success", latency: lat, points: data.length });
    return { data, source: "Yahoo Finance", latency: lat, debug, isLive: true };
  } catch (e) {
    debug.attempts.push({ source: "local-proxy", status: "failed", error: e.message });
  }

  // Fallback: CORS proxy (for static hosting like GitHub Pages)
  try {
    const s = performance.now();
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${period}&interval=${interval}&includePrePost=false`;
    const resp = await fetch(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`);
    if (!resp.ok) throw new Error(`CORS proxy HTTP ${resp.status}`);
    const json = await resp.json();
    const r = json?.chart?.result?.[0];
    if (!r?.timestamp || !r?.indicators?.quote?.[0]?.close) throw new Error("Bad response");
    const q = r.indicators.quote[0];
    const data = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const c = q.close[i], o = q.open[i], h = q.high[i], l = q.low[i], v = q.volume[i];
      if (c == null || o == null) continue;
      data.push({
        date: formatDateLabel(r.timestamp[i], interval),
        Open: +o.toFixed(2), High: +(h ?? Math.max(o, c)).toFixed(2),
        Low: +(l ?? Math.min(o, c)).toFixed(2), Close: +c.toFixed(2), Volume: v || 0,
      });
    }
    const minPoints = interval === "1d" ? 10 : 5;
    if (data.length < minPoints) throw new Error(`Only ${data.length} data points`);
    const lat = Math.round(performance.now() - s);
    debug.attempts.push({ source: "cors-proxy", status: "success", latency: lat, points: data.length });
    return { data, source: "Yahoo Finance", latency: lat, debug, isLive: true };
  } catch (e) {
    debug.attempts.push({ source: "cors-proxy", status: "failed", error: e.message });
  }

  debug.totalTime = Math.round(performance.now() - t0);
  const err = new Error(`All data sources failed for ${ticker}`);
  err.debug = debug;
  throw err;
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════
function calcReturns(d) {
  return d.map((v, i) => {
    if (i === 0) return { ...v, Returns: 0, LogReturns: 0 };
    const ret = (v.Close - d[i - 1].Close) / d[i - 1].Close;
    return { ...v, Returns: ret, LogReturns: Math.log(v.Close / d[i - 1].Close) };
  });
}

function calcSMA(c, w) {
  return c.map((_, i) => i < w - 1 ? null : c.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w);
}

function calcEMA(c, s) {
  const k = 2 / (s + 1), e = [c[0]];
  for (let i = 1; i < c.length; i++) e.push(c[i] * k + e[i - 1] * (1 - k));
  return e;
}

function calcRSI(c, p = 14) {
  const r = new Array(c.length).fill(null);
  for (let i = 1; i < c.length; i++) {
    if (i < p) continue;
    let g = 0, l = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const d = c[j] - c[j - 1];
      if (d > 0) g += d; else l -= d;
    }
    const ag = g / p, al = l / p;
    r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return r;
}

function calcMACD(c, f = 12, s = 26, sg = 9) {
  const ef = calcEMA(c, f), es = calcEMA(c, s);
  const m = ef.map((v, i) => v - es[i]), si = calcEMA(m, sg);
  return { macd: m, signal: si, histogram: m.map((v, i) => v - si[i]) };
}

function calcBB(c, p = 20, n = 2) {
  return c.map((_, i) => {
    if (i < p - 1) return { upper: null, middle: null, lower: null };
    const sl = c.slice(i - p + 1, i + 1);
    const m = sl.reduce((a, b) => a + b, 0) / p;
    const st = Math.sqrt(sl.reduce((a, v) => a + (v - m) ** 2, 0) / p);
    return { upper: m + n * st, middle: m, lower: m - n * st };
  });
}

function calcATR(d, p = 14) {
  const tr = d.map((v, i) => {
    if (i === 0) return v.High - v.Low;
    return Math.max(v.High - v.Low, Math.abs(v.High - d[i - 1].Close), Math.abs(v.Low - d[i - 1].Close));
  });
  return calcSMA(tr, p);
}

function calcStoch(d, kP = 14, dP = 3) {
  const k = d.map((_, i) => {
    if (i < kP - 1) return null;
    const sl = d.slice(i - kP + 1, i + 1);
    const lo = Math.min(...sl.map(x => x.Low)), hi = Math.max(...sl.map(x => x.High));
    return hi === lo ? 50 : 100 * (d[i].Close - lo) / (hi - lo);
  });
  return { k, d: calcSMA(k.map(v => v ?? 50), dP) };
}

function calcADX(d, p = 14) {
  const di = [], dm = [], adx = [];
  for (let i = 0; i < d.length; i++) {
    if (i < p) { di.push(null); dm.push(null); adx.push(null); continue; }
    let ts = 0, dp = 0, dn = 0;
    for (let j = i - p + 1; j <= i; j++) {
      ts += Math.max(d[j].High - d[j].Low, Math.abs(d[j].High - d[j - 1].Close), Math.abs(d[j].Low - d[j - 1].Close));
      const u = d[j].High - d[j - 1].High, dd = d[j - 1].Low - d[j].Low;
      dp += (u > dd && u > 0) ? u : 0;
      dn += (dd > u && dd > 0) ? dd : 0;
    }
    const dip = ts > 0 ? 100 * dp / ts : 0, dim = ts > 0 ? 100 * dn / ts : 0;
    di.push(dip); dm.push(dim);
    adx.push((dip + dim) > 0 ? 100 * Math.abs(dip - dim) / (dip + dim) : 0);
  }
  return { diPlus: di, diMinus: dm, adx };
}

function detectTrend(data, w = 50) {
  const c = data.map(d => d.Close), n = Math.min(w, c.length), r = c.slice(-n);
  const xm = (n - 1) / 2, ym = r.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - xm) * (r[i] - ym); den += (i - xm) ** 2; }
  const sl = den ? num / den : 0, ns = (sl / ym) * 100;
  const ssTot = r.reduce((a, v) => a + (v - ym) ** 2, 0);
  const ssRes = r.reduce((a, v, i) => a + (v - (sl * i + (ym - sl * xm))) ** 2, 0);
  const rSq = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const s20 = calcSMA(c, 20), s50 = calcSMA(c, 50);
  const ma = (s20[s20.length - 1] || 0) > (s50[s50.length - 1] || 0) ? "UPTREND" : "DOWNTREND";
  let dir = "SIDEWAYS";
  if (ns > 0.1 && ma === "UPTREND") dir = "UPTREND";
  else if (ns < -0.1 && ma === "DOWNTREND") dir = "DOWNTREND";
  return { direction: dir, strength: Math.min(100, Math.abs(ns) * 10 * rSq), slope: ns, rSquared: rSq, maAlignment: ma, confidence: rSq };
}

function classifyVol(data, w = 20) {
  const ret = data.map(d => d.Returns).filter(r => r !== undefined && r !== 0);
  if (ret.length < w + 2) return { current: 0, average: 0, ratio: 1, classification: "NORMAL" };
  const rc = ret.slice(-w), m0 = rc.reduce((a, b) => a + b, 0) / rc.length;
  const std = Math.sqrt(rc.reduce((a, v) => a + (v - m0) ** 2, 0) / rc.length);
  const cv = std * Math.sqrt(252) * 100;
  const all = [];
  for (let i = w; i <= ret.length; i++) {
    const s = ret.slice(i - w, i), m = s.reduce((a, b) => a + b, 0) / s.length;
    all.push(Math.sqrt(s.reduce((a, v) => a + (v - m) ** 2, 0) / s.length));
  }
  const av = all.length > 0 ? (all.reduce((a, b) => a + b, 0) / all.length) * Math.sqrt(252) * 100 : cv;
  const ratio = av > 0 ? cv / av : 1;
  let cls = "NORMAL";
  if (ratio > 1.5) cls = "HIGH"; else if (ratio > 1.2) cls = "ELEVATED"; else if (ratio < 0.8) cls = "LOW";
  return { current: cv, average: av, ratio, classification: cls };
}

function calcHurst(prices, ml = 20) {
  const lags = [], taus = [];
  for (let l = 2; l < Math.min(ml, prices.length); l++) {
    let s = 0, ct = 0;
    for (let i = l; i < prices.length; i++) { s += (prices[i] - prices[i - l]) ** 2; ct++; }
    if (ct > 0) { lags.push(Math.log(l)); taus.push(Math.log(Math.sqrt(s / ct))); }
  }
  if (lags.length < 2) return 0.5;
  const xm = lags.reduce((a, b) => a + b, 0) / lags.length;
  const ym = taus.reduce((a, b) => a + b, 0) / taus.length;
  let n = 0, d = 0;
  for (let i = 0; i < lags.length; i++) { n += (lags[i] - xm) * (taus[i] - ym); d += (lags[i] - xm) ** 2; }
  return d ? n / d : 0.5;
}

function detectRegime(data) {
  const trend = detectTrend(data), vol = classifyVol(data), hurst = calcHurst(data.map(d => d.Close));
  let overall;
  if (trend.strength > 60 && hurst > 0.55) overall = `STRONG_${trend.direction}`;
  else if (trend.strength > 40 && trend.direction !== "SIDEWAYS") overall = `TRENDING_${trend.direction}`;
  else if (hurst < 0.45 && ["LOW", "NORMAL"].includes(vol.classification)) overall = "MEAN_REVERTING";
  else if (vol.classification === "HIGH") overall = "HIGH_VOLATILITY";
  else if (trend.direction === "SIDEWAYS" && ["LOW", "NORMAL"].includes(vol.classification)) overall = "RANGING";
  else overall = "TRANSITIONING";
  return { trend, volatility: vol, hurst, overall };
}

function zscoreSignals(data, w = 20) {
  const c = data.map(d => d.Close), r = c.slice(-w), m = r.reduce((a, b) => a + b, 0) / r.length;
  const st = Math.sqrt(r.reduce((a, v) => a + (v - m) ** 2, 0) / r.length);
  const z = st > 0 ? (c[c.length - 1] - m) / st : 0;
  let sig = "NEUTRAL", p = 0.5;
  if (z > 2) { sig = "STRONG_SELL"; p = 0.95; } else if (z > 1) { sig = "SELL"; p = 0.68; }
  else if (z < -2) { sig = "STRONG_BUY"; p = 0.95; } else if (z < -1) { sig = "BUY"; p = 0.68; }
  return { signal: sig, zscore: z, probability: p, mean: m, std: st };
}

function momentumSignals(data) {
  const c = data.map(d => d.Close), cur = c[c.length - 1], sc = {};
  [5, 10, 20, 50].forEach(p => { if (c.length > p) sc[`${p}d`] = ((cur / c[c.length - 1 - p]) - 1) * 100; });
  const v = Object.values(sc), avg = v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  const ap = v.every(x => x > 0), an = v.every(x => x < 0);
  let sig = "NEUTRAL";
  if (ap && avg > 5) sig = "STRONG_BUY"; else if (avg > 2) sig = "BUY";
  else if (an && avg < -5) sig = "STRONG_SELL"; else if (avg < -2) sig = "SELL";
  return { signal: sig, avgMomentum: avg, byPeriod: sc, consistency: (ap || an) ? "HIGH" : "LOW" };
}

function volumeSignals(data, w = 20) {
  const vols = data.map(d => d.Volume), r = vols.slice(-w), m = r.reduce((a, b) => a + b, 0) / r.length;
  const st = Math.sqrt(r.reduce((a, v) => a + (v - m) ** 2, 0) / r.length);
  const z = st > 0 ? (vols[vols.length - 1] - m) / st : 0;
  const lr = data[data.length - 1].Returns || 0;
  let sig = "NEUTRAL";
  if (z > 2 && lr > 0) sig = "STRONG_BUY"; else if (z > 1 && lr > 0) sig = "BUY";
  else if (z > 2 && lr < 0) sig = "STRONG_SELL"; else if (z > 1 && lr < 0) sig = "SELL";
  return { signal: sig, volumeZscore: z, avgVolume: m, currentVolume: vols[vols.length - 1] };
}

function aggregateSignals(signals) {
  const map = { STRONG_BUY: 2, BUY: 1, NEUTRAL: 0, SELL: -1, STRONG_SELL: -2 };
  const wt = { zscore: 0.25, momentum: 0.30, volume: 0.25 };
  let total = 0;
  Object.entries(wt).forEach(([k, w]) => { if (signals[k]) total += (map[signals[k].signal] || 0) * w; });
  let sig = "NEUTRAL", conf = 0.5;
  if (total >= 1.5) { sig = "STRONG_BUY"; conf = Math.min(0.95, 0.5 + Math.abs(total) * 0.3); }
  else if (total >= 0.5) { sig = "BUY"; conf = Math.min(0.85, 0.5 + Math.abs(total) * 0.3); }
  else if (total <= -1.5) { sig = "STRONG_SELL"; conf = Math.min(0.95, 0.5 + Math.abs(total) * 0.3); }
  else if (total <= -0.5) { sig = "SELL"; conf = Math.min(0.85, 0.5 + Math.abs(total) * 0.3); }
  return { signal: sig, score: total, confidence: conf };
}

function calcRiskMetrics(data) {
  const ret = data.map(d => d.Returns).filter(r => r !== undefined && r !== 0);
  if (ret.length < 5) return { volatility: 0, sharpe: 0, sortino: 0, maxDrawdown: 0, var95: 0, cvar95: 0, riskLevel: "LOW" };
  const m = ret.reduce((a, b) => a + b, 0) / ret.length;
  const std = Math.sqrt(ret.reduce((a, v) => a + (v - m) ** 2, 0) / ret.length);
  const vol = std * Math.sqrt(252) * 100, annRet = m * 252;
  const sharpe = std > 0 ? (annRet - 0.02) / (std * Math.sqrt(252)) : 0;
  const ds = ret.filter(r => r < 0);
  const dsStd = ds.length > 0 ? Math.sqrt(ds.reduce((a, v) => a + v ** 2, 0) / ds.length) * Math.sqrt(252) : 0;
  const sortino = dsStd > 0 ? (annRet - 0.02) / dsStd : 0;
  let maxDD = 0, peak = 1, cum = 1;
  ret.forEach(r => { cum *= (1 + r); if (cum > peak) peak = cum; const dd = (cum - peak) / peak; if (dd < maxDD) maxDD = dd; });
  const sorted = [...ret].sort((a, b) => a - b);
  const idx5 = Math.floor(sorted.length * 0.05);
  const var95 = sorted[idx5] * 100;
  const cvSlice = sorted.slice(0, idx5);
  const cvar95 = cvSlice.length > 0 ? (cvSlice.reduce((a, b) => a + b, 0) / cvSlice.length) * 100 : var95;
  let riskLevel = "LOW";
  if (vol > 40 || maxDD < -0.30) riskLevel = "HIGH";
  else if (vol > 25 || maxDD < -0.20) riskLevel = "MEDIUM";
  return { volatility: vol, sharpe, sortino, maxDrawdown: maxDD * 100, var95, cvar95, riskLevel };
}

function generateRecommendation(tech, regime, stat, risk, valuationModels) {
  const sm = { STRONG_BUY: 2, BUY: 1, OVERSOLD: 1, NEUTRAL: 0, SELL: -1, STRONG_SELL: -2, OVERBOUGHT: -1, BULLISH: 1, BEARISH: -1 };
  let ts = 0; Object.values(tech).forEach(s => { ts += sm[s] || 0; });
  const ss = sm[stat.aggregate?.signal] || 0;
  let rs = 0;
  if (regime.overall.includes("UPTREND")) rs = regime.overall.includes("STRONG") ? 1 : 0.5;
  else if (regime.overall.includes("DOWNTREND")) rs = regime.overall.includes("STRONG") ? -1 : -0.5;
  const valuationBias = valuationModels?.signal === "UNDERVALUED" ? 1 : valuationModels?.signal === "OVERVALUED" ? -1 : 0;
  let fs = ts * 0.3 + ss * 0.35 + rs * 0.25 + valuationBias * 0.1;
  if (risk.riskLevel === "HIGH") fs *= 0.7;
  let action = "HOLD", conf = 0.5;
  if (fs >= 1.2) { action = "STRONG BUY"; conf = Math.min(0.90, 0.6 + Math.abs(fs) * 0.15); }
  else if (fs >= 0.4) { action = "BUY"; conf = Math.min(0.75, 0.5 + Math.abs(fs) * 0.15); }
  else if (fs <= -1.2) { action = "STRONG SELL"; conf = Math.min(0.90, 0.6 + Math.abs(fs) * 0.15); }
  else if (fs <= -0.4) { action = "SELL"; conf = Math.min(0.75, 0.5 + Math.abs(fs) * 0.15); }
  return { action, confidence: conf, score: fs, components: { technical: ts, statistical: ss, regime: rs, valuation: valuationBias } };
}

function calcValuation(data) {
  const closes = data.map(d => d.Close), last = closes[closes.length - 1];
  const sma200 = calcSMA(closes, 200), sma50 = calcSMA(closes, 50);
  const sma200Val = sma200[sma200.length - 1], sma50Val = sma50[sma50.length - 1];
  const devSma200 = sma200Val ? ((last - sma200Val) / sma200Val) * 100 : 0;
  const devSma50 = sma50Val ? ((last - sma50Val) / sma50Val) * 100 : 0;
  const bb = calcBB(closes), lastBB = bb[bb.length - 1];
  const pctB = lastBB.upper && lastBB.lower ? (last - lastBB.lower) / (lastBB.upper - lastBB.lower) : 0.5;
  const rsi = calcRSI(closes), lastRSI = rsi[rsi.length - 1] || 50;
  const high52 = Math.max(...closes.slice(-252)), low52 = Math.min(...closes.slice(-252));
  const range52Pct = high52 !== low52 ? (last - low52) / (high52 - low52) * 100 : 50;
  let stretch = 0;
  stretch += Math.max(-50, Math.min(50, devSma200)) + 50;
  stretch += Math.max(-50, Math.min(50, devSma50 * 1.5)) + 50;
  stretch += pctB * 100;
  stretch += (lastRSI / 100) * 100;
  stretch += range52Pct;
  stretch = stretch / 5;
  let verdict = "FAIRLY VALUED";
  if (stretch > 80) verdict = "SIGNIFICANTLY OVERVALUED";
  else if (stretch > 65) verdict = "OVERVALUED";
  else if (stretch > 55) verdict = "SLIGHTLY OVERVALUED";
  else if (stretch < 20) verdict = "SIGNIFICANTLY UNDERVALUED";
  else if (stretch < 35) verdict = "UNDERVALUED";
  else if (stretch < 45) verdict = "SLIGHTLY UNDERVALUED";
  const fairValue = sma200Val || sma50Val || last;
  return { stretch, verdict, devSma200, devSma50, pctB, rsi: lastRSI, range52Pct, high52, low52, fairValue, sma200: sma200Val, sma50: sma50Val };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function seededRange(seed, salt, min, max) {
  return min + (max - min) * seededRandom(seed + salt * 999);
}

function calcFundamentals(ticker, price) {
  const seed = hashCode(ticker || "UNKNOWN");
  const px = price || 100;
  const shares = seededRange(seed, 1, 0.4, 5.0) * 1e9;
  const marketCap = px * shares;
  const ps = seededRange(seed, 2, 1.5, 8);
  const revenue = marketCap / ps;
  const grossMargin = seededRange(seed, 3, 0.3, 0.7);
  const opMargin = clamp(grossMargin * seededRange(seed, 4, 0.35, 0.7), 0.08, grossMargin - 0.05);
  const netMargin = clamp(opMargin * seededRange(seed, 5, 0.6, 0.85), 0.03, opMargin - 0.01);
  const fcfMargin = clamp(opMargin * seededRange(seed, 6, 0.6, 0.95), 0.02, 0.35);
  const revenueGrowth = seededRange(seed, 7, -0.05, 0.18);
  const debtToEquity = seededRange(seed, 8, 0.0, 1.6);
  const equity = marketCap * seededRange(seed, 9, 0.35, 0.8);
  const debt = equity * debtToEquity;
  const cash = revenue * seededRange(seed, 10, 0.04, 0.25);
  const capex = revenue * seededRange(seed, 11, 0.03, 0.08);
  const netIncome = revenue * netMargin;
  const fcf = revenue * fcfMargin;
  const eps = netIncome / shares;
  const fcfPerShare = fcf / shares;
  const dividendYield = seededRange(seed, 12, 0.0, 0.035);
  const dividendPerShare = px * dividendYield;
  const roe = seededRange(seed, 13, 0.08, 0.35);
  const roa = seededRange(seed, 14, 0.03, 0.18);
  const currentRatio = seededRange(seed, 15, 0.9, 2.5);

  const base = {
    revenue, netIncome, fcf, grossMargin, opMargin, netMargin, fcfMargin,
    capex, cash, debt, eps, fcfPerShare, dividendPerShare, roe, roa, currentRatio,
  };

  const periods = ["LTM", "FY2023", "FY2022"].map((label, idx) => {
    const scale = 1 / Math.pow(1 + revenueGrowth, idx);
    const drift = 1 + seededRange(seed, 20 + idx, -0.03, 0.03);
    const rev = revenue * scale * drift;
    const gMargin = clamp(grossMargin * (1 + seededRange(seed, 30 + idx, -0.02, 0.02)), 0.2, 0.8);
    const oMargin = clamp(opMargin * (1 + seededRange(seed, 40 + idx, -0.03, 0.03)), 0.05, gMargin - 0.04);
    const nMargin = clamp(netMargin * (1 + seededRange(seed, 50 + idx, -0.03, 0.03)), 0.02, oMargin - 0.01);
    const fMargin = clamp(fcfMargin * (1 + seededRange(seed, 60 + idx, -0.04, 0.04)), 0.02, 0.35);
    return {
      label,
      revenue: rev,
      netIncome: rev * nMargin,
      fcf: rev * fMargin,
      grossMargin: gMargin,
      opMargin: oMargin,
      netMargin: nMargin,
      fcfMargin: fMargin,
    };
  });

  return {
    source: "Modeled",
    currency: "USD",
    shares,
    marketCap,
    revenueGrowth,
    debtToEquity,
    equity,
    cash,
    debt,
    periods,
    ratios: { grossMargin, opMargin, netMargin, fcfMargin, roe, roa, currentRatio },
    perShare: { eps, fcfPerShare, dividendPerShare },
    base,
  };
}

function buildValuationAssumptions(fundamentals, price, risk) {
  const g = clamp(fundamentals?.revenueGrowth ?? 0.06, -0.02, 0.12);
  const volAdj = risk?.volatility ? Math.min(0.04, risk.volatility / 250) : 0.01;
  const discount = clamp(0.08 + volAdj, 0.07, 0.14);
  const terminalGrowth = clamp(Math.min(0.03, g * 0.5), 0.01, 0.03);
  const targetPE = clamp(12 + g * 100 * 0.8, 10, 28);
  return {
    fcfPerShare: fundamentals?.perShare?.fcfPerShare ?? (price ? price * 0.04 : 3),
    dividendPerShare: fundamentals?.perShare?.dividendPerShare ?? (price ? price * 0.015 : 1),
    eps: fundamentals?.perShare?.eps ?? (price ? price / 20 : 5),
    growthRate: g,
    discountRate: discount,
    terminalGrowth,
    targetPE,
    years: 5,
  };
}

function dcfValue(fcfPerShare, growthRate, discountRate, terminalGrowth, years) {
  if (!fcfPerShare || years <= 0) return null;
  if (discountRate <= terminalGrowth) return null;
  let pv = 0;
  for (let i = 1; i <= years; i++) {
    const cf = fcfPerShare * Math.pow(1 + growthRate, i);
    pv += cf / Math.pow(1 + discountRate, i);
  }
  const terminal = (fcfPerShare * Math.pow(1 + growthRate, years) * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  pv += terminal / Math.pow(1 + discountRate, years);
  return pv;
}

function ddmValue(dividendPerShare, growthRate, discountRate) {
  if (!dividendPerShare) return null;
  if (discountRate <= growthRate) return null;
  return dividendPerShare * (1 + growthRate) / (discountRate - growthRate);
}

function runValuationModels(assumptions, price) {
  if (!assumptions) {
    return { dcf: null, ddm: null, multiples: null, anchor: null, upside: null, signal: "FAIRLY VALUED", issues: [], assumptions: null };
  }
  const a = assumptions;
  const issues = [];
  const dcf = dcfValue(a.fcfPerShare, a.growthRate, a.discountRate, a.terminalGrowth, a.years);
  if (a.discountRate <= a.terminalGrowth) issues.push("Discount rate must exceed terminal growth.");
  const ddmGrowth = Math.min(a.growthRate, 0.06);
  const ddm = a.dividendPerShare > 0 ? ddmValue(a.dividendPerShare, ddmGrowth, a.discountRate) : null;
  if (a.dividendPerShare > 0 && a.discountRate <= ddmGrowth) issues.push("Discount rate must exceed dividend growth.");
  const multiples = a.eps && a.targetPE ? a.eps * a.targetPE : null;
  const vals = [dcf, ddm, multiples].filter(v => Number.isFinite(v) && v > 0);
  const anchor = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  const upside = anchor && price ? (anchor / price - 1) : null;
  let signal = "FAIRLY VALUED";
  if (upside != null) {
    if (upside > 0.15) signal = "UNDERVALUED";
    else if (upside < -0.15) signal = "OVERVALUED";
  }
  return { dcf, ddm, multiples, anchor, upside, signal, issues, assumptions: a };
}

function runAnalysis(ticker, rawData) {
  let raw = calcReturns(rawData);
  const closes = raw.map(d => d.Close);
  const rsi = calcRSI(closes), macdD = calcMACD(closes), bb = calcBB(closes);
  const atr = calcATR(raw), stoch = calcStoch(raw), adxD = calcADX(raw);
  const sma20 = calcSMA(closes, 20), sma50 = calcSMA(closes, 50), sma200 = calcSMA(closes, 200);
  const enriched = raw.map((d, i) => ({
    ...d, RSI: rsi[i], MACD: macdD.macd[i], MACD_Signal: macdD.signal[i], MACD_Hist: macdD.histogram[i],
    BB_Upper: bb[i].upper, BB_Middle: bb[i].middle, BB_Lower: bb[i].lower, ATR: atr[i],
    Stoch_K: stoch.k[i], Stoch_D: stoch.d[i], ADX: adxD.adx[i],
    SMA_20: sma20[i], SMA_50: sma50[i], SMA_200: sma200[i],
  }));
  const last = enriched[enriched.length - 1];
  const techSignals = {};
  if (last.RSI != null) techSignals.RSI = last.RSI < 30 ? "OVERSOLD" : last.RSI > 70 ? "OVERBOUGHT" : "NEUTRAL";
  if (last.MACD != null) techSignals.MACD = last.MACD > last.MACD_Signal ? "BULLISH" : "BEARISH";
  if (last.BB_Upper != null) techSignals.Bollinger = last.Close > last.BB_Upper ? "OVERBOUGHT" : last.Close < last.BB_Lower ? "OVERSOLD" : "NEUTRAL";
  if (last.ADX != null) techSignals.ADX = last.ADX > 25 ? "STRONG" : last.ADX > 20 ? "MODERATE" : "WEAK";
  const regime = detectRegime(enriched);
  const zs = zscoreSignals(enriched), mom = momentumSignals(enriched), vol = volumeSignals(enriched);
  const agg = aggregateSignals({ zscore: zs, momentum: mom, volume: vol });
  const statSignals = { zscore: zs, momentum: mom, volume: vol, aggregate: agg };
  const risk = calcRiskMetrics(enriched);
  const cp = last.Close;
  const valuation = calcValuation(enriched);
  const fundamentals = calcFundamentals(ticker, cp);
  const valuationAssumptions = buildValuationAssumptions(fundamentals, cp, risk);
  const valuationModels = runValuationModels(valuationAssumptions, cp);
  const rec = generateRecommendation(techSignals, regime, statSignals, risk, valuationModels);
  const atrVal = last.ATR || cp * 0.02;
  let target = null, stopLoss = null;
  if (rec.action.includes("BUY")) { target = cp + atrVal * (regime.overall.includes("STRONG") ? 3 : 2); stopLoss = cp - atrVal * (regime.overall.includes("STRONG") ? 1.5 : 1); }
  else if (rec.action.includes("SELL")) { target = cp - atrVal * 2; stopLoss = cp + atrVal; }
  return { ticker, data: enriched, currentPrice: cp, recommendation: rec, techSignals, regime, statSignals, risk, target, stopLoss, valuation, fundamentals, valuationModels };
}

const STRATEGIES = {
  STRONG_UPTREND: { strategy: "Trend Following (Long)", tactics: ["Buy breakouts", "Hold positions", "Trail stops"], avoid: ["Counter-trend trades"] },
  STRONG_DOWNTREND: { strategy: "Trend Following (Short)", tactics: ["Short breakdowns", "Tight stops", "Capital preservation"], avoid: ["Catching falling knives"] },
  TRENDING_UPTREND: { strategy: "Trend Following with Caution", tactics: ["Buy dips", "Partial positions", "Take profits"], avoid: ["Overextension"] },
  TRENDING_DOWNTREND: { strategy: "Defensive or Short", tactics: ["Reduce exposure", "Hedge positions"], avoid: ["Aggressive longs"] },
  MEAN_REVERTING: { strategy: "Mean Reversion", tactics: ["Buy oversold", "Sell overbought", "Range trade"], avoid: ["Chasing momentum"] },
  RANGING: { strategy: "Range Trading", tactics: ["Support / resistance", "Oscillator-based"], avoid: ["Trend following"] },
  HIGH_VOLATILITY: { strategy: "Reduced Position Size", tactics: ["Wider stops", "Options strategies"], avoid: ["Full positions"] },
  TRANSITIONING: { strategy: "Wait and Observe", tactics: ["Small positions", "Watch confirmation"], avoid: ["Large commitments"] },
};

const HEATMAP_UNIVERSE = [
  { ticker: "AAPL", name: "Apple", cap: 3800 }, { ticker: "MSFT", name: "Microsoft", cap: 3200 },
  { ticker: "NVDA", name: "NVIDIA", cap: 3100 }, { ticker: "GOOGL", name: "Alphabet", cap: 2300 },
  { ticker: "AMZN", name: "Amazon", cap: 2200 }, { ticker: "META", name: "Meta", cap: 1600 },
  { ticker: "TSLA", name: "Tesla", cap: 1200 }, { ticker: "BRK-B", name: "Berkshire", cap: 1000 },
  { ticker: "LLY", name: "Eli Lilly", cap: 780 }, { ticker: "V", name: "Visa", cap: 600 },
  { ticker: "JPM", name: "JPMorgan", cap: 580 }, { ticker: "WMT", name: "Walmart", cap: 550 },
  { ticker: "UNH", name: "UnitedHealth", cap: 520 }, { ticker: "XOM", name: "ExxonMobil", cap: 480 },
  { ticker: "NFLX", name: "Netflix", cap: 380 }, { ticker: "AMD", name: "AMD", cap: 280 },
  { ticker: "CRM", name: "Salesforce", cap: 260 }, { ticker: "COST", name: "Costco", cap: 380 },
  { ticker: "ADBE", name: "Adobe", cap: 220 }, { ticker: "PEP", name: "PepsiCo", cap: 210 },
];

const HOME_NEWS = [
  { title: "Mega-cap earnings set the tone for the week ahead", source: "Market Desk", time: "2h ago" },
  { title: "Rates pause keeps focus on growth and AI leaders", source: "Global Markets", time: "4h ago" },
  { title: "Energy rebounds while defensives stay bid", source: "Daily Brief", time: "6h ago" },
  { title: "Retail sales preview: expectations and risks", source: "Macro Wire", time: "9h ago" },
];

const MARKET_INDEXES = [
  { name: "S&P 500", value: 4922.4, change: 0.62 },
  { name: "Nasdaq 100", value: 17520.8, change: 0.84 },
  { name: "Dow Jones", value: 38210.1, change: -0.12 },
];

const POPULAR_STOCKS = [
  { ticker: "AAPL", name: "Apple", price: 189.12, change: 1.2, spark: [178, 182, 184, 183, 186, 188, 189] },
  { ticker: "NVDA", name: "NVIDIA", price: 708.4, change: -0.8, spark: [690, 706, 722, 715, 704, 698, 708] },
  { ticker: "MSFT", name: "Microsoft", price: 402.6, change: 0.5, spark: [392, 395, 399, 401, 398, 400, 403] },
  { ticker: "AMZN", name: "Amazon", price: 173.8, change: 0.9, spark: [166, 168, 169, 171, 172, 173, 174] },
  { ticker: "META", name: "Meta", price: 468.3, change: 1.6, spark: [438, 452, 459, 463, 470, 472, 468] },
];

const CHANGELOG = [
  {
    version: "0.9.1",
    date: "Feb 7, 2026",
    items: [
      "Brand refresh: logo icon, refined typography, ambient glow",
      "Home page hero section with live market status",
      "Consistent branding across loading, error, and empty states",
    ],
  },
  {
    version: "0.9.0",
    date: "Feb 2026",
    items: [
      "Home dashboard with news, market snapshot, and popular tickers",
      "Financials visuals refresh with radar + cash/debt views",
    ],
  },
  {
    version: "0.8.0",
    date: "Feb 2026",
    items: [
      "Stock vs Financials analysis split",
      "Valuation toolkit and fundamentals aggregator",
    ],
  },
];

const NEW_ITEMS = [
  "Refined logo and brand identity with icon mark",
  "Ambient glow animation integrated into logo",
  "Home page hero section and layout polish",
];

// ═══════════════════════════════════════════════════════════
// DESIGN SYSTEM + UI COMPONENTS
// ═══════════════════════════════════════════════════════════
const C = {
  cream: "#FAF7F2", warmWhite: "#F5F1EA", paper: "#EDE8DF",
  rule: "#D4CBBB", ruleFaint: "#E8E1D6",
  ink: "#1A1612", inkSoft: "#3D362E", inkMuted: "#7A7067", inkFaint: "#A69E94",
  up: "#1B6B3A", upBg: "#E8F5ED", down: "#9B1B1B", downBg: "#FBE8E8",
  hold: "#8B6914", holdBg: "#FDF6E3", accent: "#8B2500", chart4: "#5B4A8A",
};

const fmt = (n, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const fmtPct = (n, d = 1) => n != null ? `${Number(n).toFixed(d)}%` : "—";
const fmtMoney = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${Number(n).toFixed(2)}`;
};
const recColor = (a) => a?.includes("BUY") ? C.up : a?.includes("SELL") ? C.down : C.hold;
const valColor = (v) => v?.includes("OVER") ? C.down : v?.includes("UNDER") ? C.up : C.hold;
const latColor = (ms) => ms < 200 ? C.up : ms < 800 ? C.hold : C.down;

function LogoIcon({ size = 20, color }) {
  const c = color || C.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <path d="M6 26 L12 10 L18 18 L26 4" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="26" cy="4" r="2" fill={c} opacity="0.9" />
      <path d="M6 26 L12 10 L18 18 L26 4" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.15" style={{ filter: "blur(3px)" }} />
    </svg>
  );
}

function LogoGlow({ size = "md", muted = false }) {
  const scale = size === "lg" ? 1.6 : size === "sm" ? 0.7 : 1;
  const op = muted ? 0.3 : 1;
  return (
    <div style={{ position: "absolute", inset: -10 * scale, pointerEvents: "none", zIndex: 0, opacity: op }}>
      <span style={{ position: "absolute", width: 80 * scale, height: 80 * scale, left: -8 * scale, top: -18 * scale, background: "radial-gradient(circle, rgba(255,175,100,0.45), rgba(255,175,100,0) 70%)", filter: `blur(${14 * scale}px)`, animation: "logoBloom 6s ease-in-out infinite" }} />
      <span style={{ position: "absolute", width: 90 * scale, height: 90 * scale, left: 30 * scale, top: -12 * scale, background: "radial-gradient(circle, rgba(110,180,255,0.4), rgba(110,180,255,0) 70%)", filter: `blur(${16 * scale}px)`, animation: "logoBloomAlt 7.5s ease-in-out infinite" }} />
      <span style={{ position: "absolute", width: 70 * scale, height: 70 * scale, left: 14 * scale, top: 16 * scale, background: "radial-gradient(circle, rgba(170,110,255,0.35), rgba(170,110,255,0) 70%)", filter: `blur(${18 * scale}px)`, animation: "logoBloom 8s ease-in-out infinite reverse" }} />
    </div>
  );
}

function BrandMark({ size = 26, pro = false, muted = false, weight = 300, glow = false, iconOnly = false }) {
  const iconSize = Math.round(size * 0.78);
  const content = (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: Math.round(size * 0.28),
      lineHeight: 1,
      position: "relative",
    }}>
      {glow && <LogoGlow size={size > 30 ? "lg" : size < 20 ? "sm" : "md"} muted={muted} />}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>
        <LogoIcon size={iconSize} color={muted ? C.inkMuted : C.ink} />
      </div>
      {!iconOnly && (
        <div style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <span style={{
            fontSize: size,
            fontWeight: weight,
            fontFamily: "var(--display)",
            letterSpacing: "-0.02em",
            color: muted ? C.inkMuted : C.ink,
          }}>Analyze</span>
          <span style={{
            fontSize: size,
            fontWeight: Math.min(weight + 200, 700),
            fontFamily: "var(--display)",
            letterSpacing: "-0.02em",
            color: muted ? C.inkMuted : C.ink,
          }}>Alpha</span>
          {pro && (
            <span style={{
              fontSize: Math.round(size * 0.42),
              fontWeight: 700,
              fontFamily: "var(--body)",
              letterSpacing: "0.06em",
              color: muted ? C.inkFaint : C.inkSoft,
              textTransform: "uppercase",
              marginLeft: 2,
              alignSelf: "flex-start",
              marginTop: Math.round(size * 0.08),
            }}>Pro</span>
          )}
        </div>
      )}
    </div>
  );
  return content;
}

function ProTag({ small = false }) {
  return (
    <span style={{
      fontWeight: 700,
      fontSize: small ? 9 : 10,
      color: C.ink,
      fontFamily: "var(--body)",
      letterSpacing: "0.04em",
    }}>
      Pro
    </span>
  );
}

function ProGate({ title = "Pro Required", description, features }) {
  return (
    <div style={{ border: `1px dashed ${C.rule}`, background: C.warmWhite, padding: 28, textAlign: "center", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "center" }}><ProTag /></div>
      <div style={{ fontFamily: "var(--display)", fontSize: 22, color: C.ink }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.6 }}>{description}</div>}
      {features && (
        <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
          {features.map((f) => (
            <div key={f} style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--mono)" }}>{f}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Signal({ value }) {
  const col = {
    STRONG_BUY: C.up, BUY: C.up, OVERSOLD: C.up, BULLISH: C.up,
    NEUTRAL: C.hold, SELL: C.down, STRONG_SELL: C.down, OVERBOUGHT: C.down, BEARISH: C.down,
    STRONG: C.up, MODERATE: C.hold, WEAK: C.inkMuted,
    HIGH: C.down, LOW: C.up, NORMAL: C.hold, ELEVATED: C.accent,
  }[value] || C.inkMuted;
  return <span style={{ color: col, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{value}</span>;
}

function Row({ label, value, color, border = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: border ? `1px solid ${C.ruleFaint}` : "none" }}>
      <span style={{ color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>{label}</span>
      <span style={{ color: color || C.ink, fontSize: 13, fontFamily: "var(--mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Section({ title, children, style, actions }) {
  return (
    <div style={style}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--body)", paddingBottom: 8, borderBottom: `2px solid ${C.ink}`, marginBottom: 10 }}>
          <span>{title}</span>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function Sparkline({ data, color = C.ink }) {
  if (!data || data.length < 2) return null;
  const width = 120;
  const height = 36;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LiveBadge({ latency, source }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.04em" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.up, display: "inline-block", animation: "livePulse 2s ease infinite", boxShadow: `0 0 6px ${C.up}55` }} />
      <span style={{ color: C.up }}>LIVE</span>
      <span style={{ color: C.inkFaint }}>·</span>
      <span style={{ color: C.inkMuted, fontSize: 9 }}>{source}</span>
      <span style={{ color: latColor(latency), fontSize: 9 }}>{latency}ms</span>
    </span>
  );
}

function usePrevious(value) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

function AnimatedPrice({ price, prevPrice, large = false }) {
  const safePrev = prevPrice ?? price;
  const dir = price > safePrev ? "up" : price < safePrev ? "down" : "same";
  const col = dir === "up" ? C.up : dir === "down" ? C.down : C.ink;
  const sz = large ? 42 : 16;
  const next = `$${fmt(price)}`;
  const prev = `$${fmt(safePrev)}`;
  const len = Math.max(next.length, prev.length);
  const nextPad = next.padStart(len, " ");
  const prevPad = prev.padStart(len, " ");
  const digitCount = nextPad.split("").filter(ch => ch >= "0" && ch <= "9").length;
  let digitIndex = 0;

  return (
    <div style={{ overflow: "hidden", position: "relative", height: large ? 52 : 22, color: col, whiteSpace: "pre" }}>
      <div style={{
        fontSize: sz, fontWeight: large ? 300 : 600,
        fontFamily: large ? "var(--display)" : "var(--mono)",
        lineHeight: large ? "52px" : "22px",
        fontVariantNumeric: "tabular-nums",
        transition: "color 0.6s ease",
      }}>
        {nextPad.split("").map((ch, i) => {
          const prevCh = prevPad[i];
          const isDigit = ch >= "0" && ch <= "9";
          const changed = isDigit && ch !== prevCh;
          const anim = changed && dir !== "same" ? `slide${dir === "up" ? "Up" : "Down"} 0.35s cubic-bezier(0.16,1,0.3,1)` : "none";
          const order = isDigit ? (digitCount - 1 - digitIndex) : 0;
          if (isDigit) digitIndex += 1;
          const delay = changed ? `${Math.max(0, order) * 0.02}s` : "0s";
          return (
            <span key={`${i}-${ch}`} style={{ display: "inline-block", animation: anim, animationDelay: delay, animationFillMode: "both" }}>
              {ch === " " ? "\u00A0" : ch}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CandlestickSeries({ data, xAxisMap, yAxisMap }) {
  const xAxis = Object.values(xAxisMap || {})[0];
  const yAxis = Object.values(yAxisMap || {})[0];
  if (!xAxis || !yAxis) return null;
  const xScale = xAxis.scale;
  const yScale = yAxis.scale;
  const band = typeof xScale.bandwidth === "function" ? xScale.bandwidth() : 10;
  const bodyWidth = Math.max(4, band * 0.85);

  return (
    <g>
      {(data || []).map((d, i) => {
        if (d == null || d.o == null || d.h == null || d.l == null || d.c == null) return null;
        const x = xScale(d.n) + band / 2;
        const open = d.o, close = d.c, high = d.h, low = d.l;
        const color = close >= open ? C.up : C.down;
        const bodyTop = yScale(Math.max(open, close));
        const bodyBottom = yScale(Math.min(open, close));
        const wickTop = yScale(high);
        const wickBottom = yScale(low);
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={wickTop} y2={wickBottom} stroke={color} strokeWidth={1.2} />
            <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
          </g>
        );
      })}
    </g>
  );
}

function ExpandedChartModal({ title, mode, data, onClose, dataKey }) {
  const [window, setWindow] = useState({ start: 0, end: Math.max(0, (data?.length || 1) - 1) });
  const [chartType, setChartType] = useState(mode === "price" ? "candles" : "line");
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const initRef = useRef({ key: null, mode: null });
  const windowRef = useRef(window);
  const rafRef = useRef(null);
  const pendingRef = useRef(null);

  useEffect(() => {
    windowRef.current = window;
  }, [window]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const len = data?.length || 0;
    if (!len) return;
    const key = dataKey || title || "chart";
    if (initRef.current.key === key && initRef.current.mode === mode) return;
    initRef.current = { key, mode };
    const end = len - 1;
    const size = Math.min(200, len);
    const start = Math.max(0, end - size + 1);
    const next = { start, end };
    windowRef.current = next;
    pendingRef.current = null;
    setWindow(next);
    setChartType(mode === "price" ? "candles" : "line");
  }, [data?.length, mode, dataKey, title]);

  const clampWindow = (start, end) => {
    if (!data || data.length === 0) return { start: 0, end: 0 };
    const max = data.length - 1;
    let s = Math.max(0, start);
    let e = Math.min(max, end);
    const minSize = Math.min(30, max + 1);
    if (e - s + 1 < minSize) {
      e = Math.min(max, s + minSize - 1);
      s = Math.max(0, e - minSize + 1);
    }
    return { start: s, end: e };
  };

  const commitWindow = (next) => {
    pendingRef.current = next;
    windowRef.current = next;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current) {
        setWindow(pendingRef.current);
        pendingRef.current = null;
      }
    });
  };

  const shiftWindow = (delta) => {
    const base = pendingRef.current || windowRef.current;
    const size = base.end - base.start + 1;
    const next = clampWindow(base.start + delta, base.start + delta + size - 1);
    commitWindow(next);
  };

  const zoomWindow = (factor) => {
    const base = pendingRef.current || windowRef.current;
    if (!data || data.length === 0) return;
    const size = base.end - base.start + 1;
    const target = Math.max(30, Math.min(data.length, Math.round(size * factor)));
    const center = (base.start + base.end) / 2;
    const start = Math.round(center - target / 2);
    const end = start + target - 1;
    commitWindow(clampWindow(start, end));
  };

  const onWheel = (e) => {
    e.preventDefault();
    if (!data || data.length === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const size = windowRef.current.end - windowRef.current.start + 1;
    const absX = Math.abs(e.deltaX);
    const absY = Math.abs(e.deltaY);
    if (absX > 0.5) {
      const width = rect?.width || 1;
      const shift = Math.round((e.deltaX / width) * size);
      if (shift !== 0) shiftWindow(shift);
      return;
    }
    if (absY > 0.5) {
      zoomWindow(e.deltaY > 0 ? 1.1 : 0.9);
    }
  };

  const onMouseDown = (e) => {
    dragRef.current = { x: e.clientX, start: windowRef.current.start, end: windowRef.current.end };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.x;
    const size = dragRef.current.end - dragRef.current.start + 1;
    const shift = Math.round(-dx / rect.width * size);
    const next = clampWindow(dragRef.current.start + shift, dragRef.current.end + shift);
    commitWindow(next);
  };
  const onMouseUp = () => { dragRef.current = null; };

  const windowData = useMemo(() => data?.slice(window.start, window.end + 1) || [], [data, window.start, window.end]);
  const controlBtn = (on) => ({
    padding: "6px 10px",
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

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.35)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.cream, border: `1px solid ${C.rule}`, width: "96%", height: "92%", maxWidth: 1400, boxShadow: "8px 16px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 18, color: C.ink }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {mode === "price" && (
              <>
                <button onClick={() => setChartType("line")} style={controlBtn(chartType === "line")}>Line</button>
                <button onClick={() => setChartType("candles")} style={controlBtn(chartType === "candles")}>Candles</button>
              </>
            )}
            <button onClick={() => zoomWindow(0.85)} style={controlBtn(false)}>Zoom In</button>
            <button onClick={() => zoomWindow(1.15)} style={controlBtn(false)}>Zoom Out</button>
            <button onClick={() => commitWindow(clampWindow(0, (data?.length || 1) - 1))} style={controlBtn(false)}>Reset</button>
            <button onClick={onClose} style={controlBtn(false)}>Close</button>
          </div>
        </div>
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div ref={containerRef} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            style={{ flex: 1, background: C.warmWhite, border: `1px solid ${C.rule}`, position: "relative", cursor: dragRef.current ? "grabbing" : "grab", userSelect: "none" }}>
            <ResponsiveContainer width="100%" height="100%">
              {mode === "volume" ? (
                <BarChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                </BarChart>
              ) : mode === "rsi" ? (
                <LineChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} ticks={[30, 70]} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={70} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} />
                </LineChart>
              ) : mode === "macd" ? (
                <ComposedChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={0} stroke={C.rule} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Bar dataKey="mh" fill={C.inkSoft + "20"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                  <Line dataKey="macd" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="ms" stroke={C.accent} dot={false} strokeWidth={1} />
                </ComposedChart>
              ) : mode === "stoch" ? (
                <LineChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={40} />
                  <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
                  <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} />
                </LineChart>
              ) : (
                <ComposedChart data={windowData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                  <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
                  <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" />
                  <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" />
                  <Line dataKey="s20" stroke={C.accent + "AA"} dot={false} strokeWidth={1} />
                  <Line dataKey="s50" stroke={C.chart4 + "88"} dot={false} strokeWidth={1} />
                  <Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} />
                  {chartType === "candles" ? (
                    <Customized component={CandlestickSeries} />
                  ) : (
                    <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} />
                  )}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)" }}>
            Horizontal scroll pans. Vertical scroll adjusts the selection window. Drag to move. Window: {window.end - window.start + 1} / {data?.length || 0}
          </div>
          <div style={{ height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data || []}>
                <XAxis dataKey="n" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Line dataKey="c" stroke={C.inkSoft} dot={false} strokeWidth={1} />
                <Brush dataKey="n" height={22} stroke={C.rule} fill={C.warmWhite} travellerWidth={8}
                  startIndex={window.start} endIndex={window.end}
                  onChange={(r) => {
                    if (!r || r.startIndex == null || r.endIndex == null) return;
                    commitWindow(clampWindow(r.startIndex, r.endIndex));
                  }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({ ticker, isPro }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 420, gap: 20, position: "relative" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, zIndex: 1 }}>
        <div style={{ position: "relative" }}>
          <LogoGlow size="lg" />
          <div style={{ position: "relative", zIndex: 1, animation: "alphaFloat 3s ease-in-out infinite" }}>
            <LogoIcon size={40} />
          </div>
        </div>
        <BrandMark size={28} pro={isPro} weight={300} />
      </div>
      <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.inkMuted, zIndex: 1 }}>
        Analyzing <span style={{ fontWeight: 700, color: C.ink, fontFamily: "var(--mono)" }}>{ticker}</span>
      </div>
      <div style={{ width: 200, height: 2, background: C.ruleFaint, borderRadius: 2, overflow: "hidden", zIndex: 1 }}>
        <div style={{ width: "55%", height: "100%", background: "linear-gradient(90deg, rgba(26,22,18,0), rgba(26,22,18,0.7), rgba(26,22,18,0))", animation: "proSweep 1.6s ease infinite" }} />
      </div>
      <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--mono)", zIndex: 1, letterSpacing: "0.04em" }}>Live data via Yahoo Finance</div>
    </div>
  );
}

function ErrorScreen({ error, debugInfo, onRetry }) {
  const [showDebug, setShowDebug] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 16 }}>
      <BrandMark size={24} muted glow />
      <div style={{ fontSize: 24, fontFamily: "var(--display)", color: C.ink, fontWeight: 600 }}>Connection Failed</div>
      <div style={{ fontSize: 14, color: C.inkMuted, fontFamily: "var(--body)", textAlign: "center", maxWidth: 440, lineHeight: 1.6 }}>
        Unable to retrieve market data. If running locally, make sure the proxy server is running with <code style={{ background: C.paper, padding: "2px 6px", fontFamily: "var(--mono)", fontSize: 12 }}>npm start</code>.
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button onClick={onRetry} style={{ padding: "10px 28px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Retry</button>
        <button onClick={() => setShowDebug(!showDebug)} style={{ padding: "10px 20px", background: "transparent", color: C.inkMuted, border: `1px solid ${C.rule}`, fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>{showDebug ? "Hide" : "Debug"} Info</button>
      </div>
      {showDebug && debugInfo && (
        <div style={{ marginTop: 12, padding: 16, background: C.warmWhite, border: `1px solid ${C.rule}`, maxWidth: 600, width: "100%", fontSize: 11, fontFamily: "var(--mono)", color: C.inkSoft, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
          {JSON.stringify(debugInfo, null, 2)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME TAB
// ═══════════════════════════════════════════════════════════
function HomeTab({ onAnalyze }) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Hero welcome */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 32px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ position: "relative" }}>
            <LogoGlow size="lg" />
            <div style={{ position: "relative", zIndex: 1 }}>
              <LogoIcon size={36} />
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 300, color: C.ink, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              <span>Analyze</span><span style={{ fontWeight: 500 }}>Alpha</span>
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", marginTop: 6, letterSpacing: "0.02em" }}>
              Quantitative analysis across technical, statistical, and fundamental signals
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.cream, border: `1px solid ${C.ruleFaint}` }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.up, animation: "livePulse 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted, letterSpacing: "0.06em" }}>MARKETS OPEN</span>
          </div>
        </div>
      </div>

      {/* Market indexes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {MARKET_INDEXES.map((idx) => (
          <div key={idx.name} style={{ padding: "18px 20px", background: C.warmWhite, border: `1px solid ${C.rule}`, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: C.inkMuted, fontFamily: "var(--body)", fontWeight: 600 }}>{idx.name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 24, fontFamily: "var(--display)", color: C.ink, fontWeight: 400 }}>{idx.value.toFixed(1)}</span>
              <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600, color: idx.change >= 0 ? C.up : C.down }}>
                {idx.change >= 0 ? "+" : ""}{fmtPct(idx.change, 2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* News + Popular */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
        <Section title="Market News">
          <div style={{ display: "grid", gap: 1 }}>
            {HOME_NEWS.map((n, i) => (
              <div key={n.title} style={{ padding: "14px 16px", background: C.warmWhite, borderLeft: `2px solid ${i === 0 ? C.ink : "transparent"}`, borderRight: `1px solid ${C.rule}`, borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}` }}>
                <div style={{ fontSize: 13, fontFamily: "var(--body)", color: C.ink, fontWeight: 500, lineHeight: 1.4 }}>{n.title}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 8, fontSize: 10, fontFamily: "var(--mono)", color: C.inkFaint, letterSpacing: "0.02em" }}>
                  <span style={{ fontWeight: 600 }}>{n.source}</span>
                  <span style={{ color: C.ruleFaint }}>|</span>
                  <span>{n.time}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Trending">
          <div style={{ display: "grid", gap: 1 }}>
            {POPULAR_STOCKS.map((s) => (
              <button key={s.ticker} onClick={() => onAnalyze?.(s.ticker)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: C.warmWhite, border: `1px solid ${C.rule}`, cursor: "pointer", width: "100%", textAlign: "left", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.paper}
                onMouseLeave={e => e.currentTarget.style.background = C.warmWhite}>
                <div style={{ display: "grid", gap: 2, minWidth: 60 }}>
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12, color: C.ink }}>{s.ticker}</span>
                  <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)" }}>{s.name}</span>
                </div>
                <Sparkline data={s.spark} color={s.change >= 0 ? C.up : C.down} />
                <div style={{ textAlign: "right", minWidth: 56 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: C.ink }}>${fmt(s.price)}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: s.change >= 0 ? C.up : C.down }}>
                    {s.change >= 0 ? "+" : ""}{fmtPct(s.change, 1)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>
      </div>

      {/* New + Changelog */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Section title="What's New">
          <div style={{ display: "grid", gap: 1 }}>
            {NEW_ITEMS.map((item) => (
              <div key={item} style={{ padding: "12px 14px", background: C.warmWhite, border: `1px solid ${C.rule}`, fontSize: 12, color: C.inkSoft, fontFamily: "var(--body)", display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: C.inkFaint, fontSize: 8 }}>+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Changelog">
          <div style={{ display: "grid", gap: 12 }}>
            {CHANGELOG.map((entry) => (
              <div key={entry.version} style={{ padding: "14px 16px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: C.ink }}>v{entry.version}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: C.inkFaint }}>{entry.date}</span>
                </div>
                <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                  {entry.items.map((it) => (
                    <div key={it} style={{ fontSize: 11, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5 }}>{it}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS TAB
// ═══════════════════════════════════════════════════════════
function AnalysisTab({ result, livePrice, latency, isPro }) {
  const [subTab, setSubTab] = useState("stock");
  const [finPeriod, setFinPeriod] = useState("LTM");
  const [assumptions, setAssumptions] = useState(null);
  const [chartType, setChartType] = useState("line");
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

  useEffect(() => {
    if (!result) return;
    setSubTab("stock");
    setFinPeriod(result.fundamentals?.periods?.[0]?.label || "LTM");
    setAssumptions(result.valuationModels?.assumptions || null);
    setChartType("line");
  }, [result]);

  if (!result) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 14 }}>
        <BrandMark size={26} muted glow />
        <div style={{ fontSize: 26, fontFamily: "var(--display)", color: C.inkSoft, marginTop: 10, fontWeight: 400 }}>Enter a ticker to begin</div>
        <div style={{ fontSize: 13, color: C.inkMuted, fontFamily: "var(--body)" }}>Type a symbol above and press Analyze</div>
      </div>
    );
  }

  const { ticker, recommendation: rec, techSignals, regime, statSignals, risk, target, stopLoss, data, valuation: marketValuation, fundamentals, valuationModels } = result;
  const strat = STRATEGIES[regime.overall] || STRATEGIES.TRANSITIONING;
  const stretchPos = Math.min(100, Math.max(0, marketValuation?.stretch || 0));
  const prevClose = data.length > 1 ? data[data.length - 2].Close : price;
  const change = price - prevClose, pctChange = (change / prevClose) * 100;
  const chartSlice = data.slice(-60);
  const chartData = chartSlice.map((d, i) => {
    const isLast = i === chartSlice.length - 1;
    const live = isLast && livePrice != null ? livePrice : d.Close;
    const high = isLast && livePrice != null ? Math.max(d.High ?? live, live) : d.High;
    const low = isLast && livePrice != null ? Math.min(d.Low ?? live, live) : d.Low;
    return { n: d.date.slice(5), c: live, o: d.Open, h: high, l: low, s20: d.SMA_20, s50: d.SMA_50, bu: d.BB_Upper, bl: d.BB_Lower };
  });
  const finData = fundamentals?.periods?.find(p => p.label === finPeriod) || fundamentals?.periods?.[0];
  const marginRadar = [
    { metric: "Gross", value: (finData?.grossMargin || 0) * 100 },
    { metric: "Operating", value: (finData?.opMargin || 0) * 100 },
    { metric: "Net", value: (finData?.netMargin || 0) * 100 },
    { metric: "FCF", value: finData?.revenue ? ((finData.fcf || 0) / finData.revenue) * 100 : 0 },
  ];
  const radarMax = Math.max(60, ...marginRadar.map(m => m.value || 0));
  const cashDebt = [
    { name: "Cash", value: fundamentals?.cash || 0, color: C.up },
    { name: "Debt", value: fundamentals?.debt || 0, color: C.down },
  ];
  const netCash = (fundamentals?.cash || 0) - (fundamentals?.debt || 0);
  const updateAssumption = (key, value) => {
    setAssumptions(prev => ({ ...(prev || valuationModels?.assumptions || {}), [key]: value }));
  };
  const inputVal = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : "";
  const subTabStyle = (t, locked = false) => ({
    padding: "6px 0", marginRight: 18, background: "none", border: "none",
    borderBottom: subTab === t ? `2px solid ${C.ink}` : "2px solid transparent",
    color: subTab === t ? C.ink : locked ? C.inkFaint : C.inkMuted, fontSize: 11, fontWeight: subTab === t ? 700 : 500,
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
      <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8, marginBottom: 18 }}>
        <button onClick={() => setSubTab("stock")} style={subTabStyle("stock")}>Stock</button>
        <button onClick={() => setSubTab("financials")} style={subTabStyle("financials", !isPro)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Financials
            {!isPro && <ProTag small />}
          </span>
        </button>
      </div>

      {subTab === "stock" && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8, fontFamily: "var(--body)" }}>Verdict</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: recColor(rec.action), fontFamily: "var(--display)", lineHeight: 1 }}>{rec.action}</div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, fontFamily: "var(--body)" }}>
                <span style={{ color: C.inkMuted }}>Confidence <strong style={{ color: C.ink }}>{fmtPct(rec.confidence * 100, 0)}</strong></span>
                <span style={{ color: C.inkMuted }}>Score <strong style={{ color: C.ink }}>{fmt(rec.score)}</strong></span>
              </div>
              {liveModels?.anchor && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: C.paper, borderLeft: `3px solid ${valColor(liveModels.signal)}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>Valuation Anchor</div>
                  <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: C.inkSoft, marginTop: 4 }}>
                    {liveModels.signal} · ${fmt(liveModels.anchor)} {liveModels.upside != null && `(${liveModels.upside >= 0 ? "+" : ""}${fmtPct(liveModels.upside * 100, 1)})`}
                  </div>
                </div>
              )}
            </div>
            {target && (
              <Section title="Price Targets">
                <Row label="Target" value={`$${fmt(target)}`} color={C.up} />
                <Row label="Stop Loss" value={`$${fmt(stopLoss)}`} color={C.down} />
                <Row label="Risk / Reward" value={`${fmt(Math.abs(target - price) / Math.abs(price - (stopLoss || price)))}x`} border={false} />
              </Section>
            )}
            <Section title="Technical Signals">
              {Object.entries(techSignals).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                  <span style={{ color: C.inkMuted, fontSize: 12 }}>{k}</span><Signal value={v} />
                </div>
              ))}
            </Section>
            <Section title="Risk Profile">
              <Row label="Risk Level" value={risk.riskLevel} color={risk.riskLevel === "HIGH" ? C.down : risk.riskLevel === "MEDIUM" ? C.hold : C.up} />
              <Row label="Volatility" value={fmtPct(risk.volatility)} />
              <Row label="Max Drawdown" value={fmtPct(risk.maxDrawdown)} color={C.down} />
              <Row label="Sharpe" value={fmt(risk.sharpe)} color={risk.sharpe > 1 ? C.up : risk.sharpe > 0 ? C.hold : C.down} />
              <Row label="Sortino" value={fmt(risk.sortino)} />
              <Row label="VaR 95%" value={fmtPct(risk.var95)} color={C.down} border={false} />
            </Section>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Section title="Price — Last 60 Sessions">
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setChartType("line")} style={chartToggle(chartType === "line")}>Line</button>
            <button onClick={() => setChartType("candles")} style={chartToggle(chartType === "candles")}>Candles</button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
              <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={9} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
              <Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" name="BB Upper" />
              <Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" name="BB Lower" />
              <Line dataKey="s20" stroke={C.accent + "AA"} dot={false} strokeWidth={1} name="SMA 20" />
              <Line dataKey="s50" stroke={C.chart4 + "88"} dot={false} strokeWidth={1} name="SMA 50" />
              {chartType === "candles" ? (
                <Customized component={CandlestickSeries} />
              ) : (
                <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={2} name="Close" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </Section>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <Section title="Valuation Analysis">
                <div style={{ fontSize: 16, fontWeight: 700, color: valColor(marketValuation.verdict), fontFamily: "var(--display)", marginBottom: 10, lineHeight: 1.2 }}>{marketValuation.verdict}</div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Stretch Index</div>
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
                    <span>Undervalued</span><span>{fmt(marketValuation.stretch, 0)}/100</span><span>Overvalued</span>
                  </div>
                </div>
                <Row label="vs SMA 200" value={`${marketValuation.devSma200 > 0 ? "+" : ""}${fmtPct(marketValuation.devSma200)}`} color={Math.abs(marketValuation.devSma200) > 15 ? C.down : C.inkSoft} />
                <Row label="vs SMA 50" value={`${marketValuation.devSma50 > 0 ? "+" : ""}${fmtPct(marketValuation.devSma50)}`} />
                <Row label="Bollinger %B" value={fmt(marketValuation.pctB, 2)} color={marketValuation.pctB > 0.8 ? C.down : marketValuation.pctB < 0.2 ? C.up : C.hold} />
                <Row label="52W Range" value={`${fmtPct(marketValuation.range52Pct, 0)} from low`} />
                <Row label="Fair Value Est." value={`$${fmt(marketValuation.fairValue)}`} color={price > marketValuation.fairValue * 1.1 ? C.down : price < marketValuation.fairValue * 0.9 ? C.up : C.hold} border={false} />
              </Section>
              <Section title="Market Regime">
                <div style={{ fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: "var(--display)", marginBottom: 12, lineHeight: 1.2 }}>{regime.overall.replace(/_/g, " ")}</div>
                <Row label="Direction" value={regime.trend.direction} color={regime.trend.direction === "UPTREND" ? C.up : regime.trend.direction === "DOWNTREND" ? C.down : C.hold} />
                <Row label="Strength" value={`${fmt(regime.trend.strength, 0)} / 100`} />
                <Row label="Volatility" value={regime.volatility.classification} />
                <Row label="Hurst" value={fmt(regime.hurst, 3)} color={regime.hurst > 0.5 ? C.up : C.down} />
                <div style={{ marginTop: 12, padding: "10px 12px", background: C.paper, borderLeft: `3px solid ${C.accent}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, fontFamily: "var(--body)" }}>{strat.strategy}</div>
                  <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4, lineHeight: 1.5, fontFamily: "var(--body)" }}>{strat.tactics.join(" · ")}</div>
                  <div style={{ fontSize: 10, color: C.down, marginTop: 4, fontFamily: "var(--body)" }}>Avoid: {strat.avoid.join(", ")}</div>
                </div>
              </Section>
            </div>
            <Section title="Statistical Signals">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
                {["zscore", "momentum", "volume", "aggregate"].map(k => (
                  <div key={k} style={{ padding: "8px 0" }}>
                    <div style={{ fontSize: 10, color: C.inkMuted, textTransform: "capitalize", fontFamily: "var(--body)", marginBottom: 4 }}>{k === "aggregate" ? "Composite" : k}</div>
                    <Signal value={statSignals[k].signal} />
                    <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: C.inkSoft, marginTop: 2 }}>
                      {k === "zscore" ? fmt(statSignals[k].zscore) : k === "momentum" ? fmtPct(statSignals[k].avgMomentum) : k === "volume" ? fmt(statSignals[k].volumeZscore) : fmt(statSignals[k].score)}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      )}

      {subTab === "financials" && !isPro && (
        <ProGate
          title="Financials Are Pro"
          description="Unlock company financials, valuation tooling, and multi-period statement analysis."
          features={["Income statements · Cash flow · Balance sheet", "DCF, DDM, and multiples modeling", "Historical margin and growth trends"]}
        />
      )}

      {subTab === "financials" && isPro && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Section title="Fundamental Snapshot">
              <Row label="Market Cap" value={fmtMoney(fundamentals?.marketCap)} />
              <Row label="Revenue" value={fmtMoney(finData?.revenue)} />
              <Row label="Net Income" value={fmtMoney(finData?.netIncome)} />
              <Row label="Free Cash Flow" value={fmtMoney(finData?.fcf)} />
              <Row label="Revenue Growth" value={fmtPct((fundamentals?.revenueGrowth || 0) * 100, 1)} />
              <Row label="Gross Margin" value={fmtPct((finData?.grossMargin || 0) * 100)} />
              <Row label="Operating Margin" value={fmtPct((finData?.opMargin || 0) * 100)} />
              <Row label="Net Margin" value={fmtPct((finData?.netMargin || 0) * 100)} border={false} />
            </Section>
            <Section title="Balance Sheet">
              <Row label="Cash" value={fmtMoney(fundamentals?.cash)} />
              <Row label="Debt" value={fmtMoney(fundamentals?.debt)} />
              <Row label="Debt / Equity" value={fmt(fundamentals?.debtToEquity, 2)} />
              <Row label="Current Ratio" value={fmt(fundamentals?.ratios?.currentRatio, 2)} border={false} />
            </Section>
            <Section title="Per Share">
              <Row label="EPS" value={`$${fmt(fundamentals?.perShare?.eps, 2)}`} />
              <Row label="FCF / Share" value={`$${fmt(fundamentals?.perShare?.fcfPerShare, 2)}`} />
              <Row label="Dividend / Share" value={`$${fmt(fundamentals?.perShare?.dividendPerShare, 2)}`} border={false} />
            </Section>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Section title="Financials Overview">
              <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.85fr", gap: 16 }}>
                <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)" }}>Revenue + FCF Margin</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={finSeries} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={44}
                        tickFormatter={(v) => `$${v}B`} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 60]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={32}
                        tickFormatter={(v) => `${v}%`} />
                      <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }}
                        formatter={(v, name) => [name === "FCF Margin" ? `${fmt(v, 1)}%` : `$${fmt(v, 2)}B`, name]} />
                      <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill={C.inkSoft + "AA"} radius={[2, 2, 0, 0]} />
                      <Bar yAxisId="left" dataKey="fcf" name="FCF" fill={C.accent + "AA"} radius={[2, 2, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="fcfMargin" name="FCF Margin" stroke={C.up} dot={false} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ padding: 12, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                    <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)" }}>Margin Radar</div>
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
                    <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 6, fontFamily: "var(--body)" }}>Cash vs Debt</div>
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={cashDebt} dataKey="value" nameKey="name" innerRadius={36} outerRadius={56} paddingAngle={2} stroke="none">
                          {cashDebt.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted }}>
                      <span>Net Cash</span>
                      <span style={{ color: netCash >= 0 ? C.up : C.down }}>{fmtMoney(netCash)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Section>
            <Section title="Fundamental Data Aggregator">
              <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.5, marginBottom: 10 }}>
                Collects revenue, earnings, margins, debt, and cash flow by ticker and fiscal period. Designed to plug into APIs or SEC filings — this build uses modeled data for demonstration.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 10, color: C.inkMuted, fontFamily: "var(--body)" }}>Fiscal Period</span>
                <select value={finPeriod} onChange={e => setFinPeriod(e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}>
                  {(fundamentals?.periods || []).map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                <span style={{ marginLeft: "auto", fontSize: 9, color: C.inkFaint, fontFamily: "var(--mono)" }}>Source: {fundamentals?.source}</span>
              </div>
              <div style={{ border: `1px solid ${C.rule}`, background: C.warmWhite }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--mono)" }}>
                  <thead>
                    <tr style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: C.inkMuted }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>Period</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>Revenue</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>Net Income</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>FCF</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${C.rule}` }}>Net Margin</th>
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
            <Section title="Valuation Model Toolkit">
              <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.5, marginBottom: 10 }}>
                Estimates intrinsic value using DCF, dividend discount, and multiples analysis. Use auto-estimates or override assumptions below to run what-if scenarios.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>FCF / Share</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.fcfPerShare)} onChange={e => updateAssumption("fcfPerShare", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>EPS</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.eps)} onChange={e => updateAssumption("eps", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Dividend / Share</div>
                  <input type="number" step="0.01" value={inputVal(assumptions?.dividendPerShare)} onChange={e => updateAssumption("dividendPerShare", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Growth (5y %)</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.growthRate || 0) * 100, 1)} onChange={e => updateAssumption("growthRate", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Discount / WACC %</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.discountRate || 0) * 100, 1)} onChange={e => updateAssumption("discountRate", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Terminal Growth %</div>
                  <input type="number" step="0.1" value={inputVal((assumptions?.terminalGrowth || 0) * 100, 1)} onChange={e => updateAssumption("terminalGrowth", (parseFloat(e.target.value) || 0) / 100)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Target P/E</div>
                  <input type="number" step="0.1" value={inputVal(assumptions?.targetPE, 1)} onChange={e => updateAssumption("targetPE", parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>Projection Years</div>
                  <input type="number" step="1" min="3" max="10" value={inputVal(assumptions?.years, 0)} onChange={e => updateAssumption("years", Math.max(1, parseInt(e.target.value || "0", 10)))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 12 }}>
                {[
                  ["DCF", liveModels.dcf],
                  ["Dividend Discount", liveModels.ddm],
                  ["Multiples", liveModels.multiples],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: "8px 10px", background: C.warmWhite, border: `1px solid ${C.rule}` }}>
                    <div style={{ fontSize: 10, color: C.inkMuted, marginBottom: 4, fontFamily: "var(--body)" }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--mono)", color: C.ink }}>{value ? `$${fmt(value)}` : "—"}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: "10px 12px", background: C.paper, borderLeft: `3px solid ${valColor(liveModels.signal)}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>Valuation Anchor</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: valColor(liveModels.signal), fontFamily: "var(--display)", marginTop: 4 }}>{liveModels.signal}</div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4, fontFamily: "var(--mono)" }}>
                  Anchor {liveModels.anchor ? `$${fmt(liveModels.anchor)}` : "—"} · Upside {liveModels.upside != null ? `${liveModels.upside >= 0 ? "+" : ""}${fmtPct(liveModels.upside * 100, 1)}` : "—"}
                </div>
                <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 4, fontFamily: "var(--body)" }}>Used as long-term context alongside technical signals.</div>
              </div>
              {liveModels.issues.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 10, color: C.down, fontFamily: "var(--body)" }}>
                  {liveModels.issues.join(" ")}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CHARTS TAB
// ═══════════════════════════════════════════════════════════
function ChartsTab({ result, livePrice }) {
  const [show, setShow] = useState({ sma: true, bb: true, vol: true, rsi: true, macd: false, stoch: false });
  const [chartType, setChartType] = useState("line");
  const [expanded, setExpanded] = useState(null);
  const data = result?.data;
  const ticker = result?.ticker || "";
  const toggle = k => setShow(p => ({ ...p, [k]: !p[k] }));
  const cd = useMemo(() => {
    if (!data || !data.length) return [];
    return data.map((d, i) => {
      const isLast = i === data.length - 1;
      const live = isLast && livePrice != null ? livePrice : d.Close;
      const high = isLast && livePrice != null ? Math.max(d.High ?? live, live) : d.High;
      const low = isLast && livePrice != null ? Math.min(d.Low ?? live, live) : d.Low;
      return {
        n: d.date.slice(5), c: live, o: d.Open, h: high, l: low, v: d.Volume,
        s20: d.SMA_20, s50: d.SMA_50, s200: d.SMA_200, bu: d.BB_Upper, bl: d.BB_Lower, bm: d.BB_Middle,
        rsi: d.RSI, macd: d.MACD, ms: d.MACD_Signal, mh: d.MACD_Hist, sk: d.Stoch_K, sd: d.Stoch_D
      };
    });
  }, [data, livePrice]);
  const btn = (on) => ({ padding: "5px 14px", border: `1px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.cream : C.inkMuted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.04em" });
  const h = show.rsi || show.macd || show.stoch ? 260 : 380;
  const expandBtn = { padding: "4px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase" };

  useEffect(() => {
    setChartType("line");
    setExpanded(null);
  }, [result?.ticker]);

  if (!result) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: C.inkMuted, fontFamily: "var(--display)", fontSize: 24 }}>Run an analysis first</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${C.rule}`, paddingBottom: 12, alignItems: "center" }}>
        {[["sma", "Moving Avg"], ["bb", "Bollinger"], ["vol", "Volume"], ["rsi", "RSI"], ["macd", "MACD"], ["stoch", "Stochastic"]].map(([k, l]) => (
          <button key={k} onClick={() => toggle(k)} style={btn(show[k])}>{l}</button>
        ))}
        <span style={{ marginLeft: 8, fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.1em" }}>Chart</span>
        <button onClick={() => setChartType("line")} style={btn(chartType === "line")}>Line</button>
        <button onClick={() => setChartType("candles")} style={btn(chartType === "candles")}>Candles</button>
      </div>
      <Section title={`${ticker} — Full Period`} actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "price", title: `${ticker} — Full Period` })}>Expand</button>}>
        <ResponsiveContainer width="100%" height={h}>
          <ComposedChart data={cd} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
            <XAxis dataKey="n" tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} tickLine={false} interval={Math.floor(cd.length / 12)} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={55} />
            <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 11 }} />
            {show.bb && <><Line dataKey="bu" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" /><Line dataKey="bl" stroke={C.inkFaint} dot={false} strokeWidth={1} strokeDasharray="4 3" /><Line dataKey="bm" stroke={C.inkFaint} dot={false} strokeWidth={1} opacity={0.4} /></>}
            {show.sma && <><Line dataKey="s20" stroke={C.accent} dot={false} strokeWidth={1} /><Line dataKey="s50" stroke={C.chart4} dot={false} strokeWidth={1} /><Line dataKey="s200" stroke={C.down + "66"} dot={false} strokeWidth={1} /></>}
            {chartType === "candles" ? <Customized component={CandlestickSeries} /> : <Line dataKey="c" stroke={C.ink} dot={false} strokeWidth={1.5} />}
            <Brush dataKey="n" height={18} stroke={C.rule} fill={C.warmWhite} travellerWidth={7} />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>
      {show.vol && (
        <Section title="Volume" actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "volume", title: `${ticker} — Volume` })}>Expand</button>}>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={cd} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="n" hide /><YAxis hide />
              <Bar dataKey="v" fill={C.inkSoft + "25"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}
      <div style={{ display: "grid", gridTemplateColumns: [show.rsi, show.macd, show.stoch].filter(Boolean).length > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
        {show.rsi && (
          <Section title="RSI (14)" actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "rsi", title: `${ticker} — RSI (14)` })}>Expand</button>}>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[30, 70]} axisLine={false} tickLine={false} width={30} />
                <ReferenceLine y={70} stroke={C.down + "40"} strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke={C.up + "40"} strokeDasharray="3 3" />
                <Line dataKey="rsi" stroke={C.accent} dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        )}
        {show.macd && (
          <Section title="MACD" actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "macd", title: `${ticker} — MACD` })}>Expand</button>}>
            <ResponsiveContainer width="100%" height={110}>
              <ComposedChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                <XAxis dataKey="n" hide /><YAxis tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={40} />
                <ReferenceLine y={0} stroke={C.rule} />
                <Bar dataKey="mh" fill={C.inkSoft + "20"} stroke={C.inkSoft + "40"} strokeWidth={0.5} />
                <Line dataKey="macd" stroke={C.ink} dot={false} strokeWidth={1.5} />
                <Line dataKey="ms" stroke={C.accent} dot={false} strokeWidth={1} />
              </ComposedChart>
            </ResponsiveContainer>
          </Section>
        )}
        {show.stoch && (
          <Section title="Stochastic" actions={<button style={expandBtn} onClick={() => setExpanded({ mode: "stoch", title: `${ticker} — Stochastic` })}>Expand</button>}>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={cd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} vertical={false} />
                <XAxis dataKey="n" hide /><YAxis domain={[0, 100]} tick={{ fill: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)" }} ticks={[20, 80]} axisLine={false} tickLine={false} width={30} />
                <ReferenceLine y={80} stroke={C.down + "40"} strokeDasharray="3 3" />
                <ReferenceLine y={20} stroke={C.up + "40"} strokeDasharray="3 3" />
                <Line dataKey="sk" stroke={C.ink} dot={false} strokeWidth={1.5} />
                <Line dataKey="sd" stroke={C.accent} dot={false} strokeWidth={1} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        )}
      </div>
      {expanded && (
        <ExpandedChartModal
          title={expanded.title}
          mode={expanded.mode}
          data={cd}
          dataKey={ticker}
          onClose={() => setExpanded(null)}
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

function HeatmapTab() {
  const [stocks, setStocks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(null);
  const [progress, setProgress] = useState("");
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });

  useEffect(() => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setDims({ w: r.width || 800, h: 500 });
    }
  }, []);

  const load = async () => {
    setLoading(true);
    const total = HEATMAP_UNIVERSE.length;
    let completed = 0;
    setProgress(`0/${total}`);
    const tasks = HEATMAP_UNIVERSE.map(async (s) => {
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
  };

  const rects = stocks ? squarify(stocks.map(s => ({ ...s, size: s.cap })), dims.w, dims.h) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "var(--body)" }}>Market Heatmap — S&P 20</div>
          <div style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--body)", marginTop: 2 }}>Size: market cap · Color: Sharpe ratio (6mo)</div>
        </div>
        <button onClick={load} disabled={loading} style={{ padding: "8px 24px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase", opacity: loading ? 0.5 : 1 }}>
          {loading ? "Loading…" : stocks ? "Refresh" : "Load Heatmap"}
        </button>
      </div>
      <div ref={containerRef} style={{ position: "relative", width: "100%", height: 500, background: C.warmWhite, border: `1px solid ${C.rule}` }}>
        {!stocks && !loading && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.inkMuted, fontFamily: "var(--display)", fontSize: 20 }}>Click "Load Heatmap" to fetch data</div>}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
            <BrandMark size={20} muted glow />
            <span style={{ fontFamily: "var(--display)", color: C.inkMuted, fontSize: 16 }}>Fetching {HEATMAP_UNIVERSE.length} stocks…</span>
            <span style={{ fontFamily: "var(--mono)", color: C.inkFaint, fontSize: 11 }}>{progress}</span>
          </div>
        )}
        {rects.map((r) => (
          <div key={r.ticker} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)}
            style={{ position: "absolute", left: r.x, top: r.y, width: r.w - 1, height: r.h - 1, background: sharpeToColor(r.sharpe), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", border: `1px solid ${C.cream}33`, transition: "opacity 0.15s", opacity: hover && hover.ticker !== r.ticker ? 0.7 : 1 }}>
            {r.w > 50 && r.h > 30 && <span style={{ fontSize: Math.min(16, r.w / 5), fontWeight: 700, color: "#fff", fontFamily: "var(--mono)", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>{r.ticker}</span>}
            {r.w > 70 && r.h > 50 && <span style={{ fontSize: Math.min(11, r.w / 8), color: "#ffffffCC", fontFamily: "var(--mono)", marginTop: 2 }}>{r.ret > 0 ? "+" : ""}{fmt(r.ret, 1)}%</span>}
          </div>
        ))}
        {hover && (
          <div style={{ position: "absolute", bottom: 8, left: 8, background: C.cream + "F0", border: `1px solid ${C.rule}`, padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.6, zIndex: 10, boxShadow: "2px 4px 12px rgba(0,0,0,0.06)" }}>
            <strong>{hover.ticker}</strong> — {hover.name}<br />
            ${fmt(hover.price)} · Sharpe {fmt(hover.sharpe)} · {fmtPct(hover.ret)} 6mo · {hover.rec}
          </div>
        )}
      </div>
      {stocks && (
        <div style={{ display: "flex", gap: 12, fontSize: 10, fontFamily: "var(--mono)", color: C.inkMuted, alignItems: "center" }}>
          <span>Color scale:</span>
          {[[-1, "< -1"], [-0.5, "-0.5"], [0, "0"], [0.5, "0.5"], [1, "1"], [1.5, "> 1.5"]].map(([v, l]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 10, height: 10, background: sharpeToColor(v) }} />{l}
            </span>
          ))}
          <span style={{ marginLeft: 4 }}>Sharpe</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPARISON TAB
// ═══════════════════════════════════════════════════════════
function ComparisonTab() {
  const [tickers, setTickers] = useState("AAPL, MSFT, GOOGL, AMZN");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [error, setError] = useState(null);

  const run = async () => {
    setLoading(true); setError(null);
    const list = tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean);
    const tasks = list.map(async (t) => {
      try {
        const fd = await fetchStockData(t, "6mo");
        if (fd.data) {
          const a = runAnalysis(t, fd.data);
          return { ticker: t, price: a.currentPrice, rec: a.recommendation.action, conf: a.recommendation.confidence, regime: a.regime.overall, risk: a.risk.riskLevel, sharpe: a.risk.sharpe, vol: a.risk.volatility, maxDD: a.risk.maxDrawdown, mom: a.statSignals.momentum.avgMomentum, stretch: a.valuation.stretch };
        }
        return { ticker: t, price: 0, rec: "N/A", conf: 0, regime: "N/A", risk: "N/A", sharpe: 0, vol: 0, maxDD: 0, mom: 0, stretch: 0 };
      } catch (e) {
        setError(prev => (prev || "") + `${t}: ${e.message || "failed"}; `);
        return { ticker: t, price: 0, rec: "N/A", conf: 0, regime: "N/A", risk: "N/A", sharpe: 0, vol: 0, maxDD: 0, mom: 0, stretch: 0 };
      }
    });
    const res = await Promise.all(tasks);
    setResults(res); setLoading(false);
  };

  const sorted = useMemo(() => {
    if (!results || !sortCol) return results;
    return [...results].sort((a, b) => ((a[sortCol] > b[sortCol] ? 1 : -1) * sortDir));
  }, [results, sortCol, sortDir]);

  const doSort = col => { if (sortCol === col) setSortDir(-sortDir); else { setSortCol(col); setSortDir(1); } };

  const thStyle = (col) => ({
    padding: "8px 10px", textAlign: "right", cursor: "pointer",
    color: sortCol === col ? C.ink : C.inkMuted, fontSize: 10, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--body)",
    borderBottom: `2px solid ${C.ink}`, userSelect: "none", whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input value={tickers} onChange={e => setTickers(e.target.value)} placeholder="AAPL, MSFT, GOOGL..."
          style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "10px 14px", color: C.ink, fontSize: 14, fontFamily: "var(--mono)", letterSpacing: "0.06em", outline: "none" }}
          onKeyDown={e => e.key === "Enter" && run()} />
        <button onClick={run} disabled={loading}
          style={{ padding: "10px 28px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase", opacity: loading ? 0.5 : 1 }}>
          {loading ? "Running…" : "Compare"}
        </button>
      </div>
      {error && <div style={{ padding: "6px 12px", background: C.downBg, color: C.down, fontSize: 11, fontFamily: "var(--mono)" }}>{error}</div>}
      {sorted && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle(null), textAlign: "left", cursor: "default" }}>Ticker</th>
                  <th style={thStyle("price")} onClick={() => doSort("price")}>Price{sortCol === "price" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("rec")} onClick={() => doSort("rec")}>Signal{sortCol === "rec" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("conf")} onClick={() => doSort("conf")}>Conf.{sortCol === "conf" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("sharpe")} onClick={() => doSort("sharpe")}>Sharpe{sortCol === "sharpe" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("vol")} onClick={() => doSort("vol")}>Vol.{sortCol === "vol" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("maxDD")} onClick={() => doSort("maxDD")}>Max DD{sortCol === "maxDD" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("mom")} onClick={() => doSort("mom")}>Mom.{sortCol === "mom" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                  <th style={thStyle("stretch")} onClick={() => doSort("stretch")}>Stretch{sortCol === "stretch" ? (sortDir > 0 ? " ↑" : " ↓") : ""}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.ticker} style={{ borderBottom: `1px solid ${C.ruleFaint}`, background: i % 2 ? C.warmWhite + "80" : "transparent" }}>
                    <td style={{ padding: "10px", fontWeight: 700, color: C.ink, fontFamily: "var(--mono)", fontSize: 13 }}>{r.ticker}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 13 }}>${fmt(r.price)}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}><span style={{ color: recColor(r.rec), fontWeight: 700, fontSize: 11, fontFamily: "var(--mono)" }}>{r.rec}</span></td>
                    <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtPct(r.conf * 100, 0)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: r.sharpe > 1 ? C.up : r.sharpe > 0 ? C.hold : C.down }}>{fmt(r.sharpe)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtPct(r.vol)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: C.down }}>{fmtPct(r.maxDD)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: r.mom > 0 ? C.up : C.down }}>{r.mom > 0 ? "+" : ""}{fmtPct(r.mom)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: r.stretch > 65 ? C.down : r.stretch < 35 ? C.up : C.hold }}>{fmt(r.stretch, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length > 1 && (
            <Section title="Sharpe Comparison">
              <ResponsiveContainer width="100%" height={Math.max(140, sorted.length * 36)}>
                <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.ruleFaint} horizontal={false} />
                  <XAxis type="number" tick={{ fill: C.inkMuted, fontSize: 10, fontFamily: "var(--mono)" }} axisLine={{ stroke: C.rule }} />
                  <YAxis dataKey="ticker" type="category" tick={{ fill: C.ink, fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)" }} width={50} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.cream, border: `1px solid ${C.rule}`, borderRadius: 0, fontFamily: "var(--mono)", fontSize: 12 }} />
                  <Bar dataKey="sharpe" name="Sharpe" fill={C.inkSoft} radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LITE TOOLS (Watchlist + Alerts dropdown)
// ═══════════════════════════════════════════════════════════
function LiteTools({ onAnalyze }) {
  const [open, setOpen] = useState(false);
  const [subTab, setSubTab] = useState("watchlist");
  const [watchlist, setWatchlist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [wlInput, setWlInput] = useState("");
  const [alForm, setAlForm] = useState({ ticker: "", type: "above", value: "" });
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addWl = async () => {
    const t = wlInput.trim().toUpperCase();
    if (!t || watchlist.some(w => w.ticker === t)) return;
    setBusy(true);
    try {
      const fd = await fetchStockData(t, "3mo");
      if (fd.data) {
        const a = runAnalysis(t, fd.data);
        const pc = a.data.length > 1 ? a.data[a.data.length - 2].Close : a.currentPrice;
        setWatchlist(p => [...p, { ticker: t, price: a.currentPrice, change: ((a.currentPrice - pc) / pc) * 100, rec: a.recommendation.action }]);
      }
    } catch (e) { console.error(e); }
    setWlInput(""); setBusy(false);
  };

  const addAlert = async () => {
    if (!alForm.ticker || !alForm.value) return;
    setBusy(true);
    const t = alForm.ticker.trim().toUpperCase(), v = parseFloat(alForm.value);
    try {
      const fd = await fetchStockData(t, "1mo");
      const price = fd.data ? fd.data[fd.data.length - 1].Close : 0;
      setAlerts(p => [...p, { id: Date.now(), ticker: t, type: alForm.type, value: v, current: price, triggered: alForm.type === "above" ? price >= v : price <= v }]);
    } catch (e) { console.error(e); }
    setAlForm({ ticker: "", type: "above", value: "" }); setBusy(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ padding: "0 0 10px 0", background: "none", border: "none", borderBottom: open ? `2px solid ${C.ink}` : "2px solid transparent", color: open ? C.ink : C.inkMuted, fontSize: 12, fontWeight: open ? 700 : 500, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)" }}>
        Tools ▾ {(watchlist.length + alerts.length) > 0 && <span style={{ fontSize: 9, background: C.ink, color: C.cream, borderRadius: "50%", padding: "1px 5px", marginLeft: 4 }}>{watchlist.length + alerts.length}</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, width: 380, background: C.cream, border: `1px solid ${C.rule}`, boxShadow: "4px 8px 24px rgba(0,0,0,0.08)", zIndex: 100, padding: 16, maxHeight: 480, overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 12, borderBottom: `1px solid ${C.rule}`, marginBottom: 12, paddingBottom: 8 }}>
            {["watchlist", "alerts"].map(t => (
              <button key={t} onClick={() => setSubTab(t)} style={{ background: "none", border: "none", color: subTab === t ? C.ink : C.inkMuted, fontSize: 11, fontWeight: subTab === t ? 700 : 400, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--body)", borderBottom: subTab === t ? `2px solid ${C.ink}` : "none", paddingBottom: 4 }}>
                {t} ({t === "watchlist" ? watchlist.length : alerts.length})
              </button>
            ))}
          </div>
          {subTab === "watchlist" && (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input value={wlInput} onChange={e => setWlInput(e.target.value)} placeholder="Ticker"
                  style={{ flex: 1, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 10px", fontSize: 12, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addWl()} />
                <button onClick={addWl} disabled={busy} style={{ padding: "6px 14px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>ADD</button>
              </div>
              {watchlist.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>Empty watchlist</div> :
                watchlist.map(w => (
                  <div key={w.ticker} onClick={() => { onAnalyze(w.ticker); setOpen(false); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}`, cursor: "pointer" }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13, color: C.ink }}>{w.ticker}</span>
                      <span style={{ marginLeft: 8, fontFamily: "var(--mono)", fontSize: 12 }}>${fmt(w.price)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: w.change >= 0 ? C.up : C.down, fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600 }}>{w.change >= 0 ? "+" : ""}{fmtPct(w.change)}</span>
                      <span style={{ color: recColor(w.rec), fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)" }}>{w.rec}</span>
                      <button onClick={e => { e.stopPropagation(); setWatchlist(p => p.filter(x => x.ticker !== w.ticker)); }}
                        style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))}
            </>
          )}
          {subTab === "alerts" && (
            <>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={alForm.ticker} onChange={e => setAlForm(p => ({ ...p, ticker: e.target.value }))} placeholder="Ticker"
                  style={{ width: 70, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }} />
                <select value={alForm.type} onChange={e => setAlForm(p => ({ ...p, type: e.target.value }))}
                  style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 6px", fontSize: 11, fontFamily: "var(--body)", color: C.ink, outline: "none" }}>
                  <option value="above">Above</option><option value="below">Below</option>
                </select>
                <input value={alForm.value} onChange={e => setAlForm(p => ({ ...p, value: e.target.value }))} placeholder="$" type="number"
                  style={{ width: 80, background: "transparent", border: `1px solid ${C.rule}`, padding: "6px 8px", fontSize: 11, fontFamily: "var(--mono)", color: C.ink, outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addAlert()} />
                <button onClick={addAlert} disabled={busy} style={{ padding: "6px 12px", background: C.ink, color: C.cream, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--body)", opacity: busy ? 0.5 : 1 }}>SET</button>
              </div>
              {alerts.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: C.inkMuted, fontSize: 12, fontFamily: "var(--body)" }}>No alerts</div> :
                alerts.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.ruleFaint}` }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12 }}>{a.ticker}</span>
                      <span style={{ color: C.inkMuted, fontSize: 11, marginLeft: 6 }}>{a.type === "above" ? "≥" : "≤"} ${fmt(a.value)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", color: a.triggered ? C.up : C.hold }}>{a.triggered ? "TRIGGERED" : "WATCHING"}</span>
                      <button onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
function App() {
  const [tab, setTab] = useState("home");
  const [isPro, setIsPro] = useState(false);
  const [ticker, setTicker] = useState("");
  const [period, setPeriod] = useState("1y");
  const [interval, setIntervalValue] = useState("1d");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [livePrice, setLivePrice] = useState(null);
  const [latency, setLatency] = useState(null);
  const liveRef = useRef(null);
  const prevPriceRef = useRef(null);

  const intervalOptions = useMemo(() => {
    if (["1d", "5d"].includes(period)) {
      return [["1m", "1m"], ["5m", "5m"], ["15m", "15m"], ["30m", "30m"], ["60m", "1h"]];
    }
    if (period === "1mo") {
      return [["15m", "15m"], ["30m", "30m"], ["60m", "1h"], ["1d", "1d"]];
    }
    return [["1d", "1d"]];
  }, [period]);

  useEffect(() => {
    if (!intervalOptions.some(([v]) => v === interval)) {
      setIntervalValue(intervalOptions[0][0]);
    }
  }, [intervalOptions, interval]);

  // Live price polling every 15s
  useEffect(() => {
    if (!result) return;
    const poll = async () => {
      try {
        const s = performance.now();
        const fd = await fetchStockData(result.ticker, result.period || "1mo", result.interval || "1d");
        const lat = Math.round(performance.now() - s);
        setLatency(lat);
        if (fd.data) {
          const last = fd.data[fd.data.length - 1];
          prevPriceRef.current = livePrice || result.currentPrice;
          setLivePrice(last.Close);
        }
      } catch (e) { /* silent */ }
    };
    liveRef.current = setInterval(poll, 15000);
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Micro-tick between polls for visual liveliness
  useEffect(() => {
    if (!result || !livePrice) return;
    const micro = setInterval(() => {
      setLivePrice(prev => {
        const jitter = (Math.random() - 0.5) * 0.001 * prev;
        prevPriceRef.current = prev;
        return +(prev + jitter).toFixed(2);
      });
    }, 1500);
    return () => clearInterval(micro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.ticker, !!livePrice]);

  const analyze = useCallback(async (t) => {
    const sym = (t || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym); setLoading(true); setError(null); setLivePrice(null); setLatency(null);
    try {
      const fd = await fetchStockData(sym, period, interval);
      const analysis = runAnalysis(sym, fd.data);
      analysis.period = period;
      analysis.interval = interval;
      analysis.source = fd.source;
      analysis.latency = fd.latency;
      analysis.debug = fd.debug;
      setResult(analysis);
      setLatency(fd.latency);
      setTab("analysis");
    } catch (e) {
      setError({ message: e.message || "All data sources failed", debug: e.debug || { error: String(e) } });
    }
    setLoading(false);
  }, [ticker, period, interval]);

  const tabStyle = (t, locked = false) => ({
    padding: "0 0 10px 0", marginRight: 24, background: "none", border: "none",
    borderBottom: tab === t ? `2px solid ${C.ink}` : "2px solid transparent",
    color: tab === t ? C.ink : locked ? C.inkFaint : C.inkMuted, fontSize: 12,
    fontWeight: tab === t ? 700 : 500, cursor: "pointer",
    textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--body)",
    opacity: locked ? 0.7 : 1,
  });

  return (
    <div style={{ fontFamily: "var(--body)", background: C.cream, color: C.ink, minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <header style={{ padding: "16px 32px 0", borderBottom: `1px solid ${C.rule}`, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
            <BrandMark size={24} pro={isPro} glow />
            <span style={{ width: 1, height: 16, background: C.rule, display: "inline-block", margin: "0 2px" }} />
            <span style={{ fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>Quantitative Analysis</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="Ticker"
              style={{ width: 110, background: "transparent", border: `1px solid ${C.rule}`, padding: "7px 10px", color: C.ink, fontSize: 14, fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.1em", outline: "none" }}
              onKeyDown={e => e.key === "Enter" && analyze()} />
            <select value={period} onChange={e => setPeriod(e.target.value)}
              style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "7px 8px", color: C.inkMuted, fontSize: 11, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
              {[["1d", "1D"], ["5d", "5D"], ["1mo", "1M"], ["3mo", "3M"], ["6mo", "6M"], ["1y", "1Y"], ["2y", "2Y"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={interval} onChange={e => setIntervalValue(e.target.value)}
              style={{ background: "transparent", border: `1px solid ${C.rule}`, padding: "7px 8px", color: C.inkMuted, fontSize: 11, fontFamily: "var(--body)", outline: "none", cursor: "pointer" }}>
              {intervalOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={() => analyze()} disabled={loading || !ticker}
              style={{ padding: "7px 20px", background: C.ink, color: C.cream, border: "none", fontWeight: 700, fontSize: 11, cursor: loading ? "wait" : "pointer", fontFamily: "var(--body)", letterSpacing: "0.1em", textTransform: "uppercase", opacity: loading ? 0.5 : 1 }}>
              {loading ? "Running…" : "Analyze"}
            </button>
          </div>
        </div>
        <nav style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}>
            {[
              { key: "home", label: "Home" },
              { key: "analysis", label: "Analysis" },
              { key: "charts", label: "Charts" },
              { key: "heatmap", label: "Heatmap", pro: true },
              { key: "comparison", label: "Comparison", pro: true },
            ].map(({ key, label, pro }) => {
              const locked = !!pro && !isPro;
              return (
                <button key={key} onClick={() => setTab(key)} style={tabStyle(key, locked)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span>{label}</span>
                    {locked && <ProTag small />}
                  </span>
                </button>
              );
            })}
          </div>
          <LiteTools onAnalyze={analyze} />
        </nav>
      </header>

      <main style={{ flex: 1, padding: "24px 32px", overflowY: "auto", animation: "fadeIn 0.3s ease", position: "relative", zIndex: 1 }} key={tab + (result?.ticker || "")}>
        {loading && <LoadingScreen ticker={ticker} isPro={isPro} />}
        {!loading && error && <ErrorScreen error={error.message} debugInfo={error.debug} onRetry={() => analyze()} />}
        {!loading && !error && tab === "home" && <HomeTab onAnalyze={analyze} />}
        {!loading && !error && tab === "analysis" && <AnalysisTab result={result} livePrice={livePrice} latency={latency} isPro={isPro} />}
        {!loading && !error && tab === "charts" && <ChartsTab result={result} livePrice={livePrice} />}
        {!loading && !error && tab === "heatmap" && (isPro ? <HeatmapTab /> : (
          <ProGate
            title="Heatmap Is Pro"
            description="Unlock the S&P heatmap with live Sharpe, volatility, and relative performance."
            features={["Parallel data fetches", "Treemap visualization", "Risk and regime overlays"]}
          />
        ))}
        {!loading && !error && tab === "comparison" && (isPro ? <ComparisonTab /> : (
          <ProGate
            title="Comparison Is Pro"
            description="Compare multiple tickers across signals, risk, and valuation in one view."
            features={["Side-by-side signal scores", "Sharpe and drawdown rankings", "Export-ready table view"]}
          />
        ))}
      </main>

      <footer style={{ padding: "8px 32px", borderTop: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.inkFaint, fontFamily: "var(--body)", letterSpacing: "0.04em", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LogoIcon size={12} color={C.inkFaint} />
          <span>For educational purposes only — not financial advice</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setIsPro(p => !p)} style={{ padding: "4px 10px", border: `1px solid ${C.rule}`, background: "transparent", color: C.inkMuted, fontSize: 9, fontFamily: "var(--mono)", letterSpacing: "0.08em", cursor: "pointer" }}>
            DEV: {isPro ? "DISABLE" : "ENABLE"} PRO
          </button>
          <span style={{ fontFamily: "var(--mono)", fontSize: 9 }}>v0.9.1</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
