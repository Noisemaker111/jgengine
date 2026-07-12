import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const sidePanelStyle: CSSProperties = {
  position: "absolute",
  borderRadius: "1.2cqw",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(15,23,42,0.85)",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.4)",
  padding: "1.3cqw",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1.4cqw",
  borderRadius: "0.6cqw",
  padding: "0.7cqw 1.1cqw",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
};

const keyBadgeStyle: CSSProperties = {
  marginLeft: "0.5cqw",
  borderRadius: "0.3cqw",
  background: "rgba(0,0,0,0.3)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
  padding: "0 0.4cqw",
  fontSize: "0.95cqw",
  fontWeight: 700,
  color: "#e2e8f0",
};

const ledStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderRadius: "0.3cqw",
  background: "#160a0a",
  boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,80,60,0.15)",
  padding: "0.4cqw 0.9cqw",
  fontFamily: "ui-monospace, monospace",
  fontSize: "2cqw",
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: "#ff3b30",
  textShadow: "0 0 6px rgba(255,60,45,0.65)",
};

function DifficultyEntry({ label, keyLabel, config, active }: { label: string; keyLabel: string; config: string; active: boolean }) {
  return (
    <div
      style={{
        ...rowStyle,
        border: active ? "1px solid rgba(251,113,133,0.7)" : rowStyle.border,
        background: active ? "rgba(244,63,94,0.15)" : rowStyle.background,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", fontSize: "1.3cqw", fontWeight: 600, color: active ? "#fff1f2" : "#e2e8f0" }}>
        {label}
        <span style={keyBadgeStyle}>{keyLabel}</span>
      </span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.05cqw", color: "#94a3b8" }}>{config}</span>
    </div>
  );
}

function BestRow({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", fontSize: "1.25cqw" }}>
      <span style={{ color: "#cbd5e1" }}>{label}</span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#fcd34d" }}>—</span>
    </div>
  );
}

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
      <div style={{ ...sidePanelStyle, top: "14%", left: "2.5%", width: "20cqw", display: "flex", flexDirection: "column", gap: "1cqw" }}>
        <div>
          <div style={{ fontSize: "1.8cqw", fontWeight: 900, letterSpacing: "-0.01em", color: "#f8fafc" }}>Flag Sweep</div>
          <div style={{ fontSize: "1cqw", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(253,164,175,0.8)" }}>
            Classic mine hunt
          </div>
        </div>
        <DifficultyEntry label="Beginner" keyLabel="1" config="9×9·10" active />
        <DifficultyEntry label="Intermediate" keyLabel="2" config="16×16·40" active={false} />
        <DifficultyEntry label="Expert" keyLabel="3" config="30×16·99" active={false} />
        <div style={{ ...rowStyle, justifyContent: "flex-start", fontSize: "1.3cqw", fontWeight: 600, color: "#e2e8f0" }}>Custom ▾</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "0.6cqw",
            background: "#f1f5f9",
            padding: "0.7cqw 1.1cqw",
            fontSize: "1.3cqw",
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          New game
          <span style={{ marginLeft: "0.5cqw", borderRadius: "0.3cqw", background: "#1e293b", padding: "0 0.4cqw", fontSize: "0.95cqw", fontWeight: 700, color: "#f1f5f9" }}>
            R
          </span>
        </div>
      </div>

      <div style={{ ...sidePanelStyle, top: "14%", right: "2.5%", width: "19cqw", display: "flex", flexDirection: "column", gap: "1cqw" }}>
        <div>
          <div style={{ marginBottom: "0.5cqw", fontSize: "1.1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8" }}>
            Best times
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4cqw" }}>
            <BestRow label="Beginner" />
            <BestRow label="Intermediate" />
            <BestRow label="Expert" />
          </div>
        </div>
        <div
          style={{
            ...rowStyle,
            justifyContent: "center",
            border: "1px solid rgba(52,211,153,0.4)",
            background: "rgba(16,185,129,0.15)",
            fontSize: "1.3cqw",
            fontWeight: 600,
            color: "#d1fae5",
          }}
        >
          Daily board
          <span style={keyBadgeStyle}>D</span>
        </div>
        <div style={{ ...rowStyle, justifyContent: "center", fontSize: "1.3cqw", fontWeight: 600, color: "#e2e8f0" }}>Share seed</div>
        <div style={{ ...rowStyle, fontSize: "1.3cqw", fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", color: "#e2e8f0" }}>
            Question marks
            <span style={keyBadgeStyle}>Q</span>
          </span>
          <span style={{ color: "#64748b" }}>Off</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          width: "34cqw",
          borderRadius: "1.2cqw",
          padding: "1.1cqw",
          background: "#e7ebf1",
          boxShadow: "inset 3px 3px 0 #ffffff, inset -3px -3px 0 #b9c3d0, 0 18px 40px -18px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0.4cqw 0.5cqw", fontSize: "1.05cqw", fontWeight: 600, color: "#475569" }}>
          <span>Beginner</span>
          <span style={{ fontFamily: "ui-monospace, monospace" }}>9×9</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.8cqw",
            borderRadius: "0.6cqw",
            padding: "0.7cqw 1.1cqw",
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
              width: "3.6cqw",
              height: "3.6cqw",
              borderRadius: "0.6cqw",
              background: "linear-gradient(150deg, #f2f5f9 0%, #cfd7e2 100%)",
              boxShadow: "inset 2px 2px 0 #ffffff, inset -2px -2px 0 #a9b4c2, 0 1px 2px rgba(0,0,0,0.3)",
            }}
          >
            <span
              style={{
                position: "relative",
                width: "2.4cqw",
                height: "2.4cqw",
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), rgba(255,255,255,0) 55%), #facc15",
                boxShadow: "0 0 0 1px #a16207",
              }}
            >
              <span style={{ position: "absolute", left: "27%", top: "34%", width: "0.35cqw", height: "0.35cqw", borderRadius: "50%", background: "#1f2937" }} />
              <span style={{ position: "absolute", right: "27%", top: "34%", width: "0.35cqw", height: "0.35cqw", borderRadius: "50%", background: "#1f2937" }} />
              <span
                style={{
                  position: "absolute",
                  left: "26%",
                  bottom: "22%",
                  width: "48%",
                  height: "24%",
                  borderBottom: "0.3cqw solid #1f2937",
                  borderRadius: "0 0 50% 50%",
                }}
              />
            </span>
          </span>
          <span style={ledStyle}>000</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: "0.15cqw" }}>
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

      <div style={{ position: "absolute", bottom: "4%", left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <span
          style={{
            borderRadius: "9999px",
            background: "rgba(2,6,23,0.7)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
            padding: "0.5cqw 1.8cqw",
            fontSize: "1.1cqw",
            fontWeight: 500,
            color: "#94a3b8",
          }}
        >
          Lineage: Microsoft Minesweeper — Robert Donner &amp; Curt Johnson (1990)
        </span>
      </div>
    </div>
  );
}
