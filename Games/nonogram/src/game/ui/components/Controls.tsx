import type { CSSProperties } from "react";
import type { AppState } from "../../state/types";
import type { Commands } from "../hooks";
import { TEAL_HI } from "../theme";

interface ControlsProps {
  app: AppState;
  commands: Commands;
}

const buttonBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 14px",
  borderRadius: 11,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(30,41,59,0.7)",
  color: "#e2e8f0",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

export function Controls({ app, commands }: ControlsProps) {
  const canUndo = app.status !== "won" && app.history.length > 0;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 14px" }}>
      <button style={buttonBase} onClick={() => commands.run("openMenu", {})}>
        ☰ Menu
      </button>

      <div
        style={{
          display: "inline-flex",
          padding: 3,
          borderRadius: 12,
          background: "rgba(15,23,42,0.7)",
          border: "1px solid rgba(148,163,184,0.24)",
        }}
      >
        <button
          onClick={() => commands.run("setMode", { mode: "fill" })}
          style={{
            ...buttonBase,
            border: "none",
            background: app.paintMode === "fill" ? TEAL_HI : "transparent",
            color: app.paintMode === "fill" ? "#04211d" : "#cbd5e1",
          }}
        >
          ■ Fill
        </button>
        <button
          onClick={() => commands.run("setMode", { mode: "cross" })}
          style={{
            ...buttonBase,
            border: "none",
            background: app.paintMode === "cross" ? "#94a3b8" : "transparent",
            color: app.paintMode === "cross" ? "#0b1220" : "#cbd5e1",
          }}
        >
          ✕ Mark
        </button>
      </div>

      <button
        style={{ ...buttonBase, opacity: canUndo ? 1 : 0.45, cursor: canUndo ? "pointer" : "default" }}
        onClick={() => canUndo && commands.run("undo", {})}
      >
        ↶ Undo
      </button>
      <button style={buttonBase} onClick={() => commands.run("clearBoard", {})}>
        ⟲ Clear
      </button>
      <button
        style={{
          ...buttonBase,
          borderColor: app.mistakesMode ? "rgba(244,63,94,0.5)" : "rgba(148,163,184,0.24)",
          color: app.mistakesMode ? "#fda4af" : "#e2e8f0",
        }}
        onClick={() => commands.run("toggleMistakes", {})}
      >
        {app.mistakesMode ? "Mistakes: On" : "Mistakes: Off"}
      </button>
    </div>
  );
}
