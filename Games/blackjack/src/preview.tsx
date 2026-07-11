import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelLabelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "rgba(209,250,229,0.6)",
};

const panelStyle: CSSProperties = {
  minWidth: "17cqw",
  borderRadius: "1cqw",
  border: "1px solid rgba(252,211,77,0.2)",
  background: "rgba(6,32,23,0.75)",
  padding: "1.2cqw 1.4cqw",
  boxShadow: "0 0.6cqw 1.6cqw rgba(0,0,0,0.35)",
};

function CardSlot() {
  return (
    <span
      style={{
        display: "inline-block",
        height: "9cqw",
        width: "6.4cqw",
        borderRadius: "0.8cqw",
        border: "0.15cqw dashed rgba(209,250,229,0.25)",
      }}
    />
  );
}

function Chip({ value, color }: { value: string; color: string }) {
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        height: "3.4cqw",
        width: "3.4cqw",
        borderRadius: "50%",
        border: "0.25cqw dotted rgba(255,255,255,0.65)",
        background: color,
        fontSize: "1.1cqw",
        fontWeight: 800,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
      }}
    >
      {value}
    </span>
  );
}

export default function BlackjackPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(ellipse at 50% 36%, #1f7a52 0%, #125537 46%, #082a1e 100%)",
        color: "#ecfdf5",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", top: "16%", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8cqw" }}>
        <span style={{ fontSize: "1.2cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(209,250,229,0.7)" }}>
          Dealer
        </span>
        <div style={{ display: "flex", gap: "0.6cqw" }}>
          <CardSlot />
          <CardSlot />
        </div>
      </div>

      <div style={{ position: "absolute", top: "42%", left: "50%", transform: "translateX(-50%)", textAlign: "center", whiteSpace: "nowrap" }}>
        <div style={{ fontSize: "1.1cqw", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(252,211,77,0.35)" }}>
          Blackjack pays 3 to 2 · Insurance pays 2 to 1
        </div>
        <div style={{ marginTop: "0.3cqw", fontSize: "1.1cqw", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(252,211,77,0.35)" }}>
          Dealer must stand on 17 and draw to 16
        </div>
      </div>

      <div style={{ position: "absolute", top: "56%", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.7cqw" }}>
        <span style={{ fontSize: "1.2cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(209,250,229,0.7)" }}>
          You
        </span>
        <div style={{ display: "flex", gap: "0.6cqw" }}>
          <CardSlot />
          <CardSlot />
        </div>
        <span style={{ fontSize: "1.1cqw", color: "rgba(209,250,229,0.5)" }}>Place a bet to deal</span>
      </div>

      <div style={{ position: "absolute", top: "16%", left: "2.5%", ...panelStyle }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1cqw" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={panelLabelStyle}>Chip Bank</span>
            <span style={{ fontSize: "2.2cqw", fontWeight: 900, color: "#fcd34d" }}>1,000</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={panelLabelStyle}>Bet</span>
            <span style={{ fontSize: "1.8cqw", fontWeight: 900, color: "#fbbf24" }}>0</span>
          </div>
        </div>
        <div style={{ marginTop: "0.8cqw", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.8cqw", borderTop: "1px solid rgba(209,250,229,0.12)", paddingTop: "0.8cqw" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "1.3cqw", fontWeight: 700 }}>0</span>
            <span style={{ fontSize: "0.9cqw", textTransform: "uppercase", color: "rgba(209,250,229,0.5)" }}>Streak</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "1.3cqw", fontWeight: 700 }}>1,000</span>
            <span style={{ fontSize: "0.9cqw", textTransform: "uppercase", color: "rgba(209,250,229,0.5)" }}>Peak</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "1.3cqw", fontWeight: 700 }}>0</span>
            <span style={{ fontSize: "0.9cqw", textTransform: "uppercase", color: "rgba(209,250,229,0.5)" }}>Hands Won</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", top: "16%", right: "2.5%", ...panelStyle }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={panelLabelStyle}>6-Deck Shoe</span>
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, color: "rgba(209,250,229,0.8)" }}>312/312</span>
        </div>
        <div style={{ position: "relative", marginTop: "0.8cqw", height: "0.8cqw", borderRadius: "1cqw", background: "rgba(0,0,0,0.4)", overflow: "hidden" }}>
          <span style={{ position: "absolute", inset: 0, width: "0%", background: "linear-gradient(to right, #fcd34d, #34d399)" }} />
        </div>
        <div style={{ marginTop: "0.6cqw", display: "flex", justifyContent: "space-between", fontSize: "0.95cqw", color: "rgba(209,250,229,0.5)" }}>
          <span>Dealt 0%</span>
          <span>Reshuffle at 25%</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "4%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.8cqw",
          borderRadius: "1.4cqw",
          border: "1px solid rgba(209,250,229,0.15)",
          background: "rgba(6,32,23,0.75)",
          padding: "1.2cqw 2cqw",
          boxShadow: "0 0.6cqw 1.6cqw rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.4cqw" }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              height: "3.8cqw",
              width: "3.8cqw",
              borderRadius: "50%",
              border: "0.2cqw dashed rgba(252,211,77,0.5)",
              fontSize: "1.3cqw",
              fontWeight: 800,
              color: "rgba(252,211,77,0.8)",
            }}
          >
            0
          </span>
          <div style={{ display: "flex", gap: "0.8cqw" }}>
            <Chip value="5" color="#b06a3f" />
            <Chip value="25" color="#2f6fb0" />
            <Chip value="100" color="#3f8f56" />
            <Chip value="500" color="#8f3a2f" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1cqw" }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              height: "2.8cqw",
              padding: "0 1.4cqw",
              borderRadius: "0.8cqw",
              background: "rgba(0,0,0,0.3)",
              color: "rgba(209,250,229,0.3)",
              fontSize: "1.2cqw",
              fontWeight: 700,
            }}
          >
            Clear
          </span>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              height: "2.8cqw",
              padding: "0 1.6cqw",
              borderRadius: "0.8cqw",
              background: "linear-gradient(#fcd34d, #f59e0b)",
              color: "#451a03",
              fontSize: "1.2cqw",
              fontWeight: 800,
            }}
          >
            Deal
          </span>
          <span style={{ fontSize: "1cqw", color: "rgba(209,250,229,0.5)" }}>Min 5 · Max 500</span>
        </div>
        <span style={{ fontSize: "0.95cqw", textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(209,250,229,0.4)" }}>
          Traditional Twenty-One
        </span>
      </div>
    </div>
  );
}
