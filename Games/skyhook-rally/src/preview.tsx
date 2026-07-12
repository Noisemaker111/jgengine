import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const courses: { name: string; rings: number; par: number; selected: boolean }[] = [
  { name: "Dawn Reach", rings: 5, par: 32, selected: true },
  { name: "Brass Gauntlet", rings: 8, par: 51, selected: false },
  { name: "Marshal's Mile", rings: 12, par: 74, selected: false },
];

const keys: [string, string][] = [
  ["LMB", "Fire / release hook"],
  ["A", "Steer left"],
  ["D", "Steer right"],
  ["W", "Nose up"],
  ["S", "Nose down"],
  ["Mouse", "Look / aim"],
];

export default function SkyhookRallyPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background:
          "linear-gradient(180deg, #f7c59f 0%, #e8a86c 40%, #b0764a 70%, #2b2118 100%)",
        color: "#f4efe6",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2cqw",
        }}
      >
        <div
          style={{
            width: "60cqw",
            maxWidth: "72cqw",
            borderRadius: "1.4cqw",
            border: "1px solid rgba(176,141,87,0.5)",
            background: "rgba(43,33,24,0.82)",
            boxShadow: "0 1.2cqw 3cqw rgba(0,0,0,0.45)",
            padding: "3cqw",
            display: "flex",
            flexDirection: "column",
            gap: "1.6cqw",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "1.1cqw",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.3em",
                color: "#b08d57",
              }}
            >
              Sunrise Brass Archipelago
            </div>
            <div style={{ marginTop: "0.5cqw", fontSize: "3.4cqw", fontWeight: 900, color: "#f4efe6", lineHeight: 1 }}>
              Skyhook Rally
            </div>
            <div style={{ marginTop: "0.8cqw", fontSize: "1.3cqw", color: "rgba(244,239,230,0.85)", lineHeight: 1.4 }}>
              Swing pylon to pylon on the brass hook, release at the apex bell, beat the marshal&apos;s par.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.8cqw" }}>
            {courses.map((course, index) => (
              <div
                key={course.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: "0.8cqw",
                  border: course.selected ? "1px solid #2e8b8b" : "1px solid rgba(176,141,87,0.4)",
                  background: course.selected ? "rgba(46,139,139,0.22)" : "rgba(43,33,24,0.4)",
                  padding: "0.9cqw 1.2cqw",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "1cqw" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "1.8cqw",
                      width: "1.8cqw",
                      borderRadius: "0.3cqw",
                      border: "1px solid rgba(244,239,230,0.4)",
                      fontSize: "1.1cqw",
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ fontSize: "1.5cqw", fontWeight: 700, color: "#f4efe6" }}>{course.name}</span>
                  <span style={{ fontSize: "1.1cqw", color: "rgba(244,239,230,0.6)" }}>{course.rings} rings</span>
                </span>
                <span style={{ fontSize: "1.2cqw", fontWeight: 700, color: "#facc8a" }}>par {course.par}s</span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.8cqw",
              borderRadius: "0.8cqw",
              border: "1px solid rgba(176,141,87,0.3)",
              background: "rgba(43,33,24,0.4)",
              padding: "1cqw",
            }}
          >
            {keys.map(([key, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.6cqw" }}>
                <span
                  style={{
                    display: "inline-flex",
                    minWidth: "2.2em",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "0.3cqw",
                    border: "1px solid rgba(244,239,230,0.4)",
                    background: "rgba(244,239,230,0.1)",
                    padding: "0.2cqw 0.5cqw",
                    fontSize: "1cqw",
                    fontWeight: 700,
                    color: "#f4efe6",
                  }}
                >
                  {key}
                </span>
                <span style={{ fontSize: "1cqw", color: "rgba(244,239,230,0.8)" }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "1.1cqw", color: "rgba(244,239,230,0.6)" }}>Press Enter or click Start</span>
            <span
              style={{
                borderRadius: "0.8cqw",
                background: "#2e8b8b",
                padding: "0.9cqw 2.2cqw",
                fontSize: "1.4cqw",
                fontWeight: 800,
                color: "#fff",
                boxShadow: "0 0.4cqw 1cqw rgba(46,139,139,0.4)",
              }}
            >
              Start run
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
