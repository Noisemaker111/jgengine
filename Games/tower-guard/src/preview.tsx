import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const labelStyle: CSSProperties = {
  fontFamily: "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  fontSize: "1.1cqw",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#95997f",
};

function Tower({ label, cost, color }: { label: string; cost: number; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.4cqw",
        padding: "0.6cqw",
        borderRadius: "0.6cqw",
        background: "rgba(10,11,7,0.6)",
        border: "1px solid #454a35",
      }}
    >
      <span
        style={{
          height: "3.6cqw",
          width: "3.6cqw",
          borderRadius: "0.6cqw",
          background: `radial-gradient(circle at 35% 30%, ${color}, #14160f)`,
          boxShadow: `0 0 10px ${color}66`,
        }}
      />
      <span style={{ fontFamily: "Consolas, monospace", fontSize: "1.1cqw", fontWeight: 700, color: "#e6e8d8" }}>{cost}g</span>
      <span style={{ ...labelStyle, fontSize: "0.95cqw" }}>{label}</span>
    </div>
  );
}

export default function TowerGuardPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#1c2013, #14160f 55%, #0a0b07)",
        color: "#e6e8d8",
        fontFamily: "\"Segoe UI\", system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          top: "16%",
          bottom: "24%",
          backgroundImage:
            "repeating-linear-gradient(to right, rgba(127,184,74,0.08) 0 1px, transparent 1px 8cqw), repeating-linear-gradient(to bottom, rgba(127,184,74,0.08) 0 1px, transparent 1px 8cqw)",
        }}
      />

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", top: "16%", bottom: "24%", left: 0, width: "100%", height: "68%" }}
      >
        <polyline
          points="3,0 3,33 41,33 41,67 78,67 78,100 97,100"
          fill="none"
          stroke="#4a5a35"
          strokeWidth={7}
        />
        <polyline
          points="3,0 3,33 41,33 41,67 78,67 78,100 97,100"
          fill="none"
          stroke="#7fb84a"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.6}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          left: "3%",
          top: "16%",
          transform: "translate(-50%, -50%)",
          height: "2.4cqw",
          width: "2.4cqw",
          borderRadius: "50%",
          background: "#d84f35",
          boxShadow: "0 0 12px rgba(216,79,53,0.6)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "97%",
          top: "84%",
          transform: "translate(-50%, -50%)",
          height: "10cqw",
          width: "10cqw",
          borderRadius: "1cqw",
          background: "linear-gradient(160deg, #6f7657, #2a2c1e)",
          border: "2px solid #95997f",
          boxShadow: "0 0 30px rgba(127,184,74,0.25)",
        }}
      />

      {[
        { left: "12%", top: "26%" },
        { left: "50%", top: "50%" },
        { left: "68%", top: "72%" },
      ].map((pos) => (
        <div
          key={`${pos.left}-${pos.top}`}
          style={{
            position: "absolute",
            left: pos.left,
            top: pos.top,
            transform: "translate(-50%, -50%)",
            height: "3.4cqw",
            width: "3.4cqw",
            borderRadius: "0.4cqw",
            border: "1px dashed #454a35",
            background: "rgba(127,184,74,0.06)",
          }}
        />
      ))}

      <div style={{ position: "absolute", top: "3%", left: "3%", display: "flex", flexDirection: "column", gap: "0.9cqw" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3cqw" }}>
          <span style={labelStyle}>Keep</span>
          <span style={{ fontSize: "1.8cqw", letterSpacing: "0.1cqw", color: "#d84f35" }}>
            {"♥".repeat(20)}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2cqw" }}>
          <span style={labelStyle}>Gold</span>
          <span style={{ fontFamily: "Consolas, monospace", fontSize: "2cqw", fontWeight: 800, color: "#d8c169" }}>150</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2cqw" }}>
          <span style={labelStyle}>Wave</span>
          <span style={{ fontSize: "1.6cqw", fontWeight: 700, color: "#e6e8d8" }}>
            1 <span style={{ color: "#95997f" }}>/ 6</span>
          </span>
          <span style={{ ...labelStyle, fontSize: "0.9cqw", color: "#95997f" }}>0 raiders</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "3%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6cqw",
        }}
      >
        <span style={labelStyle}>Build</span>
        <div style={{ display: "flex", gap: "1cqw" }}>
          <Tower label="Archer Post" cost={50} color="#7fb84a" />
          <Tower label="Cannon Redoubt" cost={90} color="#c9b73e" />
          <Tower label="Frost Spire" cost={70} color="#57a8b8" />
        </div>
      </div>
    </div>
  );
}
