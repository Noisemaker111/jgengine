import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const chipStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6cqw",
  borderRadius: "999px",
  border: "1px solid rgba(201,165,87,0.35)",
  background: "rgba(13,27,54,0.8)",
  padding: "0.5cqw 1.2cqw",
};

const chipLabelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "#8fa0c0",
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={chipStyle}>
      <span style={chipLabelStyle}>{label}</span>
      <span style={{ fontSize: "1.3cqw", fontWeight: 700, color: "#f4ecd9" }}>{value}</span>
    </span>
  );
}

function CardBack() {
  return (
    <span
      style={{
        position: "relative",
        aspectRatio: "3/4",
        borderRadius: "10%/7.5%",
        background: "radial-gradient(120% 90% at 50% 35%, #1b3159 0%, #0c1a38 100%)",
        border: "1px solid rgba(201,165,87,0.4)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span style={{ fontSize: "1.6cqw", color: "#c9a557", opacity: 0.85 }}>&#10022;</span>
    </span>
  );
}

export default function MemoryMatchPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(120% 90% at 50% 30%, #14213a 0%, #0a1120 68%)",
        color: "#f4ecd9",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.4cqw",
          padding: "2.4cqw 3cqw",
        }}
      >
        <div style={{ display: "flex", gap: "1cqw" }}>
          <StatChip label="Moves" value="0" />
          <StatChip label="Time" value="0:00" />
          <StatChip label="Pairs" value="0/8" />
        </div>

        <div
          style={{
            flex: 1,
            width: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gridTemplateRows: "repeat(4, 1fr)",
            gap: "1.2cqw",
            maxWidth: "60cqw",
            maxHeight: "100%",
            margin: "0.6cqw 0",
          }}
        >
          {Array.from({ length: 16 }, (_, i) => (
            <CardBack key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
