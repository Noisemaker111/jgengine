import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelLabelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "#8fa688",
};

function Enemy({ left, top, color }: { left: string; top: string; color: string }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width: "1.4cqw",
        height: "1.4cqw",
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 8px ${color}`,
      }}
    />
  );
}

export default function SwarmSurvivorPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(120% 90% at 50% 30%, #3a2a2e 0%, #241a24 55%, #131019 100%)",
        color: "#e8f5e2",
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(closest-side, rgba(39,74,31,0.55), transparent 70%), repeating-linear-gradient(45deg, rgba(60,122,43,0.08) 0 2px, transparent 2px 14px)",
        }}
      />

      <Enemy left="20%" top="30%" color="#c9c6b8" />
      <Enemy left="72%" top="26%" color="#c9c6b8" />
      <Enemy left="30%" top="70%" color="#8fae7a" />
      <Enemy left="80%" top="62%" color="#8fae7a" />
      <Enemy left="55%" top="20%" color="#c9c6b8" />
      <Enemy left="62%" top="78%" color="#e0483e" />

      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "48%",
          transform: "translate(-50%, -50%)",
          width: "2.6cqw",
          height: "2.6cqw",
          borderRadius: "50%",
          background: "radial-gradient(circle, #cfe8c6, #7fe36b)",
          boxShadow: "0 0 16px rgba(127,227,107,0.7)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "48%",
          transform: "translate(-50%, -50%)",
          width: "7cqw",
          height: "7cqw",
          borderRadius: "50%",
          border: "1px dashed rgba(223,233,234,0.4)",
        }}
      />

      <div style={{ position: "absolute", top: "3%", left: "2.5%", width: "22cqw" }}>
        <div style={panelLabelStyle}>Hull</div>
        <div
          style={{
            position: "relative",
            marginTop: "0.5cqw",
            height: "1.8cqw",
            borderRadius: "0.4cqw",
            background: "rgba(7,12,8,0.7)",
            border: "1px solid #2a3f27",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "0.4cqw",
              background: "linear-gradient(#e0483e, #6e211c)",
            }}
          />
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              fontSize: "1.1cqw",
              fontWeight: 800,
              color: "#fff",
            }}
          >
            100 / 100
          </span>
        </div>
      </div>

      <div style={{ position: "absolute", top: "3%", left: "50%", transform: "translateX(-50%)", textAlign: "center", width: "24cqw" }}>
        <div style={panelLabelStyle}>Survive</div>
        <div style={{ fontSize: "2.6cqw", fontWeight: 900, fontFamily: 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace', color: "#e8f5e2" }}>
          0:00
        </div>
        <div
          style={{
            marginTop: "0.4cqw",
            height: "0.9cqw",
            borderRadius: "0.3cqw",
            background: "rgba(7,12,8,0.7)",
            border: "1px solid #2a3f27",
          }}
        >
          <span style={{ display: "block", width: "0%", height: "100%", borderRadius: "0.3cqw", background: "linear-gradient(90deg, #a566d9, #4e2c6e)" }} />
        </div>
      </div>

      <div style={{ position: "absolute", top: "3%", right: "2.5%", display: "flex", alignItems: "center", gap: "1cqw" }}>
        <span style={{ fontSize: "1.6cqw", color: "#e8f5e2" }}>⚙</span>
        <div style={{ textAlign: "right" }}>
          <div style={panelLabelStyle}>Kills</div>
          <div style={{ fontSize: "2.2cqw", fontWeight: 800, fontFamily: 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace', color: "#e8f5e2" }}>
            000
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "3%", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "1cqw" }}>
        {[
          { icon: "⚡", color: "#8be9f0" },
          { icon: "⚔", color: "#dfe9ea" },
          { icon: "☄", color: "#a566d9" },
        ].map((slot) => (
          <span
            key={slot.icon}
            style={{
              width: "4cqw",
              height: "4cqw",
              borderRadius: "0.6cqw",
              display: "grid",
              placeItems: "center",
              fontSize: "1.8cqw",
              background: "rgba(7,12,8,0.75)",
              border: `1px solid ${slot.color}`,
              color: slot.color,
              boxShadow: `0 0 10px ${slot.color}55`,
            }}
          >
            {slot.icon}
          </span>
        ))}
      </div>
    </div>
  );
}
