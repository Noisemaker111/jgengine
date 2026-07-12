import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const thumbStyle: CSSProperties = {
  width: "6cqw",
  height: "6cqw",
  borderRadius: "0.8cqw",
  background: "#f6f1e3",
  backgroundImage:
    "repeating-linear-gradient(0deg, #d8ccb0 0 1px, transparent 1px 1.2cqw), repeating-linear-gradient(90deg, #d8ccb0 0 1px, transparent 1px 1.2cqw)",
  border: "1px solid #d8ccb0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#b9ab86",
  fontSize: "2.5cqw",
  fontWeight: 800,
};

function PuzzleTile() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.8cqw",
        padding: "1.2cqw 1cqw 1cqw",
        borderRadius: "1.4cqw",
        border: "1px solid rgba(148,163,184,0.16)",
        background: "rgba(30,41,59,0.5)",
      }}
    >
      <div style={thumbStyle}>?</div>
      <span style={{ fontSize: "1.4cqw", fontWeight: 700, color: "#e2e8f0" }}>? ? ?</span>
      <span style={{ fontSize: "1.2cqw", color: "#64748b" }}>unsolved</span>
    </div>
  );
}

export default function NonogramPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#12161d",
        backgroundImage:
          "radial-gradient(circle at 30% 20%, #1b2430 0, #12161d 60%), repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 30px), repeating-linear-gradient(90deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 30px)",
        color: "#f1f5f9",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "15%",
          bottom: 0,
          transform: "translateX(-50%)",
          width: "88cqw",
          display: "flex",
          flexDirection: "column",
          gap: "2cqw",
          padding: "2.6cqw 2.4cqw",
          borderRadius: "2cqw 2cqw 0 0",
          background: "rgba(11, 15, 21, 0.9)",
          border: "1px solid rgba(148,163,184,0.16)",
          borderBottom: "none",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1.2cqw" }}>
          <div>
            <div style={{ fontSize: "3.4cqw", fontWeight: 800, letterSpacing: "-0.02em", color: "#f1f5f9" }}>
              Nonogram
            </div>
            <div style={{ marginTop: "0.4cqw", fontSize: "1.5cqw", color: "#94a3b8" }}>
              Fill the grid from the row and column clues to reveal a hidden picture.
            </div>
          </div>
          <div style={{ textAlign: "right", color: "#cbd5e1", fontSize: "1.4cqw" }}>
            <div style={{ fontSize: "2.9cqw", fontWeight: 800, color: "#22c55e" }}>0/20</div>
            <div>solved</div>
          </div>
        </div>

        <span
          style={{
            alignSelf: "flex-start",
            padding: "0.9cqw 1.6cqw",
            borderRadius: "99cqw",
            border: "1px solid rgba(148,163,184,0.28)",
            background: "rgba(148,163,184,0.12)",
            color: "#cbd5e1",
            fontSize: "1.4cqw",
            fontWeight: 600,
          }}
        >
          Mistakes mode: Off — free play
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: "1cqw" }}>
          <span
            style={{
              fontSize: "1.6cqw",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#7c8aa0",
            }}
          >
            5×5
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "1.3cqw" }}>
            {Array.from({ length: 6 }, (_, i) => (
              <PuzzleTile key={i} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1cqw", flex: 1, overflow: "hidden" }}>
          <span
            style={{
              fontSize: "1.6cqw",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#7c8aa0",
            }}
          >
            10×10
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "1.3cqw" }}>
            {Array.from({ length: 6 }, (_, i) => (
              <PuzzleTile key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
