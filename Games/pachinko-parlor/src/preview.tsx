import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const cardStyle: CSSProperties = {
  background: "linear-gradient(160deg, rgba(43,24,14,0.92), rgba(26,13,8,0.92))",
  border: "1px solid #9c6f22",
  boxShadow: "0 6px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,220,150,0.15)",
  color: "#f4e7c9",
  borderRadius: "1.4cqw",
};

const statLabelStyle: CSSProperties = {
  fontSize: "1cqw",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  opacity: 0.7,
};

const CATCHERS: readonly { flex: number; label: string; color: string; ink: string }[] = [
  { flex: 26, label: "0", color: "#3b2a22", ink: "rgba(240,225,200,0.55)" },
  { flex: 5, label: "2", color: "#7fb8c4", ink: "#3a2416" },
  { flex: 5, label: "3", color: "#8fb46a", ink: "#3a2416" },
  { flex: 5, label: "5", color: "#d98a4a", ink: "#3a2416" },
  { flex: 9, label: "10", color: "#ffcf5c", ink: "#3a2416" },
  { flex: 5, label: "5", color: "#d98a4a", ink: "#3a2416" },
  { flex: 5, label: "3", color: "#8fb46a", ink: "#3a2416" },
  { flex: 5, label: "2", color: "#7fb8c4", ink: "#3a2416" },
  { flex: 26, label: "0", color: "#3b2a22", ink: "rgba(240,225,200,0.55)" },
];

const PEG_ROWS: readonly number[] = [16, 24, 32, 40, 48, 56, 64];

export default function PachinkoParlorPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "radial-gradient(120% 80% at 50% -10%, #4a2c17 0%, #2a1810 45%, #17100b 100%)",
        color: "#f4e7c9",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "4%",
          bottom: "4%",
          transform: "translateX(-50%)",
          aspectRatio: "2 / 3",
          borderRadius: "2.4cqw",
          background: "linear-gradient(160deg, #e0492f, #b8281a 40%, #7d1a10)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 0 0 3px #d9a441, inset 0 2px 0 rgba(255,220,150,0.4)",
          padding: "1.4cqw",
        }}
      >
        <div
          style={{
            position: "relative",
            height: "100%",
            width: "100%",
            overflow: "hidden",
            borderRadius: "1.3cqw",
            background: "linear-gradient(#f4e7c9, #e7d4a8)",
            boxShadow: "inset 0 0 24px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "4%", background: "#d9a441" }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "4.5%",
              background: "linear-gradient(to right, #9c6f22, #f6d888, #d9a441)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: "4.5%",
              background: "linear-gradient(to left, #9c6f22, #f6d888, #d9a441)",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "8%",
              transform: "translateX(-50%)",
              fontStyle: "italic",
              fontFamily: "ui-serif, Georgia, serif",
              fontSize: "1.7cqw",
              color: "rgba(58,36,22,0.25)",
            }}
          >
            パチンコ
          </span>
          {PEG_ROWS.map((top, row) =>
            Array.from({ length: row % 2 === 0 ? 7 : 6 }, (_, i) => (
              <span
                key={`${top}-${i}`}
                style={{
                  position: "absolute",
                  top: `${top}%`,
                  left: `${(row % 2 === 0 ? 14 + i * 12 : 20 + i * 12)}%`,
                  width: "1.5cqw",
                  height: "1.5cqw",
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 30%, rgba(255,248,220,0.85), #d9a441 55%, #9c6f22)",
                }}
              />
            )),
          )}
          <span
            style={{
              position: "absolute",
              right: "5.5%",
              bottom: "11%",
              width: "1.9cqw",
              height: "1.9cqw",
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, #ffffff, #cfd4dc 55%, #8f95a1)",
            }}
          />
          <div style={{ position: "absolute", left: "4.5%", right: "4.5%", bottom: 0, height: "11%", display: "flex" }}>
            {CATCHERS.map((c, i) => (
              <span
                key={i}
                style={{
                  flex: c.flex,
                  margin: "0 1px",
                  borderRadius: "0.4cqw 0.4cqw 0 0",
                  background: c.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.2cqw",
                  fontWeight: 700,
                  color: c.ink,
                  boxShadow: c.label === "10" ? "0 0 14px rgba(255,157,46,0.8)" : "none",
                  borderTop: c.label === "10" ? "0.5cqw solid #ff9d2e" : "none",
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: "2%", top: "14%", padding: "0.9cqw 1.4cqw", ...cardStyle }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.9cqw" }}>
          <span style={{ fontSize: "1.3cqw", fontWeight: 900, letterSpacing: "0.28em", color: "#ffcf5c" }}>
            PACHINKO
          </span>
          <span style={{ fontSize: "1.7cqw", fontWeight: 700, color: "#e0492f" }}>パチンコ</span>
        </div>
        <div style={{ fontSize: "1.1cqw", letterSpacing: "0.05em", color: "#f6d888", opacity: 0.85 }}>
          Shōwa Parlor
        </div>
      </div>

      <div style={{ position: "absolute", right: "2%", top: "14%", padding: "1.1cqw 1.5cqw", ...cardStyle }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1cqw" }}>
          <span
            style={{
              width: "2.2cqw",
              height: "2.2cqw",
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, #ffffff, #8f95a1)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={statLabelStyle}>Ball Bank</span>
            <span style={{ fontSize: "3cqw", fontWeight: 900, lineHeight: 1, color: "#ffcf5c" }}>50</span>
          </div>
        </div>
        <div style={{ marginTop: "0.9cqw", display: "grid", gridTemplateColumns: "auto auto", columnGap: "1.8cqw", rowGap: "0.6cqw" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={statLabelStyle}>In Flight</span>
            <span style={{ fontSize: "1.6cqw", fontWeight: 700 }}>0</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={statLabelStyle}>Launched</span>
            <span style={{ fontSize: "1.6cqw", fontWeight: 700 }}>0</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={statLabelStyle}>Best Bank</span>
            <span style={{ fontSize: "1.6cqw", fontWeight: 700, color: "#f6d888" }}>—</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={statLabelStyle}>Best Fever</span>
            <span style={{ fontSize: "1.6cqw", fontWeight: 700, color: "#ffd23f" }}>—</span>
          </div>
        </div>
        <div style={{ marginTop: "0.9cqw", display: "flex", alignItems: "center", gap: "0.6cqw" }}>
          <span style={statLabelStyle}>Gate</span>
          {Array.from({ length: 3 }, (_, i) => (
            <span
              key={i}
              style={{ width: "1cqw", height: "1cqw", borderRadius: "50%", background: "rgba(255,255,255,0.14)" }}
            />
          ))}
          <span style={{ marginLeft: "1cqw", fontSize: "1cqw", opacity: 0.7 }}>Fevers 0</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "3%",
          transform: "translateX(-50%)",
          width: "42cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.8cqw",
          padding: "1.3cqw 1.8cqw",
          ...cardStyle,
          borderRadius: "1.8cqw",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.3cqw" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4cqw", ...statLabelStyle }}>
              <span>Power</span>
              <span>0%</span>
            </div>
            <div
              style={{
                position: "relative",
                height: "1.7cqw",
                overflow: "hidden",
                borderRadius: "99cqw",
                background: "rgba(0,0,0,0.45)",
                border: "1px solid #9c6f22",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: "60%",
                  width: "12%",
                  background: "rgba(255,207,92,0.25)",
                  borderLeft: "1px solid #ffcf5c",
                  borderRight: "1px solid #ffcf5c",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "66%",
                  top: "50%",
                  transform: "translate(-50%,-50%)",
                  fontSize: "0.8cqw",
                  fontWeight: 700,
                  color: "#3a2416",
                }}
              >
                GATE
              </span>
            </div>
          </div>
          <span
            style={{
              borderRadius: "1.2cqw",
              padding: "1cqw 1.9cqw",
              textAlign: "center",
              fontSize: "1.5cqw",
              fontWeight: 900,
              letterSpacing: "0.08em",
              background: "linear-gradient(160deg, #b8281a, #7d1a10)",
              border: "1px solid #ffd98a",
              color: "#ffd98a",
              boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
            }}
          >
            HOLD
            <div style={{ fontSize: "0.8cqw", fontWeight: 400, letterSpacing: "0.14em", opacity: 0.8 }}>
              LAUNCH · SPACE
            </div>
          </span>
          <span
            style={{
              borderRadius: "1.2cqw",
              padding: "1cqw 1.3cqw",
              textAlign: "center",
              fontSize: "1.2cqw",
              fontWeight: 700,
              letterSpacing: "0.06em",
              background: "rgba(0,0,0,0.35)",
              border: "1px solid #9c6f22",
              color: "#f4e7c9",
            }}
          >
            AUTO
            <div style={{ fontSize: "0.8cqw", fontWeight: 400, letterSpacing: "0.14em", opacity: 0.8 }}>OFF · F</div>
          </span>
        </div>
        <div style={{ textAlign: "center", fontSize: "0.9cqw", letterSpacing: "0.24em", color: "#f6d888", opacity: 0.7 }}>
          TRADITIONAL JAPANESE PACHINKO
        </div>
      </div>
    </div>
  );
}
