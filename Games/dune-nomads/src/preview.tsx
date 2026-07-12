import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.8cqw",
  height: "1.8cqw",
  padding: "0 0.4cqw",
  borderRadius: "0.2cqw",
  border: "1px solid #5c4526",
  background: "#241a10",
  fontSize: "0.9cqw",
  fontWeight: 700,
  color: "#f4e6cc",
};

const CONTROLS: readonly { key: string; label: string }[] = [
  { key: "W / S", label: "Urge the caravan faster / ease off" },
  { key: "A / D", label: "Steer" },
  { key: "E", label: "Dock at an oasis" },
  { key: "M", label: "Expand the sand chart" },
];

export default function DuneNomadsPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(circle at 50% 30%, rgba(224,184,120,0.14), #160f09 72%)",
        color: "#f4e6cc",
        fontFamily: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2.2cqw",
          padding: "0 4cqw",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6cqw" }}>
          <span
            style={{
              fontSize: "5cqw",
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#e0b878",
              textShadow: "0 0 26px rgba(224,184,120,0.5)",
            }}
          >
            Dune Nomads
          </span>
          <span style={{ fontSize: "1.3cqw", fontStyle: "italic", color: "#c9ac82" }}>
            A caravan crossing to Meridaan
          </span>
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "1cqw",
            border: "2px solid #e0b878",
            background: "rgba(224,184,120,0.1)",
            padding: "0.9cqw 3cqw",
            fontSize: "1.5cqw",
            letterSpacing: "0.08em",
            color: "#e0b878",
          }}
        >
          Begin the Crossing
          <span style={badgeStyle}>Enter</span>
        </span>

        <div
          style={{
            borderRadius: "0.3cqw",
            border: "1px solid #5c4526",
            background: "rgba(36,26,16,0.92)",
            padding: "1.2cqw 2cqw",
            width: "38cqw",
          }}
        >
          <div style={{ fontSize: "1cqw", fontWeight: 700, letterSpacing: "0.1em", color: "#c9ac82", marginBottom: "0.8cqw" }}>
            The Rules of the Sand
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6cqw" }}>
            {CONTROLS.map((control) => (
              <div key={control.key} style={{ display: "flex", alignItems: "center", gap: "0.9cqw" }}>
                <span style={badgeStyle}>{control.key}</span>
                <span style={{ fontSize: "1cqw", color: "#f4e6cc" }}>{control.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
