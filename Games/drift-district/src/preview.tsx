import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const CYAN = "#29d9e0";
const CAR_PINK = "#ff2d78";

function building(leftPct: number, w: number, h: number): CSSProperties {
  return {
    position: "absolute",
    left: `${leftPct}%`,
    bottom: "22%",
    width: `${w}cqw`,
    height: `${h}cqh`,
    background: "linear-gradient(#1a1a24, #0d0d14)",
    borderTop: `0.15cqmin solid ${CYAN}`,
    boxShadow: `0 -0.4cqmin 1.4cqmin ${CYAN}55`,
  };
}

export default function DriftDistrictPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(180deg, #050208 0%, #0d0a14 55%, #14121c 100%)",
        userSelect: "none",
      }}
    >
      <div style={building(2, 12, 34)} />
      <div style={building(16, 9, 22)} />
      <div style={building(74, 10, 26)} />
      <div style={building(87, 11, 38)} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "3cqw solid transparent",
          borderRight: "3cqw solid transparent",
          borderBottom: "60cqh solid #101018",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "4%",
          transform: "translateX(-50%)",
          width: "0.3cqw",
          height: "40cqh",
          background: "repeating-linear-gradient(#e8e6f0 0 2.2cqh, transparent 2.2cqh 4.4cqh)",
          opacity: 0.7,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "20%",
          transform: "translate(-50%, 0)",
          width: "18cqw",
          height: "16cqh",
          borderRadius: "3cqmin 3cqmin 0 0",
          border: `0.35cqmin solid ${CYAN}`,
          borderBottom: "none",
          boxShadow: `0 0 2.4cqmin ${CYAN}aa`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "6%",
          transform: "translate(-50%, 0)",
          width: "9cqw",
          height: "13cqh",
          borderRadius: "2.4cqmin 2.4cqmin 1cqmin 1cqmin",
          background: `linear-gradient(180deg, ${CAR_PINK}, #3d0a1e)`,
          boxShadow: `0 0 2.6cqmin ${CAR_PINK}aa`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "12%",
            top: "8%",
            width: "18%",
            height: "10%",
            borderRadius: "999px",
            background: "#cfe6ff",
            boxShadow: "0 0 1cqmin #cfe6ff",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "12%",
            top: "8%",
            width: "18%",
            height: "10%",
            borderRadius: "999px",
            background: "#cfe6ff",
            boxShadow: "0 0 1cqmin #cfe6ff",
          }}
        />
      </div>

      <span
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          fontSize: "1.6cqw",
          fontWeight: 800,
          letterSpacing: "0.15em",
          color: "#e8e6f0",
          textShadow: `0 0 1cqmin ${CAR_PINK}88`,
        }}
      >
        LAP 1/3
      </span>
    </div>
  );
}
