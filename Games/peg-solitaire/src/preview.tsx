import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const SERIF = "'Iowan Old Style', 'Palatino Linotype', 'Georgia', serif";

const BRASS = "#c69a46";
const BRASS_BRIGHT = "#efd489";
const IVORY = "#efe6d2";
const MUTED = "#b39a76";

const panelStyle: CSSProperties = {
  borderRadius: "0.9cqw",
  border: "1px solid #4a3620",
  background: "rgba(32,24,16,0.9)",
  boxShadow: "0 1cqw 2.2cqw rgba(0,0,0,0.55)",
};

const labelStyle: CSSProperties = {
  fontSize: "0.9cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: MUTED,
};

const SIZE = 7;

function englishHole(r: number, c: number): boolean {
  const midCol = c >= 2 && c <= 4;
  const midRow = r >= 2 && r <= 4;
  return midCol || midRow;
}

const CELLS: { r: number; c: number; peg: boolean }[] = [];
for (let r = 0; r < SIZE; r += 1) {
  for (let c = 0; c < SIZE; c += 1) {
    if (!englishHole(r, c)) continue;
    CELLS.push({ r, c, peg: !(r === 3 && c === 3) });
  }
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 1.4cqw" }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ fontSize: "1.9cqw", fontWeight: 900, fontFamily: SERIF, color: accent ? BRASS_BRIGHT : IVORY }}>{value}</span>
    </div>
  );
}

function PillButton({ label, badge, primary }: { label: string; badge: string; primary?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.6cqw",
        borderRadius: "0.8cqw",
        padding: "0.7cqw 1.4cqw",
        fontSize: "1.1cqw",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: primary ? BRASS : "rgba(38,32,23,0.56)",
        color: primary ? "#241704" : IVORY,
        border: `1px solid ${primary ? BRASS_BRIGHT : "#4a3620"}`,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          minWidth: "1.4cqw",
          borderRadius: "0.3cqw",
          padding: "0.1cqw 0.4cqw",
          fontSize: "0.85cqw",
          fontWeight: 800,
          textAlign: "center",
          background: primary ? "#efd48922" : "transparent",
          border: primary ? "none" : "1px solid #6a4f2c",
          color: primary ? "#241704" : BRASS_BRIGHT,
        }}
      >
        {badge}
      </span>
    </span>
  );
}

export default function PegSolitairePreview({ className }: GamePreviewProps) {
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
          "radial-gradient(120% 92% at 50% 26%, #2a1e12 0%, #150f09 54%, #090603 100%)",
        color: IVORY,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", left: "2.4cqw", top: "13%", ...panelStyle, padding: "1cqw 1.6cqw" }}>
        <div style={{ fontSize: "1.5cqw", fontWeight: 900, fontFamily: SERIF, textTransform: "uppercase", letterSpacing: "0.2em", color: BRASS_BRIGHT }}>
          Peg Solitaire
        </div>
        <div style={{ fontSize: "0.85cqw", textTransform: "uppercase", letterSpacing: "0.16em", color: MUTED }}>
          English cross · 33 holes
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "13%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "stretch",
          ...panelStyle,
          padding: "0.6cqw 0.4cqw",
        }}
      >
        <StatTile label="Pegs left" value="32" />
        <StatTile label="Moves" value="0" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 1.4cqw" }}>
          <span style={labelStyle}>State</span>
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, color: IVORY }}>Ready</span>
        </div>
      </div>

      <div style={{ position: "absolute", right: "2.4cqw", top: "13%", ...panelStyle, padding: "1cqw 1.6cqw", minWidth: "11cqw" }}>
        <div style={{ marginBottom: "0.5cqw", fontSize: "0.9cqw", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: BRASS_BRIGHT }}>
          Best · English cross
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1.4cqw" }}>
          <span style={labelStyle}>Fewest pegs</span>
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, fontFamily: SERIF, color: IVORY }}>—</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1.4cqw" }}>
          <span style={labelStyle}>In moves</span>
          <span style={{ fontSize: "1.1cqw", fontWeight: 700, fontFamily: SERIF, color: IVORY }}>—</span>
        </div>
      </div>

      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "16% 4% 15%" }}>
        <div
          style={{
            position: "relative",
            width: "min(56cqw, 74cqh)",
            aspectRatio: "1 / 1",
            borderRadius: "1.6cqw",
            padding: "5%",
            background:
              "radial-gradient(120% 120% at 50% 12%, rgba(255,214,150,0.14), rgba(0,0,0,0) 46%)," +
              "linear-gradient(158deg, #7a4e2c 0%, #4c2d18 48%, #291709 100%)",
            border: "1px solid #38220f",
            boxShadow: "inset 0 0.3cqw 0.9cqw rgba(255,224,180,0.16), inset 0 -1.2cqw 3cqw rgba(0,0,0,0.62), 0 2cqw 4cqw rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ position: "relative", height: "100%", width: "100%" }}>
            {CELLS.map((cell) => {
              const pct = 100 / SIZE;
              const isCenter = cell.r === 3 && cell.c === 3;
              return (
                <div
                  key={`${cell.r}-${cell.c}`}
                  style={{
                    position: "absolute",
                    width: `${pct}%`,
                    height: `${pct}%`,
                    transform: `translate(${cell.c * 100}%, ${cell.r * 100}%)`,
                    padding: "14%",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: "100%",
                      borderRadius: "9999px",
                      background: "radial-gradient(circle at 50% 38%, #221610 0%, #160e07 62%, #0b0603 100%)",
                      boxShadow: "inset 0 0.2cqw 0.3cqw rgba(0,0,0,0.85), 0 0 0 0.14cqw rgba(124,90,31,0.55)",
                    }}
                  >
                    {cell.peg ? (
                      <div
                        style={{
                          height: "76%",
                          width: "76%",
                          margin: "12%",
                          borderRadius: "9999px",
                          background: "radial-gradient(circle at 38% 30%, #fdf8ec 0%, #efe6d2 42%, #c3b490 78%, #9c8a63 100%)",
                          boxShadow: "inset 0 0.15cqw 0.2cqw rgba(255,255,255,0.6), inset 0 -0.3cqw 0.5cqw rgba(120,96,54,0.5), 0 0.35cqw 0.7cqw rgba(0,0,0,0.5)",
                        }}
                      />
                    ) : isCenter ? (
                      <div
                        style={{
                          height: "40%",
                          width: "40%",
                          margin: "30%",
                          borderRadius: "9999px",
                          border: "0.14cqw dashed rgba(120,200,255,0.85)",
                          boxShadow: "0 0 1cqw rgba(120,200,255,0.45)",
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "3%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6cqw",
          ...panelStyle,
          padding: "1cqw 1.6cqw",
        }}
      >
        <div style={{ display: "flex", gap: "0.8cqw" }}>
          <PillButton label="Hint" badge="H" primary />
          <PillButton label="Undo" badge="Z" />
          <PillButton label="Restart" badge="R" />
        </div>
        <div style={{ fontSize: "0.85cqw", color: MUTED }}>Click a peg to see its jumps, then click a glowing hole — or drag it across.</div>
      </div>

      <div style={{ position: "absolute", right: "2.4cqw", bottom: "3%", maxWidth: "16cqw", textAlign: "right", fontSize: "0.85cqw", lineHeight: 1.4, color: MUTED }}>
        Peg solitaire — traditional, first recorded at the court of Louis XIV (1697)
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          boxShadow: "inset 0 0 6cqw rgba(0,0,0,0.35)",
        }}
      />
    </div>
  );
}
