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
          top: "14%",
          bottom: "10%",
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
      </div>

      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          borderRadius: "1.4cqw",
          border: "1px solid rgba(252,211,77,0.2)",
          background: "rgba(0,0,0,0.45)",
          padding: "1.4cqw 3cqw",
        }}
      >
        <p style={{ fontSize: "1.4cqw", fontWeight: 700, color: "#fef3c7", margin: 0 }}>
          Stand on a covered tile with your crew.
        </p>
        <p style={{ fontSize: "1.1cqw", color: "rgba(254,243,199,0.7)", marginTop: "0.5cqw" }}>
          Press <span style={{ border: "1px solid rgba(252,211,77,0.4)", borderRadius: "0.3cqw", padding: "0.1cqw 0.6cqw", fontWeight: 700 }}>Space</span> to dig it — everyone drops together.
        </p>
      </div>

      <div
        style={{
          position: "absolute",
          top: "16%",
          left: "2.5%",
          borderRadius: "1cqw",
          border: "1px solid rgba(252,211,77,0.3)",
          background: "linear-gradient(#3f2d10dd, #1c1712dd)",
          padding: "1.1cqw 1.6cqw",
        }}
      >
        <p style={{ fontSize: "1.5cqw", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: "#fcd34d", margin: 0 }}>
          Mine Drop
        </p>
        <p style={{ fontSize: "0.95cqw", color: "rgba(254,243,199,0.6)", marginTop: "0.2cqw" }}>
          giant minesweeper · jump a tile to dig it
        </p>
        <div style={{ display: "flex", gap: "2cqw", marginTop: "1cqw", alignItems: "flex-end" }}>
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
        <div style={{ marginTop: "0.7cqw", height: "0.5cqw", width: "16cqw", borderRadius: "1cqw", background: "rgba(0,0,0,0.4)", overflow: "hidden" }}>
          <div style={{ width: "0%", height: "100%", background: "linear-gradient(90deg, #fbbf24, #34d399)" }} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "16%",
          right: "2.5%",
          borderRadius: "1cqw",
          border: "1px solid rgba(252,211,77,0.25)",
          background: "rgba(28,23,18,0.8)",
          padding: "1cqw 1.4cqw",
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

      <div
        style={{
          position: "absolute",
          bottom: "3%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "1.4cqw",
          borderRadius: "2cqw",
          border: "1px solid rgba(252,211,77,0.15)",
          background: "rgba(0,0,0,0.5)",
          padding: "0.7cqw 1.8cqw",
          fontSize: "1cqw",
          color: "rgba(254,243,199,0.75)",
          whiteSpace: "nowrap",
        }}
      >
        <span>Space dig / jump</span>
        <span>Q flag</span>
        <span style={{ color: "rgba(254,243,199,0.4)" }}>WASD move · drag to look</span>
      </div>
    </div>
  );
}
