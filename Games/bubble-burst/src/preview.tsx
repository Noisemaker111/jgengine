import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const BRASS = "#e9c46a";
const MINT = "#dff3ec";

const panelStyle: CSSProperties = {
  borderRadius: "1cqw",
  background: "rgba(4,32,29,0.74)",
  border: "1px solid rgba(233,196,106,0.30)",
  boxShadow: "0 0.6cqw 1.8cqw rgba(0,0,0,0.35)",
  padding: "0.9cqw 1.3cqw",
};

const labelStyle: CSSProperties = {
  fontSize: "1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.22em",
  color: BRASS,
};

const COLORS = [
  { base: "#ff4d6d", light: "#ffb0be", dark: "#a10e34" },
  { base: "#ffd23f", light: "#fff2a8", dark: "#a9760a" },
  { base: "#3ddc84", light: "#aef5cd", dark: "#0b7d43" },
  { base: "#4d96ff", light: "#b4d0ff", dark: "#123f9e" },
  { base: "#ff8c42", light: "#ffcda2", dark: "#a24d0c" },
  { base: "#b15cff", light: "#e0bcff", dark: "#5f1aa8" },
];

function Bubble({ color, size, left, top }: { color: number; size: string; left: string; top: string }) {
  const c = COLORS[color]!;
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 34% 30%, ${c.light}, ${c.base} 55%, ${c.dark} 100%)`,
        boxShadow: `inset 0 0 0 0.15cqw ${c.dark}`,
      }}
    />
  );
}

const OPENING_ROWS = [
  { color: 0, count: 8, top: "6%", left: "6%", right: "6%" },
  { color: 1, count: 7, top: "15%", left: "11%", right: "11%" },
  { color: 2, count: 8, top: "24%", left: "6%", right: "6%" },
  { color: 3, count: 7, top: "33%", left: "11%", right: "11%" },
];

export default function BubbleBurstPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(circle at 50% 12%, #0d4a41 0%, #052a25 55%, #03201d 100%)",
        color: MINT,
        fontFamily: "'Trebuchet MS', system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          top: "17%",
          bottom: "6%",
          borderRadius: "2cqw",
          background: "linear-gradient(#0c463d 0%, #062a25 62%, #03201d 100%)",
          boxShadow: "0 0 4.6cqw rgba(10,70,60,0.55), inset 0 0 0 0.1cqw rgba(233,196,106,0.12)",
        }}
      >
        {OPENING_ROWS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              position: "absolute",
              left: row.left,
              right: row.right,
              top: row.top,
              display: "grid",
              gridTemplateColumns: `repeat(${row.count}, 1fr)`,
              gap: "1.4cqw",
            }}
          >
            {Array.from({ length: row.count }, (_, i) => (
              <Bubble key={`r${rowIndex}-${i}`} color={row.color} size="4.6cqw" left="0" top="0" />
            ))}
          </div>
        ))}

        <div
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            top: "45%",
            borderTop: "0.15cqw dashed rgba(255,180,120,0.35)",
          }}
        />

        <span
          style={{
            position: "absolute",
            left: "50%",
            bottom: "9%",
            transform: "translateX(-50%)",
            width: "3.2cqw",
            height: "3.2cqw",
            borderRadius: "50%",
            background: "radial-gradient(circle at 34% 30%, #ffe9a8, #c8931a 60%, #6d4c08 100%)",
            boxShadow: "inset 0 0 0 0.15cqw #432f05",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "50%",
            bottom: "10.5%",
            transform: "translateX(-50%)",
            width: "1.6cqw",
            height: "5cqw",
            borderRadius: "0.5cqw",
            background: "linear-gradient(#f6dc8c, #b8860b 50%, #6d4c08)",
            boxShadow: "inset 0 0 0 0.1cqw #432f05",
          }}
        />
        <Bubble color={0} size="2.6cqw" left="calc(50% - 1.3cqw)" top="9.6%" />
      </div>

      <div style={{ position: "absolute", left: "3%", top: "18%", width: "17cqw" }}>
        <div style={panelStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3cqw" }}>
            <span style={labelStyle}>Level 1/12</span>
            <span style={{ fontSize: "1.5cqw", fontWeight: 900, color: MINT }}>Opening Salvo</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", right: "3%", top: "18%", width: "13cqw" }}>
        <div style={panelStyle}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3cqw" }}>
            <span style={labelStyle}>Score</span>
            <span style={{ fontSize: "2.6cqw", fontWeight: 900, lineHeight: 1, fontFamily: "ui-monospace, monospace", color: MINT }}>
              0
            </span>
            <span style={{ fontSize: "1.1cqw", fontWeight: 700, color: BRASS }}>Best 0</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: "3%", bottom: "3%", width: "19cqw" }}>
        <div style={panelStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.7cqw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.4cqw" }}>
              <span style={labelStyle}>Compressor</span>
              <span style={{ fontSize: "1.1cqw", fontWeight: 700, color: MINT }}>Drop in 6</span>
            </div>
            <div style={{ display: "flex", gap: "0.5cqw" }}>
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  style={{
                    height: "1.1cqw",
                    flex: 1,
                    borderRadius: "1cqw",
                    background: "rgba(255,255,255,0.12)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", right: "3%", bottom: "3%", width: "22cqw" }}>
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.4cqw" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3cqw" }}>
              <span style={labelStyle}>Loaded</span>
              <span style={{ position: "relative", width: "3.4cqw", height: "3.4cqw", display: "block" }}>
                <Bubble color={0} size="3.4cqw" left="0" top="0" />
              </span>
            </div>
            <span style={{ fontSize: "1.6cqw", color: BRASS }}>→</span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3cqw" }}>
              <span style={labelStyle}>Next</span>
              <span style={{ position: "relative", width: "2.6cqw", height: "2.6cqw", display: "block" }}>
                <Bubble color={1} size="2.6cqw" left="0" top="0" />
              </span>
            </div>
            <span
              style={{
                borderRadius: "0.8cqw",
                background: "rgba(233,196,106,0.16)",
                border: "1px solid rgba(233,196,106,0.4)",
                padding: "0.6cqw 1cqw",
                fontSize: "1.1cqw",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                color: BRASS,
              }}
            >
              Swap
            </span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: "50%", bottom: "0.6%", transform: "translateX(-50%)" }}>
        <span
          style={{
            borderRadius: "1.4cqw",
            background: "rgba(4,32,29,0.6)",
            padding: "0.5cqw 1.4cqw",
            fontSize: "1cqw",
            fontWeight: 500,
            letterSpacing: "0.02em",
            color: "#9fc7bc",
          }}
        >
          Homage to Puzzle Bobble — Taito (1994)
        </span>
      </div>
    </div>
  );
}
