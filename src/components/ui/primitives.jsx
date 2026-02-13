import React from "react";

const sizeMap = {
  sm: { padding: "6px 12px", fontSize: 10 },
  md: { padding: "8px 16px", fontSize: 11 },
  lg: { padding: "10px 18px", fontSize: 12 },
};

export function UIButton({
  C,
  variant = "primary",
  size = "md",
  disabled = false,
  style,
  children,
  ...rest
}) {
  const s = sizeMap[size] || sizeMap.md;
  const base = {
    ...s,
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "var(--body)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontWeight: 700,
    opacity: disabled ? 0.5 : 1,
  };

  const variants = {
    primary: {
      background: C.ink,
      color: C.cream,
      borderColor: C.ink,
    },
    secondary: {
      background: "transparent",
      color: C.ink,
      borderColor: C.rule,
    },
    ghost: {
      background: "transparent",
      color: C.inkMuted,
      borderColor: "transparent",
      textTransform: "none",
      letterSpacing: "normal",
      fontWeight: 600,
    },
  };

  return (
    <button {...rest} disabled={disabled} style={{ ...base, ...(variants[variant] || variants.primary), ...style }}>
      {children}
    </button>
  );
}

export function ControlChip({ C, active = false, onClick, children, style, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      style={{
        padding: "6px 12px",
        border: `1px solid ${active ? C.ink : C.rule}`,
        background: active ? C.ink : "transparent",
        color: active ? C.cream : C.inkMuted,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "var(--body)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function TableHeadCell({ C, align = "right", onClick, active = false, children, style }) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: "8px 10px",
        textAlign: align,
        cursor: onClick ? "pointer" : "default",
        color: active ? C.ink : C.inkMuted,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontFamily: "var(--body)",
        borderBottom: `2px solid ${C.ink}`,
        whiteSpace: "nowrap",
        userSelect: "none",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

export function TableCell({ align = "right", style, children }) {
  return (
    <td style={{ padding: "8px 10px", textAlign: align, ...style }}>
      {children}
    </td>
  );
}

export function TabGroup({ C, tabs, active, onChange, style }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.rule}`, marginBottom: 16, overflowX: "auto", ...style }}>
      {tabs.map(({ key, label, pro }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: "8px 16px",
            background: "none",
            border: "none",
            borderBottom: active === key ? `2px solid ${C.ink}` : "2px solid transparent",
            color: active === key ? C.ink : C.inkMuted,
            fontSize: 11,
            fontWeight: active === key ? 700 : 500,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            fontFamily: "var(--body)",
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {label}
          {pro && <span style={{ fontSize: 8, fontWeight: 700, background: C.ink, color: C.cream, padding: "1px 4px", letterSpacing: "0.08em" }}>PRO</span>}
        </button>
      ))}
    </div>
  );
}

export function DataTable({ C, columns, rows, sortCol, sortDir, onSort, striped = true, style }) {
  const sorted = sortCol != null ? [...rows].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number") return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  }) : rows;

  return (
    <div style={{ overflowX: "auto", ...style }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: 11 }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <TableHeadCell
                key={col.key}
                C={C}
                align={col.align || "right"}
                onClick={onSort ? () => onSort(col.key) : undefined}
                active={sortCol === col.key}
                style={col.headerStyle}
              >
                {col.label}
                {sortCol === col.key && <span style={{ marginLeft: 4 }}>{sortDir > 0 ? "▲" : "▼"}</span>}
              </TableHeadCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr
              key={row._key || ri}
              style={{
                background: striped && ri % 2 === 1 ? C.warmWhite : "transparent",
                borderBottom: `1px solid ${C.ruleFaint}`,
              }}
            >
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align || "right"} style={col.cellStyle}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </TableCell>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MetricCard({ C, label, value, change, suffix, style }) {
  const changeColor = change > 0 ? C.up : change < 0 ? C.down : C.inkMuted;
  return (
    <div style={{
      padding: "12px 14px",
      border: `1px solid ${C.rule}`,
      background: C.warmWhite,
      minWidth: 120,
      ...style,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)", color: C.ink }}>
        {value}{suffix && <span style={{ fontSize: 11, color: C.inkMuted, marginLeft: 2 }}>{suffix}</span>}
      </div>
      {change != null && (
        <div style={{ fontSize: 10, fontWeight: 600, fontFamily: "var(--mono)", color: changeColor, marginTop: 4 }}>
          {change > 0 ? "+" : ""}{typeof change === "number" ? change.toFixed(2) : change}%
        </div>
      )}
    </div>
  );
}

export function GaugeBar({ C, value = 0, max = 100, label, style }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct > 66 ? C.up : pct > 33 ? C.hold : C.down;
  return (
    <div style={{ ...style }}>
      {label && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.inkMuted, fontFamily: "var(--body)", marginBottom: 4 }}>{label}</div>}
      <div style={{ height: 6, background: C.paper, border: `1px solid ${C.ruleFaint}`, position: "relative", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

export function EmptyState({ C, icon, title, message, action, style }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", ...style }}>
      {icon && <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</div>}
      {title && <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: "var(--display)", marginBottom: 8 }}>{title}</div>}
      {message && <div style={{ fontSize: 12, color: C.inkMuted, fontFamily: "var(--body)", lineHeight: 1.5, maxWidth: 360, margin: "0 auto", marginBottom: action ? 16 : 0 }}>{message}</div>}
      {action}
    </div>
  );
}

export function FloatingPanel({ C, open, onClose, title, children, style }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed",
      bottom: 80,
      right: 20,
      width: 360,
      maxHeight: "60vh",
      background: C.cream,
      border: `1px solid ${C.rule}`,
      boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      display: "flex",
      flexDirection: "column",
      zIndex: 9000,
      animation: "fadeIn 0.2s ease",
      ...style,
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${C.rule}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--body)", color: C.ink }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.inkMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 6px" }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {children}
      </div>
    </div>
  );
}
