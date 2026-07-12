import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  cloudWhite: "#f4f7f9",
  skyTeal: "#4ecdc4",
  citySlate: "#5d737e",
  windsockOrange: "#ff9f1c",
  shadowBlue: "#2b3a67",
} as const;

function Cloud({ left, top, scale, opacity }: { left: string; top: string; scale: number; opacity: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: `${18 * scale}cqw`,
        height: `${6 * scale}cqw`,
        borderRadius: "999px",
        background: PALETTE.cloudWhite,
        opacity,
        filter: "blur(0.4cqw)",
      }}
    />
  );
}

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2cqw" }}>
      <span
        style={{
          fontSize: "0.9cqw",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "rgba(244,247,249,0.65)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: "1.6cqw",
          fontWeight: 800,
          color: PALETTE.cloudWhite,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function TurbineCityPreview({ className }: GamePreviewProps) {
  const style: CSSProperties = {
    containerType: "size",
    position: "relative",
    height: "100%",
    width: "100%",
    overflow: "hidden",
    background: `linear-gradient(180deg, ${PALETTE.skyTeal} 0%, #dff3f1 62%, #eef7f8 100%)`,
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    userSelect: "none",
  };

  return (
    <div className={className} style={style}>
      <Cloud left="4cqw" top="14cqh" scale={1.1} opacity={0.55} />
      <Cloud left="70cqw" top="10cqh" scale={0.8} opacity={0.45} />
      <Cloud left="14cqw" top="68cqh" scale={1.3} opacity={0.5} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "42%",
          transform: "translate(-50%, -50%)",
          width: "34cqw",
          height: "34cqw",
          borderRadius: "50%",
          border: `1.2cqw solid ${PALETTE.skyTeal}`,
          boxShadow: `0 0 4cqw ${PALETTE.skyTeal}99, inset 0 0 3cqw ${PALETTE.skyTeal}55`,
          background: `radial-gradient(circle, ${PALETTE.skyTeal}22 0%, transparent 70%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "78cqw",
          top: "30cqh",
          width: "12cqw",
          height: "12cqw",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `0.5cqw solid ${PALETTE.citySlate}`,
            background: PALETTE.cloudWhite,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "9cqw",
            height: "9cqw",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: PALETTE.shadowBlue,
          }}
        />
        {[0, 72, 144, 216, 288].map((deg) => (
          <div
            key={deg}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "0.8cqw",
              height: "4.4cqw",
              background: PALETTE.cloudWhite,
              boxShadow: `0 0 0.6cqw ${PALETTE.windsockOrange}88`,
              transformOrigin: "50% 0%",
              transform: `translate(-50%, 0) rotate(${deg}deg)`,
              borderRadius: "999px",
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: "6cqw",
          bottom: "10cqh",
          width: "0.6cqw",
          height: "6cqw",
          background: PALETTE.citySlate,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "0.3cqw",
            width: "5.5cqw",
            height: "2.2cqw",
            background: PALETTE.windsockOrange,
            clipPath: "polygon(0 0, 100% 20%, 70% 50%, 100% 80%, 0 100%)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: "38cqw",
          top: "58cqh",
          width: "14cqw",
          height: "8cqw",
          transform: "rotate(-18deg)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "0",
            top: "50%",
            width: "12cqw",
            height: "2.4cqw",
            transform: "translateY(-50%)",
            background: PALETTE.cloudWhite,
            borderRadius: "999px 40% 40% 999px",
            boxShadow: "0 0.3cqw 0.6cqw rgba(0,0,0,0.25)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "2cqw",
            top: "50%",
            width: "8cqw",
            height: "0.7cqw",
            transform: "translateY(-50%)",
            background: PALETTE.windsockOrange,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "-1.5cqw",
            top: "50%",
            width: "3.4cqw",
            height: "3.4cqw",
            transform: "translateY(-50%)",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${PALETTE.skyTeal}cc 0%, transparent 75%)`,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          display: "flex",
          gap: "2.4cqw",
        }}
      >
        <HudStat label="Lap" value="1/2" />
        <HudStat label="Ring" value="1/10" />
      </div>

      <div style={{ position: "absolute", top: "3cqh", right: "3cqw", textAlign: "right" }}>
        <HudStat label="Time" value="0:00.00" />
      </div>

      <div style={{ position: "absolute", bottom: "4cqh", left: "3cqw" }}>
        <HudStat label="Streak" value="0" />
      </div>
    </div>
  );
}
