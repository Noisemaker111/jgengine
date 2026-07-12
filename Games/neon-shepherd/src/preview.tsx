import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const inkWhite = "#eef4f0";
const spiritMint = "#7ef9c8";
const streetlightAmber = "#f5c56b";

const chipStyle: CSSProperties = {
  borderRadius: "0.5cqw",
  background: "#0c0e12",
  color: streetlightAmber,
  fontSize: "1.1cqw",
  fontWeight: 700,
  padding: "0.4cqw 0.9cqw",
};

function ControlRow({ label, action }: { label: string; action: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.9cqw" }}>
      <span style={chipStyle}>{label}</span>
      <span style={{ fontSize: "1.1cqw", color: "rgba(238,244,240,0.75)" }}>{action}</span>
    </div>
  );
}

export default function NeonShepherdPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#101318",
        color: inkWhite,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(to right, rgba(126,249,200,0.05) 0 1px, transparent 1px 8cqw), repeating-linear-gradient(to bottom, rgba(126,249,200,0.04) 0 1px, transparent 1px 8cqw)",
        }}
      />
      {Array.from({ length: 20 }, (_, i) => {
        const left = 8 + ((i * 37) % 84);
        const top = 25 + ((i * 53) % 55);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: "0.6cqw",
              height: "0.6cqw",
              borderRadius: "50%",
              background: spiritMint,
              boxShadow: "0 0 0.8cqw rgba(126,249,200,0.6)",
              opacity: 0.75,
            }}
          />
        );
      })}

      <div style={{ position: "absolute", inset: 0, background: "rgba(16,19,24,0.9)", backdropFilter: "blur(6px)" }} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "44%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          maxWidth: "62cqw",
        }}
      >
        <div style={{ fontSize: "4.4cqw", fontWeight: 900, letterSpacing: "0.02em", color: inkWhite }}>Neon Shepherd</div>
        <div style={{ fontSize: "1.3cqw", fontStyle: "italic", color: spiritMint, marginTop: "0.8cqw", lineHeight: 1.5 }}>
          After midnight, twenty lights follow you through the sleeping city.
          <br />
          Walk them all home. Lose none.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "63%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.28em", color: "rgba(238,244,240,0.6)" }}>
          Choose the city's mood
        </div>
        <div style={{ display: "flex", gap: "0.9cqw", marginTop: "0.8cqw" }}>
          {["Hush", "Drift", "Static"].map((tier, i) => (
            <span
              key={tier}
              style={{
                borderRadius: "0.6cqw",
                border: i === 0 ? `1px solid ${spiritMint}` : "1px solid #2a2f38",
                background: i === 0 ? "rgba(126,249,200,0.1)" : "#161a20",
                color: inkWhite,
                fontSize: "1.2cqw",
                fontWeight: 700,
                padding: "0.6cqw 1.6cqw",
              }}
            >
              {tier}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "6%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "0.7cqw",
          borderRadius: "1cqw",
          background: "rgba(22,26,32,0.85)",
          padding: "1.2cqw 2cqw",
        }}
      >
        <div style={{ display: "flex", gap: "2cqw" }}>
          <ControlRow label="WASD" action="walk" />
          <ControlRow label="SPACE" action="gather pulse" />
          <ControlRow label="SHIFT" action="hold the herd" />
        </div>
        <span
          style={{
            alignSelf: "center",
            marginTop: "0.6cqw",
            borderRadius: "2cqw",
            background: spiritMint,
            color: "#101318",
            fontWeight: 900,
            fontSize: "1.4cqw",
            padding: "0.7cqw 2.4cqw",
            boxShadow: "0 0 1.4cqw rgba(126,249,200,0.5)",
          }}
        >
          Start · Enter
        </span>
      </div>
    </div>
  );
}
