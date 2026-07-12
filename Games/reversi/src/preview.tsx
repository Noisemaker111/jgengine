import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const COLORS = {
  felt: "#1d5636",
  feltDark: "#0d2a19",
  brass: "#c69a43",
  brassLo: "#7c5d1f",
  brassHi: "#eccd7c",
  panelBg: "rgba(11, 24, 17, 0.94)",
  panelBorder: "rgba(198, 154, 67, 0.42)",
  text: "#f3eede",
  subtext: "#a9b79c",
} as const;

function discGradient(dark: boolean): string {
  return dark
    ? "radial-gradient(circle at 34% 30%, #454550 0%, #1a1a20 46%, #0a0a0f 100%)"
    : "radial-gradient(circle at 34% 30%, #fffef6 0%, #efe7d1 52%, #d4cbb0 100%)";
}

function Pip({ dark, count, label, active }: { dark: boolean; count: number; label: string; active: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.8cqw",
        padding: "0.7cqw 1.2cqw",
        borderRadius: "0.8cqw",
        background: active ? "rgba(198,154,67,0.18)" : "rgba(255,255,255,0.03)",
        boxShadow: active ? `inset 0 0 0 0.12cqw ${COLORS.brass}` : "inset 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      <span
        style={{
          width: "2.2cqw",
          height: "2.2cqw",
          borderRadius: "9999px",
          background: discGradient(dark),
          boxShadow: "0 0.2cqw 0.3cqw rgba(0,0,0,0.5)",
        }}
      />
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: "1.8cqw", fontWeight: 700, color: COLORS.text }}>{count}</div>
        <div style={{ fontSize: "0.9cqw", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.subtext }}>{label}</div>
      </div>
    </div>
  );
}

const START_DISCS = [
  { row: 3, col: 3, dark: false },
  { row: 3, col: 4, dark: true },
  { row: 4, col: 3, dark: true },
  { row: 4, col: 4, dark: false },
];

export default function ReversiPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `linear-gradient(150deg, ${COLORS.felt} 0%, ${COLORS.feltDark} 100%)`,
        color: COLORS.text,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "6%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "1cqw",
          padding: "0.8cqw 1.2cqw",
          borderRadius: "1cqw",
          background: COLORS.panelBg,
          boxShadow: `inset 0 0 0 1px ${COLORS.panelBorder}`,
        }}
      >
        <Pip dark count={2} label="You" active />
        <span style={{ fontSize: "1cqw", color: COLORS.subtext, fontWeight: 600 }}>vs</span>
        <Pip dark={false} count={2} label="AI" active={false} />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "58%",
          transform: "translate(-50%, -50%)",
          width: "min(62cqw, 62cqh)",
          aspectRatio: "1 / 1",
          padding: "1.4cqw",
          borderRadius: "1.4cqw",
          background: `linear-gradient(150deg, ${COLORS.brassHi} 0%, ${COLORS.brass} 40%, ${COLORS.brassLo} 100%)`,
          boxShadow: "0 1.4cqw 3cqw rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gridTemplateRows: "repeat(8, 1fr)",
            gap: "0.15cqw",
            padding: "0.2cqw",
            borderRadius: "0.6cqw",
            background: "rgba(4, 20, 12, 0.55)",
          }}
        >
          {Array.from({ length: 64 }, (_, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const disc = START_DISCS.find((d) => d.row === row && d.col === col);
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "0.3cqw",
                  background: "linear-gradient(145deg, #22623f 0%, #134228 100%)",
                }}
              >
                {disc !== undefined ? (
                  <span
                    style={{
                      width: "82%",
                      height: "82%",
                      borderRadius: "9999px",
                      background: discGradient(disc.dark),
                      boxShadow: "0 0.2cqw 0.3cqw rgba(0,0,0,0.45)",
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
