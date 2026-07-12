import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const labelStyle: CSSProperties = {
  fontSize: "1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  color: "#a8a29e",
};

function HealthBar({ hp, maxHp, width }: { hp: number; maxHp: number; width: number }) {
  const pct = (hp / maxHp) * 100;
  return (
    <div
      style={{
        position: "relative",
        width: `${width}cqw`,
        height: "1.8cqw",
        borderRadius: "1cqw",
        overflow: "hidden",
        border: "1px solid rgba(12,10,9,0.6)",
        background: "rgba(12,10,9,0.7)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "linear-gradient(90deg,#059669,#34d399)" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: "1cqw",
          fontWeight: 700,
          color: "#fafaf9",
        }}
      >
        {hp} / {maxHp}
      </div>
    </div>
  );
}

function Card({
  cost,
  name,
  text,
  ring,
  gem,
}: {
  cost: number;
  name: string;
  text: string;
  ring: string;
  gem: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "10cqw",
        height: "14cqw",
        borderRadius: "1cqw",
        border: `2px solid ${ring}`,
        background: "linear-gradient(180deg,#292524,#1c1917)",
        padding: "0.6cqw",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "-0.6cqw",
          top: "-0.6cqw",
          width: "2.2cqw",
          height: "2.2cqw",
          borderRadius: "50%",
          background: gem,
          color: "#1c1917",
          fontWeight: 900,
          fontSize: "1.2cqw",
          display: "grid",
          placeItems: "center",
        }}
      >
        {cost}
      </span>
      <span style={{ marginTop: "0.4cqw", fontSize: "1.1cqw", fontWeight: 800, color: "#f5f5f4", textAlign: "center" }}>{name}</span>
      <div style={{ flex: 1, width: "100%", margin: "0.6cqw 0", borderRadius: "0.6cqw", background: "rgba(12,10,9,0.5)" }} />
      <span style={{ fontSize: "0.95cqw", color: "#d6d3d1", textAlign: "center", lineHeight: 1.2 }}>{text}</span>
    </div>
  );
}

export default function SpireCardsPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(circle at 50% 28%,#3b3457 0%,#231f36 45%,#12101c 100%)",
        color: "#f5f5f4",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", left: "3%", top: "17%", display: "flex", alignItems: "center", gap: "1cqw" }}>
        <span style={labelStyle}>Turn</span>
        <span style={{ fontSize: "1.8cqw", fontWeight: 900, color: "#fcd34d" }}>1</span>
      </div>
      <div style={{ position: "absolute", left: "3%", top: "24%", display: "flex", alignItems: "center", gap: "0.8cqw" }}>
        <span style={labelStyle}>Encounter</span>
        <span style={{ fontSize: "1.6cqw", fontWeight: 900, color: "#fcd34d" }}>1</span>
        <span style={{ fontSize: "1cqw", color: "#78716c" }}>/ 5</span>
      </div>

      <div style={{ position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8cqw" }}>
        <div
          style={{
            width: "13cqw",
            height: "13cqw",
            borderRadius: "2.4cqw",
            border: "2px solid rgba(132,204,22,0.4)",
            background: "linear-gradient(180deg,rgba(63,98,18,0.7),rgba(20,25,7,0.8))",
          }}
        />
        <span
          style={{
            fontSize: "0.9cqw",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            padding: "0.2cqw 0.8cqw",
            borderRadius: "1cqw",
            border: "1px solid #78716c",
            background: "rgba(41,37,36,0.7)",
            color: "#d6d3d1",
          }}
        >
          Foe
        </span>
        <span style={{ fontSize: "1.6cqw", fontWeight: 800 }}>Acid Slime</span>
        <HealthBar hp={48} maxHp={48} width={20} />
      </div>

      <div style={{ position: "absolute", left: "3%", bottom: "20%", display: "flex", flexDirection: "column", gap: "0.6cqw" }}>
        <span style={{ fontSize: "1.4cqw", fontWeight: 800 }}>Ironclad</span>
        <HealthBar hp={72} maxHp={72} width={18} />
      </div>

      <div style={{ position: "absolute", bottom: "3%", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "1.2cqw" }}>
        <Card cost={1} name="Strike" text="Deal 6 damage." ring="#fb7185" gem="#f43f5e" />
        <Card cost={1} name="Defend" text="Gain 5 Block." ring="#38bdf8" gem="#0ea5e9" />
        <Card cost={2} name="Bash" text="Deal 10 damage." ring="#fb7185" gem="#f43f5e" />
      </div>

      <div style={{ position: "absolute", bottom: "3%", right: "3%", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8cqw" }}>
        <div
          style={{
            width: "5.4cqw",
            height: "5.4cqw",
            borderRadius: "50%",
            border: "2px solid rgba(252,211,77,0.7)",
            background: "linear-gradient(180deg,#fbbf24,#ea580c)",
            display: "grid",
            placeItems: "center",
            fontSize: "1.8cqw",
            fontWeight: 900,
            color: "#1c1917",
          }}
        >
          3<span style={{ fontSize: "1.1cqw", opacity: 0.7 }}>/3</span>
        </div>
        <span
          style={{
            fontSize: "1.2cqw",
            fontWeight: 800,
            padding: "0.5cqw 1.4cqw",
            borderRadius: "0.8cqw",
            border: "1px solid rgba(252,211,77,0.6)",
            background: "rgba(217,119,6,0.85)",
            color: "#1c1917",
          }}
        >
          End Turn
        </span>
      </div>
    </div>
  );
}
