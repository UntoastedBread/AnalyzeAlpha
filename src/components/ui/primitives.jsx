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
