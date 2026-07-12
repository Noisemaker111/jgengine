import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const CLASSES = [
  { name: "Warrior", color: "#C79C6E", resource: "rage" },
  { name: "Mage", color: "#69CCF0", resource: "mana" },
  { name: "Rogue", color: "#FFF569", resource: "energy" },
  { name: "Paladin", color: "#F58CBA", resource: "mana" },
  { name: "Hunter", color: "#ABD473", resource: "mana" },
  { name: "Priest", color: "#FFFFF0", resource: "mana" },
  { name: "Shaman", color: "#0070DE", resource: "mana" },
  { name: "Warlock", color: "#9482C9", resource: "mana" },
  { name: "Druid", color: "#FF7D0A", resource: "mana" },
];

const cardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1.4cqw",
  borderRadius: "0.6cqw",
  border: "1px solid #44403c",
  background: "rgba(28,25,23,0.8)",
  padding: "1.4cqw 1.6cqw",
};

export default function ClaudecraftPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#0c0a09",
        color: "#fff",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "18% 6% 4%",
        }}
      >
        <span
          style={{
            fontSize: "1.4cqw",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.3em",
            color: "rgba(217,119,6,0.8)",
          }}
        >
          World of ClaudeCraft
        </span>
        <span
          style={{
            marginTop: "0.6cqw",
            fontFamily: "Georgia, serif",
            fontSize: "3.4cqw",
            fontWeight: 700,
            color: "#fef3c7",
          }}
        >
          Choose your class
        </span>
        <span style={{ marginTop: "0.8cqw", fontSize: "1.3cqw", color: "#a8a29e" }}>
          Nine callings, three zones, one road to the Hollow Crypt.
        </span>

        <div
          style={{
            marginTop: "3cqw",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1.2cqw",
            width: "100%",
          }}
        >
          {CLASSES.map((cls) => (
            <div key={cls.name} style={cardStyle}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "3.4cqw",
                  width: "3.4cqw",
                  flexShrink: 0,
                  borderRadius: "0.4cqw",
                  border: `1px solid ${cls.color}66`,
                  color: cls.color,
                  fontSize: "1.6cqw",
                  fontWeight: 800,
                }}
              >
                {cls.name.charAt(0)}
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "0.15cqw" }}>
                <span style={{ fontSize: "1.4cqw", fontWeight: 700, color: cls.color }}>{cls.name}</span>
                <span style={{ fontSize: "1cqw", textTransform: "capitalize", color: "#a8a29e" }}>
                  {cls.resource}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
