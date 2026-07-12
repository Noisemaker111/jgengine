import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelLabelStyle: CSSProperties = {
  fontSize: "1cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.22em",
  color: "rgba(254,243,199,0.5)",
};

export default function MineDropPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#0a0a0a",
        color: "#fef3c7",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "10%",
          right: "10%",
          top: "8%",
          bottom: "6%",
          background: "linear-gradient(160deg, #7a6152, #6b4326 55%, #4a2c17)",
          border: "1px solid rgba(0,0,0,0.4)",
          boxShadow: "0 2cqw 4cqw rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "6%",
            display: "grid",
            gridTemplateColumns: "repeat(10, 1fr)",
            gridTemplateRows: "repeat(10, 1fr)",
            gap: "0.35cqw",
          }}
        >
          {Array.from({ length: 100 }, (_, i) => (
            <span
              key={i}
              style={{
                background: "linear-gradient(160deg, #f1e0b3, #e7d3a1 60%, #d4bd85)",
                borderRadius: "0.25cqw",
                boxShadow: "inset 0 0 0 1px rgba(74,44,23,0.5)",
              }}
            />
          ))}
        </div>

        {[
          [4, 4, "#f4c04e"],
          [5, 4, "#2563eb"],
          [4, 3, "#b45309"],
        ].map(([col, row, color], i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `calc(6% + (88% / 10) * ${col} + (88% / 20))`,
              top: `calc(6% + (88% / 10) * ${row} + (88% / 20))`,
              transform: "translate(-50%, -50%)",
              width: "3.4%",
              aspectRatio: "1",
              borderRadius: "50%",
              background: color as string,
              boxShadow: "0 0 0 2px rgba(0,0,0,0.5), 0 0.3cqw 0.6cqw rgba(0,0,0,0.5)",
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: "3%",
          left: "2.5%",
          borderRadius: "1cqw",
          border: "1px solid rgba(252,211,77,0.3)",
          background: "linear-gradient(#3f2d10dd, #1c1712dd)",
          padding: "0.9cqw 1.4cqw",
        }}
      >
        <div style={{ display: "flex", gap: "2cqw", alignItems: "flex-end" }}>
          <div>
            <div style={panelLabelStyle}>Cleared</div>
            <div style={{ fontSize: "1.6cqw", fontWeight: 700, color: "#fef3c7" }}>
              0<span style={{ color: "rgba(254,243,199,0.4)" }}>/85</span>
            </div>
          </div>
          <div>
            <div style={{ ...panelLabelStyle, color: "rgba(253,164,175,0.6)" }}>Bombs</div>
            <div style={{ fontSize: "1.6cqw", fontWeight: 700, color: "#fda4af" }}>15</div>
          </div>
          <div>
            <div style={panelLabelStyle}>Flags</div>
            <div style={{ fontSize: "1.6cqw", fontWeight: 700, color: "#fcd34d" }}>0</div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "3%",
          right: "2.5%",
          borderRadius: "1cqw",
          border: "1px solid rgba(252,211,77,0.25)",
          background: "rgba(28,23,18,0.8)",
          padding: "0.9cqw 1.4cqw",
        }}
      >
        <div style={{ fontSize: "0.9cqw", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(254,243,199,0.6)" }}>
          Your crew
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5cqw", marginTop: "0.6cqw" }}>
          {[["You", "#f4c04e"], ["Pib", "#2563eb"], ["Tuck", "#b45309"]].map(([name, color]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: "0.7cqw", fontSize: "1.1cqw", color: "#fef3c7" }}>
              <span style={{ width: "0.9cqw", height: "0.9cqw", borderRadius: "50%", background: color, boxShadow: "0 0 0 2px rgba(0,0,0,0.4)" }} />
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
