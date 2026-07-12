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
  lit,
}: {
  placement: CSSProperties;
  corner: string;
  base: string;
  deep: string;
  keyLabel: string;
  badge: CSSProperties;
  lit: boolean;
}) {
  return (
    <span
      style={{
        position: "absolute",
        width: "47.5%",
        height: "47.5%",
        borderRadius: corner,
        background: `radial-gradient(130% 130% at 50% 40%, ${lit ? base : deep} 0%, ${deep} 82%)`,
        boxShadow: lit
          ? `inset 0 -6px 18px rgba(0,0,0,0.3), inset 0 4px 10px rgba(255,255,255,0.25), 0 0 3cqw ${base}`
          : "inset 0 -6px 18px rgba(0,0,0,0.45), inset 0 4px 10px rgba(255,255,255,0.12)",
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
          top: "10%",
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "1cqw",
        }}
      >
        <Chip label="Round" value="1" />
        <Chip label="Best" value="—" />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "54%",
          transform: "translate(-50%, -50%)",
          width: "32cqw",
          aspectRatio: "1 / 1",
          borderRadius: "9999px",
          background: "radial-gradient(120% 120% at 50% 35%, #241708 0%, #120b05 80%)",
          boxShadow: "0 0 0 1cqw #1d130a, 0 0 0 1.2cqw rgba(217,164,65,0.22), 0 24px 60px rgba(0,0,0,0.65)",
        }}
      >
        <Pad placement={{ top: 0, left: 0 }} corner="100% 10% 10% 10%" base="#0f8a45" deep="#0a5c2f" keyLabel="1" badge={{ top: "18%", left: "18%" }} lit />
        <Pad placement={{ top: 0, right: 0 }} corner="10% 100% 10% 10%" base="#bb2330" deep="#7d161f" keyLabel="2" badge={{ top: "18%", right: "18%" }} lit={false} />
        <Pad placement={{ bottom: 0, left: 0 }} corner="10% 10% 10% 100%" base="#c69207" deep="#8a6504" keyLabel="3" badge={{ bottom: "18%", left: "18%" }} lit={false} />
        <Pad placement={{ bottom: 0, right: 0 }} corner="10% 10% 100% 10%" base="#1d59bd" deep="#123c82" keyLabel="4" badge={{ bottom: "18%", right: "18%" }} lit={false} />
        <div
          style={{
            position: "absolute",
            inset: "30.5%",
            borderRadius: "9999px",
            background: "radial-gradient(110% 110% at 50% 30%, #2e2113 0%, #191007 78%)",
            boxShadow: "0 0 0 0.7cqw #0d0803, 0 0 26px rgba(0,0,0,0.85), inset 0 3px 10px rgba(255,240,200,0.08)",
          }}
        />
      </div>
    </div>
  );
}
