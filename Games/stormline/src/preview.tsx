import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const ROAD = "#12161c";
const FENCE = "#3d4a5c";
const GOLD = "#d9a441";
const ORANGE = "#f25c05";

function fencePost(side: "left" | "right", depth: number): CSSProperties {
  const spread = 6 + depth * 34;
  const top = 18 + depth * 62;
  const scale = 0.25 + depth * 0.85;
  return {
    position: "absolute",
    top: `${top}cqh`,
    [side]: `calc(50% - ${spread}cqw)`,
    width: `${0.6 * scale}cqw`,
    height: `${6 * scale}cqh`,
    background: FENCE,
    transform: "translateX(-50%)",
    borderRadius: "0.2cqw",
  };
}

export default function StormlinePreview({ className }: GamePreviewProps) {
  const depths = [0.12, 0.3, 0.5, 0.7, 0.9];

  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#161c26, #10151d)",
        color: "#e6edf3",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(60cqw 40cqh at 50% -6%, rgba(242,92,5,0.32), transparent 60%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "16cqh",
          bottom: 0,
          width: "6cqw",
          background: ROAD,
          clipPath: "polygon(50% 0%, 60% 0%, 100% 100%, 0% 100%, 40% 0%)",
          transform: "translateX(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "18cqh",
          bottom: "2cqh",
          width: "0.25cqw",
          background: "repeating-linear-gradient(to bottom, #4a5568 0 6%, transparent 6% 12%)",
          transform: "translateX(-50%)",
          opacity: 0.7,
        }}
      />

      {depths.map((d, i) => (
        <div key={`l-${i}`} style={fencePost("left", d)} />
      ))}
      {depths.map((d, i) => (
        <div key={`r-${i}`} style={fencePost("right", d)} />
      ))}

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "6cqh",
          transform: "translateX(-50%)",
          width: "10cqw",
          height: "16cqh",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "40%",
            height: "60%",
            background: GOLD,
            borderRadius: "0.6cqw",
            boxShadow: "0 0.3cqh 1cqh rgba(0,0,0,0.5)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "10%",
            right: "10%",
            bottom: "78%",
            height: "24%",
            background: "#3d4a5c",
            borderRadius: "0.5cqw 0.5cqw 0 0",
          }}
        />
        <div style={{ position: "absolute", left: "8%", bottom: "38%", width: "18%", height: "6%", background: "#fef3c7", borderRadius: "0.2cqw", boxShadow: "0 0 0.8cqw rgba(254,243,199,0.8)" }} />
        <div style={{ position: "absolute", right: "8%", bottom: "38%", width: "18%", height: "6%", background: "#fef3c7", borderRadius: "0.2cqw", boxShadow: "0 0 0.8cqw rgba(254,243,199,0.8)" }} />
      </div>

      <div
        style={{
          position: "absolute",
          top: "2.5cqh",
          left: "50%",
          transform: "translateX(-50%)",
          width: "48cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.5cqw",
          borderRadius: "0.6cqw",
          border: "1px solid #3d4a5c",
          background: "rgba(30,38,51,0.85)",
          padding: "0.7cqw 1.2cqw",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1cqw", textTransform: "uppercase", letterSpacing: "0.15em", color: "#9fb8c8" }}>
          <span>The Line</span>
          <span style={{ color: GOLD, fontWeight: 700 }}>420m lead</span>
        </div>
        <div style={{ height: "0.9cqh", borderRadius: "999px", background: "#0f151d", overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", background: GOLD }} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "2.5cqh",
          right: "2.5cqw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.3cqw",
          borderRadius: "0.6cqw",
          border: "1px solid #3d4a5c",
          background: "rgba(30,38,51,0.85)",
          padding: "0.7cqw 1.4cqw",
        }}
      >
        <span style={{ fontSize: "2cqw", fontWeight: 800, color: GOLD }}>0</span>
        <span style={{ fontSize: "0.85cqw", color: "#9fb8c8", textTransform: "uppercase", letterSpacing: "0.1em" }}>km/h</span>
      </div>

      <span
        style={{
          position: "absolute",
          bottom: "2.5cqh",
          left: "2.5cqw",
          fontSize: "1cqw",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: ORANGE,
        }}
      >
        Cutbank Crossing
      </span>
    </div>
  );
}
