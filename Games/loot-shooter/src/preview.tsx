import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelLabelStyle: CSSProperties = {
  fontSize: "1.2cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.3em",
  color: "#94a3b8",
};

function Crate({ left, bottom, width, color }: { left: string; bottom: string; width: string; color: string }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        bottom,
        width,
        aspectRatio: "1.5",
        background: `linear-gradient(160deg, ${color}, #1a2028)`,
        border: "1px solid rgba(255,255,255,0.12)",
        transform: "skewX(-4deg)",
      }}
    />
  );
}

export default function LootShooterPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#0d1526 0%, #182238 52%, #303748 52.5%, #23293a 100%)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "52%",
          bottom: 0,
          background:
            "linear-gradient(to bottom, rgba(245,166,35,0.14), transparent 30%), repeating-linear-gradient(to right, rgba(72,84,106,0.55) 0 1px, transparent 1px 9cqw), repeating-linear-gradient(to bottom, rgba(72,84,106,0.55) 0 1px, transparent 1px 7cqw)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "52%",
          height: "0.5cqw",
          backgroundImage: "repeating-linear-gradient(to right, #f5a623 0 3cqw, transparent 3cqw 5cqw)",
          opacity: 0.8,
        }}
      />
      {[["8%", "44%"], ["30%", "46%"], ["66%", "45%"], ["90%", "44%"]].map(([left, top]) => (
        <span key={left} style={{ position: "absolute", left, top, width: "1.4cqw", height: "7cqw", background: "#1a222c" }}>
          <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1.4cqw", background: "#38e1ff", boxShadow: "0 0 12px #38e1ff" }} />
        </span>
      ))}
      <Crate left="16%" bottom="18%" width="11cqw" color="#4a5566" />
      <Crate left="25%" bottom="14%" width="8cqw" color="#96702a" />
      <Crate left="70%" bottom="20%" width="9cqw" color="#4a5566" />
      <span
        style={{
          position: "absolute",
          right: "12%",
          bottom: "13%",
          width: "7cqw",
          aspectRatio: "0.8",
          background: "linear-gradient(#f5a623, #7a5312)",
          border: "1px solid rgba(255,255,255,0.2)",
          boxShadow: "0 0 16px rgba(245,166,35,0.4)",
        }}
      />

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <span style={{ position: "relative", width: "3.4cqw", height: "3.4cqw" }}>
          <span style={{ position: "absolute", left: "50%", top: "50%", width: "0.3cqw", height: "0.3cqw", transform: "translate(-50%,-50%)", background: "rgba(255,255,255,0.9)" }} />
          <span style={{ position: "absolute", left: "50%", top: 0, width: "0.25cqw", height: "0.9cqw", transform: "translateX(-50%)", background: "rgba(255,255,255,0.8)" }} />
          <span style={{ position: "absolute", left: "50%", bottom: 0, width: "0.25cqw", height: "0.9cqw", transform: "translateX(-50%)", background: "rgba(255,255,255,0.8)" }} />
          <span style={{ position: "absolute", top: "50%", left: 0, height: "0.25cqw", width: "0.9cqw", transform: "translateY(-50%)", background: "rgba(255,255,255,0.8)" }} />
          <span style={{ position: "absolute", top: "50%", right: 0, height: "0.25cqw", width: "0.9cqw", transform: "translateY(-50%)", background: "rgba(255,255,255,0.8)" }} />
        </span>
      </div>

      <div style={{ position: "absolute", top: "3%", left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
        <div style={panelLabelStyle}>Wave</div>
        <div style={{ fontSize: "3.4cqw", fontWeight: 900, color: "#fcd34d" }}>
          1<span style={{ fontSize: "1.8cqw", color: "#64748b" }}> / 10</span>
        </div>
      </div>

      <div style={{ position: "absolute", top: "3%", right: "2.5%", textAlign: "right" }}>
        <div style={panelLabelStyle}>Score</div>
        <div style={{ fontSize: "3cqw", fontWeight: 800, fontFamily: "ui-monospace, monospace", color: "#cffafe" }}>0</div>
        <div style={{ fontSize: "1.3cqw", color: "#94a3b8" }}>
          0 kills · <span style={{ color: "#fcd34d" }}>0 scrap</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4%", left: "2.5%", width: "24cqw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ ...panelLabelStyle, color: "#67e8f9" }}>Operative</span>
          <span style={{ fontSize: "1.4cqw", fontWeight: 800, color: "#fcd34d" }}>LV 1</span>
        </div>
        <div
          style={{
            position: "relative",
            marginTop: "0.6cqw",
            height: "2.4cqw",
            transform: "skewX(-12deg)",
            background: "rgba(2,6,12,0.7)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <span style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #16a34a, #a3e635)" }} />
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              fontSize: "1.4cqw",
              fontWeight: 800,
              color: "#fff",
              transform: "skewX(12deg)",
            }}
          >
            100 / 100
          </span>
        </div>
        <div style={{ marginTop: "0.5cqw", height: "0.5cqw", background: "rgba(245,166,35,0.2)" }} />
      </div>

      <div style={{ position: "absolute", bottom: "4%", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "0.9cqw" }}>
        {[
          { n: "1", name: "Scrap Iron", selected: true },
          { n: "2", name: "—", selected: false },
          { n: "3", name: "—", selected: false },
        ].map((slot) => (
          <div
            key={slot.n}
            style={{
              width: "9cqw",
              height: "6.4cqw",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "0.6cqw",
              background: "rgba(2,6,12,0.72)",
              border: slot.selected ? "1px solid #67e8f9" : "1px solid rgba(148,163,184,0.35)",
              borderBottom: slot.selected ? "3px solid #b8c0cc" : "1px solid rgba(148,163,184,0.35)",
              boxShadow: slot.selected ? "0 0 12px rgba(56,225,255,0.35)" : "none",
            }}
          >
            <span style={{ fontSize: "1.1cqw", fontWeight: 700, color: slot.selected ? "#67e8f9" : "#64748b" }}>{slot.n}</span>
            <span style={{ fontSize: "1.2cqw", fontWeight: 600, color: slot.selected ? "#e2e8f0" : "#475569" }}>{slot.name}</span>
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", bottom: "4%", right: "2.5%", textAlign: "right" }}>
        <div style={{ fontSize: "1.7cqw", fontWeight: 800, color: "#b8c0cc" }}>Scrap Iron</div>
        <div style={{ fontSize: "1.2cqw", color: "#94a3b8" }}>common · pistol</div>
        <div style={{ fontSize: "3.4cqw", fontWeight: 900, fontFamily: "ui-monospace, monospace", color: "#cffafe", lineHeight: 1.05 }}>
          120 <span style={{ fontSize: "1.3cqw", color: "#94a3b8" }}>Light</span>
        </div>
        <div style={{ fontSize: "1.2cqw", color: "#64748b" }}>
          <span style={{ color: "#67e8f9" }}>Light 120</span> · Heavy 60 · Shell 16 · Cell 0
        </div>
      </div>
    </div>
  );
}
