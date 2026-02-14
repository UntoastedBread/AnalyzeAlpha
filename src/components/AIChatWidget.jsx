import React, { useState, useRef, useEffect, useCallback } from "react";

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
    { role: "assistant", text: "AnalyzeAlpha Terminal v0.4.1\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nAvailable commands:\n  analyze [TICKER]  \u2014 stock analysis\n  compare [TICKERS] \u2014 side-by-side\n  oversold stocks   \u2014 find oversold\n  what is [TERM]    \u2014 learn indicators\n  portfolio         \u2014 your portfolio\n  markets           \u2014 market overview\n\nType a ticker symbol to analyze it." },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Type-in effect for responses
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || !last._typing || last.text === last._typing) return;
    const timer = setTimeout(() => {
      setMessages(prev => {
        const msgs = [...prev];
        const lastMsg = { ...msgs[msgs.length - 1] };
        lastMsg.text = lastMsg._typing.slice(0, lastMsg.text.length + 1);
        if (lastMsg.text === lastMsg._typing) delete lastMsg._typing;
        msgs[msgs.length - 1] = lastMsg;
        return msgs;
      });
    }, 15);
    return () => clearTimeout(timer);
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
      response = "Available commands:\n  analyze [TICKER]  \u2014 full stock analysis\n  compare [TICKERS] \u2014 side-by-side comparison\n  oversold stocks   \u2014 find opportunities\n  what is [TERM]    \u2014 learn about indicators\n  portfolio         \u2014 your portfolio\n  markets           \u2014 market overview\n\nOr just type a ticker symbol like \"AAPL\" to analyze it.";
    }

    setTimeout(() => {
      setMessages(prev => [...prev, { role: "assistant", text: "", _typing: response }]);
    }, 200);
  }, [input, onAnalyze, onNavigate]);

  return (
    <>
      {/* Floating terminal button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "#1a1a2e",
          color: "#00ff41",
          border: "1px solid #00ff4133",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          zIndex: 8999,
          fontSize: 16,
          fontFamily: "monospace",
          fontWeight: 700,
          transition: "transform 0.2s ease",
        }}
        aria-label="AI Terminal"
      >
        {open ? "\u00D7" : ">_"}
      </button>

      {/* Terminal panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 80,
          right: 20,
          width: 380,
          maxHeight: "60vh",
          background: "#1a1a2e",
          border: "1px solid #00ff4133",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          zIndex: 9000,
          fontFamily: "monospace",
        }}>
          {/* Terminal header */}
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid #00ff4122",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#00ff41", letterSpacing: "0.08em" }}>
                AnalyzeAlpha Terminal v0.4.1
              </div>
              <div style={{ fontSize: 9, color: "#00ff4166" }}>
                Quick navigation & analysis terminal
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#00ff4166", cursor: "pointer", fontSize: 16, fontFamily: "monospace" }}>{"\u00D7"}</button>
          </div>

          {/* Messages area */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px", maxHeight: "40vh" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <span style={{ color: "#00ff4166", fontSize: 10, fontFamily: "monospace" }}>
                  {msg.role === "user" ? "aa>" : ">"}
                </span>{" "}
                <span style={{
                  color: msg.role === "user" ? "#e0e0e0" : "#00ff41",
                  fontSize: 12,
                  fontFamily: "monospace",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}>
                  {msg.text}
                </span>
              </div>
            ))}
            <style>{`
              @keyframes terminalBlink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
              }
            `}</style>
            <span style={{
              display: "inline-block",
              width: 8,
              height: 14,
              background: "#00ff41",
              animation: "terminalBlink 1s step-end infinite",
              verticalAlign: "middle",
            }} />
          </div>

          {/* Input area */}
          <div style={{ display: "flex", gap: 0, borderTop: "1px solid #00ff4122" }}>
            <span style={{ padding: "10px 0 10px 16px", color: "#00ff4166", fontSize: 12, fontFamily: "monospace" }}>aa&gt;</span>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
              placeholder="type a command..."
              style={{
                flex: 1,
                padding: "10px 12px",
                border: "none",
                background: "transparent",
                color: "#e0e0e0",
                fontSize: 12,
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <button
              onClick={handleSend}
              style={{
                padding: "10px 14px",
                background: "transparent",
                color: "#00ff41",
                border: "none",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "monospace",
                letterSpacing: "0.06em",
              }}
            >
              RUN
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default AIChatWidget;
