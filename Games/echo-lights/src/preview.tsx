import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const chipStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "0.9cqw",
  borderRadius: "9999px",
  border: "1px solid rgba(217,164,65,0.3)",
  background: "rgba(16,10,6,0.8)",
  padding: "0.5cqw 1.6cqw",
};

const chipLabelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "#8a6f4d",
};

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={chipStyle}>
      <span style={chipLabelStyle}>{label}</span>
      <span style={{ fontSize: "1.6cqw", fontWeight: 900, color: "#f3dfae" }}>{value}</span>
    </span>
  );
}

function Pad({
  placement,
  corner,
  base,
  deep,
  keyLabel,
  badge,
}: {
  placement: CSSProperties;
  corner: string;
  base: string;
  deep: string;
  keyLabel: string;
  badge: CSSProperties;
}) {
  return (
    <span
      style={{
        position: "absolute",
        width: "47.5%",
        height: "47.5%",
        borderRadius: corner,
        background: `radial-gradient(130% 130% at 50% 40%, ${base} 0%, ${deep} 82%)`,
        boxShadow: "inset 0 -6px 18px rgba(0,0,0,0.45), inset 0 4px 10px rgba(255,255,255,0.12)",
        ...placement,
      }}
    >
      <span
        style={{
          position: "absolute",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "2.6cqw",
          height: "2.6cqw",
          borderRadius: "9999px",
          background: "rgba(10,6,3,0.55)",
          color: "rgba(255,248,230,0.85)",
          fontSize: "1.3cqw",
          fontWeight: 800,
          boxShadow: "inset 0 0 0 1px rgba(255,248,230,0.25)",
          ...badge,
        }}
      >
        {keyLabel}
      </span>
    </span>
  );
}

export default function EchoLightsPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(120% 100% at 50% 18%, #2b1e12 0%, #170f08 52%, #0b0704 100%)",
        color: "#f3dfae",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "14%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1cqw",
        }}
      >
        <span style={{ fontSize: "2.4cqw", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.34em", color: "#e8cf9a" }}>
          Echo Lights
        </span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1cqw" }}>
          <Chip label="Round" value="—" />
          <Chip label="Best" value="—" />
          <Chip label="Mode" value="Classic" />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          width: "27cqw",
          aspectRatio: "1 / 1",
          borderRadius: "9999px",
          background: "radial-gradient(120% 120% at 50% 35%, #241708 0%, #120b05 80%)",
          boxShadow: "0 0 0 1cqw #1d130a, 0 0 0 1.2cqw rgba(217,164,65,0.22), 0 24px 60px rgba(0,0,0,0.65)",
        }}
      >
        <Pad placement={{ top: 0, left: 0 }} corner="100% 10% 10% 10%" base="#0f8a45" deep="#0a5c2f" keyLabel="1" badge={{ top: "18%", left: "18%" }} />
        <Pad placement={{ top: 0, right: 0 }} corner="10% 100% 10% 10%" base="#bb2330" deep="#7d161f" keyLabel="2" badge={{ top: "18%", right: "18%" }} />
        <Pad placement={{ bottom: 0, left: 0 }} corner="10% 10% 10% 100%" base="#c69207" deep="#8a6504" keyLabel="3" badge={{ bottom: "18%", left: "18%" }} />
        <Pad placement={{ bottom: 0, right: 0 }} corner="10% 10% 100% 10%" base="#1d59bd" deep="#123c82" keyLabel="4" badge={{ bottom: "18%", right: "18%" }} />
        <div
          style={{
            position: "absolute",
            inset: "30.5%",
            display: "grid",
            placeItems: "center",
            borderRadius: "9999px",
            background: "radial-gradient(110% 110% at 50% 30%, #2e2113 0%, #191007 78%)",
            boxShadow: "0 0 0 0.7cqw #0d0803, 0 0 26px rgba(0,0,0,0.85), inset 0 3px 10px rgba(255,240,200,0.08)",
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              borderRadius: "9999px",
              width: "72%",
              height: "72%",
              background: "radial-gradient(120% 120% at 50% 32%, #f2c96a 0%, #d9a441 70%)",
              color: "#1a1108",
              fontWeight: 900,
              letterSpacing: "0.22em",
              fontSize: "1.6cqw",
              boxShadow: "0 6px 18px rgba(217,164,65,0.35), inset 0 2px 6px rgba(255,255,255,0.5)",
            }}
          >
            START
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "12%",
          left: 0,
          right: 0,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "1cqw",
        }}
      >
        <span style={{ display: "flex", overflow: "hidden", borderRadius: "9999px", border: "1px solid rgba(217,164,65,0.4)" }}>
          <span style={{ padding: "0.7cqw 1.8cqw", fontSize: "1.3cqw", fontWeight: 700, letterSpacing: "0.05em", background: "#d9a441", color: "#17100a" }}>
            Classic
          </span>
          <span style={{ padding: "0.7cqw 1.8cqw", fontSize: "1.3cqw", fontWeight: 700, letterSpacing: "0.05em", color: "#d9a441" }}>
            Practice
          </span>
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.7cqw",
            borderRadius: "9999px",
            background: "#d9a441",
            padding: "0.7cqw 2cqw",
            fontSize: "1.3cqw",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#17100a",
          }}
        >
          New game
          <span style={{ borderRadius: "0.4cqw", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.3)", padding: "0 0.5cqw", fontSize: "1.1cqw", fontWeight: 800, color: "#e8cf9a" }}>
            R
          </span>
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.7cqw",
            borderRadius: "9999px",
            border: "1px solid rgba(95,227,138,0.4)",
            padding: "0.7cqw 1.8cqw",
            fontSize: "1.3cqw",
            fontWeight: 700,
            color: "#8fe9ab",
          }}
        >
          Daily
          <span style={{ borderRadius: "0.4cqw", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.3)", padding: "0 0.5cqw", fontSize: "1.1cqw", fontWeight: 800, color: "#e8cf9a" }}>
            D
          </span>
        </span>
        <span style={{ borderRadius: "9999px", border: "1px solid rgba(217,164,65,0.4)", padding: "0.7cqw 1.8cqw", fontSize: "1.3cqw", fontWeight: 600, color: "#d9a441" }}>
          seed k3x9p1a
        </span>
      </div>

      <div style={{ position: "absolute", bottom: "4%", left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <span
          style={{
            borderRadius: "9999px",
            background: "rgba(0,0,0,0.45)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
            padding: "0.5cqw 1.8cqw",
            fontSize: "1.1cqw",
            fontWeight: 500,
            letterSpacing: "0.08em",
            color: "#8a6f4d",
          }}
        >
          Homage to Simon — Ralph Baer &amp; Howard Morrison (1978), after Atari&apos;s Touch Me
        </span>
      </div>
    </div>
  );
}
