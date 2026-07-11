import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";

import type { AiLevel } from "../../ai";
import { keybinds } from "../../keybinds";
import type { AppState, Mode } from "../../state";
import { COLORS } from "../theme";

const LEVELS: readonly { id: AiLevel; name: string; hint: string }[] = [
  { id: "novice", name: "Novice", hint: "greedy max-flips" },
  { id: "club", name: "Club", hint: "positional + corners" },
  { id: "master", name: "Master", hint: "minimax α-β depth 5" },
];

function Btn({
  active,
  onClick,
  children,
  grow,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  grow?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: grow ? 1 : undefined,
        padding: "7px 12px",
        borderRadius: "8px",
        border: active ? `1.5px solid ${COLORS.brass}` : "1px solid rgba(255,255,255,0.1)",
        background: active ? "rgba(198,154,67,0.2)" : "rgba(255,255,255,0.04)",
        color: active ? COLORS.text : COLORS.subtext,
        fontSize: "12px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
      }}
    >
      {children}
    </button>
  );
}

export function Menu({ app }: { app: AppState }): React.ReactElement {
  const { commands } = useGame();
  const start = (mode: Mode, level: AiLevel): void => {
    commands.run("startGame", { mode, level });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "220px" }}>
      <div style={{ display: "flex", gap: "6px" }}>
        <Btn grow active={app.mode === "ai"} onClick={() => start("ai", app.level)}>
          vs Computer
        </Btn>
        <Btn grow active={app.mode === "hotseat"} onClick={() => start("hotseat", app.level)}>
          2 Players
        </Btn>
      </div>
      {app.mode === "ai" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {LEVELS.map((lvl) => (
            <button
              key={lvl.id}
              type="button"
              onClick={() => start("ai", lvl.id)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "8px",
                border: app.level === lvl.id ? `1.5px solid ${COLORS.brass}` : "1px solid rgba(255,255,255,0.1)",
                background: app.level === lvl.id ? "rgba(198,154,67,0.16)" : "rgba(255,255,255,0.03)",
                color: COLORS.text,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 700 }}>{lvl.name}</span>
              <span style={{ fontSize: "10px", color: COLORS.subtext }}>{lvl.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "6px" }}>
        <Btn grow onClick={() => commands.run("rematch", {})}>
          New Game
        </Btn>
        <Btn grow onClick={() => commands.run("undo", {})}>
          Undo ({actionLabel(keybinds, "undo")})
        </Btn>
      </div>
    </div>
  );
}
