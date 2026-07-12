import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

type Village = { id: string; name: string; nx: number; nz: number; size: number };

const VILLAGES: Village[] = [
  { id: "ridgehome", name: "Ridgehome", nx: 50, nz: 50, size: 5.2 },
  { id: "northpoint", name: "Northpoint", nx: 75, nz: 66.7, size: 4 },
  { id: "saltmarsh", name: "Saltmarsh", nx: 27.1, nz: 70.8, size: 4 },
  { id: "highstead", name: "Highstead", nx: 29.2, nz: 27.1, size: 4 },
];

const ROUTES: [Village, Village][] = [
  [VILLAGES[0]!, VILLAGES[1]!],
  [VILLAGES[0]!, VILLAGES[3]!],
];

function villageStyle(v: Village): CSSProperties {
  return {
    position: "absolute",
    left: `${v.nx}%`,
    top: `${v.nz}%`,
    transform: "translate(-50%, -50%)",
  };
}

export default function CourierZeroPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(180deg, #8fd0c9 0%, #cfe7c2 38%, #e9d9a8 60%, #2a9d8f 100%)",
        color: "#26413c",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {ROUTES.map(([a, b]) => (
          <line
            key={`${a.id}-${b.id}`}
            x1={a.nx}
            y1={a.nz}
            x2={b.nx}
            y2={b.nz}
            stroke="#c9a878"
            strokeWidth={0.6}
            strokeDasharray="1.5 1.2"
          />
        ))}
      </svg>

      {VILLAGES.map((v) => (
        <div key={v.id} style={villageStyle(v)}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "0.4cqw",
            }}
          >
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: `${v.size}cqw`,
                  height: `${v.size * 1.2}cqw`,
                  background: "linear-gradient(180deg, #e8d5a3, #c9a878)",
                  border: "0.08cqw solid #26413c",
                }}
              />
            ))}
          </div>
          <span
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginTop: "0.4cqw",
              fontSize: "1cqw",
              fontWeight: 700,
              whiteSpace: "nowrap",
              color: "#26413c",
              textShadow: "0 0 0.4cqw rgba(255,255,255,0.8)",
            }}
          >
            {v.name}
          </span>
        </div>
      ))}

      <div style={{ ...villageStyle(VILLAGES[0]!), zIndex: 2 }}>
        <div
          style={{
            width: "2.4cqw",
            height: "2.4cqw",
            borderRadius: "50%",
            background: "#e76f51",
            border: "0.15cqw solid #26413c",
            boxShadow: "0 0 1cqw rgba(231,111,81,0.7)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.6cqw",
          borderRadius: "0.8cqw",
          background: "rgba(38,65,60,0.85)",
          padding: "1cqw 1.4cqw",
          color: "#e8d5a3",
        }}
      >
        <span style={{ fontSize: "1cqw", textTransform: "uppercase", letterSpacing: "0.2em", color: "#2a9d8f" }}>
          The Shallows
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6cqw" }}>
          <span style={{ fontSize: "1cqw" }}>Stamina</span>
          <div style={{ width: "8cqw", height: "0.8cqw", borderRadius: "0.4cqw", background: "rgba(0,0,0,0.4)" }}>
            <div style={{ width: "100%", height: "100%", borderRadius: "0.4cqw", background: "#2a9d8f" }} />
          </div>
        </div>
        <span style={{ fontSize: "1cqw" }}>Delivered 0 / 8</span>
      </div>
    </div>
  );
}
