import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const cabinet: CSSProperties = {
  background: "linear-gradient(160deg, #7c1a1a 0%, #4a0d0d 58%, #310808 100%)",
  boxShadow: "0 26px 70px rgba(0,0,0,0.72)",
};

const screen: CSSProperties = {
  backgroundColor: "#06140d",
  boxShadow: "inset 0 0 70px rgba(28,138,74,0.32), inset 0 0 14px rgba(0,0,0,0.92)",
};

function Card() {
  return (
    <div
      style={{
        width: "6.4cqw",
        aspectRatio: "0.68",
        borderRadius: "0.5cqw",
        background: "linear-gradient(160deg, #1a3d2c, #0c1f16)",
        border: "1px solid rgba(251,191,36,0.35)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span style={{ fontSize: "2.4cqw", color: "rgba(251,191,36,0.35)", fontWeight: 900 }}>?</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRadius: "0.5cqw",
        border: "1px solid rgba(245,158,11,0.4)",
        background: "rgba(0,0,0,0.45)",
        padding: "0.4cqw 1cqw",
      }}
    >
      <span style={{ fontSize: "0.9cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(252,211,77,0.8)" }}>
        {label}
      </span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.7cqw", fontWeight: 900, color: accent ? "#fde68a" : "#8ef2a8" }}>
        {value}
      </span>
    </div>
  );
}

export default function VideoPokerPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#170505",
        color: "#f5f5f4",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "92%", borderRadius: "2cqw", border: "4px solid rgba(217,119,6,0.8)", padding: "2cqw", ...cabinet }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.6cqw" }}>
          <div>
            <div
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "2.6cqw",
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#fcd34d",
              }}
            >
              Video Poker
            </div>
            <div style={{ fontSize: "1cqw", fontWeight: 700, letterSpacing: "0.3em", textTransform: "uppercase", color: "rgba(253,230,138,0.7)" }}>
              Jacks or Better · 9/6
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.8cqw" }}>
            <Stat label="Best Bank" value="—" />
            <Stat label="Top Win" value="—" accent />
          </div>
        </div>

        <div style={{ position: "relative", borderRadius: "1cqw", border: "2px solid rgba(180,83,9,0.5)", padding: "1.6cqw", ...screen }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "1cqw" }}>
            <Card />
            <Card />
            <Card />
            <Card />
            <Card />
          </div>
          <div
            style={{
              marginTop: "1.4cqw",
              textAlign: "center",
              fontSize: "1.4cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(142,242,168,0.8)",
            }}
          >
            Place your bet, then DEAL
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1.8cqw" }}>
          <div style={{ display: "flex", gap: "0.8cqw" }}>
            <Stat label="Bank" value="200" accent />
            <Stat label="Bet" value="1" />
          </div>
          <div style={{ display: "flex", gap: "0.8cqw" }}>
            <span
              style={{
                borderRadius: "0.6cqw",
                border: "1px solid rgba(245,158,11,0.6)",
                background: "linear-gradient(180deg, rgba(245,158,11,0.3), rgba(180,83,9,0.2))",
                padding: "0.6cqw 1.4cqw",
                fontSize: "1.1cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#fde68a",
              }}
            >
              Bet One
            </span>
            <span
              style={{
                borderRadius: "0.6cqw",
                border: "1px solid rgba(245,158,11,0.6)",
                background: "linear-gradient(180deg, rgba(245,158,11,0.3), rgba(180,83,9,0.2))",
                padding: "0.6cqw 1.4cqw",
                fontSize: "1.1cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#fde68a",
              }}
            >
              Bet Max
            </span>
            <span
              style={{
                borderRadius: "0.6cqw",
                border: "1px solid #fde68a",
                background: "linear-gradient(180deg, #fcd34d, #d97706)",
                padding: "0.6cqw 1.6cqw",
                fontSize: "1.2cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#450a0a",
              }}
            >
              Deal
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
