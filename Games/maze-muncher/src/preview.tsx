import type { CSSProperties, ReactNode } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelLabelStyle: CSSProperties = {
  fontSize: "1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "#f87171",
};

function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: "0.5cqw",
        border: "1px solid rgba(239,68,68,0.4)",
        background: "rgba(0,0,0,0.7)",
        padding: "0.9cqw 1.4cqw",
        boxShadow: "0 0 12px rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Pellet({ left, top, size, color }: { left: string; top: string; size: string; color: string }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 0.8cqw ${color}`,
      }}
    />
  );
}

export default function MazeMuncherPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#03030a",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(#08070f 0%, #08070f 42%, #0e0e1c 42%, #0e0e1c 58%, #050509 58%)",
        }}
      />

      {[["6%", "42%", "58%"], ["94%", "42%", "58%"]].map(([left, top, bottom], i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left,
            top,
            bottom: `${100 - Number(bottom.replace("%", ""))}%`,
            width: "2cqw",
            transform: "translateX(-50%)",
            background: "linear-gradient(to bottom, #14142a, #0e0e1c)",
            boxShadow: "0 0 20px rgba(0,0,0,0.6)",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: "24%",
          right: "24%",
          top: "40%",
          bottom: "58%",
          background: "linear-gradient(to bottom, rgba(14,14,28,0.9), rgba(3,3,10,0.98))",
        }}
      />

      <Pellet left="47%" top="87%" size="0.8cqw" color="#ffdca0" />
      <Pellet left="53%" top="87%" size="0.8cqw" color="#ffdca0" />
      <Pellet left="47%" top="78%" size="0.8cqw" color="#ffdca0" />
      <Pellet left="53%" top="78%" size="0.8cqw" color="#ffdca0" />
      <Pellet left="47%" top="69%" size="0.7cqw" color="#ffdca0" />
      <Pellet left="53%" top="69%" size="0.7cqw" color="#ffdca0" />
      <Pellet left="48%" top="60%" size="0.6cqw" color="#ffdca0" />
      <Pellet left="52%" top="60%" size="0.6cqw" color="#ffdca0" />
      <Pellet left="49.5%" top="52%" size="1cqw" color="#8affc0" />

      <div
        style={{
          position: "absolute",
          left: "44%",
          top: "43%",
          width: "5.5%",
          aspectRatio: "1",
          borderRadius: "50% 50% 0 0",
          background: "radial-gradient(circle at 40% 30%, #ff4747, #ff1414)",
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "51%",
          top: "43.5%",
          width: "4.5%",
          aspectRatio: "1",
          borderRadius: "50% 50% 0 0",
          background: "radial-gradient(circle at 40% 30%, #ffcbf0, #ffb0e6)",
          opacity: 0.85,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 12cqw 4cqw rgba(0,0,0,0.6)",
        }}
      />

      <div style={{ position: "absolute", top: "6%", left: "1.6cqw", display: "flex", gap: "0.8cqw" }}>
        <Panel>
          <div style={panelLabelStyle}>Souls</div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "2cqw", lineHeight: 1, color: "#fcd34d" }}>00000</div>
        </Panel>
        <Panel style={{ textAlign: "center" }}>
          <div style={{ ...panelLabelStyle, color: "rgba(252,165,165,0.8)" }}>Depth</div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "2cqw", lineHeight: 1, color: "#fff" }}>1/5</div>
        </Panel>
      </div>

      <div style={{ position: "absolute", top: "6%", right: "1.6cqw", display: "flex", alignItems: "center", gap: "0.8cqw" }}>
        <Panel style={{ display: "flex", alignItems: "center", gap: "0.6cqw" }}>
          <span style={panelLabelStyle}>Lives</span>
          <div style={{ display: "flex", gap: "0.3cqw" }}>
            <span style={{ width: "1.1cqw", height: "1.1cqw", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 0.6cqw rgba(239,68,68,0.8)" }} />
            <span style={{ width: "1.1cqw", height: "1.1cqw", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 0.6cqw rgba(239,68,68,0.8)" }} />
            <span style={{ width: "1.1cqw", height: "1.1cqw", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 0.6cqw rgba(239,68,68,0.8)" }} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
