import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const ledStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderRadius: "0.4cqw",
  background: "#160a0a",
  boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,80,60,0.15)",
  padding: "0.5cqw 1.1cqw",
  fontFamily: "ui-monospace, monospace",
  fontSize: "2.6cqw",
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: "#ff3b30",
  textShadow: "0 0 6px rgba(255,60,45,0.65)",
};

export default function FlagSweepPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#0a0a0a",
        color: "#f1f5f9",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "46cqw",
          borderRadius: "1.4cqw",
          padding: "1.6cqw",
          background: "#e7ebf1",
          boxShadow: "inset 4px 4px 0 #ffffff, inset -4px -4px 0 #b9c3d0, 0 24px 50px -20px rgba(0,0,0,0.75)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 0.5cqw 0.8cqw",
            fontSize: "1.4cqw",
            fontWeight: 600,
            color: "#475569",
          }}
        >
          <span>Beginner</span>
          <span style={{ fontFamily: "ui-monospace, monospace" }}>9×9</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.1cqw",
            borderRadius: "0.8cqw",
            padding: "1cqw 1.5cqw",
            background: "#dbe1ea",
            boxShadow: "inset 2px 2px 0 #ffffff, inset -2px -2px 0 #b3bdca",
          }}
        >
          <span style={ledStyle}>010</span>
          <span
            style={{
              position: "relative",
              display: "grid",
              placeItems: "center",
              width: "4.8cqw",
              height: "4.8cqw",
              borderRadius: "0.8cqw",
              background: "linear-gradient(150deg, #f2f5f9 0%, #cfd7e2 100%)",
              boxShadow: "inset 2px 2px 0 #ffffff, inset -2px -2px 0 #a9b4c2, 0 1px 2px rgba(0,0,0,0.3)",
            }}
          >
            <span
              style={{
                position: "relative",
                width: "3.2cqw",
                height: "3.2cqw",
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), rgba(255,255,255,0) 55%), #facc15",
                boxShadow: "0 0 0 1px #a16207",
              }}
            >
              <span style={{ position: "absolute", left: "27%", top: "34%", width: "0.45cqw", height: "0.45cqw", borderRadius: "50%", background: "#1f2937" }} />
              <span style={{ position: "absolute", right: "27%", top: "34%", width: "0.45cqw", height: "0.45cqw", borderRadius: "50%", background: "#1f2937" }} />
              <span
                style={{
                  position: "absolute",
                  left: "26%",
                  bottom: "22%",
                  width: "48%",
                  height: "24%",
                  borderBottom: "0.4cqw solid #1f2937",
                  borderRadius: "0 0 50% 50%",
                }}
              />
            </span>
          </span>
          <span style={ledStyle}>000</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: "0.2cqw" }}>
          {Array.from({ length: 81 }, (_, i) => (
            <span
              key={i}
              style={{
                aspectRatio: "1",
                background: "linear-gradient(150deg, #5b6b80 0%, #47566a 55%, #3a4759 100%)",
                boxShadow:
                  "inset 2px 2px 0 rgba(255,255,255,0.22), inset -2px -2px 0 rgba(8,12,20,0.45), 0 1px 1px rgba(0,0,0,0.25)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
