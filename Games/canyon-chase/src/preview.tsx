import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const seeds = [
  { id: "01", label: "Rookie Run", selected: false },
  { id: "02", label: "Border Push", selected: true },
  { id: "03", label: "Ghost Run", selected: false },
];

function SeedRow({ id, label, selected }: { id: string; label: string; selected: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: "1cqw",
        borderBottom: `1px solid ${selected ? "#ffc857" : "rgba(244,230,210,0.15)"}`,
        padding: "0.8cqw 0",
        color: selected ? "#ffc857" : "rgba(244,230,210,0.55)",
      }}
    >
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.1cqw", opacity: 0.45 }}>{id}</span>
      <span style={{ fontSize: "1.5cqw", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.16em" }}>{label}</span>
      <span
        style={{
          height: "0.9cqw",
          width: "0.9cqw",
          transform: "rotate(45deg)",
          border: `1px solid ${selected ? "#ffc857" : "currentColor"}`,
          background: selected ? "#ffc857" : "transparent",
        }}
      />
    </div>
  );
}

export default function CanyonChasePreview({ className }: GamePreviewProps) {
  const eyebrowStyle: CSSProperties = {
    fontSize: "1.1cqw",
    textTransform: "uppercase",
    letterSpacing: "0.42em",
    color: "rgba(255,200,87,0.75)",
  };

  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#120d12",
        color: "#f4e6d2",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 76% 24%, rgba(255,200,87,0.20), transparent 27%), linear-gradient(155deg, #21131d 0%, #090709 58%, #24120c 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "48%",
          opacity: 0.5,
          clipPath: "polygon(0 48%, 18% 22%, 36% 42%, 55% 8%, 72% 30%, 100% 0, 100% 100%, 0 100%)",
          background: "#5f2b1c",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "34%",
          clipPath: "polygon(0 35%, 17% 12%, 38% 46%, 58% 16%, 78% 45%, 100% 20%, 100% 100%, 0 100%)",
          background: "#170d0b",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "1fr 34cqw",
          alignItems: "end",
          gap: "3cqw",
          padding: "0 4cqw 6cqw",
        }}
      >
        <section>
          <p style={eyebrowStyle}>Border pursuit dispatch</p>
          <div
            style={{
              marginTop: "1cqw",
              fontSize: "6.4cqw",
              fontWeight: 900,
              textTransform: "uppercase",
              lineHeight: 0.84,
              letterSpacing: "-0.02em",
              color: "#ffc857",
            }}
          >
            Canyon
            <div style={{ paddingLeft: "0.6em", color: "#f4e6d2" }}>Chase</div>
          </div>
          <div
            style={{
              marginTop: "2cqw",
              display: "flex",
              alignItems: "center",
              gap: "1.6cqw",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                border: "2px solid #ffc857",
                background: "#ffc857",
                color: "#21131d",
                padding: "1cqw 2.4cqw",
                fontSize: "1.5cqw",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                boxShadow: "0 1.4cqw 4cqw rgba(0,0,0,0.45)",
              }}
            >
              Ignition
            </span>
            <span style={{ fontSize: "1cqw", textTransform: "uppercase", letterSpacing: "0.24em", color: "rgba(244,230,210,0.42)" }}>
              Drive · brake · survey · handbrake
            </span>
          </div>
        </section>

        <aside style={{ borderLeft: "1px solid rgba(255,200,87,0.35)", paddingLeft: "1.8cqw" }}>
          <p style={{ fontSize: "1cqw", textTransform: "uppercase", letterSpacing: "0.34em", color: "rgba(255,200,87,0.65)" }}>
            Select pursuit file
          </p>
          <div style={{ marginTop: "1.2cqw" }}>
            {seeds.map((seed) => (
              <SeedRow key={seed.id} id={seed.id} label={seed.label} selected={seed.selected} />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
