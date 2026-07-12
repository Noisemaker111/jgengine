import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const FONT = '"IBM Plex Mono", "SFMono-Regular", ui-monospace, Menlo, monospace';
const PHOSPHOR = "#c7ffd2";
const PHOSPHOR_BRIGHT = "#effff2";
const GLOW = "0 0 1cqw rgba(88,255,150,0.55), 0 0 2.4cqw rgba(88,255,150,0.22)";

const paddleStyle: CSSProperties = {
  position: "absolute",
  top: "45%",
  width: "1.7cqw",
  height: "15cqh",
  background: PHOSPHOR,
  boxShadow: GLOW,
};

export default function PaddleDuelPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#04070a",
        color: PHOSPHOR,
        fontFamily: FONT,
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "6%",
          border: "1px solid rgba(88,255,150,0.18)",
          boxShadow: "0 0 4cqw rgba(88,255,150,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "6%",
          bottom: "6%",
          width: 0,
          borderLeft: "0.3cqw dashed rgba(88,255,150,0.3)",
        }}
      />
      <span style={{ ...paddleStyle, left: "4cqw" }} />
      <span style={{ ...paddleStyle, right: "4cqw" }} />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "1.6cqw",
          height: "1.6cqw",
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          background: PHOSPHOR_BRIGHT,
          boxShadow: GLOW,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "4%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "baseline",
          gap: "2cqw",
          fontSize: "3cqw",
          fontWeight: 900,
          letterSpacing: "0.1em",
          color: PHOSPHOR_BRIGHT,
          textShadow: GLOW,
        }}
      >
        <span>0</span>
        <span style={{ fontSize: "1.6cqw", opacity: 0.4 }}>–</span>
        <span>0</span>
      </div>
    </div>
  );
}
