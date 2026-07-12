import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const SUIT_SYMBOL: Record<string, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
const RED_SUITS = new Set(["D", "H"]);

const CASCADES: string[][] = [
  ["JD", "KD", "2S", "4C", "3S", "6D", "6S"],
  ["2D", "KC", "KS", "5C", "10D", "8S", "9C"],
  ["9H", "9S", "9D", "10S", "4S", "8D", "2H"],
  ["JC", "5S", "QD", "QH", "10H", "QS", "6H"],
  ["5D", "AD", "JS", "4H", "8H", "6C"],
  ["7H", "QC", "AS", "AC", "2C", "3D"],
  ["7C", "KH", "AH", "4D", "JH", "8C"],
  ["5H", "3H", "3C", "7S", "7D", "10C"],
];

const slotStyle: CSSProperties = {
  height: "6.4cqw",
  width: "4.6cqw",
  borderRadius: "0.5cqw",
  border: "1px dashed rgba(226,232,240,0.2)",
  background: "rgba(226,232,240,0.04)",
};

function Card({ code }: { code: string }) {
  const suit = code.slice(-1);
  const rank = code.slice(0, -1);
  const red = RED_SUITS.has(suit);
  return (
    <div
      style={{
        position: "relative",
        height: "6.4cqw",
        width: "4.6cqw",
        borderRadius: "0.5cqw",
        border: "1px solid rgba(203,213,225,0.8)",
        background: "linear-gradient(180deg, #ffffff 0%, #eef2f7 100%)",
        boxShadow: "0 2px 5px -1px rgba(0,0,0,0.55)",
        color: red ? "#dc2626" : "#0f172a",
      }}
    >
      <span style={{ position: "absolute", left: "8%", top: "5%", fontSize: "1.5cqw", fontWeight: 700, lineHeight: 1 }}>
        {rank}
      </span>
      <span style={{ position: "absolute", left: "10%", top: "22%", fontSize: "1.3cqw", lineHeight: 1 }}>
        {SUIT_SYMBOL[suit]}
      </span>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.8cqw", opacity: 0.9 }}>
        {SUIT_SYMBOL[suit]}
      </span>
    </div>
  );
}

export default function FreeCellPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(160deg, #0e2247 0%, #0a1c3c 55%, #071530 100%)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "2.4%",
          right: "3%",
          textAlign: "right",
        }}
      >
        <div style={{ fontSize: "2.2cqw", fontWeight: 900, letterSpacing: "0.12em", color: "#f1f5f9" }}>FreeCell</div>
        <div style={{ fontSize: "1.1cqw", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.28em", color: "#7dd3fc" }}>
          Solitaire
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "3%",
          right: "3%",
          top: "16%",
          borderRadius: "1.2cqw",
          border: "1px solid rgba(148,163,184,0.25)",
          background: "linear-gradient(160deg,#123262 0%,#0c2247 55%,#081a38 100%)",
          boxShadow: "0 18px 48px -12px rgba(0,0,0,0.75), inset 0 1px 0 rgba(226,232,240,0.14)",
          padding: "2.2cqw",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "2cqw", marginBottom: "2.4cqw" }}>
          <div style={{ display: "flex", gap: "0.9cqw" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={slotStyle} />
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.9cqw" }}>
            {["♣", "♦", "♥", "♠"].map((s) => (
              <div key={s} style={{ ...slotStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "2.8cqw", opacity: 0.3, color: s === "♦" || s === "♥" ? "#f87171" : "#cbd5e1" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "0.9cqw" }}>
          {CASCADES.map((col, i) => (
            <div key={i} style={{ position: "relative", height: `calc(6.4cqw + ${col.length - 1} * 2cqw)`, width: "4.6cqw" }}>
              {col.map((code, row) => (
                <div key={code} style={{ position: "absolute", top: `calc(${row} * 2cqw)`, left: 0 }}>
                  <Card code={code} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "2%",
          textAlign: "center",
          fontSize: "1cqw",
          fontWeight: 500,
          letterSpacing: "0.05em",
          color: "rgba(148,163,184,0.7)",
        }}
      >
        Deal #1 · FreeCell — Paul Alfille (1978)
      </div>
    </div>
  );
}
