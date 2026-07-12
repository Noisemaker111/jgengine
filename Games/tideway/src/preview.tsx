import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const WATER_A = "#14505c";
const WATER_B = "#0a2126";
const GOLD = "#f2c14e";
const FOAM = "#e6f2ef";

interface BoatSpec {
  x: number;
  hull: string;
  sail: string;
  label: string;
}

const BOATS: readonly BoatSpec[] = [
  { x: 32, hull: "#0e2a30", sail: FOAM, label: "Brigand's Wake" },
  { x: 50, hull: "#c74a34", sail: GOLD, label: "Skipper" },
  { x: 68, hull: GOLD, sail: "#c74a34", label: "Halyard's Due" },
];

function boatStyle(x: number): CSSProperties {
  return {
    position: "absolute",
    left: `${x}%`,
    bottom: "18cqh",
    transform: "translateX(-50%)",
    width: "6cqw",
    height: "11cqh",
  };
}

export default function TidewayPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `linear-gradient(${WATER_A}, ${WATER_B})`,
        color: "#e6f2ef",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(100deg, rgba(230,242,239,0.05) 0 2px, transparent 2px 22px)",
          backgroundSize: "100% 100%",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "14cqh",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.4cqw",
        }}
      >
        <div style={{ display: "flex", gap: "10cqw" }}>
          <span style={{ width: "1cqw", height: "8cqh", background: GOLD, borderRadius: "0.2cqw", boxShadow: `0 0 1cqw ${GOLD}88` }} />
          <span style={{ width: "1cqw", height: "8cqh", background: GOLD, borderRadius: "0.2cqw", boxShadow: `0 0 1cqw ${GOLD}88` }} />
        </div>
        <span style={{ fontSize: "0.95cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: GOLD }}>
          Gate 1
        </span>
      </div>

      {BOATS.map((boat) => (
        <div key={boat.label} style={boatStyle(boat.x)}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 0,
              transform: "translateX(-50%)",
              width: "100%",
              height: "45%",
              background: boat.hull,
              clipPath: "polygon(50% 0%, 100% 40%, 85% 100%, 15% 100%, 0% 40%)",
              boxShadow: "0 0.4cqh 0.8cqh rgba(0,0,0,0.4)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "40%",
              transform: "translateX(-50%)",
              width: "0",
              height: "0",
              borderLeft: "2.6cqw solid transparent",
              borderRight: "2.6cqw solid transparent",
              borderBottom: `9cqh solid ${boat.sail}`,
              opacity: 0.92,
            }}
          />
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          bottom: "3cqh",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.4cqw",
          borderRadius: "0.3cqw",
          border: `1px solid ${GOLD}4d`,
          background: "rgba(14,42,48,0.8)",
          padding: "0.8cqw 2cqw",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.4cqw" }}>
          <span style={{ fontSize: "2.2cqw", fontWeight: 900, color: "#e6f2ef" }}>0.0</span>
          <span style={{ fontSize: "0.9cqw", textTransform: "uppercase", letterSpacing: "0.2em", color: "#e6f2ef99" }}>knots</span>
        </div>
        <div style={{ height: "0.5cqh", width: "12cqw", borderRadius: "999px", background: WATER_A, overflow: "hidden" }}>
          <div style={{ width: "0%", height: "100%", background: "#e6f2ef" }} />
        </div>
      </div>

      <span
        style={{
          position: "absolute",
          top: "2.4cqh",
          left: "2.4cqw",
          fontSize: "1cqw",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.25em",
          color: GOLD,
        }}
      >
        Lap 1 / 2
      </span>
    </div>
  );
}
