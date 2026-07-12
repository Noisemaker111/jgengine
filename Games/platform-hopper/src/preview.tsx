import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelStyle: CSSProperties = {
  position: "absolute",
  borderRadius: "0.8cqw",
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(0,0,0,0.55)",
  padding: "0.9cqw 1.4cqw",
  boxShadow: "0 0.4cqw 1.2cqw rgba(0,0,0,0.35)",
};

function Building({ left, width, height, stories }: { left: string; width: string; height: string; stories: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        bottom: "34%",
        width,
        height,
        background: "linear-gradient(#7c8a9a, #5b6674)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {Array.from({ length: stories }, (_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: "18%",
            right: "18%",
            top: `${10 + i * (70 / stories)}%`,
            height: "12%",
            background: "rgba(253,224,71,0.55)",
          }}
        />
      ))}
    </div>
  );
}

export default function PlatformHopperPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#bfe6ff, #4a9fe0)",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <Building left="8%" width="9cqw" height="16cqw" stories={4} />
      <Building left="24%" width="7cqw" height="11cqw" stories={2} />
      <Building left="66%" width="8cqw" height="14cqw" stories={3} />
      <Building left="84%" width="7cqw" height="9cqw" stories={2} />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "34%",
          background: "linear-gradient(#a8e26a, #4d8f2f)",
        }}
      />

      <span
        style={{
          position: "absolute",
          left: "34%",
          bottom: "38%",
          width: "10cqw",
          height: "1.6cqw",
          background: "linear-gradient(#8a5a2f, #5c3a1e)",
          borderRadius: "0.3cqw",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "58%",
          bottom: "46%",
          width: "9cqw",
          height: "1.6cqw",
          background: "linear-gradient(#8a5a2f, #5c3a1e)",
          borderRadius: "0.3cqw",
        }}
      />

      {["18%", "48%", "72%"].map((left) => (
        <span
          key={left}
          style={{
            position: "absolute",
            left,
            bottom: "34%",
            width: "1.6cqw",
            height: "1.6cqw",
            transform: "translateY(50%)",
            background: "linear-gradient(#94a3b8, #64748b)",
            clipPath: "polygon(0% 100%, 50% 0%, 100% 100%)",
          }}
        />
      ))}

      <span
        style={{
          position: "absolute",
          left: "42%",
          bottom: "35.5%",
          width: "1.4cqw",
          height: "1.4cqw",
          borderRadius: "50%",
          background: "radial-gradient(circle, #fde68a, #f5a623)",
          boxShadow: "0 0 0.8cqw rgba(245,166,35,0.6)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "63%",
          bottom: "43.5%",
          width: "1.4cqw",
          height: "1.4cqw",
          borderRadius: "50%",
          background: "radial-gradient(circle, #fde68a, #f5a623)",
          boxShadow: "0 0 0.8cqw rgba(245,166,35,0.6)",
        }}
      />

      <span
        style={{
          position: "absolute",
          left: "12%",
          bottom: "34%",
          width: "1.4cqw",
          height: "4.6cqw",
          background: "linear-gradient(#f87171, #b91c1c)",
          borderRadius: "0.4cqw 0.4cqw 0 0",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "20%",
          bottom: "34%",
          width: "2.4cqw",
          height: "3.4cqw",
          background: "linear-gradient(#38bdf8, #0284c7)",
          borderRadius: "0.6cqw 0.6cqw 0.3cqw 0.3cqw",
          boxShadow: "0 0 1cqw rgba(56,189,248,0.5)",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "20%",
            top: "18%",
            width: "0.5cqw",
            height: "0.5cqw",
            borderRadius: "50%",
            background: "#fff",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: "88%",
          bottom: "34%",
          width: "0.5cqw",
          height: "7cqw",
          background: "#e2e8f0",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "0.5cqw",
            top: 0,
            width: "3.4cqw",
            height: "2.2cqw",
            background: "linear-gradient(#4ade80, #16a34a)",
            clipPath: "polygon(0% 0%, 100% 20%, 0% 40%)",
          }}
        />
      </div>

      <div style={{ ...panelStyle, top: "14%", left: "2%" }}>
        <p style={{ margin: 0, fontSize: "1.2cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "#7dd3fc" }}>
          Platform Hopper
        </p>
        <p style={{ margin: "0.4cqw 0 0", fontSize: "1.3cqw", color: "rgba(255,255,255,0.85)" }}>
          Run right, stomp the stompers, dodge the spikes, reach the flag.
        </p>
      </div>

      <div style={{ ...panelStyle, top: "14%", right: "2%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5cqw" }}>
        <span style={{ fontSize: "1.8cqw", letterSpacing: "0.2em", color: "#fb7185" }}>♥ ♥ ♥</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: "0.6cqw" }}>
          <span style={{ fontSize: "1.1cqw", textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(253,224,71,0.8)" }}>
            Score
          </span>
          <span style={{ fontSize: "1.6cqw", fontWeight: 700, color: "#fde047" }}>0</span>
        </span>
      </div>

      <div style={{ position: "absolute", top: "24%", left: "50%", transform: "translateX(-50%)", width: "34cqw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1cqw", textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.6)" }}>
          <span>Start</span>
          <span>Flag</span>
        </div>
        <div style={{ marginTop: "0.4cqw", height: "0.8cqw", borderRadius: "0.4cqw", background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
          <div style={{ width: "10%", height: "100%", background: "linear-gradient(to right, #38bdf8, #34d399)" }} />
        </div>
      </div>
    </div>
  );
}
