import type { CSSProperties, ReactNode } from "react";
import type { Puzzle } from "../../logic/types";
import type { AppState } from "../../state/types";
import { formatTime } from "../format";
import type { Commands } from "../hooks";
import { GOOD, TEAL_HI, WARN } from "../theme";
import { Thumb } from "./Thumb";

const scrim: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(6, 9, 14, 0.72)",
  backdropFilter: "blur(3px)",
  zIndex: 50,
};

const card: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 14,
  padding: "28px 30px 24px",
  borderRadius: 20,
  background: "rgba(15, 20, 28, 0.96)",
  border: "1px solid rgba(148,163,184,0.2)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
  maxWidth: "min(420px, 92vw)",
  textAlign: "center",
};

function ActionButton({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 20px",
        borderRadius: 12,
        border: primary ? "none" : "1px solid rgba(148,163,184,0.3)",
        background: primary ? TEAL_HI : "rgba(30,41,59,0.7)",
        color: primary ? "#04211d" : "#e2e8f0",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Buttons({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 10, marginTop: 4 }}>{children}</div>;
}

export function WinOverlay({
  app,
  puzzle,
  commands,
}: {
  app: AppState;
  puzzle: Puzzle;
  commands: Commands;
}) {
  return (
    <div style={scrim}>
      <div style={card}>
        <Thumb puzzle={puzzle} solved px={168} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: GOOD }}>
            Solved
          </div>
          <h2 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>{puzzle.name}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#cbd5e1" }}>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Time</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {formatTime(app.elapsedMs)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Best</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {formatTime(app.bestMs)}
            </div>
          </div>
        </div>
        {app.newRecord && (
          <div style={{ padding: "4px 12px", borderRadius: 999, background: "rgba(34,197,94,0.15)", color: GOOD, fontSize: 13, fontWeight: 700 }}>
            ★ New personal best
          </div>
        )}
        <Buttons>
          <ActionButton label="Menu" onClick={() => commands.run("openMenu", {})} />
          <ActionButton label="Next puzzle" primary onClick={() => commands.run("nextPuzzle", {})} />
        </Buttons>
      </div>
    </div>
  );
}

export function FailOverlay({
  app,
  commands,
}: {
  app: AppState;
  commands: Commands;
}) {
  return (
    <div style={scrim}>
      <div style={card}>
        <div style={{ fontSize: 44 }}>✕</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: WARN }}>
            Out of strikes
          </div>
          <h2 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: "#f1f5f9" }}>
            {app.maxStrikes} mistakes made
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#94a3b8" }}>
            Clear the board and try this one again.
          </p>
        </div>
        <Buttons>
          <ActionButton label="Menu" onClick={() => commands.run("openMenu", {})} />
          <ActionButton label="Try again" primary onClick={() => commands.run("clearBoard", {})} />
        </Buttons>
      </div>
    </div>
  );
}
