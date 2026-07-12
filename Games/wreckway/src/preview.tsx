import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const C = {
  bg: "#1c1a17",
  rust: "#b7410e",
  yellow: "#f0c419",
  cream: "#fef3e0",
  steel: "#8d99a6",
  muted: "#c9b8a4",
} as const;

const hudLabelStyle: CSSProperties = {
  fontSize: "0.85cqw",
  fontWeight: 900,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: C.muted,
};

export default function WreckwayPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: C.bg,
        color: C.cream,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "0%",
          width: "26cqw",
          height: "100cqh",
          transform: "translateX(-50%)",
          clipPath: "polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)",
          background: "linear-gradient(180deg, #2b2823 0%, #34302a 100%)",
        }}
      />

      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: `${10 + i * 16}cqh`,
            width: `${2 - i * 0.25}cqw`,
            height: `${1.4 - i * 0.15}cqh`,
            transform: "translateX(-50%)",
            background: C.yellow,
            opacity: 0.7,
            borderRadius: "999px",
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "0%",
          width: "22cqw",
          height: "60cqh",
          transform: "translateX(-50%)",
          clipPath: "polygon(38% 0%, 62% 0%, 90% 100%, 10% 100%)",
          background: `repeating-linear-gradient(90deg, ${C.rust}22 0 1.4cqw, transparent 1.4cqw 2.8cqw)`,
        }}
      />

      {[-1, 1].map((side) => (
        <div key={side} style={{ position: "absolute", left: side < 0 ? "8cqw" : "auto", right: side > 0 ? "8cqw" : "auto", top: "40cqh", display: "flex", flexDirection: "column", gap: "1.4cqh" }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              style={{
                width: `${3.4 - i * 0.5}cqw`,
                height: `${3.4 - i * 0.5}cqw`,
                borderRadius: "50%",
                background: "#241f19",
                border: `0.3cqw solid ${C.steel}`,
              }}
            />
          ))}
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "8cqh",
          transform: "translateX(-50%)",
          width: "13cqw",
          height: "9cqw",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "5%",
            right: "5%",
            top: "18%",
            bottom: "22%",
            borderRadius: "1.4cqw 1.4cqw 0.6cqw 0.6cqw",
            background: `linear-gradient(180deg, ${C.rust} 0%, #8a2f09 100%)`,
            border: `0.25cqw solid ${C.bg}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "18%",
            right: "18%",
            top: "0%",
            bottom: "48%",
            borderRadius: "0.8cqw 0.8cqw 0 0",
            background: "#241f19",
          }}
        />
        <div style={{ position: "absolute", left: "-2%", bottom: "0%", width: "26%", height: "22%", borderRadius: "50%", background: C.bg, border: `0.3cqw solid ${C.steel}` }} />
        <div style={{ position: "absolute", right: "-2%", bottom: "0%", width: "26%", height: "22%", borderRadius: "50%", background: C.bg, border: `0.3cqw solid ${C.steel}` }} />
        <div style={{ position: "absolute", left: "10%", bottom: "24%", width: "80%", height: "0.6cqw", background: C.yellow, opacity: 0.85 }} />
        <div style={{ position: "absolute", left: "12%", bottom: "20%", width: "8%", height: "6%", borderRadius: "50%", background: C.yellow }} />
        <div style={{ position: "absolute", right: "12%", bottom: "20%", width: "8%", height: "6%", borderRadius: "50%", background: C.yellow }} />
      </div>

      <div style={{ position: "absolute", top: "3cqh", left: "3cqw" }}>
        <div style={hudLabelStyle}>Zone</div>
        <div style={{ fontSize: "1.3cqw", fontWeight: 900, color: C.cream }}>Car-Stack Canyons</div>
      </div>

      <div style={{ position: "absolute", top: "3cqh", right: "3cqw", textAlign: "right" }}>
        <div style={hudLabelStyle}>Time</div>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.5cqw", fontWeight: 800, color: C.cream }}>0:00</div>
      </div>

      <div style={{ position: "absolute", top: "10cqh", left: "3cqw", right: "3cqw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4cqh" }}>
          <span style={hudLabelStyle}>Compactor</span>
          <span style={{ ...hudLabelStyle, color: C.rust }}>39m</span>
        </div>
        <div style={{ height: "0.8cqh", borderRadius: "999px", background: "rgba(0,0,0,0.5)", border: `1px solid ${C.steel}55` }}>
          <div style={{ width: "82%", height: "100%", borderRadius: "999px", background: C.rust }} />
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "3cqh", left: "3cqw", display: "flex", gap: "0.6cqw" }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            style={{
              width: "2.4cqw",
              height: "2.4cqw",
              borderRadius: "0.4cqw",
              border: `1px dashed ${C.steel}88`,
              display: "grid",
              placeItems: "center",
              fontSize: "0.7cqw",
              color: C.muted,
            }}
          >
            —
          </div>
        ))}
      </div>
    </div>
  );
}
