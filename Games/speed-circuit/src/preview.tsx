import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const ACCENT = "#41e6f0";
const TEXT = "#e9ecff";
const TEXT_DIM = "#8d8bb3";

const labelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.3em",
  color: TEXT_DIM,
};

export default function SpeedCircuitPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#12101f 0%, #1c1836 45%, #2a2050 45.5%, #1a1530 100%)",
        color: TEXT,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 8%, rgba(65,230,240,0.18), transparent 40%), repeating-linear-gradient(to bottom, transparent 0 3px, rgba(65,230,240,0.06) 4px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          top: "46%",
          width: "42cqw",
          transform: "translateX(-50%)",
          background: "linear-gradient(#302750, #100c1e)",
          borderLeft: "2px solid rgba(65,230,240,0.5)",
          borderRight: "2px solid rgba(65,230,240,0.5)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: "0.6cqw",
            transform: "translateX(-50%)",
            backgroundImage: "repeating-linear-gradient(to bottom, #f0e341 0 3cqw, transparent 3cqw 6cqw)",
            opacity: 0.8,
          }}
        />
      </div>

      <div style={{ position: "absolute", top: "4%", left: "4%" }}>
        <div
          style={{
            position: "relative",
            width: "10cqw",
            height: "10cqw",
            borderRadius: "50%",
            border: "0.4cqw solid rgba(65,230,240,0.35)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: "0.4cqw",
              borderRadius: "50%",
              border: `0.4cqw solid ${ACCENT}`,
              borderRightColor: "transparent",
              borderBottomColor: "transparent",
              transform: "rotate(-45deg)",
            }}
          />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2.6cqw", fontWeight: 900, color: TEXT }}>0</div>
            <div style={{ fontSize: "1cqw", fontWeight: 700, letterSpacing: "0.2em", color: TEXT_DIM }}>KM/H</div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "4%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6cqw",
        }}
      >
        <span style={labelStyle}>Lap 1/3</span>
        <div style={{ display: "flex", gap: "2.8cqw" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2cqw" }}>
            <span style={labelStyle}>Time</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "2.2cqw", fontWeight: 800, color: TEXT }}>--:--</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2cqw" }}>
            <span style={labelStyle}>Best</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "2.2cqw", fontWeight: 800, color: TEXT }}>--:--</span>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "10%",
          width: "6.4cqw",
          transform: "translateX(-50%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-1.4cqw",
            left: "-1.6cqw",
            right: "-1.6cqw",
            height: "0.55cqw",
            backgroundImage:
              "repeating-linear-gradient(90deg, #f2f2f2 0 0.55cqw, #12101f 0.55cqw 1.1cqw)",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "11cqw",
            borderRadius: "1.2cqw",
            background: "linear-gradient(#e8392a, #a02418)",
            boxShadow: "0 0 1.4cqw rgba(232,57,42,0.5)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "12%",
              right: "12%",
              top: "26%",
              height: "34%",
              borderRadius: "0.6cqw",
              background: "#1c2636",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "16%",
              right: "16%",
              bottom: "6%",
              height: "0.6cqw",
              borderRadius: "0.3cqw",
              background: "#fffaf0",
              boxShadow: "0 0 0.8cqw rgba(255,242,176,0.8)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
