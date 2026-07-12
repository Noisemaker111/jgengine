import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const C = {
  baize: "radial-gradient(ellipse 130% 100% at 50% 16%, #237f52 0%, #16643f 40%, #0c3f28 74%, #072a1c 100%)",
  feltRaised: "linear-gradient(180deg, #14503686 0%, #0c3a27 100%)",
  leatherLight: "#875734",
  stitch: "rgba(240,222,176,0.34)",
  gold: "#e9c46a",
  goldSoft: "#f2dd97",
  text: "#f3ecd9",
  textDim: "rgba(243,236,217,0.6)",
  ghost: "rgba(243,236,217,0.32)",
  line: "rgba(240,222,176,0.14)",
};

const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const boardStyle: CSSProperties = {
  background: C.feltRaised,
  border: `2px solid ${C.leatherLight}`,
  borderRadius: "1.4cqw",
  boxShadow: "0 1.4cqw 3.4cqw rgba(0,0,0,.45)",
  outline: `1px dashed ${C.stitch}`,
  outlineOffset: "-0.6cqw",
  padding: "2cqw 2.4cqw",
};

const UPPER_ROWS: readonly string[] = ["Ones", "Twos", "Threes", "Fours", "Fives", "Sixes"];
const LOWER_ROWS: readonly string[] = [
  "Three of a Kind",
  "Four of a Kind",
  "Full House",
  "Small Straight",
  "Large Straight",
  "Yacht",
  "Chance",
];

function ScoreRow({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.4cqw 0.7cqw",
        borderRadius: "0.5cqw",
        border: "1px dashed rgba(240,222,176,0.32)",
      }}
    >
      <span style={{ fontSize: "1cqw", fontWeight: 700, color: C.text }}>{label}</span>
      <span style={{ fontSize: "1.15cqw", fontWeight: 800, fontFamily: SERIF, color: C.ghost }}>–</span>
    </div>
  );
}

export default function YachtDicePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: C.baize,
        color: C.text,
        fontFamily: SANS,
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "2.4cqw" }}>
        <div style={{ ...boardStyle, width: "94cqw", maxWidth: "100%", display: "flex", flexDirection: "column", gap: "1.6cqw" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1.6cqw" }}>
            <div>
              <div style={{ fontSize: "2.6cqw", fontWeight: 800, fontFamily: SERIF, color: C.text }}>
                Yacht <span style={{ color: C.gold }}>Dice</span>
              </div>
            </div>
            <div style={{ textAlign: "right", lineHeight: 1 }}>
              <div style={{ fontSize: "3.4cqw", fontWeight: 800, fontFamily: SERIF, color: C.goldSoft }}>0</div>
              <div style={{ fontSize: "0.9cqw", fontWeight: 700, letterSpacing: "0.22em", color: C.textDim, marginTop: "0.3cqw" }}>
                TOTAL
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1cqw", fontWeight: 600, color: C.textDim, marginBottom: "0.5cqw" }}>
              <span>Upper bonus</span>
              <span>0 / 63 · +35</span>
            </div>
            <div style={{ height: "0.7cqw", borderRadius: "999px", background: "rgba(0,0,0,0.35)" }} />
          </div>

          <div style={{ borderTop: `1px solid ${C.line}` }} />

          <div style={{ display: "flex", gap: "2.8cqw", alignItems: "flex-start", justifyContent: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.6cqw" }}>
              <div style={{ display: "flex", gap: "1.4cqw" }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      width: "5.6cqw",
                      height: "5.6cqw",
                      borderRadius: "1cqw",
                      background: "linear-gradient(180deg,#fbf5e6,#efe6cf)",
                      border: "1px solid #d9caa4",
                      boxShadow: "0 0.4cqw 0.8cqw rgba(0,0,0,0.35)",
                      opacity: 0.42,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1.4cqw" }}>
                <div style={{ display: "flex", gap: "0.6cqw" }}>
                  {Array.from({ length: 3 }, (_, i) => (
                    <span
                      key={i}
                      style={{
                        width: "0.8cqw",
                        height: "0.8cqw",
                        borderRadius: "50%",
                        background: C.gold,
                        border: `1px solid ${C.gold}`,
                      }}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontSize: "1.5cqw",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    color: "#211f1b",
                    background: "linear-gradient(180deg,#f2dd97,#e3b652)",
                    border: `1px solid ${C.goldSoft}`,
                    padding: "1cqw 1.8cqw",
                    borderRadius: "1cqw",
                  }}
                >
                  Roll Dice
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "2.2cqw" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4cqw", minWidth: "22cqw" }}>
                <div style={{ fontSize: "0.9cqw", fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: C.gold, paddingBottom: "0.5cqw", borderBottom: `1px solid ${C.line}` }}>
                  Upper Section
                </div>
                {UPPER_ROWS.map((label) => (
                  <ScoreRow key={label} label={label} />
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4cqw", minWidth: "22cqw" }}>
                <div style={{ fontSize: "0.9cqw", fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: C.gold, paddingBottom: "0.5cqw", borderBottom: `1px solid ${C.line}` }}>
                  Lower Section
                </div>
                {LOWER_ROWS.map((label) => (
                  <ScoreRow key={label} label={label} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
