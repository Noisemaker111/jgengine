import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const cardBaseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  aspectRatio: "1",
  borderRadius: "0.8cqw",
  fontWeight: 900,
};

function LockedCard({ index }: { index: number }) {
  return (
    <div style={{ ...cardBaseStyle, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.3)", opacity: 0.6 }}>
      <span style={{ fontSize: "1.6cqw" }}>🔒</span>
      <span style={{ marginTop: "0.4cqw", fontSize: "1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(253,230,138,0.25)" }}>
        {String(index).padStart(2, "0")}
      </span>
    </div>
  );
}

function OpenCard({ index }: { index: number }) {
  return (
    <div
      style={{
        ...cardBaseStyle,
        border: "1px solid rgba(251,191,36,0.3)",
        background: "linear-gradient(#3a2f1d, #241c11)",
        boxShadow: "0 0 16px rgba(245,178,60,0.12)",
      }}
    >
      <span style={{ fontSize: "1.8cqw", color: "#fffbeb" }}>{String(index).padStart(2, "0")}</span>
      <span style={{ marginTop: "0.4cqw", fontSize: "1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(252,211,77,0.7)" }}>
        Play
      </span>
    </div>
  );
}

export default function CrateKeeperPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#1a140c",
        color: "#fffbeb",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "80%", padding: "2.4cqw 0" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "1.6cqw" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.2cqw" }}>
            <span style={{ fontSize: "3cqw", fontWeight: 900, letterSpacing: "-0.02em", color: "#fffbeb" }}>
              Crate <span style={{ color: "#fbbf24" }}>Keeper</span>
            </span>
            <span style={{ fontSize: "1.3cqw", color: "rgba(253,230,138,0.5)" }}>Push every crate onto its lamp.</span>
          </div>
          <span
            style={{
              borderRadius: "0.8cqw",
              background: "rgba(0,0,0,0.3)",
              padding: "0.7cqw 1.2cqw",
              fontSize: "1.4cqw",
              fontWeight: 700,
              color: "#fef3c7",
            }}
          >
            ★ 0 <span style={{ color: "rgba(252,211,77,0.4)" }}>/ 60</span>
          </span>
        </div>

        <span
          style={{
            marginTop: "1.4cqw",
            borderRadius: "0.8cqw",
            background: "linear-gradient(#f59e0b, #b45309)",
            padding: "1cqw 1.6cqw",
            fontSize: "1.6cqw",
            fontWeight: 900,
            textAlign: "center",
            color: "#451a03",
          }}
        >
          Start Shift
        </span>

        <div
          style={{
            marginTop: "1.6cqw",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "1cqw",
          }}
        >
          <OpenCard index={1} />
          {Array.from({ length: 9 }, (_, i) => (
            <LockedCard key={i} index={i + 2} />
          ))}
        </div>
      </div>
    </div>
  );
}
