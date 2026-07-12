import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const runners: { name: string; leg: string; jersey: string; flavor: string }[] = [
  { name: "Zoe Chen", leg: "Leg 1", jersey: "#b3573f", flavor: "Fastest off the mark — burns hot on the warehouse flats." },
  { name: "Mika Torres", leg: "Leg 2", jersey: "#f2b950", flavor: "Steadiest hands — never fumbles a clean snap." },
  { name: "Jonah Okafor", leg: "Leg 3", jersey: "#b8a9d9", flavor: "Longest stride — clears the widest tower gaps." },
];

const keys: [string, string][] = [
  ["WASD", "Move"],
  ["Space", "Jump"],
  ["Shift", "Sprint"],
  ["E", "Handoff in zone"],
];

export default function RooftopRelayPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(120% 90% at 50% 8%, #4a3a2a 0%, #2b2320 60%, #1a1512 100%)",
        color: "#f4efe6",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2cqw",
        }}
      >
        <div
          style={{
            width: "58cqw",
            maxWidth: "70cqw",
            borderRadius: "1.6cqw",
            border: "1px solid rgba(242,185,80,0.4)",
            background: "rgba(43,35,32,0.92)",
            boxShadow: "0 1.2cqw 3cqw rgba(0,0,0,0.5)",
            padding: "3.2cqw",
            display: "flex",
            flexDirection: "column",
            gap: "1.8cqw",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "4cqw",
                fontWeight: 900,
                letterSpacing: "-0.01em",
                color: "#f2b950",
                lineHeight: 1,
              }}
            >
              ROOFTOP RELAY
            </div>
            <div style={{ marginTop: "0.8cqw", fontSize: "1.5cqw", color: "#c9c4b8", lineHeight: 1.4 }}>
              Dawn courier crew, five legs, one baton. Run the roofs, trust the jump, snap it clean.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.9cqw" }}>
            {runners.map((runner) => (
              <div
                key={runner.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.2cqw",
                  borderRadius: "0.8cqw",
                  background: "rgba(0,0,0,0.3)",
                  padding: "1cqw 1.2cqw",
                }}
              >
                <span
                  style={{
                    height: "2.6cqw",
                    width: "2.6cqw",
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.4)",
                    background: runner.jersey,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "1.5cqw", fontWeight: 700, color: "#f2b950" }}>
                    {runner.leg} — {runner.name}
                  </div>
                  <div
                    style={{
                      fontSize: "1.2cqw",
                      color: "#c9c4b8",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {runner.flavor}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "1cqw",
              borderRadius: "0.8cqw",
              border: "1px solid rgba(201,196,184,0.2)",
              background: "rgba(0,0,0,0.25)",
              padding: "1cqw",
            }}
          >
            {keys.map(([key, label]) => (
              <div key={key} style={{ textAlign: "center" }}>
                <div
                  style={{
                    display: "inline-block",
                    borderRadius: "0.4cqw",
                    border: "1px solid rgba(201,196,184,0.4)",
                    background: "rgba(0,0,0,0.4)",
                    padding: "0.3cqw 0.8cqw",
                    fontSize: "1.2cqw",
                    fontWeight: 700,
                    color: "#f2b950",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {key}
                </div>
                <div style={{ marginTop: "0.4cqw", fontSize: "1cqw", color: "#c9c4b8" }}>{label}</div>
              </div>
            ))}
          </div>

          <span
            style={{
              alignSelf: "flex-start",
              borderRadius: "0.8cqw",
              background: "#b3573f",
              padding: "1cqw 2.4cqw",
              fontSize: "1.6cqw",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "#fff",
              boxShadow: "0 0.4cqw 1cqw rgba(179,87,63,0.4)",
            }}
          >
            Go go go — Start (Enter)
          </span>
        </div>
      </div>
    </div>
  );
}
