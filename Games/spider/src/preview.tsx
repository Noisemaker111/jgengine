import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const FELT = "radial-gradient(120% 90% at 50% 0%,#7a2138 0%,#5e1729 42%,#40101d 78%,#2a0a14 100%)";
const IVORY = "linear-gradient(158deg,#fffdf6 0%,#f5eede 60%,#ece2cd 100%)";
const BLACK_INK = "#20222b";

const chipStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.2cqw",
};

const chipLabelStyle: CSSProperties = {
  fontSize: "0.9cqw",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(236,228,232,0.55)",
};

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={chipStyle}>
      <span style={chipLabelStyle}>{label}</span>
      <span style={{ fontSize: "1.6cqw", fontWeight: 800, color: "#fff" }}>{value}</span>
    </span>
  );
}

function cardStyle(w: number): CSSProperties {
  return {
    width: `${w}cqw`,
    height: `${w * 1.42}cqw`,
    borderRadius: `${w * 0.14}cqw`,
    background: IVORY,
    border: "1px solid rgba(90,70,40,0.4)",
    boxShadow: "0 0.15cqw 0.3cqw rgba(0,0,0,0.4)",
    position: "relative",
    boxSizing: "border-box",
  };
}

function backStyle(w: number): CSSProperties {
  return {
    width: `${w}cqw`,
    height: `${w * 1.42}cqw`,
    borderRadius: `${w * 0.14}cqw`,
    background: "repeating-linear-gradient(45deg,#6e1f33 0 0.5cqw,#7d2740 0.5cqw 1cqw)",
    border: "2px solid #c9ccd6",
    boxSizing: "border-box",
  };
}

function Corner({ label, w }: { label: string; w: number }) {
  return (
    <span
      style={{
        position: "absolute",
        left: `${w * 0.1}cqw`,
        top: `${w * 0.06}cqw`,
        fontFamily: "'Georgia','Times New Roman',serif",
        fontWeight: 800,
        fontSize: `${w * 0.3}cqw`,
        lineHeight: 1,
        color: BLACK_INK,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <span>{label}</span>
      <span>♠</span>
    </span>
  );
}

function FaceCard({ rank, w }: { rank: string; w: number }) {
  return (
    <div style={cardStyle(w)}>
      <Corner label={rank} w={w} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontFamily: "'Georgia','Times New Roman',serif",
          fontSize: `${w * 0.6}cqw`,
          color: BLACK_INK,
          opacity: 0.8,
        }}
      >
        ♠
      </div>
    </div>
  );
}

const TABLEAU: { faceDown: number; rank: string }[] = [
  { faceDown: 5, rank: "8" },
  { faceDown: 5, rank: "K" },
  { faceDown: 5, rank: "3" },
  { faceDown: 5, rank: "Q" },
  { faceDown: 4, rank: "6" },
  { faceDown: 4, rank: "10" },
  { faceDown: 4, rank: "2" },
  { faceDown: 4, rank: "J" },
  { faceDown: 4, rank: "4" },
  { faceDown: 4, rank: "7" },
];

export default function SpiderPreview({ className }: GamePreviewProps) {
  const w = 5.4;
  const faceDownGap = w * 1.42 * 0.14;

  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: FELT,
        color: "#f3eef0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "1.4cqw 2.4cqw",
          background: "rgba(30,9,15,0.5)",
          borderBottom: "1px solid rgba(207,211,220,0.2)",
        }}
      >
        <div style={{ display: "flex", gap: "2.4cqw" }}>
          <Chip label="Score" value="500" />
          <Chip label="Moves" value="0" />
          <Chip label="Stock" value="5" />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "12%",
          left: "3%",
          display: "flex",
          gap: `${w * 0.28}cqw`,
        }}
      >
        <div style={{ position: "relative", width: `${w + w * 0.28 * 4}cqw`, height: `${w * 1.42}cqw` }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: `${i * w * 0.28}cqw`, top: 0 }}>
              <div style={backStyle(w)} />
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "12%",
          right: "3%",
          display: "flex",
          gap: `${w * 0.35}cqw`,
        }}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            style={{
              width: `${w * 0.66}cqw`,
              height: `${w * 0.66 * 1.42}cqw`,
              borderRadius: `${w * 0.1}cqw`,
              border: "1px dashed rgba(226,224,232,0.32)",
              background: "rgba(255,255,255,0.05)",
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: "26%",
          left: "3%",
          right: "3%",
          bottom: "4%",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {TABLEAU.map((pile, i) => (
          <div key={i} style={{ position: "relative", width: `${w}cqw`, height: "100%" }}>
            {Array.from({ length: pile.faceDown }, (_, j) => (
              <div key={j} style={{ position: "absolute", top: `${j * faceDownGap}cqw`, left: 0 }}>
                <div style={backStyle(w)} />
              </div>
            ))}
            <div style={{ position: "absolute", top: `${pile.faceDown * faceDownGap}cqw`, left: 0 }}>
              <FaceCard rank={pile.rank} w={w} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
