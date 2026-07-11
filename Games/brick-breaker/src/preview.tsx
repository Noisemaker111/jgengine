import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const chipStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "0.8cqw",
  borderRadius: "0.8cqw",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  padding: "0.5cqw 1.4cqw",
};

const chipLabelStyle: CSSProperties = {
  fontSize: "1.3cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "#94a3b8",
};

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={chipStyle}>
      <span style={chipLabelStyle}>{label}</span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "2cqw", fontWeight: 700, color }}>{value}</span>
    </span>
  );
}

export default function BrickBreakerPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#040313",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 10%, rgba(91,76,255,0.24), transparent 34%), linear-gradient(#07051e, #02020b)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.08,
          backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 3px, white 4px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: "2cqw",
            borderBottom: "1px solid rgba(167,139,250,0.25)",
            padding: "1.2cqw 2.4cqw",
          }}
        >
          <span style={{ fontSize: "1.3cqw", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.35em", color: "rgba(240,171,252,0.75)" }}>
            JG-76 cabinet
          </span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.6cqw" }}>
            <span
              style={{
                fontSize: "2.6cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.3em",
                color: "#67e8f9",
                textShadow: "0 0 10px rgba(34,211,238,0.5)",
              }}
            >
              Brick Breaker
            </span>
            <Chip label="Score" value="0" color="#67e8f9" />
            <Chip label="Best" value="0" color="#fbbf24" />
            <Chip label="Level" value="1/12" color="#e879f9" />
            <span style={chipStyle}>
              <span style={chipLabelStyle}>Lives</span>
              <span style={{ fontSize: "1.9cqw", color: "#f472b6" }}>♥ ♥ ♥</span>
            </span>
          </div>
          <span
            style={{
              border: "1px solid rgba(103,232,249,0.45)",
              background: "rgba(7,20,41,0.8)",
              padding: "0.9cqw 1.6cqw",
              fontSize: "1.4cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#a5f3fc",
            }}
          >
            Pause
          </span>
        </div>

        <div
          style={{
            position: "relative",
            flex: 1,
            margin: "0 2.4cqw",
            borderLeft: "2px solid rgba(139,92,246,0.55)",
            borderRight: "2px solid rgba(139,92,246,0.55)",
            borderTop: "2px solid rgba(139,92,246,0.55)",
            background: "linear-gradient(#12103a, #0a0928 50%, #050418)",
            boxShadow: "0 0 40px rgba(76,29,149,0.38), inset 0 0 38px rgba(34,211,238,0.04)",
          }}
        >
          <span style={{ position: "absolute", left: 0, top: 0, height: "3cqw", width: "3cqw", borderLeft: "4px solid rgba(103,232,249,0.7)", borderTop: "4px solid rgba(103,232,249,0.7)" }} />
          <span style={{ position: "absolute", right: 0, top: 0, height: "3cqw", width: "3cqw", borderRight: "4px solid rgba(103,232,249,0.7)", borderTop: "4px solid rgba(103,232,249,0.7)" }} />

          <div
            style={{
              position: "absolute",
              left: "6%",
              right: "6%",
              top: "8%",
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gap: "0.7cqw",
            }}
          >
            {Array.from({ length: 48 }, (_, i) => (
              <span
                key={i}
                style={{
                  height: "2.6cqw",
                  borderRadius: "0.4cqw",
                  background: "linear-gradient(#7be9fb, #0b8fb0)",
                  boxShadow: "inset 0 0 0 1px #c8f7ff33",
                }}
              />
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "52%",
              transform: "translateX(-50%)",
              borderTop: "1px solid rgba(240,171,252,0.45)",
              borderBottom: "1px solid rgba(240,171,252,0.45)",
              background: "rgba(5,4,20,0.88)",
              boxShadow: "0 0 35px rgba(232,121,249,0.18)",
              padding: "1.4cqw 3cqw",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                fontSize: "2.6cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.28em",
                color: "#f0abfc",
                textShadow: "0 0 12px rgba(232,121,249,0.65)",
              }}
            >
              Level 1 — First Contact
            </span>
          </div>

          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "22%",
              transform: "translateX(-50%)",
              borderTop: "1px solid rgba(103,232,249,0.35)",
              borderBottom: "1px solid rgba(103,232,249,0.35)",
              background: "rgba(5,4,20,0.75)",
              padding: "0.7cqw 3cqw",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: "1.4cqw", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.3em", color: "#a5f3fc" }}>
              Space / click to launch
            </span>
          </div>

          <span
            style={{
              position: "absolute",
              left: "50%",
              bottom: "9%",
              transform: "translate(-50%, 0)",
              height: "1.6cqw",
              width: "1.6cqw",
              borderRadius: "50%",
              background: "radial-gradient(circle, #ffffff, #22d3ee)",
              boxShadow: "0 0 10px #a5f3fc",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              bottom: "6%",
              transform: "translateX(-50%)",
              height: "1.7cqw",
              width: "14cqw",
              borderRadius: "1cqw",
              background: "linear-gradient(#7dd3fc, #1d4ed8)",
              boxShadow: "0 0 12px #38bdf8",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "0 2.4cqw",
            borderLeft: "2px solid rgba(139,92,246,0.55)",
            borderRight: "2px solid rgba(139,92,246,0.55)",
            borderBottom: "2px solid rgba(139,92,246,0.55)",
            background: "#090721",
            padding: "1cqw 1.6cqw",
            fontSize: "1.1cqw",
            textTransform: "uppercase",
            letterSpacing: "0.22em",
            color: "#64748b",
          }}
        >
          <span>A / D move · Space launch · P pause</span>
          <span>Breakout tribute · 1976</span>
        </div>
      </div>
    </div>
  );
}
