import type { CSSProperties, ReactNode } from "react";

import { color, RANK_LABEL, SUIT_GLYPH, type Card, type Suit } from "../../klondike/engine";

export interface CardMetrics {
  w: number;
  h: number;
}

const IVORY = "linear-gradient(158deg,#fffdf5 0%,#f6efdc 62%,#efe6cd 100%)";
const RED_INK = "#c22e2e";
const BLACK_INK = "#1c1c22";

function isCourt(rank: number): boolean {
  return rank >= 11;
}

function radius(metrics: CardMetrics): number {
  return Math.round(metrics.w * 0.12);
}

function cornerStyle(metrics: CardMetrics, ink: string, rotated: boolean): CSSProperties {
  const size = Math.max(11, Math.round(metrics.w * 0.3));
  return {
    position: "absolute",
    ...(rotated ? { right: Math.round(metrics.w * 0.08), bottom: Math.round(metrics.h * 0.05) } : { left: Math.round(metrics.w * 0.08), top: Math.round(metrics.h * 0.04) }),
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    lineHeight: 0.94,
    fontWeight: 800,
    fontSize: size,
    color: ink,
    transform: rotated ? "rotate(180deg)" : undefined,
    fontFamily: "'Georgia','Times New Roman',serif",
  };
}

function Corner({ label, glyph, metrics, ink, rotated }: {
  label: string;
  glyph: string;
  metrics: CardMetrics;
  ink: string;
  rotated: boolean;
}): ReactNode {
  return (
    <div style={cornerStyle(metrics, ink, rotated)}>
      <span>{label}</span>
      <span style={{ fontSize: Math.round(metrics.w * 0.26) }}>{glyph}</span>
    </div>
  );
}

export function CardFace({ card, metrics, dim, lifted }: {
  card: Card;
  metrics: CardMetrics;
  dim?: boolean;
  lifted?: boolean;
}): ReactNode {
  const ink = color(card.suit) === "red" ? RED_INK : BLACK_INK;
  const glyph = SUIT_GLYPH[card.suit];
  const label = RANK_LABEL[card.rank];
  const court = isCourt(card.rank);
  return (
    <div
      style={{
        width: metrics.w,
        height: metrics.h,
        borderRadius: radius(metrics),
        background: IVORY,
        border: "1px solid rgba(120,92,34,0.4)",
        boxShadow: lifted
          ? "0 10px 22px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.7)"
          : "0 1.5px 3px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(255,255,255,0.6)",
        position: "relative",
        opacity: dim ? 0.32 : 1,
        userSelect: "none",
        touchAction: "none",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <Corner label={label} glyph={glyph} metrics={metrics} ink={ink} rotated={false} />
      <Corner label={label} glyph={glyph} metrics={metrics} ink={ink} rotated />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: ink,
          fontFamily: "'Georgia','Times New Roman',serif",
          fontWeight: court ? 800 : 400,
          fontSize: Math.round(metrics.w * (court ? 0.5 : 0.62)),
          opacity: court ? 0.92 : 0.82,
          letterSpacing: court ? -1 : 0,
          textShadow: court ? "0 1px 0 rgba(255,255,255,0.5)" : undefined,
        }}
      >
        {court ? label : glyph}
      </div>
      {court ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "end center",
            paddingBottom: Math.round(metrics.h * 0.12),
            color: ink,
            fontSize: Math.round(metrics.w * 0.26),
            opacity: 0.85,
          }}
        >
          {glyph}
        </div>
      ) : null}
    </div>
  );
}

export function CardBack({ metrics }: { metrics: CardMetrics }): ReactNode {
  const r = radius(metrics);
  return (
    <div
      style={{
        width: metrics.w,
        height: metrics.h,
        borderRadius: r,
        background:
          "repeating-linear-gradient(45deg,#0c6b3b 0 7px,#0f7d46 7px 14px)",
        border: "2px solid #cfa94a",
        boxShadow: "0 1.5px 3px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(0,0,0,0.25)",
        position: "relative",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: Math.round(metrics.w * 0.1),
          borderRadius: Math.round(r * 0.7),
          border: "1px solid rgba(207,169,74,0.7)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          color: "rgba(207,169,74,0.85)",
          fontSize: Math.round(metrics.w * 0.34),
        }}
      >
        ✦
      </div>
    </div>
  );
}

export function EmptySlot({ metrics, glyph, suit, dashed = true }: {
  metrics: CardMetrics;
  glyph?: string;
  suit?: Suit;
  dashed?: boolean;
}): ReactNode {
  const tint = suit !== undefined && color(suit) === "red" ? "rgba(220,120,120,0.4)" : "rgba(235,228,196,0.34)";
  return (
    <div
      style={{
        width: metrics.w,
        height: metrics.h,
        borderRadius: radius(metrics),
        border: `2px ${dashed ? "dashed" : "solid"} rgba(233,224,188,0.32)`,
        background: "rgba(255,255,255,0.045)",
        display: "grid",
        placeItems: "center",
        color: tint,
        fontSize: Math.round(metrics.w * 0.46),
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      {glyph ?? (suit ? SUIT_GLYPH[suit] : "")}
    </div>
  );
}
