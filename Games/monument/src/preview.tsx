import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const ACID = "#d7ff43";

const eyebrowStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.28em",
  color: "#666961",
};

function Building({ left, bottom, width, height, color }: { left: string; bottom: string; width: string; height: string; color: string }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        bottom,
        width,
        height,
        background: color,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
      }}
    />
  );
}

export default function MonumentPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#3a3d38, #6b6f64 55%, #7c8071)",
        color: "#eeeae0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: "55%", bottom: 0, background: "#5a5d53" }} />
      <Building left="6%" bottom="46%" width="10cqw" height="16cqw" color="#8a8d80" />
      <Building left="17%" bottom="46%" width="7cqw" height="10cqw" color="#9a9d8f" />
      <Building left="76%" bottom="46%" width="9cqw" height="13cqw" color="#82857a" />
      <Building left="87%" bottom="46%" width="8cqw" height="8cqw" color="#95988a" />

      <div style={{ position: "absolute", inset: 0, background: "rgba(12,15,13,0.55)", backdropFilter: "blur(6px)" }} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          width: "78%",
          maxWidth: "92cqw",
          height: "72%",
          borderRadius: "1.4cqw",
          overflow: "hidden",
          boxShadow: "0 2cqw 6cqw rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            flex: "1.2",
            background: "#171916",
            color: "#eeeae0",
            padding: "3cqw 3cqw",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: ACID }}>
            Form · light · life
          </span>
          <span style={{ fontSize: "4.2cqw", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em", marginTop: "0.8cqw" }}>
            Monument
          </span>
          <span style={{ fontSize: "1.6cqw", fontWeight: 600, color: "rgba(238,234,224,0.8)", marginTop: "0.6cqw" }}>
            Brutalist city playground
          </span>
          <p style={{ fontSize: "1.2cqw", color: "rgba(238,234,224,0.6)", marginTop: "1.4cqw", lineHeight: 1.5, maxWidth: "34cqw" }}>
            Pull, repeat, branch, and carve each structure — then guide its use, atmosphere,
            public spaces, and the life that gathers around it.
          </p>
        </div>
        <div
          style={{
            flex: "1",
            background: "#e9e4d8",
            color: "#171916",
            padding: "3cqw 2.6cqw",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "1.2cqw",
          }}
        >
          <span style={eyebrowStyle}>Start a city</span>
          <div
            style={{
              borderRadius: "0.8cqw",
              border: "1px solid rgba(20,22,18,0.19)",
              background: "rgba(255,255,255,0.5)",
              padding: "1.2cqw 1.6cqw",
            }}
          >
            <div style={{ fontSize: "1.5cqw", fontWeight: 800 }}>Riverside Plot</div>
            <div style={{ fontSize: "1.1cqw", color: "#666961", marginTop: "0.3cqw" }}>
              A quiet grid on the water, ready for its first spine.
            </div>
          </div>
          <span
            style={{
              alignSelf: "flex-start",
              borderRadius: "0.8cqw",
              background: ACID,
              color: "#171916",
              fontWeight: 800,
              fontSize: "1.3cqw",
              padding: "0.8cqw 1.8cqw",
            }}
          >
            Continue →
          </span>
        </div>
      </div>
    </div>
  );
}
