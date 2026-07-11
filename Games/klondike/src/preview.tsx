import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const GOLD = "#e6c65a";
const IVORY = "linear-gradient(158deg,#fffdf5 0%,#f6efdc 62%,#efe6cd 100%)";
const RED_INK = "#c22e2e";
const BLACK_INK = "#1c1c22";
const CARD_W = 8.4;
const CARD_H = 11.9;
const RED_SUITS = ["♥", "♦"];
const SUITS = ["♠", "♥", "♦", "♣"];

const panelStyle: CSSProperties = {
  background: "rgba(8,28,18,0.82)",
  border: "1px solid rgba(230,198,90,0.25)",
  borderRadius: "0.9cqw",
  padding: "0.6cqw 1cqw",
  color: "#f3efdc",
  boxShadow: "0 0.5cqw 1.4cqw rgba(0,0,0,0.35)",
};

function CardFace({ rank, suit, faceDown }: { rank: string; suit: string; faceDown?: boolean }) {
  if (faceDown) {
    return (
      <div
        style={{
          width: `${CARD_W}cqw`,
          height: `${CARD_H}cqw`,
          borderRadius: "1cqw",
          background: "repeating-linear-gradient(45deg,#0c6b3b 0 0.5cqw,#0f7d46 0.5cqw 1cqw)",
          border: "0.16cqw solid #cfa94a",
          boxSizing: "border-box",
        }}
      />
    );
  }
  const ink = RED_SUITS.includes(suit) ? RED_INK : BLACK_INK;
  return (
    <div
      style={{
        width: `${CARD_W}cqw`,
        height: `${CARD_H}cqw`,
        borderRadius: "1cqw",
        background: IVORY,
        border: "1px solid rgba(120,92,34,0.4)",
        boxShadow: "0 0.15cqw 0.3cqw rgba(0,0,0,0.38)",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "absolute", left: "0.7cqw", top: "0.5cqw", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.94, fontWeight: 800, fontSize: "1.6cqw", color: ink, fontFamily: "'Georgia','Times New Roman',serif" }}>
        <span>{rank}</span>
        <span style={{ fontSize: "1.4cqw" }}>{suit}</span>
      </div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: ink, fontFamily: "'Georgia','Times New Roman',serif", fontWeight: 400, fontSize: "3.6cqw", opacity: 0.82 }}>
        {suit}
      </div>
    </div>
  );
}

function EmptySlot({ suit, dashed }: { suit?: string; dashed?: boolean }) {
  const tint = suit !== undefined && RED_SUITS.includes(suit) ? "rgba(220,120,120,0.4)" : "rgba(235,228,196,0.34)";
  return (
    <div
      style={{
        width: `${CARD_W}cqw`,
        height: `${CARD_H}cqw`,
        borderRadius: "1cqw",
        border: `0.16cqw ${dashed ? "dashed" : "solid"} rgba(233,224,188,0.32)`,
        background: "rgba(255,255,255,0.045)",
        display: "grid",
        placeItems: "center",
        color: tint,
        fontSize: "3.4cqw",
        boxSizing: "border-box",
      }}
    >
      {suit ?? ""}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "3.4cqw" }}>
      <div style={{ fontSize: "0.9cqw", letterSpacing: "0.05em", textTransform: "uppercase", color: "rgba(240,235,215,0.55)" }}>{label}</div>
      <div style={{ fontSize: "1.6cqw", fontWeight: 800, color: "#fff" }}>{value}</div>
    </div>
  );
}

const TABLEAU: { rank: string; suit: string }[][] = [
  [{ rank: "6", suit: "♦" }],
  [{ rank: "", suit: "" }, { rank: "K", suit: "♣" }],
  [{ rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "9", suit: "♥" }],
  [{ rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "2", suit: "♠" }],
  [{ rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "J", suit: "♦" }],
  [{ rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "4", suit: "♣" }],
  [{ rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "7", suit: "♥" }],
];

export default function KlondikePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(120% 90% at 50% 0%,#1c7a48 0%,#136437 42%,#0c4a29 78%,#083a20 100%)",
        color: "#f3efdc",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", top: "3cqw", left: "2cqw" }}>
        <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: "0.2cqw" }}>
          <div style={{ fontWeight: 800, letterSpacing: "0.05em", color: GOLD, fontSize: "1.5cqw" }}>KLONDIKE</div>
          <div style={{ fontSize: "1.1cqw", color: "rgba(240,235,215,0.65)" }}>Free play · 3f9c2a1e</div>
        </div>
      </div>

      <div style={{ position: "absolute", top: "3cqw", left: "50%", transform: "translateX(-50%)" }}>
        <div style={{ ...panelStyle, display: "flex", gap: "1.8cqw", alignItems: "center" }}>
          <Stat label="Score" value="0" />
          <Stat label="Time" value="0:00" />
          <Stat label="Moves" value="0" />
        </div>
      </div>

      <div style={{ position: "absolute", top: "17cqw", left: "2cqw", display: "flex", gap: "1.4cqw" }}>
        <CardFace rank="" suit="" faceDown />
        <div style={{ width: `${CARD_W}cqw`, height: `${CARD_H}cqw` }}>
          <EmptySlot dashed={false} />
        </div>
      </div>

      <div style={{ position: "absolute", top: "17cqw", right: "2cqw", display: "flex", gap: "1.4cqw" }}>
        {SUITS.map((s) => (
          <EmptySlot key={s} suit={s} />
        ))}
      </div>

      <div style={{ position: "absolute", top: "33cqw", left: "2cqw", right: "2cqw", display: "flex", justifyContent: "space-between" }}>
        {TABLEAU.map((pile, i) => (
          <div key={i} style={{ position: "relative", width: `${CARD_W}cqw`, height: `${CARD_H + (pile.length - 1) * 3.4}cqw` }}>
            {pile.map((card, j) => (
              <div key={j} style={{ position: "absolute", top: `${j * 3.4}cqw`, left: 0 }}>
                {j === pile.length - 1 ? <CardFace rank={card.rank} suit={card.suit} /> : <CardFace rank="" suit="" faceDown />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
