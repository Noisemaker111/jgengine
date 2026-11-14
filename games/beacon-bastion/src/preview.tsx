/** @jsxImportSource @jgengine/core/ui/jsx */
import type { CSSProperties } from "@jgengine/core/ui/jsx";
import type { GamePreviewProps } from "@jgengine/ui/preview";

import { BEACON_FONTS } from "./art/look";

const labelStyle: CSSProperties = {
  fontFamily: BEACON_FONTS.fontBody,
  fontSize: "1.1cqw",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#f6e7c1",
};

function Worker({ label, cost, color }: { label: string; cost: number; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.3cqw",
        padding: "0.6cqw 0.8cqw",
        borderRadius: "1cqw",
        background: "linear-gradient(#e4573f, #b83a28)",
        border: "2px solid #ffd9b0",
      }}
    >
      <span style={{ height: "3cqw", width: "3cqw", borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, #fff4e0, ${color})` }} />
      <span style={{ ...labelStyle, fontSize: "0.95cqw", color: "#fff4e0" }}>{label}</span>
      <span style={{ fontFamily: BEACON_FONTS.fontBody, fontSize: "1.1cqw", fontWeight: 800, color: "#8fe07a" }}>${cost}</span>
    </div>
  );
}

/** A gadget on the street: a glowing screen with a face, for the card's art. */
function Gadget({ left, top, glow }: { left: string; top: string; glow: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%, -50%) rotate(-8deg)",
        height: "4.4cqw",
        width: "2.6cqw",
        borderRadius: "0.5cqw",
        background: "#1c1c24",
        border: `0.35cqw solid #1c1c24`,
        boxShadow: `0 0 14px ${glow}`,
      }}
    >
      <div style={{ height: "100%", width: "100%", borderRadius: "0.3cqw", background: glow }} />
    </div>
  );
}

export default function BeaconBastionPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#bfe3f2, #9fd07a 30%, #78b85a)",
        color: "#fff6e6",
        fontFamily: BEACON_FONTS.fontBody,
        userSelect: "none",
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: "16%", bottom: "24%", left: 0, width: "100%", height: "68%" }}>
        <polyline points="3,0 3,33 41,33 41,67 78,67 78,100 97,100" fill="none" stroke="#5a5a62" strokeWidth={8} />
        <polyline points="3,0 3,33 41,33 41,67 78,67 78,100 97,100" fill="none" stroke="#f6e27a" strokeWidth={0.6} strokeDasharray="3 3" />
      </svg>

      <Gadget left="3%" top="22%" glow="#5ab8ff" />
      <Gadget left="22%" top="41%" glow="#6affb0" />
      <Gadget left="41%" top="58%" glow="#ff4ad8" />

      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "6%",
          padding: "1.2cqw 2.4cqw",
          borderRadius: "2cqw",
          background: "linear-gradient(#f0407a, #b01f52)",
          border: "3px solid #ffe08a",
          textAlign: "center",
          boxShadow: "0 0 30px rgba(255,74,138,0.4)",
        }}
      >
        <div style={{ fontFamily: BEACON_FONTS.fontDisplay, fontSize: "4.2cqw", lineHeight: 1, color: "#fff4e0" }}>DO NOT</div>
        <div style={{ fontFamily: BEACON_FONTS.fontDisplay, fontSize: "4.2cqw", lineHeight: 1, color: "#ffe08a" }}>DISTURB</div>
      </div>

      <div style={{ position: "absolute", top: "4%", left: "3%", display: "flex", flexDirection: "column", gap: "0.8cqw" }}>
        <div style={{ padding: "0.5cqw 1cqw", borderRadius: "1cqw", background: "#1f5c5a", border: "2px solid #f6e7c1" }}>
          <span style={labelStyle}>Attention </span>
          <span style={{ fontFamily: BEACON_FONTS.fontDisplay, fontSize: "2cqw" }}>20/20</span>
        </div>
        <div style={{ padding: "0.5cqw 1cqw", borderRadius: "1cqw", background: "#1f5c5a", border: "2px solid #f6e7c1" }}>
          <span style={{ fontFamily: BEACON_FONTS.fontDisplay, fontSize: "2cqw", color: "#8fe07a" }}>$150</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "3%", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "0.8cqw" }}>
        <Worker label="Barista" cost={50} color="#8a5a34" />
        <Worker label="Plumber" cost={65} color="#2f6fb0" />
        <Worker label="Grandma" cost={70} color="#b46a9a" />
        <Worker label="Teacher" cost={90} color="#c0392b" />
      </div>
    </div>
  );
}
