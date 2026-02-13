import React, { useState, useRef, useEffect, useCallback } from "react";
import { FloatingPanel } from "./ui/primitives";

const EDUCATIONAL = {
  rsi: "RSI (Relative Strength Index) measures the speed and magnitude of recent price changes to evaluate overbought or oversold conditions. Values above 70 suggest overbought, below 30 suggest oversold.",
  macd: "MACD (Moving Average Convergence Divergence) is a trend-following momentum indicator showing the relationship between two exponential moving averages. A bullish signal occurs when MACD crosses above the signal line.",
  bollinger: "Bollinger Bands consist of a middle SMA band and two outer bands at standard deviations. Price touching the upper band may indicate overbought conditions, while the lower band may indicate oversold.",
  sharpe: "The Sharpe Ratio measures risk-adjusted return. It's calculated as (return - risk-free rate) / standard deviation. A ratio above 1.0 is considered good, above 2.0 is very good.",
  atr: "ATR (Average True Range) measures market volatility by averaging the true range over a period. Higher ATR means more volatility. Useful for setting stop-loss levels.",
  drawdown: "Maximum Drawdown is the largest peak-to-trough decline in portfolio value. It measures the worst-case loss an investor would have experienced.",
  regime: "Market regime detection classifies the current market state (trending, mean-reverting, high volatility, etc.) to help select appropriate trading strategies.",
  dcf: "DCF (Discounted Cash Flow) valuation estimates a company's intrinsic value by projecting future cash flows and discounting them to present value using a required rate of return.",
  ddm: "DDM (Dividend Discount Model) values a stock based on the present value of its expected future dividends. Only applicable to dividend-paying stocks.",
  beta: "Beta measures a stock's volatility relative to the overall market. Beta > 1 means more volatile than the market, < 1 means less volatile.",
  pe: "P/E (Price-to-Earnings) ratio compares a company's stock price to its earnings per share. Higher P/E may indicate growth expectations or overvaluation.",
  eps: "EPS (Earnings Per Share) is a company's net profit divided by outstanding shares. It's a key measure of profitability used in valuation.",
};

const KEYWORD_MAP = [
  { patterns: [/^analyze\s+([A-Z0-9.\-^=]+)/i, /^analyse\s+([A-Z0-9.\-^=]+)/i, /^check\s+([A-Z0-9.\-^=]+)/i, /^look\s+at\s+([A-Z0-9.\-^=]+)/i], action: "analyze" },
  { patterns: [/^compare\s+([A-Z0-9.\-^=,\s]+)/i], action: "compare" },
  { patterns: [/oversold\s*stocks?/i, /find\s*oversold/i], action: "screener_oversold" },
  { patterns: [/momentum\s*(leaders?|stocks?)?/i], action: "screener_momentum" },
  { patterns: [/high\s*sharpe/i], action: "screener_sharpe" },
  { patterns: [/low\s*vol/i, /low\s*volatility/i], action: "screener_lowvol" },
  { patterns: [/portfolio\s*(summary|overview)?/i, /my\s*portfolio/i], action: "portfolio" },
  { patterns: [/backtest/i, /back\s*test/i], action: "backtest" },
  { patterns: [/market\s*(overview|summary)?$/i, /markets?$/i], action: "markets" },
  { patterns: [/crypto/i, /bitcoin/i, /ethereum/i], action: "crypto" },
  { patterns: [/earnings/i], action: "earnings" },
  { patterns: [/dividend/i], action: "dividends" },
  { patterns: [/options?\s*chain/i, /options?\s+([A-Z]+)/i], action: "options" },
  { patterns: [/sectors?/i, /sector\s*rotation/i], action: "sectors" },
  { patterns: [/economic/i, /macro/i, /fed\b/i, /fomc/i], action: "economic" },
  { patterns: [/screener/i, /scan\b/i, /screen\b/i], action: "screener" },
];

const EDUCATION_PATTERNS = [
  { patterns: [/what\s*is\s*rsi/i, /explain\s*rsi/i], key: "rsi" },
  { patterns: [/what\s*is\s*macd/i, /explain\s*macd/i], key: "macd" },
  { patterns: [/what\s*(?:is|are)\s*bollinger/i, /explain\s*bollinger/i], key: "bollinger" },
  { patterns: [/what\s*is\s*(?:the\s*)?sharpe/i, /explain\s*sharpe/i], key: "sharpe" },
  { patterns: [/what\s*is\s*atr/i, /explain\s*atr/i], key: "atr" },
  { patterns: [/what\s*is\s*(?:max\s*)?drawdown/i], key: "drawdown" },
  { patterns: [/what\s*is\s*(?:a\s*)?regime/i, /market\s*regime/i], key: "regime" },
  { patterns: [/what\s*is\s*dcf/i, /explain\s*dcf/i, /discounted\s*cash/i], key: "dcf" },
  { patterns: [/what\s*is\s*ddm/i, /dividend\s*discount/i], key: "ddm" },
  { patterns: [/what\s*is\s*beta/i, /explain\s*beta/i], key: "beta" },
  { patterns: [/what\s*is\s*p\/?e/i, /price.to.earnings/i], key: "pe" },
  { patterns: [/what\s*is\s*eps/i, /earnings\s*per\s*share/i], key: "eps" },
];

function parseIntent(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;

  for (const edu of EDUCATION_PATTERNS) {
    for (const pattern of edu.patterns) {
      if (pattern.test(trimmed)) {
        return { type: "education", key: edu.key, text: EDUCATIONAL[edu.key] };
      }
    }
  }

  for (const cmd of KEYWORD_MAP) {
    for (const pattern of cmd.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return { type: "command", action: cmd.action, args: match[1] || "" };
      }
    }
  }

  if (/^[A-Z0-9.\-^=]{1,12}$/.test(trimmed.toUpperCase()) && trimmed.length <= 12) {
    return { type: "command", action: "analyze", args: trimmed.toUpperCase() };
  }

  return { type: "unknown" };
}

function AIChatWidget({ C, onNavigate, onAnalyze }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! I'm your AI assistant. Try commands like:\n• \"analyze AAPL\" — run stock analysis\n• \"compare AAPL, MSFT\" — compare stocks\n• \"oversold stocks\" — find oversold stocks\n• \"what is RSI\" — learn about indicators\n• \"portfolio\" — view your portfolio\n• \"markets\" — market overview" },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);

    const intent = parseIntent(text);
    let response = "";

    if (intent?.type === "education") {
      response = intent.text;
    } else if (intent?.type === "command") {
      switch (intent.action) {
        case "analyze": {
          const ticker = (intent.args || "").replace(/[^A-Z0-9.\-^=]/gi, "").toUpperCase();
          if (ticker) {
            response = `Running analysis for ${ticker}...`;
            setTimeout(() => onAnalyze?.(ticker), 300);
          } else {
            response = "Please specify a ticker symbol. Example: \"analyze AAPL\"";
          }
          break;
        }
        case "compare": {
          const tickers = (intent.args || "").split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
          if (tickers.length >= 2) {
            response = `Navigating to comparison for ${tickers.join(", ")}...`;
            setTimeout(() => onNavigate?.("screener", "comparison", { tickers }), 300);
          } else {
            response = "Please specify at least 2 tickers. Example: \"compare AAPL, MSFT, GOOGL\"";
          }
          break;
        }
        case "screener_oversold":
          response = "Navigating to screener with oversold filter...";
          setTimeout(() => onNavigate?.("screener", "screener", { preset: "oversold" }), 300);
          break;
        case "screener_momentum":
          response = "Navigating to screener with momentum filter...";
          setTimeout(() => onNavigate?.("screener", "screener", { preset: "momentum" }), 300);
          break;
        case "screener_sharpe":
          response = "Navigating to screener with high Sharpe filter...";
          setTimeout(() => onNavigate?.("screener", "screener", { preset: "sharpe" }), 300);
          break;
        case "screener_lowvol":
          response = "Navigating to screener with low volatility filter...";
          setTimeout(() => onNavigate?.("screener", "screener", { preset: "lowvol" }), 300);
          break;
        case "portfolio":
          response = "Opening your portfolio...";
          setTimeout(() => onNavigate?.("portfolio"), 300);
          break;
        case "backtest":
          response = "Opening backtesting engine...";
          setTimeout(() => onNavigate?.("portfolio", "backtesting"), 300);
          break;
        case "markets":
          response = "Opening markets overview...";
          setTimeout(() => onNavigate?.("markets"), 300);
          break;
        case "crypto":
          response = "Opening crypto dashboard...";
          setTimeout(() => onNavigate?.("markets", "crypto"), 300);
          break;
        case "earnings":
          response = "Tip: Analyze a stock to see its earnings data. Try \"analyze AAPL\" to see earnings history and upcoming dates.";
          break;
        case "dividends":
          response = "Tip: Analyze a stock to see dividend data. Try \"analyze KO\" for a dividend-paying stock.";
          break;
        case "options":
          response = "Tip: Analyze a stock, then switch to the Options sub-tab. Try \"analyze AAPL\" first.";
          break;
        case "sectors":
          response = "Opening sector analysis...";
          setTimeout(() => onNavigate?.("markets", "sectors"), 300);
          break;
        case "economic":
          response = "Opening economic calendar...";
          setTimeout(() => onNavigate?.("markets", "economic"), 300);
          break;
        case "screener":
          response = "Opening stock screener...";
          setTimeout(() => onNavigate?.("screener"), 300);
          break;
        default:
          response = "I'm not sure how to help with that. Try \"analyze AAPL\", \"compare AAPL MSFT\", \"oversold stocks\", or \"what is RSI\".";
      }
    } else {
      response = "I understand natural language commands like:\n• \"analyze [ticker]\" — full stock analysis\n• \"compare [tickers]\" — side-by-side comparison\n• \"oversold stocks\" — find opportunities\n• \"what is [term]\" — learn about indicators\n• \"portfolio\" — your portfolio\n• \"markets\" — market overview\n\nOr just type a ticker symbol like \"AAPL\" to analyze it.";
    }

    setTimeout(() => {
      setMessages(prev => [...prev, { role: "assistant", text: response }]);
    }, 200);
  }, [input, onAnalyze, onNavigate]);

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: C.ink,
          color: C.cream,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          zIndex: 8999,
          fontSize: 20,
          transition: "transform 0.2s ease",
          transform: open ? "rotate(45deg)" : "none",
        }}
        aria-label="AI Chat"
      >
        {open ? "+" : "💬"}
      </button>

      {/* Chat panel */}
      <FloatingPanel C={C} open={open} onClose={() => setOpen(false)} title="AI Assistant">
        <div ref={scrollRef} style={{ maxHeight: "40vh", overflowY: "auto", marginBottom: 12 }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: 10,
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  padding: "8px 12px",
                  background: msg.role === "user" ? C.ink : C.warmWhite,
                  color: msg.role === "user" ? C.cream : C.ink,
                  fontSize: 12,
                  fontFamily: "var(--body)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  border: msg.role === "assistant" ? `1px solid ${C.ruleFaint}` : "none",
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
            placeholder="Type a command..."
            style={{
              flex: 1,
              padding: "8px 12px",
              border: `1px solid ${C.rule}`,
              background: "transparent",
              color: C.ink,
              fontSize: 12,
              fontFamily: "var(--body)",
              outline: "none",
            }}
          />
          <button
            onClick={handleSend}
            style={{
              padding: "8px 14px",
              background: C.ink,
              color: C.cream,
              border: "none",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "var(--body)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Send
          </button>
        </div>
      </FloatingPanel>
    </>
  );
}

export default AIChatWidget;
