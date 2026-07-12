import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const DAWN_SKY = "#f7c59f";
const ZENITH = "#8fd0e0";
const ISLAND_EARTH = "#8a9b68";
const ISLAND_ROCK = "#6f6152";
const BRASS = "#b08d57";
const BRASS_DARK = "#8a6c3e";
const CLOUD_CREAM = "#f4efe6";
const BANNER_TEAL = "#2e8b8b";
const RING_GLOW = "#ffd699";

const panelStyle: CSSProperties = {
  borderRadius: "0.8cqw",
  border: "1px solid rgba(176,141,87,0.45)",
  background: "rgba(43,33,24,0.68)",
  boxShadow: "0 0.4cqw 1cqw rgba(0,0,0,0.35)",
  backdropFilter: "blur(2px)",
};

const labelStyle: CSSProperties = {
  fontSize: "1cqw",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "rgba(244,239,230,0.6)",
};

function Islet({ left, top, size }: { left: string; top: string; size: number }) {
  return (
    <div style={{ position: "absolute", left, top, width: `${size}cqw`, height: `${size * 0.6}cqw` }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `linear-gradient(180deg, ${ISLAND_EARTH} 0%, ${ISLAND_EARTH} 45%, ${ISLAND_ROCK} 100%)`,
          boxShadow: "0 0.6cqw 1.2cqw rgba(0,0,0,0.3)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "82%",
          width: "0.35cqw",
          height: `${size * 0.55}cqw`,
          background: BRASS_DARK,
          transform: "translateX(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: `${82 + size * 0.55}%`,
          width: `${size * 0.34}cqw`,
          height: `${size * 0.34}cqw`,
          transform: "translate(-50%, 50%)",
          borderRadius: "50%",
          border: `0.28cqw solid ${BRASS}`,
          boxShadow: `0 0 1cqw ${RING_GLOW}`,
        }}
      />
    </div>
  );
}

export default function SkyhookRallyPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `linear-gradient(180deg, ${ZENITH} 0%, ${DAWN_SKY} 55%, #e8a86c 82%, #b0764a 100%)`,
        color: CLOUD_CREAM,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {[
        { left: "6%", top: "20%", size: 16 },
        { left: "70%", top: "14%", size: 12 },
        { left: "86%", top: "38%", size: 10 },
      ].map((c, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: c.left,
            top: c.top,
            width: `${c.size}cqw`,
            height: `${c.size * 0.45}cqw`,
            borderRadius: "50%",
            background: CLOUD_CREAM,
            opacity: 0.55,
            filter: "blur(0.3cqw)",
          }}
        />
      ))}

      <Islet left="10%" top="58%" size={22} />
      <Islet left="46%" top="38%" size={17} />
      <Islet left="78%" top="52%" size={19} />

      <div
        style={{
          position: "absolute",
          left: "17%",
          top: "40%",
          width: "34%",
          height: "20%",
          borderTop: `0.22cqw solid ${BRASS}`,
          borderRadius: "50%",
          opacity: 0.75,
        }}
      />

      <div style={{ position: "absolute", left: "31%", top: "52%", width: "3.4cqw", height: "6.5cqw" }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: "0.18cqw",
            height: "3.6cqw",
            background: BRASS,
            transform: "translateX(-50%) rotate(-8deg)",
            transformOrigin: "top center",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "38%",
            top: "3.5cqw",
            width: "1.8cqw",
            height: "2.6cqw",
            borderRadius: "0.9cqw 0.9cqw 0.5cqw 0.5cqw",
            background: BANNER_TEAL,
            boxShadow: "0 0.3cqw 0.8cqw rgba(0,0,0,0.35)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "3.2cqw",
          height: "3.2cqw",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `0.16cqw solid ${RING_GLOW}`,
          opacity: 0.7,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "4%",
          left: "50%",
          transform: "translateX(-50%)",
          ...panelStyle,
          display: "flex",
          alignItems: "center",
          gap: "1.6cqw",
          padding: "0.7cqw 1.4cqw",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={labelStyle}>Checkpoint</div>
          <div style={{ fontSize: "1.5cqw", fontWeight: 900 }}>0/8</div>
        </div>
        <div style={{ width: "1px", height: "2.2cqw", background: "rgba(176,141,87,0.4)" }} />
        <div style={{ textAlign: "center" }}>
          <div style={labelStyle}>Time</div>
          <div style={{ fontSize: "1.5cqw", fontWeight: 900 }}>0.0s</div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "8%",
          ...panelStyle,
          width: "9cqw",
          height: "9cqw",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ position: "relative", width: "70%", height: "70%" }}>
          {[
            [50, 78],
            [30, 40],
            [68, 30],
          ].map(([x, y], i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                width: "0.9cqw",
                height: "0.9cqw",
                borderRadius: "50%",
                background: i === 0 ? RING_GLOW : "rgba(244,239,230,0.55)",
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "5%",
          left: "4%",
          ...panelStyle,
          padding: "0.6cqw 1.2cqw",
        }}
      >
        <div style={labelStyle}>Altitude</div>
        <div style={{ fontSize: "1.6cqw", fontWeight: 900 }}>18m</div>
      </div>
    </div>
  );
}
