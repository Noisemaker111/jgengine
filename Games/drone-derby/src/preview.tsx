import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelStyle: CSSProperties = {
  borderRadius: "0.4cqw",
  border: "1px solid #3a4048",
  background: "rgba(32,36,43,0.92)",
  padding: "1cqw 1.6cqw",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.8cqw",
  height: "1.8cqw",
  padding: "0 0.4cqw",
  borderRadius: "0.3cqw",
  border: "1px solid #57616d",
  background: "#14171b",
  fontSize: "1cqw",
  fontWeight: 700,
  color: "#eef2f5",
};

const COURSES: readonly { name: string; rings: number; cap: string; selected: boolean }[] = [
  { name: "Container Sprint", rings: 8, cap: "1:30", selected: true },
  { name: "Crane Gauntlet", rings: 12, cap: "2:15", selected: false },
  { name: "Harbor Loop", rings: 16, cap: "3:00", selected: false },
];

export default function DroneDerbyPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#1c2027, #14171b 60%)",
        color: "#eef2f5",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
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
          gap: "1.4cqw",
          padding: "1cqw 4cqw",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4cqw" }}>
          <span
            style={{
              fontSize: "4.2cqw",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "#eef2f5",
              textShadow: "0 4px 0 #5f8f0e, 0 8px 22px rgba(0,0,0,0.9), 0 0 32px rgba(158,240,26,0.55)",
            }}
          >
            Drone Derby
          </span>
          <span style={{ fontSize: "1.1cqw", textTransform: "uppercase", letterSpacing: "0.32em", color: "#4cc9f0" }}>
            Volt-Neon Tech Expo — Container Port Circuit
          </span>
        </div>

        <div style={{ ...panelStyle, width: "34cqw" }}>
          <div style={{ fontSize: "1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "#9aa4ad", marginBottom: "0.8cqw" }}>
            Select Course
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6cqw" }}>
            {COURSES.map((course, i) => (
              <div
                key={course.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.6cqw 0.8cqw",
                  background: course.selected ? "rgba(158,240,26,0.12)" : "transparent",
                  border: `1px solid ${course.selected ? "#9ef01a" : "#3a4048"}`,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.7cqw" }}>
                  <span style={badgeStyle}>{i + 1}</span>
                  <span style={{ fontSize: "1.1cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: course.selected ? "#eef2f5" : "#9aa4ad" }}>
                    {course.name}
                  </span>
                </span>
                <span style={{ fontFamily: "Consolas, 'Cascadia Mono', monospace", fontSize: "0.9cqw", color: "#9aa4ad" }}>
                  {course.rings} rings · cap {course.cap}
                </span>
              </div>
            ))}
          </div>
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.8cqw",
            border: "2px solid #9ef01a",
            background: "rgba(158,240,26,0.1)",
            padding: "0.7cqw 2.4cqw",
            fontSize: "1.4cqw",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "#9ef01a",
          }}
        >
          Launch
          <span style={badgeStyle}>Enter</span>
        </span>
      </div>
    </div>
  );
}
